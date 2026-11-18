import { hasBearer } from "@/lib/api/authorization";
import { fromError, ok, serviceUnavailable } from "@/lib/api/respond";
import { getDatabase } from "@/lib/db/client";
import { isGithubAuthenticated } from "@/lib/github/client";
import { collectSnapshots } from "@/lib/trending/collector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!hasBearer(request, process.env.CRON_SECRET)) return Response.json({ error: { kind: "unauthorized", message: "Unauthorized job request." } }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const db = getDatabase();
  if (!db) return serviceUnavailable("Snapshot collection", "PostgreSQL is not configured.");
  if (!isGithubAuthenticated()) return serviceUnavailable("Snapshot collection", "Configure GITHUB_TOKEN to collect snapshots within authenticated rate limits.");
  try {
    const result = await collectSnapshots(db);
    return ok(result, { status: result.state === "running" ? 202 : result.state === "rate_limited" ? 429 : result.state === "failed" ? 503 : 200 });
  } catch (error) { return fromError(error); }
}

// Vercel Cron invokes GET with the same Bearer CRON_SECRET as external POST.
export const GET = POST;
