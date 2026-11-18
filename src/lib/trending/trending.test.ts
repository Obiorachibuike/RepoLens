// @vitest-environment node
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { drizzle } from "drizzle-orm/pglite";
import { readTrending } from "./query";
import { parseTrending, trendingDefaults } from "./model";

const now = new Date("2026-11-18T12:00:00.000Z");
function filters(input: Record<string, unknown> = {}) {
  const parsed = parseTrending(input, now);
  if (!parsed.success) throw parsed.error;
  return parsed.data;
}

describe("trending date semantics", () => {
  it("defaults to a rolling seven days, growth, all languages and 20 results", () => {
    expect(filters()).toMatchObject({ ...trendingDefaults, startAt: "2026-11-11T12:00:00.000Z", endAt: now.toISOString(), archived: false });
  });
  it("prefills the custom range and includes the entire last day, up to now", () => {
    expect(filters({ period: "custom" })).toMatchObject({ startDate: "2026-10-01", endDate: "2026-11-18", startAt: "2026-10-01T00:00:00.000Z", endAt: now.toISOString() });
    expect(filters({ period: "custom", startDate: "2026-10-02", endDate: "2026-11-03" }).endAt).toBe("2026-11-03T23:59:59.999Z");
    expect(filters({ period: "today" }).startAt).toBe("2026-11-17T12:00:00.000Z");
    expect(filters({ period: "1y" }).startAt).toBe("2025-11-18T12:00:00.000Z");
  });
  it.each([
    { startDate: "2026-11-19", endDate: "2026-11-18" },
    { startDate: "2026-11-01", endDate: "2026-11-19" },
    { startDate: "2026-02-30", endDate: "2026-11-11" },
    { startDate: "2024-01-01", endDate: "2026-10-01" },
  ])("rejects invalid ranges: %o", (range) => expect(parseTrending({ period: "custom", ...range }, now).success).toBe(false));
});

