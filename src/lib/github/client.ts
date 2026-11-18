import "server-only";
import { createHash } from "node:crypto";
import { after } from "next/server";
import { getCachedData, setCachedData, invalidateCache, clearLocalCache, type CachedData } from "@/lib/infra/cache";
import { acquireLease, clearRedisStateForTests } from "@/lib/infra/redis";
import { limitError } from "@/lib/infra/budget";
import { envInt } from "@/lib/infra/config";
import { GithubApiError, errorFromResponse, retryAfterSeconds, resetIso } from "./errors";
import { clearPacing, permit, recordCooldown, type Bucket, type Quota } from "./pacing";
import type { RateLimitInfo } from "./types";

const api = "https://api.github.com";
const version = "2022-11-28";
const defaultAccept = "application/vnd.github+json";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const repoPath = /^\/repos\/([\w.-]+)\/([\w.-]+)(\/.*)?$/;

export interface GithubRequestMeta {
  status: number;
  rateLimit: RateLimitInfo | null;
  fromCache: boolean;
  authenticated: boolean;
  freshness: "live" | "validated" | "fresh" | "stale";
  /** When GitHub last returned or confirmed this representation. */
  observedAt: string;
}

export interface GithubRequestOptions {
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  resource?: "search" | "core";
  requiresAuth?: boolean;
  /** Override the endpoint TTL; 0 opts out of persistent caching. */
  cacheSeconds?: number;
  timeoutMs?: number;
  accept?: string;
  responseType?: "json" | "text";
  signal?: AbortSignal;
  /** Collectors must wait for GitHub validation, not treat cache hits as observations. */
  refresh?: "validate";
}

type Body = { body: unknown; etag: string | null; lastModified: string | null };
type Result = { data: unknown; meta: GithubRequestMeta };
const inflight = new Map<string, Promise<Result>>();
const deferred = new Set<string>();
const quota: Quota = {};
const counters = { totalRequests: 0, cacheHits: 0, cacheMisses: 0, avoided: 0, failures: 0, rateLimitErrors: 0, secondaryLimits: 0, notModified: 0, upstreamMs: 0 };

export function githubDiagnostics() {
  const { upstreamMs, ...stats } = counters;
  return { ...stats, averageLatencyMs: stats.totalRequests ? Math.round(upstreamMs / stats.totalRequests) : null, quota, scope: "this process" };
}

export function getGithubToken(): string | null {
  return process.env.GITHUB_TOKEN?.trim() || process.env.GITHUB_PERSONAL_ACCESS_TOKEN?.trim() || null;
}
export function isGithubAuthenticated() { return getGithubToken() !== null; }

function endpoint(path: string, query?: GithubRequestOptions["query"]): URL {
  if (!/^\/(?!\/)[^?#\\\u0000-\u0020]+$/.test(path) || path.length > 4000) throw invalidPath();
  for (const segment of path.split("/")) {
    let decoded: string;
    try { decoded = decodeURIComponent(segment); } catch { throw invalidPath(); }
    if (decoded === "." || decoded === ".." || /[/\\\u0000-\u001f\u007f]/.test(decoded)) throw invalidPath();
  }
  const url = new URL(path, api);
  if (url.origin !== api) throw invalidPath();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  url.searchParams.sort();
  return url;
}
function invalidPath() { return new GithubApiError({ kind: "validation", message: "Invalid GitHub API endpoint or repository path." }); }

function ttl(path: string) {
  if (path === "/rate_limit") return envInt("GITHUB_RATE_LIMIT_TTL", 30, 0, 3600);
  if (/^\/search\/users$/.test(path) || path.startsWith("/users/")) return envInt("GITHUB_DEVELOPERS_TTL", 900, 0, 86400);
  if (path.startsWith("/search/")) return envInt("GITHUB_SEARCH_TTL", 300, 0, 3600);
  if (path.endsWith("/readme")) return envInt("GITHUB_README_TTL", 3600, 0, 86400);
  if (path.endsWith("/languages")) return envInt("GITHUB_LANGUAGES_TTL", 3600, 0, 86400);
  if (path.endsWith("/contributors")) return envInt("GITHUB_CONTRIBUTORS_TTL", 1800, 0, 86400);
  if (path.endsWith("/commits")) return envInt("GITHUB_COMMITS_TTL", 600, 0, 86400);
  if (/\/(?:contents|git\/trees|git\/blobs)(?:\/|$)/.test(path)) return envInt("GITHUB_FILES_TTL", 3600, 0, 86400);
  return envInt("GITHUB_REPOSITORY_TTL", 900, 0, 86400);
}

function bucketFor(path: string, resource: GithubRequestOptions["resource"]): Bucket {
  if (path === "/search/code") return "code";
  return path.startsWith("/search/") || resource === "search" ? "search" : "core";
}

function requestIdentity(options: GithubRequestOptions, token: string | null) {
  const url = endpoint(options.path, options.query);
  const scope = token ? hash(token).slice(0, 32) : "anonymous";
  const accept = options.accept ?? defaultAccept;
  const responseType = options.responseType ?? "json";
  const path = url.pathname.toLowerCase().startsWith("/repos/") ? url.pathname.replace(repoPath, (_p, owner: string, repo: string, suffix?: string) => `/repos/${owner.toLowerCase()}/${repo.toLowerCase()}${suffix ?? ""}`) : url.pathname;
  const family = path.startsWith("/search/") ? `search:${path.split("/")[2]}` : path === "/rate_limit" ? "quota" : "repo-resource";
  const key = `github:${family}:${scope}:${hash(JSON.stringify([path, url.search, accept, version, responseType]))}`;
  return { url, scope, accept, responseType, key };
}

export async function invalidateGithubCache(options: GithubRequestOptions) {
  await invalidateCache(requestIdentity(options, getGithubToken()).key);
}

function cancelled() { return new GithubApiError({ kind: "network", message: "The request was cancelled." }); }

/** A caller can cancel its own wait without aborting the fetch for other callers. */
function waitFor<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(cancelled());
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
    promise.then(
      (value) => { signal.removeEventListener("abort", onAbort); resolve(value); },
      (error: unknown) => { signal.removeEventListener("abort", onAbort); reject(error); },
    );
  });
}

