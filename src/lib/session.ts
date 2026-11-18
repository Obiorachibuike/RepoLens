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
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return null;
  return value;
}

/**
 * Maps an existing session key to a user row. Only the session bootstrap
 * creates a session; unrelated route reads never write a new user.
 * Returns null when PostgreSQL is not configured (callers fall back to
 * browser-local storage) — never throws for missing infrastructure.
 */
export async function resolveUserId(sessionKey: string | null, create = false): Promise<string | null> {
  if (!sessionKey) return null;
  const db = getDatabase();
  if (!db) return null;

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.anonymousKey, sessionKey)).limit(1);
  const found = existing[0];
  if (found || !create) return found?.id ?? null;

  const inserted = await db
    .insert(users)
    .values({ anonymousKey: sessionKey })
    .onConflictDoNothing({ target: users.anonymousKey })
    .returning({ id: users.id });
  if (inserted[0]) return inserted[0].id;
  const [winner] = await db.select({ id: users.id }).from(users).where(eq(users.anonymousKey, sessionKey)).limit(1);
  return winner?.id ?? null;
}

/** Convenience helper for route handlers. */
export async function currentUserId(): Promise<string | null> {
  return resolveUserId(await readSessionKey());
}
