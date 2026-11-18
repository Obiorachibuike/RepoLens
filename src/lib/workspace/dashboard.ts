import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { getDatabase } from "@/lib/db/client";
import { repositoryAnalyses } from "@/lib/db/schema";
import { currentUserId } from "@/lib/session";
import { parseTrending } from "@/lib/trending/model";
import { readTrending } from "@/lib/trending/query";
import { recommendationSignals, recommendProjects } from "@/lib/discovery/recommendations";
import { recommendationProfile } from "@/lib/discovery/filters";
import { envInt } from "@/lib/infra/config";

export async function recentAnalyses(limit = 8, offset = 0) {
  const db = getDatabase();
  if (!db) return null;
  try {
    const user = await currentUserId();
    if (!user) return [];
    return await db.select({ repository: repositoryAnalyses.repository, healthScore: repositoryAnalyses.healthScore, evidenceCoverage: repositoryAnalyses.evidenceCoverage, viewedAt: repositoryAnalyses.viewedAt })
      .from(repositoryAnalyses).where(eq(repositoryAnalyses.userId, user)).orderBy(desc(repositoryAnalyses.viewedAt), asc(repositoryAnalyses.repository)).limit(Math.min(50, limit)).offset(Math.max(0, offset));
  } catch { return null; }
}

export async function loadDashboard() {
  const db = getDatabase();
  const filters = parseTrending({ limit: 4 });
  const discover = async () => {
    if (process.env.REPOLENS_OVERVIEW_PROJECTS === "off") return null;
    const signals = await recommendationSignals();
    return recommendProjects(signals.profile ?? recommendationProfile.parse({}), signals).catch(() => null);
  };
  const [trending, recent, recommended] = await Promise.all([
    db && filters.success ? readTrending(db, filters.data).catch(() => null) : null,
    recentAnalyses(4), discover(),
  ]);
  return { trending, recent, recommended, configured: Boolean(db), cadence: envInt("SNAPSHOT_INTERVAL_HOURS", 20, 1, 48) };
}
