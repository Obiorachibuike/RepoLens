import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { redisStatus } from "@/lib/infra/redis";
import type { TrendingData, TrendingFilters } from "./model";
import { snapshotToleranceHours, snapshotJob } from "./store";

export type SqlReader = { execute(statement: SQL): PromiseLike<{ rows: Record<string, unknown>[] }> };

type QueryRow = {
  repositories: TrendingData["repositories"];
  summary: TrendingData["summary"];
  languages: string[];
  lastSnapshot: string | null;
  lastSuccess: string | null;
  lastState: TrendingData["collectionState"] | null;
  runStarted: string | null;
};

export async function readTrending(db: SqlReader, filters: TrendingFilters, now = new Date()): Promise<TrendingData> {
  const maxAge = snapshotToleranceHours();
  const { startAt, endAt, language, ranking, page, limit } = filters;
  const offset = (page - 1) * limit;
  const sort = ranking === "stars" ? sql`current_stars DESC` : ranking === "percentage" ? sql`pct DESC, growth DESC, current_stars DESC` : sql`growth DESC, current_stars DESC`;
  const qualifies = ranking === "stars" ? sql`true` : ranking === "percentage" ? sql`growth > 0 AND pct IS NOT NULL` : sql`growth > 0`;
  const result = await db.execute(sql`
    WITH boundaries AS (
      SELECT ${startAt}::timestamptz AS start_at, ${endAt}::timestamptz AS end_at,
             make_interval(hours => ${maxAge}::int) AS tolerance
    ), matched AS (
      SELECT r.*, a.stars AS starting, b.stars AS ending, a.captured_at AS observed_start, b.captured_at AS observed_end,
        CASE WHEN a.captured_at IS NULL THEN 'missing_start'
             WHEN b.captured_at IS NULL THEN 'missing_end'
             WHEN a.captured_at >= b.captured_at THEN 'same_snapshot'
             ELSE 'complete' END AS coverage,
        CASE WHEN a.captured_at < b.captured_at THEN b.stars - a.stars END AS growth
      FROM tracked_repositories r CROSS JOIN boundaries bounds
      LEFT JOIN LATERAL (
        SELECT stars, captured_at FROM repository_snapshots
        WHERE tracked_repository_id = r.id AND captured_at <= bounds.start_at AND captured_at >= bounds.start_at - bounds.tolerance
        ORDER BY captured_at DESC LIMIT 1
      ) a ON true
      LEFT JOIN LATERAL (
        SELECT stars, captured_at FROM repository_snapshots
        WHERE tracked_repository_id = r.id AND captured_at <= bounds.end_at AND captured_at >= bounds.end_at - bounds.tolerance
        ORDER BY captured_at DESC LIMIT 1
      ) b ON true
      WHERE r.tracking_status = 'active' AND NOT r.archived
        ${language === "all" ? sql`` : sql`AND lower(r.primary_language) = lower(${language})`}
    ), computed AS (
      SELECT matched.*, growth::numeric * 100 / nullif(starting, 0) AS pct FROM matched
    ), qualified AS (
      SELECT * FROM computed WHERE ${qualifies}
    ), page_rows AS (
      SELECT q.*, row_number() OVER (ORDER BY ${sort}, lower(full_name), github_repository_id)::int AS rank
      FROM qualified q ORDER BY ${sort}, lower(full_name), github_repository_id LIMIT ${limit} OFFSET ${offset}
    ), eligible_stats AS (
      SELECT count(*)::int AS eligible, count(*) FILTER (WHERE coverage = 'complete')::int AS covered,
        max(last_tracked_at) AS last_snapshot FROM matched
    ), qualifying_stats AS (
      SELECT count(*)::int AS total, count(growth)::int AS covered,
        sum(growth) AS gained, round(avg(growth), 2) AS average FROM qualified
    ), latest_run AS (
      SELECT state, started_at FROM scheduled_job_runs WHERE job = ${snapshotJob} ORDER BY started_at DESC LIMIT 1
    )
    SELECT COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', github_repository_id, 'rank', rank, 'owner', owner, 'name', name, 'fullName', full_name,
      'avatarUrl', avatar_url, 'description', description, 'language', primary_language, 'url', repository_url,
      'currentStars', current_stars, 'forks', current_forks, 'openIssues', open_issues, 'createdAt', github_created_at,
      'updatedAt', github_updated_at, 'trackedAt', last_tracked_at,
      'startingStars', starting, 'endingStars', ending, 'starGrowth', growth, 'growthPercentage', round(pct, 2),
      'startingObservedAt', observed_start, 'endingObservedAt', observed_end, 'coverage', coverage
    ) ORDER BY rank) FROM page_rows), '[]'::jsonb) AS repositories,
    jsonb_build_object('totalQualifying', qs.total, 'totalStarsGained', qs.gained, 'averageGrowth', qs.average,
      'coverageCount', es.covered, 'trackedCount', es.eligible, 'resultCoverageCount', qs.covered, 'fastest', (
        SELECT jsonb_build_object('fullName', full_name, 'owner', owner, 'name', name, 'growth', growth)
        FROM qualified WHERE growth > 0 ORDER BY growth DESC, lower(full_name), github_repository_id LIMIT 1
      )) AS summary,
    ARRAY(SELECT min(primary_language) FROM tracked_repositories WHERE tracking_status = 'active' AND NOT archived AND primary_language IS NOT NULL
      GROUP BY lower(primary_language) ORDER BY lower(primary_language) LIMIT 100) AS languages,
    es.last_snapshot::text AS "lastSnapshot",
    (SELECT max(finished_at)::text FROM scheduled_job_runs WHERE job = ${snapshotJob} AND collected > 0) AS "lastSuccess",
    (SELECT state FROM latest_run) AS "lastState", (SELECT started_at::text FROM latest_run) AS "runStarted"
    FROM qualifying_stats qs CROSS JOIN eligible_stats es
  `);
  const row = result.rows[0] as QueryRow | undefined;
  if (!row) throw new Error("Missing trending result");
  const iso = (time: string | null) => time ? new Date(time).toISOString() : null;
  const lastUpdatedAt = iso(row.lastSnapshot);
  const fresh = lastUpdatedAt && now.getTime() - Date.parse(lastUpdatedAt) <= maxAge * 3_600_000;
  return {
    repositories: row.repositories, summary: row.summary, languages: row.languages, filters,
    historicalCoverage: { toleranceHours: maxAge, matched: row.summary.coverageCount, eligible: row.summary.trackedCount },
    pagination: { page, limit, total: row.summary.totalQualifying, pages: Math.ceil(row.summary.totalQualifying / limit) },
    lastUpdatedAt, lastSuccessfulCollectionAt: iso(row.lastSuccess), freshness: !lastUpdatedAt ? "uncollected" : fresh ? "fresh" : "stale",
    collectionState: row.lastState === "running" && row.runStarted && now.getTime() - Date.parse(row.runStarted) > 90_000 ? "failed" : row.lastState ?? "idle",
    redisMode: redisStatus().mode,
  };
}
