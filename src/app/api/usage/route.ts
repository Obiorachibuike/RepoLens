import { fromError, ok, serviceUnavailable, sessionRequired } from "@/lib/api/respond";
import { getDatabase } from "@/lib/db/client";
import { currentUserId } from "@/lib/session";
import { summarizeUsage } from "@/lib/workspace/usage";
import { isAiConfigured } from "@/lib/ai/provider";
export const dynamic = "force-dynamic";
export async function GET() {
  const db = getDatabase();
  if (!db) return serviceUnavailable("AI usage", "PostgreSQL is not configured for usage tracking.");
  try {
    const user = await currentUserId();
    if (!user) return sessionRequired();
    return ok({ configured: isAiConfigured(), last30Days: await summarizeUsage(db, user) });
  } catch (error) { return fromError(error); }
}
