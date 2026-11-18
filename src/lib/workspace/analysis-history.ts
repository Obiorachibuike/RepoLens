import "server-only";
import { getDatabase } from "@/lib/db/client";
import { repositoryAnalyses } from "@/lib/db/schema";
import { currentUserId } from "@/lib/session";
import type { HealthReport } from "@/lib/intelligence/health";

export async function recordAnalysis(repository: string, report?: HealthReport) {
  const db = getDatabase();
  if (!db) return;
  try {
    const userId = await currentUserId();
    if (!userId) return;
    const scores = report ? { healthScore: report.score, evidenceCoverage: report.coverage } : {};
    await db.insert(repositoryAnalyses).values({ userId, repository, ...scores }).onConflictDoUpdate({
      target: [repositoryAnalyses.userId, repositoryAnalyses.repository], set: { ...scores, viewedAt: new Date() },
    });
  } catch { console.warn("[repolens] Analysis history write failed."); }
}
