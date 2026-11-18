import { fromError, ok, searchParamsToRecord, serviceUnavailable } from "@/lib/api/respond";
import { getDatabase } from "@/lib/db/client";
import { parseTrending } from "@/lib/trending/model";
import { checkRedis } from "@/lib/infra/redis";
import { readTrending } from "@/lib/trending/query";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const parsed = parseTrending(searchParamsToRecord(new URL(request.url)));
  if (!parsed.success) {
    return Response.json({ error: { kind: "validation", message: "Check the period and filters.", issues: parsed.error.issues.map((issue) => issue.message) } }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const db = getDatabase();
  if (!db) return serviceUnavailable("Historical tracking", "Trending needs PostgreSQL to store real star observations. No historical data is estimated.");
  try {
    const [result, redis] = await Promise.all([readTrending(db, parsed.data), checkRedis(30_000)]);
    return ok({ ...result, redisMode: redis.mode });
  } catch (error) { return fromError(error); }
}
