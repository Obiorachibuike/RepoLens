import "server-only";
import { sql } from "drizzle-orm";
import type { Database } from "@/lib/db/client";

export async function summarizeUsage(db: Database, userId?: string) {
  const values = await db.execute<{ attempts: number; successes: number; failures: number; pending: number; input: number | null; output: number | null; costMicros: number | null; priced: number }>(sql`
    SELECT count(*)::int AS attempts,
        count(*) FILTER (WHERE state = 'success')::int AS successes,
        count(*) FILTER (WHERE state = 'failed')::int AS failures,
        count(*) FILTER (WHERE state = 'pending')::int AS pending,
        sum(input_tokens)::float8 AS input, sum(output_tokens)::float8 AS output,
        sum(cost_micros)::float8 AS "costMicros", count(cost_micros)::int AS priced
    FROM analysis_usage WHERE created_at >= now() - interval '30 days'
      ${userId ? sql`AND user_id = ${userId}` : sql``}`);
  return values.rows[0];
}
