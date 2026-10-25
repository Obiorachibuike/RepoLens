import { NextResponse } from "next/server";
import { GithubApiError } from "@/lib/github/errors";
import type { GithubErrorKind, RateLimitInfo } from "@/lib/github/types";

export interface ApiErrorBody {
  error: {
    kind: GithubErrorKind;
    message: string;
    hint: string | null;
    status: number | null;
    retryAfterSeconds: number | null;
    resetAt: string | null;
    /** Field-level validation errors, when the request itself was invalid. */
    issues?: string[];
  };
}

export function ok<T extends object>(
  data: T & { rateLimit?: RateLimitInfo | null },
  init?: { status?: number; revalidate?: number },
): NextResponse {
  return NextResponse.json(data, {
    status: init?.status ?? 200,
    headers: {
      // Search results change constantly; detail data can be cached briefly.
      "Cache-Control": init?.revalidate
        ? `public, s-maxage=${init.revalidate}, stale-while-revalidate=${init.revalidate * 2}`
        : "no-store",
    },
  });
}

export function validationError(issues: string[]): NextResponse<ApiErrorBody> {
  return NextResponse.json<ApiErrorBody>(
    {
      error: {
        kind: "validation",
        message: "That search could not be processed. Check the highlighted fields and try again.",
        hint: null,
        status: 400,
        retryAfterSeconds: null,
        resetAt: null,
        issues,
      },
    },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Converts any thrown value into a safe JSON error response.
 * Raw upstream payloads and stack traces never leave the server.
 */
export function fromError(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof GithubApiError) {
    const status = statusForKind(error.kind);
    return NextResponse.json<ApiErrorBody>(
      {
        error: {
          kind: error.kind,
          message: error.message,
          hint: error.hint,
          status: error.status,
          retryAfterSeconds: error.retryAfterSeconds,
          resetAt: error.resetAt,
        },
      },
      {
        status,
        headers: {
          "Cache-Control": "no-store",
          ...(error.retryAfterSeconds ? { "Retry-After": String(error.retryAfterSeconds) } : {}),
        },
      },
    );
  }

  if (error instanceof Error && error.name === "AbortError") {
    return NextResponse.json<ApiErrorBody>(
      {
        error: { kind: "network", message: "The request was cancelled.", hint: null, status: null, retryAfterSeconds: null, resetAt: null },
      },
      { status: 499, headers: { "Cache-Control": "no-store" } },
    );
  }

  // Unexpected: log server-side, return a generic message.
  console.error("[repolens] unexpected API error:", error instanceof Error ? error.message : error);
  return NextResponse.json<ApiErrorBody>(
    {
      error: {
        kind: "unknown",
        message: "Something went wrong while talking to GitHub. Please try again.",
        hint: null,
        status: null,
        retryAfterSeconds: null,
        resetAt: null,
      },
    },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

function statusForKind(kind: GithubErrorKind): number {
  switch (kind) {
    case "rate_limited":
      return 429;
    case "unauthorized":
      return 401;
    case "forbidden":
      return 403;
    case "not_found":
      return 404;
    case "validation":
      return 422;
    case "unavailable":
      return 503;
    case "timeout":
      return 504;
    case "network":
      return 502;
    default:
      return 500;
  }
}

export function serviceUnavailable(feature: string, reason: string): NextResponse<ApiErrorBody> {
  return NextResponse.json<ApiErrorBody>(
    {
      error: { kind: "unavailable", message: reason, hint: feature, status: 503, retryAfterSeconds: null, resetAt: null },
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * Shared 503 for personal features that need PostgreSQL.
 *
 * The message states what is actually happening (the data stays in the browser)
 * instead of failing silently, so the UI never has to guess.
 */
export function persistenceUnavailable(feature: string, subject: string): NextResponse<ApiErrorBody> {
  return serviceUnavailable(
    feature,
    `${subject} not synchronized: DATABASE_URL is not set on the server, so RepoLens keeps this data in the browser only. Set DATABASE_URL to sync it across devices.`,
  );
}

/** Shared 401: the visitor has no session cookie yet. */
export function sessionRequired(): NextResponse<ApiErrorBody> {
  return NextResponse.json<ApiErrorBody>(
    {
      error: {
        kind: "unauthorized",
        message: "No session. Call POST /api/session first.",
        hint: null,
        status: 401,
        retryAfterSeconds: null,
        resetAt: null,
      },
    },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}

/** Flattens Next.js URLSearchParams into the record our zod schemas expect. */
export function searchParamsToRecord(url: URL): Record<string, string> {
  const record: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (!(key in record)) record[key] = value;
  }
  return record;
}
