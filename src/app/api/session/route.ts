import { NextResponse } from "next/server";
import { SESSION_COOKIE, createSessionKey, readSessionKey, resolveUserId } from "@/lib/session";
import { isDatabaseConfigured } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/session — reports whether server persistence is available.
 * POST /api/session — issues the anonymous session cookie (httpOnly) used to
 * scope saved repositories, collections and history when PostgreSQL is set up.
 */
export async function GET() {
  const key = await readSessionKey();
  return NextResponse.json({
    configured: isDatabaseConfigured(),
    hasSession: Boolean(key),
  });
}

export async function POST(request: Request) {
  const existing = await readSessionKey();
  const key = existing ?? createSessionKey();
  const userId = await resolveUserId(key);
  const secure = new URL(request.url).protocol === "https:";

  const response = NextResponse.json({
    configured: isDatabaseConfigured(),
    hasSession: Boolean(userId),
  });

  response.cookies.set(SESSION_COOKIE, key, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  return response;
}
