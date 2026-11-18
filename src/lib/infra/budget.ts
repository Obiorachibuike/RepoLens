import "server-only";
import { Ratelimit } from "@upstash/ratelimit";
import { createHash } from "node:crypto";
import { GithubApiError } from "@/lib/github/errors";
import { envInt } from "./config";
import { namespace, usingRedis } from "./redis";

const policies = {
  trending: { limit: 2, seconds: 3600 },
  snapshot: { limit: 240, seconds: 3600 },
  analysis: { limit: 18, seconds: 60 },
  discovery: { limit: 24, seconds: 60 },
  refresh: { limit: 10, seconds: 3600 },
  ai: { limit: 12, seconds: 3600 },
  "ai-global": { limit: 160, seconds: 86400 },
} as const;
const local = new Map<string, { count: number; window: number }>();

export function limitError(seconds: number, message = "RepoLens is pacing requests. Please wait and try again.") {
  const retryAfterSeconds = Math.max(1, Math.ceil(seconds));
  return new GithubApiError({ kind: "rate_limited", status: 429, message, retryAfterSeconds, resetAt: new Date(Date.now() + retryAfterSeconds * 1000).toISOString() });
}

export async function enforceBudget(policy: keyof typeof policies, subject = "shared") {
  const { limit: fallback, seconds } = policies[policy];
  const limit = envInt(`REPOLENS_${policy.toUpperCase().replaceAll("-", "_")}_LIMIT`, fallback, 1, 10_000);
  const id = subject === "shared" ? subject : createHash("sha256").update(subject).digest("hex");
  const prefix = `${namespace}:budget:${policy}`;
  const result = await usingRedis(async (redis) => {
    const limiter = new Ratelimit({ redis, prefix, limiter: Ratelimit.fixedWindow(limit, `${seconds} s`), timeout: 0, analytics: false });
    const grant = await limiter.limit(id);
    await grant.pending;
    return grant;
  });
  const now = Date.now();
  if (result) {
    if (!result.success) throw limitError((result.reset - now) / 1000);
    return;
  }
  const windowMs = seconds * 1000;
  const window = Math.floor(now / windowMs);
  const key = `${prefix}:${id}`;
  if (local.size >= 2000) {
    // Bounded memory: remove expired keys only, never evict a live rate limit.
    for (const [k, item] of local) {
      const name = k.split(":").at(-2) as keyof typeof policies;
      if (Math.floor(now / ((policies[name]?.seconds ?? seconds) * 1000)) > item.window) local.delete(k);
    }
    if (local.size >= 2000 && !local.has(key)) throw limitError(60);
  }
  const previous = local.get(key);
  const count = previous?.window === window ? previous.count : 0;
  const localLimit = policy === "ai-global" ? Math.ceil(limit / 2) : limit;
  if (count >= localLimit) throw limitError(((window + 1) * windowMs - now) / 1000);
  local.set(key, { window, count: count + 1 });
}