function readRateLimit(headers: Headers, bucket: Bucket): RateLimitInfo | null {
  const limit = headers.get("x-ratelimit-limit");
  const remaining = headers.get("x-ratelimit-remaining");
  if (limit === null || remaining === null || !Number.isFinite(Number(limit)) || !Number.isFinite(Number(remaining))) return null;
  return { limit: Number(limit), remaining: Number(remaining), resetAt: resetIso(headers), resource: bucket === "core" ? "core" : "search" };
}

export function isPrivateRepository(raw: unknown) {
  if (typeof raw !== "object" || !raw) return false;
  const repo = raw as { private?: boolean; visibility?: string };
  return repo.private === true || (typeof repo.visibility === "string" && repo.visibility !== "public");
}

function publicNotFound() {
  return new GithubApiError({ kind: "not_found", status: 404, message: "That public repository was not found on GitHub." });
}

function publicData(body: unknown, path: string) {
  const match = path.match(repoPath);
  if (((match && !match[3]) || /^\/repositories\/\d+$/.test(path)) && isPrivateRepository(body)) throw publicNotFound();
  if (path.startsWith("/search/") && typeof body === "object" && body && "items" in body && Array.isArray(body.items)) {
    const filtered = body.items.filter((item) => !isPrivateRepository(item) && !isPrivateRepository(item?.repository));
    // Drop counts as well if an upstream result violates the public-only contract.
    return filtered.length === body.items.length ? body : { ...body, items: filtered, total_count: filtered.length, incomplete_results: true };
  }
  return body;
}

function cached(entry: CachedData<Body>, authenticated: boolean, freshness: "fresh" | "stale"): Result {
  counters.cacheHits++;
  counters.avoided++;
  return { data: entry.data.body, meta: { status: 200, rateLimit: null, fromCache: true, authenticated, freshness, observedAt: new Date(entry.updatedAt).toISOString() } };
}