describe("production trending query on PostgreSQL", () => {
  const pg = new PGlite({ extensions: { pgcrypto } });
  const db = drizzle(pg);
  async function repo(id: number, name: string, stars: number, language: string | null, archived = false, last = "2026-11-18T09:00Z") {
    const { rows } = await pg.query<{ id: string }>(`INSERT INTO tracked_repositories (github_repository_id, owner,name,full_name,repository_url,current_stars,current_forks,open_issues,primary_language,archived,last_tracked_at)
      VALUES ($1, 'test', $2, 'test/'||$2,'https://github.com/test/'||$2,$3,0,0,$4,$5,$6) RETURNING id`, [id, name, stars, language, archived, last]);
    return rows[0]!.id;
  }
  async function snapshot(repoId: string, at: string, stars: number) {
    return pg.query(`INSERT INTO repository_snapshots (tracked_repository_id,stars,forks,open_issues,archived,captured_at,collection_slot)
      VALUES ($1,$2,0,0,false,$3,date_trunc('hour',$3::timestamptz))`, [repoId, stars, at]);
  }
  let alpha: string;
  beforeAll(async () => {
    await pg.exec(await readFile("drizzle/0000_init.sql", "utf8"));
    await pg.exec("INSERT INTO users (anonymous_key) VALUES ('keep-me')");
    await pg.exec(await readFile("drizzle/0001_repository_tracking.sql", "utf8"));
    alpha = await repo(1, "alpha", 110, "TypeScript");
    const beta = await repo(2, "beta", 20, "TypeScript");
    const gamma = await repo(3, "gamma", 999, null);
    const archive = await repo(4, "archive", 9999, "Rust", true);
    const old = await repo(5, "old", 45, "Go", false, "2026-11-13T09:00Z");
    const zero = await repo(6, "zero", 3, "TypeScript");
    await snapshot(alpha, "2026-11-09T07:00Z", 15);
    await snapshot(alpha, "2026-11-11T09:00Z", 50);
    await snapshot(alpha, "2026-11-11T13:00Z", 75); // after start boundary, not the start count
    await snapshot(alpha, "2026-11-18T09:00Z", 110);
    await snapshot(alpha, "2026-11-18T14:00Z", 1000); // after end boundary, not the end count
    await snapshot(beta, "2026-11-11T09:00Z", 5);
    await snapshot(beta, "2026-11-18T09:00Z", 20);
    await snapshot(gamma, "2026-11-18T09:00Z", 999);
    await snapshot(archive, "2026-11-11T09:00Z", 100);
    await snapshot(archive, "2026-11-18T09:00Z", 9999);
    await snapshot(old, "2026-11-08T09:00Z", 30); // outside tolerance
    await snapshot(old, "2026-11-13T09:00Z", 45);
    await snapshot(zero, "2026-11-11T00:00Z", 0);
    await snapshot(zero, "2026-11-18T09:00Z", 3);
    await pg.exec("INSERT INTO scheduled_job_runs (job,state,collected,started_at,finished_at) VALUES ('trending-snapshots','success',5,'2026-11-18T08:58Z','2026-11-18T09:01Z')");
  }, 20_000);
  afterAll(async () => { await pg.close(); });

  it("uses nearest prior boundaries, ranks absolute growth, and preserves original records", async () => {
    const result = await readTrending(db, filters(), now);
    expect(result.repositories.map((r) => r.name)).toEqual(["alpha", "beta", "zero"]);
    expect(result.repositories[0]).toMatchObject({ rank: 1, startingStars: 50, endingStars: 110, starGrowth: 60, growthPercentage: 120, startingObservedAt: "2026-11-11T09:00:00+00:00", coverage: "complete" });
    expect(result.repositories[2]).toMatchObject({ growthPercentage: null, startingStars: 0 });
    expect(result.summary).toMatchObject({ totalQualifying: 3, totalStarsGained: 78, averageGrowth: 26, coverageCount: 3, trackedCount: 5, fastest: { fullName: "test/alpha", growth: 60 } });
    expect(result.lastSuccessfulCollectionAt).toBe("2026-11-18T09:01:00.000Z");
    expect(await pg.query("SELECT anonymous_key FROM users")).toMatchObject({ rows: [{ anonymous_key: "keep-me" }] });
  });
  it("changes the ordering for percentage and excludes zero starting counts", async () => {
    const result = await readTrending(db, filters({ ranking: "percentage" }), now);
    expect(result.repositories.map((r) => [r.name, r.growthPercentage])).toEqual([["beta", 300], ["alpha", 120]]);
  });
  it("lists most starred without history and includes unknown languages with all", async () => {
    const result = await readTrending(db, filters({ ranking: "stars", page: 1, limit: 1 }), now);
    expect(result.repositories[0]).toMatchObject({ name: "gamma", language: null, starGrowth: null, coverage: "missing_start" });
    expect(result.pagination).toEqual({ page: 1, limit: 1, total: 5, pages: 5 });
    const page2 = await readTrending(db, filters({ ranking: "stars", page: 2, limit: 1 }), now);
    expect(page2.repositories[0]).toMatchObject({ name: "alpha", rank: 2 });
  });
  it("applies language to all summary statistics and refuses stale history", async () => {
    const result = await readTrending(db, filters({ language: "go", ranking: "stars" }), now);
    expect(result.repositories[0]).toMatchObject({ starGrowth: null, coverage: "missing_start" });
    expect(result.freshness).toBe("stale");
    expect(result.summary).toMatchObject({ totalQualifying: 1, averageGrowth: null, totalStarsGained: null, coverageCount: 0, trackedCount: 1 });
    expect(result.languages).toEqual(["Go", "TypeScript"]);
    const long = await readTrending(db, filters({ period: "custom" }), now);
    expect(long.repositories).toEqual([]);
    expect(long.summary).toMatchObject({ coverageCount: 0, totalStarsGained: null });
  });
  it("enforces collection timestamp and slot uniqueness in PostgreSQL", async () => {
    await expect(snapshot(alpha, "2026-11-18T09:00Z", 110)).rejects.toMatchObject({ code: "23505" });
    await expect(snapshot(alpha, "2026-11-18T09:25Z", 110)).rejects.toMatchObject({ code: "23505" });
  });
});
