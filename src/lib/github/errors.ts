import type { GithubErrorKind } from "./types";

/**
 * A typed, user-safe error for every GitHub API failure.
 *
 * It never carries raw credentials or upstream stack traces — only a
 * human-readable message plus the structured detail the UI needs.
 */
export class GithubApiError extends Error {
  readonly kind: GithubErrorKind;
  readonly status: number | null;
  readonly retryAfterSeconds: number | null;
  readonly resetAt: string | null;
  readonly hint: string | null;

  constructor(options: {
    kind: GithubErrorKind;
    message: string;
    status?: number | null;
    retryAfterSeconds?: number | null;
    resetAt?: string | null;
    hint?: string | null;
  }) {
    super(options.message);
    this.name = "GithubApiError";
    this.kind = options.kind;
    this.status = options.status ?? null;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
    this.resetAt = options.resetAt ?? null;
    this.hint = options.hint ?? null;
  }

  toJSON() {
    return {
      kind: this.kind,
      message: this.message,
      status: this.status,
      retryAfterSeconds: this.retryAfterSeconds,
      resetAt: this.resetAt,
      hint: this.hint,
    };
  }
}

function secondsUntil(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.ceil(ms / 1000));
}

function humanReset(iso: string | null): string {
  if (!iso) return "shortly";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "shortly";
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

/** Translate an HTTP response from api.github.com into a GithubApiError. */
export function errorFromResponse(options: {
  status: number;
  statusText: string;
  body: unknown;
  headers: Headers;
  authenticated: boolean;
  requiresAuth?: boolean;
}): GithubApiError {
  const { status, headers, authenticated } = options;
  const retryAfterHeader = headers.get("retry-after");
  const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : null;
  const remaining = headers.get("x-ratelimit-remaining");
  const resetHeader = headers.get("x-ratelimit-reset");
  const resetAt = resetHeader ? new Date(Number(resetHeader) * 1000).toISOString() : null;
  const message = extractMessage(options.body);

  // Secondary rate limits arrive as 403 with a Retry-After header.
  if (status === 403 && retryAfterSeconds && retryAfterSeconds > 0) {
    return new GithubApiError({
      kind: "rate_limited",
      status,
      retryAfterSeconds,
      resetAt,
      message: `GitHub asked us to slow down. Try again in about ${retryAfterSeconds} seconds.`,
      hint: "Secondary rate limits are temporary — waiting is the only fix.",
    });
  }

  if (status === 403 && remaining === "0") {
    return new GithubApiError({
      kind: "rate_limited",
      status,
      resetAt,
      retryAfterSeconds: secondsUntil(resetAt),
      message: `GitHub's ${authenticated ? "authenticated" : "unauthenticated"} request limit has been reached. It resets at ${humanReset(resetAt)}.`,
      hint: authenticated
        ? "Set GITHUB_TOKEN to a token with more quota, or wait for the reset."
        : "Set the optional GITHUB_TOKEN environment variable to raise the limit from 60 to 5,000 requests per hour.",
    });
  }

  if (status === 429) {
    return new GithubApiError({
      kind: "rate_limited",
      status,
      retryAfterSeconds,
      resetAt,
      message: retryAfterSeconds
        ? `GitHub is rate limiting requests. Try again in about ${retryAfterSeconds} seconds.`
        : "GitHub is rate limiting requests. Please wait before trying again.",
    });
  }

  switch (status) {
    case 401:
      return new GithubApiError({
        kind: options.requiresAuth && !authenticated ? "unauthorized" : "unauthorized",
        status,
        message: options.requiresAuth
          ? "This GitHub endpoint requires authentication. Set the optional GITHUB_TOKEN server environment variable to enable it."
          : "GitHub rejected the configured token. Check that GITHUB_TOKEN is valid.",
        hint: "Public repository search works without a token; code search does not.",
      });
    case 403:
      return new GithubApiError({
        kind: "forbidden",
        status,
        message: message || "GitHub refused this request (403 Forbidden).",
        hint: "The configured token may be missing a permission this endpoint needs.",
      });
    case 404:
      return new GithubApiError({
        kind: "not_found",
        status,
        message: message || "Not found on GitHub. It may be private, renamed, or deleted.",
      });
    case 422:
      return new GithubApiError({
        kind: "validation",
        status,
        message: message || "GitHub could not process that query. Check the syntax and try again.",
        hint: "Qualifiers such as stars:>100 must use valid values, and dates must be YYYY-MM-DD.",
      });
    default:
      if (status >= 500) {
        return new GithubApiError({
          kind: "unavailable",
          status,
          message: "GitHub's API is temporarily unavailable. Please try again in a moment.",
        });
      }
      return new GithubApiError({
        kind: "unknown",
        status,
        message: message || `GitHub returned an unexpected response (${status}).`,
      });
  }
}

/** Pull a readable message out of GitHub's error body without leaking internals. */
function extractMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const message = record.message;
  if (typeof message === "string" && message.length > 0 && !message.includes("token")) {
    const errors = record.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      const first = errors[0];
      if (first && typeof first === "object") {
        const detail = (first as Record<string, unknown>).message;
        if (typeof detail === "string") return `${message} (${detail})`;
      }
    }
    return message;
  }
  return null;
}
