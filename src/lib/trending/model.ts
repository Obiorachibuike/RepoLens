import { z } from "zod";

export const dayMs = 86_400_000;
export const periods = ["today", "3d", "7d", "14d", "30d", "1y", "custom"] as const;
export const periodLabels = { today: "Today", "3d": "Last 3 days", "7d": "Last 7 days", "14d": "Last 14 days", "30d": "Last 30 days", "1y": "Last 1 year", custom: "Custom range" } satisfies Record<(typeof periods)[number], string>;
const days = { today: 1, "3d": 3, "7d": 7, "14d": 14, "30d": 30, "1y": 365 };
export const rankingLabels = { growth: "Growth", stars: "Most starred", percentage: "Growth percentage" } as const;
export const defaultDates = { startDate: "2026-10-01", endDate: "2026-11-18" } as const;
export const trendingDefaults = { period: "7d", ranking: "growth", language: "all", page: 1, limit: 20 } as const;
const englishUTC = (now: Date) => now.toISOString().slice(0, 10);
export const maxRangeDays = 366;

export function parseTrending(input: Record<string, unknown>, now = new Date()) {
  return z.object({
    period: z.enum(periods).default(trendingDefaults.period),
    ranking: z.enum(["growth", "stars", "percentage"]).default(trendingDefaults.ranking),
    language: z.string().trim().min(1).max(60).regex(/^[\p{L}\p{N} #+.()_\-]+$/u).default(trendingDefaults.language),
    startDate: z.iso.date().optional(), endDate: z.iso.date().optional(),
    page: z.coerce.number().int().min(1).max(1000).default(trendingDefaults.page),
    limit: z.coerce.number().int().min(1).max(50).default(trendingDefaults.limit),
  }).superRefine(({ period, startDate, endDate }, ctx) => {
    if (period !== "custom") return;
    const start = startDate ?? defaultDates.startDate;
    const end = endDate ?? defaultDates.endDate;
    const flag = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (start > end) flag("startDate", "Start date must be on or before end date.");
    if (end > englishUTC(now)) flag("endDate", "End date cannot be in the future (UTC).");
    if ((Date.parse(end) - Date.parse(start)) / dayMs + 1 > maxRangeDays) flag("endDate", `Choose at most ${maxRangeDays} calendar days.`);
  }).transform(({ period, ranking, language, page, limit, startDate, endDate }) => {
    const start = startDate ?? defaultDates.startDate;
    const end = endDate ?? defaultDates.endDate;
    const bounds = period === "custom"
      ? { startAt: new Date(Date.parse(start)).toISOString(), endAt: new Date(Math.min(now.getTime(), Date.parse(end) + dayMs - 1)).toISOString() }
      : { startAt: new Date(now.getTime() - days[period] * dayMs).toISOString(), endAt: now.toISOString() };
    return { period, ranking, language: language.toLowerCase() === "all" ? "all" : language, page, limit, ...bounds, startDate: period === "custom" ? start : null, endDate: period === "custom" ? end : null, archived: false as const };
  }).safeParse(input);
}

export type TrendingFilters = NonNullable<ReturnType<typeof parseTrending>["data"]>;
export type TrendingRepository = {
  id: number; rank: number; owner: string; name: string; fullName: string; avatarUrl: string | null;
  description: string | null; language: string | null; url: string; currentStars: number; forks: number; openIssues: number;
  createdAt: string | null; updatedAt: string | null; trackedAt: string | null;
  startingStars: number | null; endingStars: number | null; starGrowth: number | null; growthPercentage: number | null;
  startingObservedAt: string | null; endingObservedAt: string | null;
  coverage: "complete" | "missing_start" | "missing_end" | "same_snapshot";
};
export type TrendingData = {
  repositories: TrendingRepository[];
  summary: { totalQualifying: number; totalStarsGained: number | null; averageGrowth: number | null; fastest: { fullName: string; owner: string; name: string; growth: number } | null; coverageCount: number; trackedCount: number; resultCoverageCount: number };
  filters: TrendingFilters;
  pagination: { page: number; limit: number; pages: number; total: number };
  historicalCoverage: { toleranceHours: number; matched: number; eligible: number };
  languages: string[];
  lastUpdatedAt: string | null;
  lastSuccessfulCollectionAt: string | null;
  freshness: "uncollected" | "fresh" | "stale";
  collectionState: "idle" | "running" | "success" | "partial" | "failed" | "rate_limited";
  redisMode: "local" | "shared" | "degraded" | "configured";
};
