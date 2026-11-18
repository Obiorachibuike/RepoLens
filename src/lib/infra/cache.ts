import "server-only";
import { acquireLease, namespace, usingRedis } from "./redis";

export interface CachedData<T> { data: T; updatedAt: number; freshUntil: number; keepUntil: number }
const memory = new Map<string, { value: CachedData<unknown>; bytes: number }>();
const maxMemoryBytes = 12 * 1024 * 1024;
const maxValueBytes = 1024 * 1024;
let memoryBytes = 0;

function drop(key: string) {
  const entry = memory.get(key);
  if (entry) memoryBytes -= entry.bytes;
  memory.delete(key);
}

export async function getCachedData<T>(key: string): Promise<CachedData<T> | null> {
  const shared = await usingRedis((redis) => redis.get<CachedData<T>>(`${namespace}:data:${key}`));
  if (shared === null) { drop(key); return null; }
  const entry = shared ?? memory.get(key)?.value as CachedData<T> | undefined;
  if (!entry || entry.keepUntil <= Date.now()) { drop(key); return null; }
  return entry;
}

export async function setCachedData<T>(key: string, data: T, freshSeconds: number, retainSeconds = freshSeconds, observedAt = Date.now()) {
  const now = Date.now();
  const retention = Math.max(freshSeconds, retainSeconds);
  if (retention <= 0) return;
  const entry: CachedData<T> = { data, updatedAt: observedAt, freshUntil: now + freshSeconds * 1000, keepUntil: now + retention * 1000 };
  const bytes = Buffer.byteLength(JSON.stringify(entry));
  if (bytes > maxValueBytes) return;
  drop(key);
  while (memory.size >= 256 || memoryBytes + bytes > maxMemoryBytes) {
    const oldest = memory.keys().next().value;
    if (!oldest) break;
    drop(oldest);
  }
  memory.set(key, { value: entry, bytes });
  memoryBytes += bytes;
  await usingRedis((redis) => redis.set(`${namespace}:data:${key}`, entry, { ex: retention }));
}

export async function invalidateCache(key: string) {
  drop(key);
  await usingRedis((redis) => redis.del(`${namespace}:data:${key}`));
}

export async function getOrSetCachedData<T>(key: string, seconds: number, load: () => Promise<T>): Promise<T> {
  const existing = await getCachedData<T>(key);
  if (existing && existing.freshUntil > Date.now()) return existing.data;
  const lease = await acquireLease(`derived:${key}`, 45_000);
  if (!lease) {
    // Keep a short bounded wait instead of duplicating expensive analysis.
    for (const ms of [100, 250, 500]) {
      await new Promise((resolve) => setTimeout(resolve, ms));
      const result = await getCachedData<T>(key);
      if (result && result.freshUntil > Date.now()) return result.data;
    }
    throw new Error("Analysis already running");
  }
  try {
    const latest = await getCachedData<T>(key);
    if (latest && latest.freshUntil > Date.now()) return latest.data;
    const result = await load();
    await setCachedData(key, result, seconds);
    return result;
  } finally { await lease.release(); }
}

export function getCacheStatus() { return { localEntries: memory.size, localBytes: memoryBytes }; }
export function clearLocalCache() { memory.clear(); memoryBytes = 0; }
