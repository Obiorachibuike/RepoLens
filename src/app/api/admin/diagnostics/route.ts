import { desc, sql } from "drizzle-orm";
import { hasBearer } from "@/lib/api/authorization";
import { ok } from "@/lib/api/respond";
import { checkDatabase, getDatabase } from "@/lib/db/client";
import { scheduledJobRuns } from "@/lib/db/schema";
import { getCacheStatus } from "@/lib/infra/cache";
import { checkRedis } from "@/lib/infra/redis";
import { githubDiagnostics, isGithubAuthenticated } from "@/lib/github/client";
import { isAiConfigured } from "@/lib/ai/provider";
import { summarizeUsage } from "@/lib/workspace/usage";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!hasBearer(request, process.env.DIAGNOSTICS_SECRET)) return Response.json({ error: { kind: "unauthorized", message: "Diagnostics authorization required." } }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const db = database.connected ? getDatabase() : null;
  const [jobs, usage, snapshots] = db ? await Promise.all([
    db.select({ job: scheduledJobRuns.job, state: scheduledJobRuns.state, collected: scheduledJobRuns.collected, failed: scheduledJobRuns.failed, deferred: scheduledJobRuns.deferred, reason: scheduledJobRuns.reason, startedAt: scheduledJobRuns.startedAt, finishedAt: scheduledJobRuns.finishedAt }).from(scheduledJobRuns).orderBy(desc(scheduledJobRuns.startedAt)).limit(8).catch(() => null),
    summarizeUsage(db).catch(() => null),
    db.execute<{ lastObservation: string | null }>(sql`SELECT max(captured_at)::text AS "lastObservation" FROM repository_snapshots`).then((res) => res.rows[0] ?? null, () => null),
  ]) : [null, null, null];
  return ok({ github: { tokenConfigured: isGithubAuthenticated(), ...githubDiagnostics() }, redis, cache: getCacheStatus(), database, snapshots, jobs, ai: { configured: isAiConfigured(), last30Days: usage } });
}