export async function githubRequest<T>(options: GithubRequestOptions): Promise<{ data: T; meta: GithubRequestMeta }> {
  const token = getGithubToken();
  if (options.signal?.aborted) throw cancelled();
  if (options.requiresAuth && !token) {
    throw new GithubApiError({ kind: "unauthorized", status: 401, message: "This GitHub endpoint needs authentication. Set GITHUB_TOKEN on the server.", hint: "Use a token with public read access only." });
  }
  const identity = requestIdentity(options, token);
  const path = identity.url.pathname;
  const match = path.match(repoPath);
  if (match?.[3] && token) {
    // Authenticate only public repository subresources, not names the token
    // happens to have private access to. Do not use stale metadata for this gate.
    const verified = await githubRequest<{ private?: boolean; visibility?: string }>({ path: `/repos/${match[1]}/${match[2]}`, signal: options.signal });
    if (verified.meta.freshness === "stale" || isPrivateRepository(verified.data)) {
      await githubRequest({ path: `/repos/${match[1]}/${match[2]}`, refresh: "validate", signal: options.signal });
    }
  }
  const seconds = options.cacheSeconds ?? ttl(path);
  const timeout = Math.min(15_000, Math.max(10, options.timeoutMs ?? 8_000));
  const wanted = Date.now();
  const { key } = identity;
  const flightKey = options.refresh ? `${key}:validate` : key;
  const pending = inflight.get(flightKey);
  if (pending) {
    const result = await waitFor(pending, options.signal);
    counters.avoided++;
    return { ...result, data: result.data as T, meta: { ...result.meta, fromCache: true } };
  }
  if (inflight.size >= 90) throw limitError(2);

  async function refresh(stored: CachedData<Body> | null): Promise<Result> {
    const lease = await acquireLease(key, 25_000);
    if (!lease) {
      if (stored && !options.refresh && !(match && !match[3])) return cached(stored, !!token, "stale");
      for (const ms of [100, 250, 500, 600]) {
        await new Promise((resolve) => setTimeout(resolve, ms));
        const another = seconds > 0 ? await getCachedData<Body>(key) : null;
        if (another && (options.refresh ? another.updatedAt >= wanted : another.freshUntil > Date.now())) {
          return cached(another, !!token, "fresh");
        }
      }
      throw limitError(2, "This GitHub resource is already being refreshed. Try again shortly.");
    }
    try {
      // A different worker may have filled the cache before we took the lock.
      const newer = seconds > 0 ? await getCachedData<Body>(key) : null;
      if (newer && (options.refresh ? newer.updatedAt >= wanted : newer.freshUntil > Date.now())) return cached(newer, !!token, "fresh");
      const lastGood = newer ?? stored;
      try {
        const result = await execute(identity, token, bucketFor(path, options.resource), timeout, lastGood?.data);
        await setCachedData(key, result.entry, seconds, seconds ? seconds + envInt("GITHUB_STALE_TTL", 86400, 0, 604800) : 0, Date.parse(result.meta.observedAt));
        return { data: result.entry.body, meta: result.meta };
      } catch (error) {
        if (error instanceof GithubApiError) {
          if (error.kind === "not_found" || error.kind === "forbidden" || error.kind === "unauthorized") await invalidateCache(key);
          if (!options.refresh && lastGood && ["rate_limited", "network", "timeout", "unavailable"].includes(error.kind)) {
            return cached(lastGood, !!token, "stale");
          }
        }
        throw error;
      }
    } finally { await lease.release(); }
  }

  const job = (async () => {
    const stored = seconds > 0 ? await getCachedData<Body>(key) : null;
    if (stored && !options.refresh && stored.freshUntil > Date.now()) return cached(stored, !!token, "fresh");
    counters.cacheMisses++;
    // Metadata controls public visibility, and the collector needs validated
    // timestamps. Revalidate these on the awaited path, never from a stale job.
    if (stored && !options.refresh && !(match && !match[3]) && path !== "/rate_limit" && deferred.size < 8) {
      if (deferred.has(key)) return cached(stored, !!token, "stale");
      deferred.add(key);
      try {
        after(async () => { try { await refresh(stored); } catch { /* retain last good only on transient errors */ } finally { deferred.delete(key); } });
        return cached(stored, !!token, "stale");
      } catch { deferred.delete(key); } // Not in a Next request (scripts/tests).
    }
    return refresh(stored);
  })().finally(() => inflight.delete(flightKey));
  inflight.set(flightKey, job);
  const result = await waitFor(job, options.signal);
  return { ...result, data: result.data as T };
}

