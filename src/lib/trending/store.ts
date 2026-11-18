import "server-only";
import { and, eq, lte, sql } from "drizzle-orm";
import { getDatabase, type Database } from "@/lib/db/client";
import { repositorySnapshots, trackedRepositories, type WatchSignals } from "@/lib/db/schema";
import type { RepositoryDetail, RepositorySummary } from "@/lib/github/types";
import { envInt } from "@/lib/infra/config";
import { redactLine } from "@/lib/intelligence/redact";
import { githubRepoUrl, repoRefSchema } from "@/lib/validation/repository";

export const snapshotJob = "trending-snapshots";
export const poolSize = () => envInt("TRACKED_POOL_LIMIT", 40, 5, 250);
export const snapshotCadenceHours = () => envInt("SNAPSHOT_INTERVAL_HOURS", 20, 1, 48);
export const snapshotToleranceHours = () => envInt("SNAPSHOT_TOLERANCE_HOURS", 36, 1, 96);
export type TrackingSource = "search" | "detail" | "discovery" | "save" | "explicit";
const priority = { search: 1, detail: 2, discovery: 3, save: 4, explicit: 5 } satisfies Record<TrackingSource, number>;

const date = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? new Date(value) : null;

function metadata(repo: RepositorySummary, subscribers: number | null) {
  const ref = { owner: repo.owner.login, repo: repo.name };
  const avatar = repo.owner.avatarUrl;
  return {
    githubRepositoryId: repo.id, owner: ref.owner, name: ref.repo, fullName: `${ref.owner}/${ref.repo}`,
    description: repo.description ? redactLine(repo.description).slice(0, 2000) : null, avatarUrl: avatar?.startsWith("https://avatars.githubusercontent.com/") ? avatar : null,
    primaryLanguage: repo.language?.slice(0, 60) ?? null, repositoryUrl: githubRepoUrl(ref), topics: repo.topics.slice(0, 24),
    currentStars: repo.stargazersCount, currentForks: repo.forksCount, openIssues: repo.openIssuesCount, watchers: subscribers,
    archived: repo.archived, githubCreatedAt: date(repo.createdAt), githubUpdatedAt: date(repo.updatedAt), pushedAt: date(repo.pushedAt),
  };
}
export async function registerRepositories(repos: RepositorySummary[], source: TrackingSource, database = getDatabase()) {
  if (!database) return [];
  const recentAfter = Date.now() - 365 * 86400_000;
  const isPriority = priority[source] >= priority.save;
  const candidates = [...new Map(repos.map((repo) => [repo.id, repo])).values()].filter((repo) =>
    Number.isSafeInteger(repo.id) && repo.id > 0 && !repo.disabled &&
    !("visibility" in repo && repo.visibility !== "public") &&
    repoRefSchema.safeParse({ owner: repo.owner.login, repo: repo.name }).success &&
    (isPriority || (!repo.archived && !repo.fork && repo.stargazersCount >= 20 && Date.parse(repo.pushedAt) >= recentAfter)),
  ).slice(0, source === "discovery" ? 20 : 4);
  if (candidates.length === 0) return [];
  return database.transaction(async (tx) => {
    // Serializes only pool admission, never a GitHub request or a snapshot read.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(382110475)`);
    const ids = sql.join(candidates.map((r) => sql`${r.id}`), sql`, `);
    const existing = await tx.execute<{ id: string; github_repository_id: number | string; priority: number }>(sql`
      SELECT id, github_repository_id, priority FROM tracked_repositories WHERE github_repository_id IN (${ids}) AND tracking_status = 'active'`);
    const found = new Map(existing.rows.map((r) => [Number(r.github_repository_id), r]));
    const rows = await tx.execute<{ total: number }>(sql`SELECT count(*)::int AS total FROM tracked_repositories t WHERE tracking_status = 'active' OR EXISTS (SELECT 1 FROM repository_watchlists w WHERE w.tracked_repository_id = t.id)`);
    const capacity = isPriority ? poolSize() : Math.floor(poolSize() * (source === "discovery" ? .75 : .55));
    let available = capacity - (rows.rows[0]?.total ?? 0);
    const registered: { id: string; githubRepositoryId: number }[] = [];
    for (const repo of candidates) {
      const prev = found.get(repo.id);
      if (prev) {
        if (priority[source] > prev.priority) await tx.update(trackedRepositories).set({ priority: priority[source] }).where(eq(trackedRepositories.id, prev.id));
        registered.push({ id: prev.id, githubRepositoryId: repo.id });
      } else if (available > 0) {
        const values = { ...metadata(repo, "subscribersCount" in repo ? (repo as RepositoryDetail).subscribersCount : null), priority: priority[source] };
        const [row] = await tx.insert(trackedRepositories).values(values).onConflictDoUpdate({
          target: trackedRepositories.githubRepositoryId,
          set: { ...values, trackingStatus: "active", failures: 0, nextCheckAt: new Date() },
          setWhere: eq(trackedRepositories.trackingStatus, "unavailable"),
        }).returning({ id: trackedRepositories.id, githubRepositoryId: trackedRepositories.githubRepositoryId });
        if (row) { registered.push(row); available--; }
      }
    }
    return registered;
  });
}

export async function trackBestEffort(repos: RepositorySummary[], source: TrackingSource) {
  try { await registerRepositories(repos, source); } catch { console.warn("[repolens] Repository tracking admission failed."); }
}

export async function saveObservation(db: Database, trackedId: string, repo: RepositoryDetail, capturedAt: Date, signals: WatchSignals = {}, probeAt?: Date) {
  const collectionSlot = new Date(Math.floor(capturedAt.getTime() / 3600_000) * 3600_000);
  const updated = metadata(repo, repo.subscribersCount);
  const next = new Date(capturedAt.getTime() + snapshotCadenceHours() * 3600_000);
  return db.transaction(async (tx) => {
    const [written] = await tx.insert(repositorySnapshots).values({
      trackedRepositoryId: trackedId, stars: updated.currentStars, forks: updated.currentForks,
      openIssues: updated.openIssues, watchers: updated.watchers, archived: updated.archived, capturedAt, collectionSlot, signals,
    }).onConflictDoNothing().returning({ id: repositorySnapshots.id });
    if (written) await tx.update(trackedRepositories).set({ ...updated, lastTrackedAt: capturedAt, ...(probeAt && { lastWatchProbeAt: probeAt }), nextCheckAt: next, failures: 0, trackingStatus: "active" })
      .where(and(eq(trackedRepositories.id, trackedId), sql`(${trackedRepositories.lastTrackedAt} IS NULL OR ${lte(trackedRepositories.lastTrackedAt, capturedAt)})`));
    return Boolean(written);
  });
}
