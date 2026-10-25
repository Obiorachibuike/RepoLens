import "server-only";
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

let pool: Pool | null = null;
let database: Database | null = null;
let connectionFailed = false;

/** True when DATABASE_URL is present, i.e. persistent features are available. */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL && process.env.DATABASE_URL.trim().length > 0);
}

/**
 * Lazily creates the pooled connection.
 * Returns null when PostgreSQL is not configured or unreachable so callers can
 * fall back to browser-local storage instead of failing the whole request.
 */
export function getDatabase(): Database | null {
  if (!isDatabaseConfigured()) return null;
  if (database) return database;
  if (connectionFailed) return null;

  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    database = drizzle(pool, { schema });
    return database;
  } catch (error) {
    connectionFailed = true;
    console.error("[repolens] database unavailable:", error instanceof Error ? error.message : error);
    return null;
  }
}

/** Verifies the connection once per process; used by /api/db/status. */
export async function checkDatabase(): Promise<{ configured: boolean; connected: boolean; error: string | null }> {
  if (!isDatabaseConfigured()) return { configured: false, connected: false, error: null };
  const db = getDatabase();
  if (!db) return { configured: true, connected: false, error: "connection pool could not be created" };
  try {
    await db.execute(sql`SELECT 1 AS ok`);
    return { configured: true, connected: true, error: null };
  } catch (error) {
    connectionFailed = false; // allow a retry on the next request
    database = null;
    return {
      configured: true,
      connected: false,
      error: error instanceof Error ? error.message : "unknown error",
    };
  }
}
