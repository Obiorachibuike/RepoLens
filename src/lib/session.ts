import "server-only";
import { cookies } from "next/headers";
import { getDatabase } from "./db/client";
import { users } from "./db/schema";
import { eq } from "drizzle-orm";

export const SESSION_COOKIE = "repolens_session";

export function createSessionKey(): string {
  return crypto.randomUUID();
}

/** Reads the anonymous session key from the request cookies. */
export async function readSessionKey(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(SESSION_COOKIE)?.value;
  if (!value || !/^[0-9a-f-]{8,64}$/i.test(value)) return null;
  return value;
}

/**
 * Maps a session key to a user row, creating one on first use.
 * Returns null when PostgreSQL is not configured (callers fall back to
 * browser-local storage) — never throws for missing infrastructure.
 */
export async function resolveUserId(sessionKey: string | null): Promise<string | null> {
  if (!sessionKey) return null;
  const db = getDatabase();
  if (!db) return null;

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.anonymousKey, sessionKey)).limit(1);
  const found = existing[0];
  if (found) return found.id;

  const inserted = await db
    .insert(users)
    .values({ anonymousKey: sessionKey })
    .returning({ id: users.id });
  return inserted[0]?.id ?? null;
}

/** Convenience helper for route handlers. */
export async function currentUserId(): Promise<string | null> {
  return resolveUserId(await readSessionKey());
}
