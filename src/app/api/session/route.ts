import { NextResponse } from "next/server";
import { fromError } from "@/lib/api/respond";
import { SESSION_COOKIE, createSessionKey, readSessionKey, resolveUserId } from "@/lib/session";
import { isDatabaseConfigured } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * GET /api/session — reports whether server persistence is available.
 * POST /api/session — issues the anonymous session cookie (httpOnly) used to
 * scope saved repositories, collections and history when PostgreSQL is set up.
 */
export async function GET() {
  try {
    const key = await readSessionKey();
    return NextResponse.json({ configured: isDatabaseConfigured(), hasSession: Boolean(await resolveUserId(key)) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return fromError(error); }
}

export async function POST(request: Request) {
  try {
    const existing = await readSessionKey();
    let userId = await resolveUserId(existing);
    const key = existing && userId ? existing : createSessionKey();
    userId ??= await resolveUserId(key, true);
    const secure = new URL(request.url).protocol === "https:";

    const response = NextResponse.json({
      configured: isDatabaseConfigured(),
      hasSession: Boolean(userId),
    }, { headers: { "Cache-Control": "no-store" } });

    response.cookies.set(SESSION_COOKIE, key, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });

    return response;
  } catch (error) { return fromError(error); }
}
