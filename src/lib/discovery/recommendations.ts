import "server-only";
import { sql } from "drizzle-orm";
import { enforceBudget } from "@/lib/infra/budget";
import { getDatabase } from "@/lib/db/client";
import { currentUserId } from "@/lib/session";
import { getPreferences } from "@/lib/db/queries";
import { searchRepositories } from "@/lib/github/search";
import { readTrending } from "@/lib/trending/query";
import { parseTrending } from "@/lib/trending/model";
import { languageFilter, recommendationProfile, type RecommendationProfile } from "./filters";
import { repoRefSchema, type RepoRef } from "@/lib/validation/repository";

type Recommended = { ref: RepoRef; description: string | null; language: string | null; stars: number; reason: string };
const topics = { ai: "machine-learning", web: "web-development", mobile: "mobile", blockchain: "blockchain", tools: "developer-tools", security: "security", backend: "backend" } as const;

export async function recommendationSignals() {
  const db = getDatabase();
  if (!db) return { persisted: false, saved: new Set<string>(), detected: "", profile: undefined };
  try {
    const user = await currentUserId();
    if (!user) return { persisted: true, saved: new Set<string>(), detected: "", profile: undefined };
    const [prefs, result] = await Promise.all([
      getPreferences(user), db.execute<{ name: string; language: string | null }>(sql`
        SELECT full_name AS name, language FROM (SELECT full_name,language FROM saved_repositories WHERE user_id = ${user} ORDER BY created_at DESC LIMIT 40) s
        UNION ALL
        SELECT t.full_name AS name, t.primary_language AS language FROM
          (SELECT repository FROM repository_analyses WHERE user_id = ${user} ORDER BY viewed_at DESC LIMIT 10) a
          JOIN tracked_repositories t ON lower(t.full_name) = lower(a.repository) WHERE t.tracking_status = 'active'`),
    ]);
    const freq = new Map<string, number>();
    for (const item of result.rows) if (item.language && languageFilter.safeParse(item.language).success) freq.set(item.language, (freq.get(item.language) ?? 0) + 1);
    const profile = recommendationProfile.safeParse(prefs.recommendations);
    return { persisted: true, profile: profile.success ? profile.data : undefined, detected: [...freq].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "", saved: new Set(result.rows.map((r) => r.name.toLowerCase())) };
  } catch { return { persisted: true, saved: new Set<string>(), detected: "", profile: undefined }; }
}

type Signals = Awaited<ReturnType<typeof recommendationSignals>>;
export async function recommendProjects(profile: RecommendationProfile, signals: Signals): Promise<{ items: Recommended[]; reason: string; coverageMissing: boolean }> {
  const language = profile.language || signals.detected;
  const reason = profile.language ? `Preferred language: ${language}` : signals.detected ? `Language from saved repositories and analysis history: ${language}` : "No language preference or workspace signal yet";
  if (profile.category === "growing") {
    const db = getDatabase();
    const filters = parseTrending({ language: language || "all", limit: 40 });
    if (!db || !filters.success) return { items: [], reason, coverageMissing: true };
    const result = await readTrending(db, filters.data);
    const items = result.repositories.filter((repo) => !signals.saved.has(repo.fullName.toLowerCase())).slice(0, 12).map((repo) => ({ ref: { owner: repo.owner, repo: repo.name }, description: repo.description, language: repo.language, stars: repo.currentStars, reason: `Gained ${repo.starGrowth} stars between measured observations in the 7-day view` }));
    return { items, reason: `${reason}. Fast-growing suggestions use snapshot growth; skill and technology filters apply to live categories.`, coverageMissing: result.summary.coverageCount === 0 };
  }
  await enforceBudget("discovery");
  const beginner = profile.category === "beginner" || profile.skill === "beginner";
  const topic = profile.technology || (profile.category in topics ? topics[profile.category as keyof typeof topics] : "");
  const pushed = new Date(Date.now() - 120 * 86400_000).toISOString().slice(0, 10);
  const minStars = profile.skill === "experienced" ? 300 : beginner ? 20 : 100;
  const query = [`archived:false fork:false pushed:>=${pushed} stars:>=${minStars}`, language ? `language:"${language}"` : "", topic ? `topic:${topic}` : "", beginner ? "good-first-issues:>0" : ""].filter(Boolean).join(" ");
  const { items } = await searchRepositories({ query, sort: beginner ? "help-wanted-issues" : "stars", perPage: 20 });
  return { reason, coverageMissing: false, items: items.filter((repo) => !signals.saved.has(repo.fullName.toLowerCase())).flatMap((repo) => {
    const ref = repoRefSchema.safeParse({ owner: repo.owner.login, repo: repo.name });
    return ref.success ? [{ ref: ref.data, description: repo.description, language: repo.language, stars: repo.stargazersCount, reason: [language ? `${repo.language ?? language} selection` : null, topic ? `${topic} topic` : null, beginner ? "Has good-first-issue matches on GitHub (difficulty unverified)" : "Recently pushed"].filter(Boolean).join(" · ") }] : [];
  }).slice(0, 12) };
}
