import "server-only";
import { Redis } from "@upstash/redis";
import { randomUUID } from "node:crypto";

export const namespace = "repolens:v2";
const outageCooldownMs = 15_000;
let instance: Redis | undefined;
let circuitUntil = 0;
let commands = 0;
let failures = 0;
let lastOk: number | null = null;

export function redisStatus() {
  const configured = Boolean(process.env.UPSTASH_REDIS_REST_URL?.trim() && process.env.UPSTASH_REDIS_REST_TOKEN?.trim());
  return {
    mode: !configured ? "local" as const : circuitUntil > Date.now() ? "degraded" as const : lastOk ? "shared" as const : "configured" as const,
    operations: commands,
    failures,
    lastSuccessAt: lastOk === null ? null : new Date(lastOk).toISOString(),
  };
}

/** Undefined means disabled/unavailable; null can be a successful Redis miss. */
export async function usingRedis<T>(operation: (redis: Redis) => Promise<T>): Promise<T | undefined> {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token || circuitUntil > Date.now()) return undefined;
  try {
    if (!instance) {
      const endpoint = new URL(url);
      if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error("Invalid Redis REST endpoint");
      instance = new Redis({ url, token, retry: false, signal: () => AbortSignal.timeout(900), enableTelemetry: false });
    }
    commands++;
    const result = await operation(instance);
    lastOk = Date.now();
    return result;
  } catch {
    // Never log upstream exceptions (URLs, headers and commands can contain secrets).
    failures++;
    circuitUntil = Date.now() + outageCooldownMs;
    return undefined;
  }
}

export async function checkRedis() {
  await usingRedis((redis) => redis.ping());
  return redisStatus();
}

const localLocks = new Map<string, { id: string; until: number }>();
const releaseScript = "if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0";
export type Lease = { owner: string; release: () => Promise<void> };

export async function acquireLease(key: string, ttlMs: number): Promise<Lease | null> {
  const full = `${namespace}:lock:${key}`;
  const owner = randomUUID();
  const acquired = await usingRedis((redis) => redis.set(full, owner, { nx: true, px: ttlMs }));
  if (acquired === null) return null;
  if (acquired !== undefined) {
    return { owner, release: async () => { await usingRedis((redis) => redis.eval(releaseScript, [full], [owner])); } };
  }
  const now = Date.now();
  if ((localLocks.get(full)?.until ?? 0) > now) return null;
  if (localLocks.size >= 200) {
    for (const [name, lease] of localLocks) if (lease.until <= now) localLocks.delete(name);
    if (localLocks.size >= 200) return null;
  }
  localLocks.set(full, { id: owner, until: now + ttlMs });
  return { owner, release: async () => { if (localLocks.get(full)?.id === owner) localLocks.delete(full); } };
}

export function clearRedisStateForTests() {
  instance = undefined;
  circuitUntil = commands = failures = 0;
  lastOk = null;
  localLocks.clear();
}
