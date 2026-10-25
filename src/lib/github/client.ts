import "server-only";
import { GithubApiError, errorFromResponse } from "./errors";
import type { RateLimitInfo } from "./types";

const GITHUB_API_BASE = "https://api.github.com";
const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_CACHE_ENTRIES = 250;

export interface GithubRequestMeta {
  status: number;
  rateLimit: RateLimitInfo | null;
  fromCache: boolean;
  authenticated: boolean;
}

export interface GithubRequestOptions {
  /** Path after https://api.github.com, e.g. "/search/repositories". */
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** "search" or "core" — decides which rate-limit bucket we report. */
  resource?: "search" | "core";
  /** Endpoints such as code search need a token; set to produce a clear error. */
  requiresAuth?: boolean;
  /** In-memory cache lifetime in seconds. 0 disables caching (default). */
  cacheSeconds?: number;
  timeoutMs?: number;
  accept?: string;
  /** "text" for raw media types such as application/vnd.github.raw. */
  responseType?: "json" | "text";
  signal?: AbortSignal;
}

interface CacheEntry {
  payload: Promise<unknown>;
  expiresAt: number;
}

/**
 * Tiny in-memory cache + request de-duplication.
 * On a serverless deployment it is per-instance, which is exactly what we want:
 * it collapses duplicate renders without pretending to be a shared cache.
 */
const cache = new Map<string, CacheEntry>();
/** In-flight de-duplication: identical concurrent requests share one response. */
const inflight = new Map<string, Promise<{ data: unknown }>>();

function pruneCache(): void {
  if (cache.size <= MAX_CACHE_ENTRIES) return;
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
}

/** Server-side only. Never exposed to the client bundle. */
export function getGithubToken(): string | null {
  const token =
    process.env.GITHUB_TOKEN?.trim() ||
    process.env.GITHUB_PERSONAL_ACCESS_TOKEN?.trim() ||
    null;
  return token && token.length > 0 ? token : null;
}

export function isGithubAuthenticated(): boolean {
  return getGithubToken() !== null;
}

