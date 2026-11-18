import "server-only";
import { randomUUID } from "node:crypto";
import { limitError } from "@/lib/infra/budget";
import { namespace, usingRedis } from "@/lib/infra/redis";
import type { RateLimitInfo } from "./types";

export type Bucket = "core" | "search" | "code";
const global = (scope: string) => `${namespace}:github:quota:${scope}`;
const waits = new Map<string, number>();
const slots = new Map<string, { next: number; count: number; until: number }>();
const strikes = new Map<string, { count: number; until: number }>();
let localActive = 0;
const queueMs = 1500;

// A single atomic admission: cooldown, quota window, paced reservation and a
// per-credential semaphore. Expired leases are removed after crashes/timeouts.
const admit = `
local clock=redis.call('TIME'); local now=clock[1]*1000+math.floor(clock[2]/1000)
local cool=math.max(redis.call('PTTL',KEYS[1]),redis.call('PTTL',KEYS[2]))
if cool>0 then return {-1,cool} end
local limit=tonumber(ARGV[1]); local window=tonumber(ARGV[2]); local gap=tonumber(ARGV[3]);
local count=tonumber(redis.call('GET',KEYS[3]) or '0');
if count>=limit then return {-1,math.max(1000,redis.call('PTTL',KEYS[3]))} end
redis.call('ZREMRANGEBYSCORE',KEYS[5],'-inf',now)
if redis.call('ZCARD',KEYS[5])>=4 then return {-2,400} end
local due=math.max(now,tonumber(redis.call('GET',KEYS[4]) or '0')); local delay=due-now
if delay>tonumber(ARGV[4]) then return {-2,math.min(1000,delay)} end
redis.call('SET',KEYS[4],due+gap,'PX',delay+gap+100)
if redis.call('INCR',KEYS[3])==1 then redis.call('PEXPIRE',KEYS[3],window) end
redis.call('ZADD',KEYS[5],due+tonumber(ARGV[6]),ARGV[5]); redis.call('PEXPIRE',KEYS[5],30000)
return {delay,0}`;

const pause = `
local delay=tonumber(ARGV[1]);
if ARGV[2]=='secondary' then
  local n=redis.call('INCR',KEYS[2]); redis.call('EXPIRE',KEYS[2],3600);
  if n>1 or delay<=1000 then delay=math.max(delay,math.min(900000,60000*(2^math.min(4,n-1)))); end
end
if redis.call('PTTL',KEYS[1])<delay then redis.call('SET',KEYS[1],'1','PX',delay); end
return math.max(delay,redis.call('PTTL',KEYS[1]));`;

const sleep = (ms: number) => ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

export async function permit(scope: string, bucket: Bucket, authenticated: boolean, timeout: number) {
  const root = global(scope);
  const key = `${root}:${bucket}`;
  const now = Date.now();
  const waitMs = Math.max(waits.get(root) ?? 0, waits.get(key) ?? 0) - now;
  if (waitMs > 0) throw limitError(waitMs / 1000, "GitHub is rate limiting requests. Please wait before trying again.");
  const lease = randomUUID();
  const window = bucket === "core" ? 3_600_000 : 60_000;
  const limit = bucket === "code" ? 8 : bucket === "search" ? (authenticated ? 24 : 8) : (authenticated ? 4200 : 54);
  const gap = bucket === "code" ? 1500 : bucket === "search" ? (authenticated ? 450 : 700) : 140;
  const keys = [`${root}:cool`, `${key}:cool`, `${key}:count`, `${key}:pace`, `${root}:active`];
  let shared = await usingRedis((redis) => redis.eval<(string | number)[], [number, number]>(admit, keys, [limit, window, gap, queueMs, lease, timeout + 5000]));
  if (shared?.[0] === -2) {
    await sleep(shared[1]);
    shared = await usingRedis((redis) => redis.eval<(string | number)[], [number, number]>(admit, keys, [limit, window, gap, queueMs, lease, timeout + 5000]));
  }
  if (shared) {
    if (shared[0] < 0) throw limitError(shared[1] / 1000);
    await sleep(shared[0]);
    return async () => { await usingRedis((redis) => redis.zrem(`${root}:active`, lease)); };
  }
  // No multiplier or credential rotation. A conservative ceiling applies to
  // each process when distributed coordination can't be reached.
  const localLimit = bucket === "core" ? (authenticated ? 600 : 40) : bucket === "code" ? 5 : authenticated ? 17 : 7;
  const current = slots.get(key);
  const time = Date.now();
  const slot = current && current.until > time ? current : { next: time, count: 0, until: time + window };
  if (slot.count >= localLimit) throw limitError((slot.until - time) / 1000);
  const delay = Math.max(0, slot.next - time);
  if (localActive >= 24 || delay > queueMs) throw limitError(2);
  slot.next = time + delay + (process.env.NODE_ENV === "test" ? 0 : gap);
  slot.count++;
  slots.set(key, slot);
  localActive++;
  // Bound both queued reservations and actual network concurrency.
  try {
    await sleep(delay);
    const queued = Date.now();
    while (running >= 3 && Date.now() - queued < queueMs) await sleep(70);
    if (running >= 3) throw limitError(2);
    running++;
    let released = false;
    return async () => { if (!released) { released = true; running--; localActive--; } };
  } catch (error) { localActive--; throw error; }
}
let running = 0;

export async function recordCooldown(scope: string, bucket: Bucket, seconds: number, secondary: boolean) {
  const root = global(scope);
  const key = secondary ? root : `${root}:${bucket}`;
  let delay = Math.max(1000, seconds * 1000);
  if (secondary) {
    const n = strikes.get(root);
    const count = n && n.until > Date.now() ? n.count + 1 : 1;
    strikes.set(root, { count, until: Date.now() + 3600000 });
    // An explicit GitHub Retry-After is the minimum for the first event.
    delay = Math.max(delay, count === 1 && seconds > 0 ? 0 : Math.min(900_000, 60_000 * 2 ** Math.min(4, count - 1)));
  }
  waits.set(key, Math.max(waits.get(key) ?? 0, Date.now() + delay));
  const shared = await usingRedis((redis) => redis.eval<(string | number)[], number>(pause, [`${key}:cool`, `${root}:strikes`], [delay, secondary ? "secondary" : "primary"]));
  if (shared) waits.set(key, Math.max(waits.get(key) ?? 0, Date.now() + shared));
  return Math.ceil((waits.get(key)! - Date.now()) / 1000);
}

export type Quota = Partial<Record<Bucket, RateLimitInfo>>;
export function clearPacing() { waits.clear(); slots.clear(); strikes.clear(); localActive = running = 0; }
