import "server-only";
import { createHash } from "node:crypto";
import { and, eq, lt, sql } from "drizzle-orm";
import { type Database } from "@/lib/db/client";
import { scheduledJobLeases, scheduledJobRuns, trackedRepositories, type WatchSignals } from "@/lib/db/schema";
import { getRepository, assertRef, type RepoRef } from "@/lib/github/repos";
import { searchRepositories } from "@/lib/github/search";
import { githubRequest } from "@/lib/github/client";
import { GithubApiError } from "@/lib/github/errors";
import { acquireLease } from "@/lib/infra/redis";
import { enforceBudget } from "@/lib/infra/budget";
import { envInt } from "@/lib/infra/config";
import { poolSize, registerRepositories, saveObservation, snapshotJob } from "./store";

const leaseMs = 90_000;
const invocationBudgetMs = 43_000;
const digest = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 32);

type Due = { id: string; owner: string; name: string; github_repository_id: string; failures: number; watched: boolean };
type Outcome = "collected" | "failed" | "duplicate";
const kindOf = (error: unknown) => error instanceof GithubApiError ? error.kind : "unknown";

async function watchSignals(ref: RepoRef, signal: AbortSignal): Promise<WatchSignals> {
  assertRef(ref);
  const base = `/repos/${ref.owner}/${ref.repo}`;
  const request = async <T>(path: string, count?: number) => {
    try {
      const { data, meta } = await githubRequest<T>({ path: `${base}/${path}`, query: { per_page: count }, signal, timeoutMs: 3500, refresh: "validate" });
      if (meta.freshness !== "stale") return data;
    } catch { /* Missing measurements are omitted, not treated as changes. */ }
  };
  // A small number of watched repositories are enriched per run, sequentially
  // per repository. No clone, submodule fetch, or untrusted code execution.
  const head = await request<{ sha?: string }[]>("commits", 1);
  const releases = await request<{ tag_name?: string }[]>("releases", 1);
  const contributors = await request<{ login?: string }[]>("contributors", 12);
  const root = await request<{ name: string; sha: string }[]>("contents");
  return {
    ...(head?.[0]?.sha ? { head: head[0].sha } : {}),
    ...(releases ? { release: releases[0]?.tag_name?.slice(0, 160) ?? "No published releases" } : {}),
    ...(contributors ? { contributorSample: digest(contributors.map((entry) => entry.login ?? "").filter(Boolean).sort().join(",")) } : {}),
    ...(Array.isArray(root) ? { manifestFingerprint: digest(root.filter((item) => /^(package(?:-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|requirements\.txt|pyproject\.toml|poetry\.lock|Cargo\.(?:toml|lock)|go\.(?:mod|sum)|Gemfile(?:\.lock)?|pom\.xml|composer\.(?:json|lock))$/.test(item.name)).map((item) => `${item.name}:${item.sha}`).sort().join(",")) } : {}),
  };
}

async function observe(db: Database, item: Due, signal: AbortSignal, enrich: boolean): Promise<Outcome> {
  const ref = { owner: item.owner, repo: item.name };
  try {
    await enforceBudget("snapshot");
    const { data, observedAt, stale, hasSnapshotCounts } = await getRepository(ref, signal, "validate");
    if (stale || !hasSnapshotCounts) throw new Error("Missing snapshot evidence");
    if (String(data.id) !== String(item.github_repository_id)) throw new GithubApiError({ kind: "not_found", status: 404, message: "Repository identity changed." });
    const signals = enrich && !signal.aborted ? await watchSignals({ owner: data.owner.login, repo: data.name }, signal) : {};
    return await saveObservation(db, item.id, data, new Date(observedAt), signals) ? "collected" : "duplicate";
  } catch (error) {
    const kind = kindOf(error);
    if (signal.aborted || kind === "rate_limited" || kind === "unauthorized") throw error;
    const retryMs = Math.min(168, 2 ** Math.min(item.failures + 1, 8)) * 3600_000;
    await db.update(trackedRepositories).set({
      failures: item.failures + 1,
      nextCheckAt: new Date(Date.now() + retryMs),
      ...(kind === "not_found" ? { trackingStatus: "unavailable" as const } : {}),
    }).where(eq(trackedRepositories.id, item.id));
    return "failed";
  }
}

async function seedPool(db: Database, signal: AbortSignal) {
  const result = await db.execute<{ total: number }>(sql`SELECT count(*)::int AS total FROM tracked_repositories WHERE tracking_status = 'active' AND NOT archived`);
  if ((result.rows[0]?.total ?? 0) >= Math.floor(poolSize() * .75)) return;
  await enforceBudget("trending");
  const after = new Date(Date.now() - 45 * 86400_000).toISOString().slice(0, 10);
  const { items } = await searchRepositories({ query: `stars:>=200 pushed:>=${after} archived:false fork:false`, sort: "stars", perPage: Math.min(20, poolSize()), signal, cacheSeconds: envInt("GITHUB_TRENDING_TTL", 900, 0, 3600) });
  await registerRepositories(items, "discovery", db);
}

export async function collectSnapshots(db: Database) {
  const distributed = await acquireLease(snapshotJob, leaseMs);
  if (!distributed) return { state: "running" as const, collected: 0, failed: 0, deferred: 0 };
  try {
    // Authoritative PG lease also prevents overlap during a Redis outage (or
    // when a timed out Redis request actually acquired its key).
    const [acquired] = await db.insert(scheduledJobLeases).values({ job: snapshotJob, owner: distributed.owner, expiresAt: new Date(Date.now() + leaseMs) })
      .onConflictDoUpdate({ target: scheduledJobLeases.job, set: { owner: distributed.owner, expiresAt: new Date(Date.now() + leaseMs) }, setWhere: lt(scheduledJobLeases.expiresAt, sql`now()`) })
      .returning({ owner: scheduledJobLeases.owner });
    if (!acquired) return { state: "running" as const, collected: 0, failed: 0, deferred: 0 };
    try {
      // Close runs left behind by platform termination so diagnostics never
      // report a dead invocation as still running.
      await db.update(scheduledJobRuns).set({ state: "failed", reason: "invocation_expired", finishedAt: new Date() })
        .where(and(eq(scheduledJobRuns.job, snapshotJob), eq(scheduledJobRuns.state, "running")));
      return await runBatch(db);
    } finally {
      await db.delete(scheduledJobLeases).where(and(eq(scheduledJobLeases.job, snapshotJob), eq(scheduledJobLeases.owner, distributed.owner)));
    }
  } finally { await distributed.release(); }
}

async function runBatch(db: Database) {
  const [run] = await db.insert(scheduledJobRuns).values({ job: snapshotJob, state: "running" }).returning({ id: scheduledJobRuns.id });
  if (!run) throw new Error("Could not record snapshot run");
  const started = Date.now();
  const signal = AbortSignal.timeout(invocationBudgetMs);
  let collected = 0, failed = 0, processed = 0, eligible = 0;
  let reason: string | null = null;
  let state: typeof scheduledJobRuns.$inferInsert.state = "success";
  try {
    try { await seedPool(db, signal); } catch (error) {
      const kind = kindOf(error);
      reason = `discovery_${kind}`;
      if (kind === "unauthorized") throw error;
    }
    const limit = envInt("SNAPSHOT_BATCH_SIZE", 40, 1, 60);
    const due = await db.execute<Due>(sql`
      SELECT t.id, t.owner, t.name, t.github_repository_id, t.failures,
        EXISTS (SELECT 1 FROM repository_watchlists w WHERE w.tracked_repository_id = t.id) AS watched
      FROM tracked_repositories t
      WHERE t.tracking_status = 'active' AND NOT t.archived AND t.next_check_at <= now()
      ORDER BY t.next_check_at, t.priority DESC, t.id LIMIT ${limit + 1}
    `);
    eligible = due.rows.length;
    const queue = due.rows.slice(0, limit);
    let enriched = 0;
    const concurrency = envInt("SNAPSHOT_CONCURRENCY", 3, 1, 3);
    for (let offset = 0; offset < queue.length; offset += concurrency) {
      if (Date.now() - started > invocationBudgetMs - 6000 || signal.aborted) { reason = "batch_deadline"; break; }
      const wave = await Promise.allSettled(queue.slice(offset, offset + concurrency).map((item) =>
        observe(db, item, signal, item.watched && enriched++ < 8 && Date.now() - started < 24_000)));
      let stop = false;
      for (const item of wave) {
        if (item.status === "rejected") {
          const kind = kindOf(item.reason);
          if (kind === "rate_limited" || kind === "unauthorized" || signal.aborted) {
            reason = signal.aborted ? "batch_deadline" : kind;
            if (kind === "rate_limited") state = "rate_limited";
            if (kind === "unauthorized") state = "failed";
            stop = true;
          } else { failed++; processed++; reason = "observation_failed"; }
        } else {
          processed++;
          if (item.value === "collected") collected++;
          if (item.value === "failed") failed++;
        }
      }
      if (stop) break;
    }
    if (state === "success" && (failed > 0 || processed < eligible || reason)) state = collected > 0 || processed < eligible ? "partial" : reason?.endsWith("rate_limited") ? "rate_limited" : "failed";
  } catch (error) {
    reason = kindOf(error);
    state = reason === "rate_limited" ? "rate_limited" : "failed";
  }
  const result = { state, collected, failed, deferred: Math.max(0, eligible - processed), reason };
  await db.update(scheduledJobRuns).set({ ...result, finishedAt: new Date() }).where(eq(scheduledJobRuns.id, run.id));
  return result;
}