async function execute(
  { url, scope, accept, responseType }: ReturnType<typeof requestIdentity>, token: string | null,
  bucket: Bucket, timeout: number, stored?: Body,
): Promise<{ entry: Body; meta: GithubRequestMeta }> {
  const release = await permit(scope, bucket, !!token, timeout);
  let redirected: (() => Promise<void>) | undefined;
  const signal = AbortSignal.timeout(timeout);
  let start = Date.now();
  const headers = {
    Accept: accept, "X-GitHub-Api-Version": version, "User-Agent": "RepoLens",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(stored?.etag ? { "If-None-Match": stored.etag } : {}),
    ...(stored?.lastModified ? { "If-Modified-Since": stored.lastModified } : {}),
  };
  const fetchOptions: RequestInit = { headers, signal, cache: "no-store", redirect: "manual" };
  try {
    counters.totalRequests++;
    let response = await fetch(url.toString(), fetchOptions);
    if ([301, 302, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      const target = location ? new URL(location, api) : null;
      // GitHub renames redirect from /repos/owner/name (and its children) to
      // /repositories/id. No token is ever sent to redirected external hosts.
      if (!target || target.origin !== api || target.username || target.password || !/^\/repositories\/\d+(?:\/|$)/.test(target.pathname) || !repoPath.test(url.pathname)) throw publicNotFound();
      await response.body?.cancel();
      counters.upstreamMs += Date.now() - start;
      await release();
      redirected = await permit(scope, bucket, !!token, timeout);
      signal.throwIfAborted();
      start = Date.now();
      counters.totalRequests++;
      response = await fetch(target.toString(), fetchOptions);
    }
    const rateLimit = readRateLimit(response.headers, bucket);
    if (rateLimit) quota[bucket] = rateLimit;
    const observedAt = new Date().toISOString();
    const meta: GithubRequestMeta = { status: response.status, rateLimit, fromCache: false, authenticated: !!token, observedAt, freshness: "live" };
    const exhausted = response.headers.get("x-ratelimit-remaining") === "0";
    if (response.status === 304 && stored) {
      if (exhausted) await recordCooldown(scope, bucket, secondsToReset(response.headers), false);
      counters.notModified++;
      return { entry: { ...stored, etag: response.headers.get("etag") ?? stored.etag, lastModified: response.headers.get("last-modified") ?? stored.lastModified }, meta: { ...meta, freshness: "validated", fromCache: true } };
    }
    const text = response.status === 204 ? "" : await boundedText(response, response.ok ? 8 * 1024 * 1024 : 16_384);
    if (!response.ok) {
      const safeText = token ? text.replaceAll(token, "[redacted]") : text;
      let body: unknown;
      try { body = JSON.parse(safeText); } catch { body = null; }
      const error = errorFromResponse({ status: response.status, statusText: response.statusText, body, headers: response.headers, authenticated: !!token });
      if (error.kind === "rate_limited") {
        counters.rateLimitErrors++;
        const secondary = !exhausted;
        if (secondary) counters.secondaryLimits++;
        const explicit = retryAfterSeconds(response.headers);
        const seconds = await recordCooldown(scope, bucket, exhausted ? Math.max(secondsToReset(response.headers), explicit ?? 0) : explicit ?? 0, secondary);
        throw new GithubApiError({ ...error.toJSON(), retryAfterSeconds: Math.max(error.retryAfterSeconds ?? 0, seconds), resetAt: new Date(Date.now() + seconds * 1000).toISOString() });
      }
      throw error;
    }
    if (exhausted) await recordCooldown(scope, bucket, secondsToReset(response.headers), false);
    let body: unknown = text;
    if (responseType === "json") {
      try { body = response.status === 204 ? null : JSON.parse(text); } catch {
        throw new GithubApiError({ kind: "unavailable", message: "GitHub returned an unreadable response." });
      }
    }
    return { entry: { body: publicData(body, url.pathname), etag: response.headers.get("etag"), lastModified: response.headers.get("last-modified") }, meta };
  } catch (error) {
    counters.failures++;
    if (error instanceof GithubApiError) throw error;
    if (signal.aborted) throw new GithubApiError({ kind: "timeout", message: "The request to GitHub timed out. Try a narrower search or try again." });
    throw new GithubApiError({ kind: "network", message: "Could not reach GitHub's API. Please try again." });
  } finally {
    counters.upstreamMs += Date.now() - start;
    await (redirected ?? release)();
  }
}

function secondsToReset(headers: Headers) {
  const iso = resetIso(headers);
  return iso ? Math.max(1, Math.ceil((Date.parse(iso) - Date.now()) / 1000)) : 60;
}

export async function boundedText(response: Response, maxBytes: number) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  let size = 0;
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return text + decoder.decode();
      size += value.byteLength;
      if (size > maxBytes) throw new GithubApiError({ kind: "unavailable", message: "The upstream response exceeded the allowed size." });
      text += decoder.decode(value, { stream: true });
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

export async function fetchRateLimits(signal?: AbortSignal) {
  const { data } = await githubRequest<{ resources?: Record<string, { limit: number; remaining: number; reset: number }> }>({ path: "/rate_limit", signal });
  const info = (resource: "core" | "search"): RateLimitInfo | null => {
    const entry = data.resources?.[resource];
    return entry ? { limit: entry.limit, remaining: entry.remaining, resetAt: Number.isFinite(entry.reset) ? new Date(entry.reset * 1000).toISOString() : null, resource } : null;
  };
  return { core: info("core"), search: info("search"), authenticated: isGithubAuthenticated() };
}

export function __clearGithubCache(): void {
  clearLocalCache();
  clearRedisStateForTests();
  clearPacing();
  inflight.clear();
  deferred.clear();
}
