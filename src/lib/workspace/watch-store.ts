import "server-only";
import { sql } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { defaultWatchPreferences, repositoryWatchlists } from "@/lib/db/schema";
import { GithubApiError } from "@/lib/github/errors";
import { deriveWatchEvents, type WatchItem, type WatchSnapshot } from "./watch-model";

type RawWatch = Omit<WatchItem, "events" | "unread"> & { snapshots: WatchSnapshot[] };
export async function listWatchlist(db: Database, userId: string): Promise<WatchItem[]> {
  const data = await db.execute<RawWatch>(sql`
    SELECT w.id, t.owner, t.name, t.repository_url AS url, t.archived, t.tracking_status AS status,
      t.last_tracked_at::text AS "lastChecked", t.next_check_at::text AS "nextCheck", w.seen_at::text AS "seenAt", w.preferences,
      COALESCE(observations.items, '[]'::jsonb) AS snapshots
    FROM repository_watchlists w JOIN tracked_repositories t ON t.id = w.tracked_repository_id
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object('capturedAt', s.captured_at, 'stars', s.stars, 'issues', s.open_issues, 'archived', s.archived, 'signals', s.signals) ORDER BY s.captured_at DESC) AS items
      FROM (SELECT * FROM repository_snapshots WHERE tracked_repository_id = t.id ORDER BY captured_at DESC LIMIT 24) s
    ) observations ON true
    WHERE w.user_id = ${userId} ORDER BY w.created_at DESC LIMIT 20
  `);
  return data.rows.map(({ snapshots, preferences, ...row }) => {
    const prefs = { ...defaultWatchPreferences, ...preferences };
    const events = deriveWatchEvents(snapshots, prefs, row.seenAt);
    return { ...row, preferences: prefs, events: events.slice(0, 8), unread: events.filter((event) => event.unread).length };
  });
}

export async function addWatch(db: Database, userId: string, trackedId: string) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(231592, hashtext(${userId}))`);
    const existing = await tx.execute<{ id: string; tracked_repository_id: string }>(sql`SELECT id, tracked_repository_id FROM repository_watchlists WHERE user_id = ${userId} LIMIT 20`);
    const item = existing.rows.find((row) => row.tracked_repository_id === trackedId);
    if (item) return item.id;
    if (existing.rows.length >= 20) throw new GithubApiError({ kind: "validation", message: "The watchlist can hold up to 20 repositories." });
    const [row] = await tx.insert(repositoryWatchlists).values({ userId, trackedRepositoryId: trackedId }).returning({ id: repositoryWatchlists.id });
    return row?.id;
  });
}