function buildUrl(path: string, query?: GithubRequestOptions["query"]): string {
  const url = new URL(path.startsWith("http") ? path : `${GITHUB_API_BASE}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function readRateLimit(headers: Headers, resource: "search" | "core"): RateLimitInfo | null {
  const limit = headers.get("x-ratelimit-limit");
  const remaining = headers.get("x-ratelimit-remaining");
  const reset = headers.get("x-ratelimit-reset");
  const used = headers.get("x-ratelimit-used");
  if (!limit || !remaining) return null;
  const headerResource = headers.get("x-ratelimit-resource");
  return {
    limit: Number(limit),
    remaining: Number(remaining),
    used: used ? Number(used) : undefined,
    resetAt: reset ? new Date(Number(reset) * 1000).toISOString() : null,
    resource: headerResource === "search" || headerResource === "core" ? headerResource : resource,
  };
}

function combineSignals(signal: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
  let onAbort: (() => void) | null = null;
  if (signal) {
    if (signal.aborted) {
      controller.abort(signal.reason);
    } else {
      onAbort = () => controller.abort(signal.reason);
      signal.addEventListener("abort", onAbort, { once: true });
    }
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      if (signal && onAbort) signal.removeEventListener("abort", onAbort);
    },
  };
}

/**
 * Single entry point for every api.github.com call: builds the URL, attaches the
 * optional server-side token, enforces a timeout, honours caller cancellation,
 * de-duplicates identical in-flight requests, maps failures to GithubApiError
 * and reports the rate-limit bucket that answered.
 */
export async function githubRequest<T>(
  options: GithubRequestOptions,
): Promise<{ data: T; meta: GithubRequestMeta }> {
  const {
    path,
    query,
    resource = "core",
    requiresAuth = false,
    cacheSeconds = 0,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    accept,
    responseType = "json",
    signal,
  } = options;

  const token = getGithubToken();
  const authenticated = token !== null;

  if (requiresAuth && !authenticated) {
    throw new GithubApiError({
      kind: "unauthorized",
      status: 401,
      message:
        "GitHub code search requires authentication. Set the optional GITHUB_TOKEN server environment variable to enable it.",
      hint: "A classic token with no scopes is enough — no repository permissions are needed.",
    });
  }

  const url = buildUrl(path, query);
  const cacheKey = `${url}#${accept ?? "default"}`;
  const now = Date.now();

  if (cacheSeconds > 0) {
    const hit = cache.get(cacheKey);
    if (hit && hit.expiresAt > now) {
      return { data: (await hit.payload) as T, meta: { status: 200, rateLimit: null, fromCache: true, authenticated } };
    }
  }

  const existing = inflight.get(cacheKey);
  if (existing) {
    const shared = await existing;
    return {
      data: shared.data as T,
      meta: { status: 200, rateLimit: null, fromCache: true, authenticated },
    };
  }

  const request = execute<T>(url, {
    token,
    accept,
    responseType,
    resource,
    timeoutMs,
    signal,
    requiresAuth,
    authenticated,
  });

  inflight.set(cacheKey, request);
  try {
    const result = await request;
    if (cacheSeconds > 0) {
      pruneCache();
      cache.set(cacheKey, { payload: Promise.resolve(result.data), expiresAt: now + cacheSeconds * 1000 });
    }
    return result;
  } finally {
    inflight.delete(cacheKey);
  }
}

async function execute<T>(
  url: string,
  context: {
    token: string | null;
    accept?: string;
    responseType: "json" | "text";
    resource: "search" | "core";
    timeoutMs: number;
    signal?: AbortSignal;
    requiresAuth: boolean;
    authenticated: boolean;
  },
): Promise<{ data: T; meta: GithubRequestMeta }> {
  const { signal, cleanup } = combineSignals(context.signal, context.timeoutMs);
  try {
    const response = await fetch(url, {
      signal,
      headers: {
        Accept: context.accept ?? "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "RepoLens",
        ...(context.token ? { Authorization: `Bearer ${context.token}` } : {}),
      },
      cache: "no-store",
    });

    const rateLimit = readRateLimit(response.headers, context.resource);
    const body: unknown =
      response.ok && context.responseType === "text"
        ? await response.text()
        : await safeJson(response);

    if (!response.ok) {
      throw errorFromResponse({
        status: response.status,
        statusText: response.statusText,
        body,
        headers: response.headers,
        authenticated: context.authenticated,
        requiresAuth: context.requiresAuth,
      });
    }

    return {
      data: body as T,
      meta: { status: response.status, rateLimit, fromCache: false, authenticated: context.authenticated },
    };
  } catch (error) {
    if (error instanceof GithubApiError) throw error;
    if (error instanceof Error && (error.name === "AbortError" || error.message === "timeout")) {
      const timedOut = !context.signal?.aborted;
      throw new GithubApiError({
        kind: timedOut ? "timeout" : "network",
        message: timedOut
          ? "The request to GitHub timed out. Try a narrower search or try again."
          : "The request was cancelled.",
      });
    }
    throw new GithubApiError({
      kind: "network",
      message: "Could not reach GitHub's API. Check your network connection and try again.",
      // Never surface raw network error text — it can contain URLs and headers.
    });
  } finally {
    cleanup();
  }
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Live rate-limit snapshot straight from GitHub (GET /rate_limit). */
export async function fetchRateLimits(signal?: AbortSignal): Promise<{
  core: RateLimitInfo | null;
  search: RateLimitInfo | null;
  authenticated: boolean;
}> {
  const { data } = await githubRequest<{
    resources?: Record<string, { limit: number; remaining: number; reset: number }>;
  }>({ path: "/rate_limit", signal });

  const toInfo = (
    bucket: { limit: number; remaining: number; reset: number } | undefined,
    resource: "core" | "search",
  ): RateLimitInfo | null =>
    bucket
      ? {
          limit: bucket.limit,
          remaining: bucket.remaining,
          resetAt: new Date(bucket.reset * 1000).toISOString(),
          resource,
        }
      : null;

  return {
    core: toInfo(data.resources?.core, "core"),
    search: toInfo(data.resources?.search, "search"),
    authenticated: isGithubAuthenticated(),
  };
}

/** Test hook: clears cached responses and in-flight de-duplication entries. */
export function __clearGithubCache(): void {
  cache.clear();
  inflight.clear();
}
