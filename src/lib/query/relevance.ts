import type { RepositorySummary } from "@/lib/github/types";
import { clamp } from "@/lib/utils";

/**
 * RepoLens relevance scoring.
 *
 * GitHub returns results in its own best-match order but does not expose a
 * percentage. When RepoLens shows a number it is *this* score, computed locally
 * and explained in the UI. It never pretends to be a GitHub value.
 *
 * Factors (weights sum to 1; inapplicable factors are removed and the rest are
 * renormalised so the score stays comparable):
 *
 *   nameMatch        0.35  search terms vs owner/name
 *   descriptionMatch 0.30  search terms vs description
 *   topicMatch       0.20  requested topics present in repo topics
 *   languageMatch    0.10  requested language equals repo language
 *   popularity       0.05  log10(stars+1)/5, capped at 100k stars
 */
export const RELEVANCE_WEIGHTS = {
  nameMatch: 0.35,
  descriptionMatch: 0.3,
  topicMatch: 0.2,
  languageMatch: 0.1,
  popularity: 0.05,
} as const;

export type RelevanceBand = "exact" | "strong" | "good" | "partial" | "weak";

export interface RelevanceFactor {
  key: keyof typeof RELEVANCE_WEIGHTS;
  label: string;
  /** 0..1 contribution before weighting. */
  value: number;
  weight: number;
  detail: string;
}

export interface RelevanceResult {
  /** 0..100 integer, or null when nothing could be measured. */
  score: number | null;
  band: RelevanceBand | null;
  factors: RelevanceFactor[];
  /** GitHub's own ordering position on this page (1-based). */
  githubRank: number | null;
}

export interface RelevanceInput {
  repo: RepositorySummary;
  /** Lowercased free-text terms from the search. */
  terms: string[];
  /** Topics requested through filters or intent extraction. */
  topics?: string[];
  /** Language requested through filters or intent extraction. */
  language?: string | null;
  /** 1-based position in the GitHub response. */
  rank?: number;
}

export function scoreRelevance(input: RelevanceInput): RelevanceResult {
  const { repo, terms, topics = [], language, rank } = input;
  const factors: RelevanceFactor[] = [];

  const fullName = `${repo.owner.login}/${repo.name}`.toLowerCase();
  const name = repo.name.toLowerCase().replace(/[-_.]/g, " ");
  const owner = repo.owner.login.toLowerCase();

  // --- name ---------------------------------------------------------------
  if (terms.length > 0) {
    const exact = terms.some((term) => term === name || term === owner || term === fullName);
    const contained = terms.filter((term) => fullName.includes(term));
    const value = exact ? 1 : contained.length > 0 ? clamp(0.55 + 0.2 * contained.length, 0, 0.95) : 0;
    factors.push({
      key: "nameMatch",
      label: "Name match",
      value,
      weight: RELEVANCE_WEIGHTS.nameMatch,
      detail: exact
        ? `“${terms.find((t) => t === name || t === owner)}” matches the repository or owner name exactly`
        : contained.length > 0
          ? `${contained.length} of ${terms.length} term(s) appear in “${fullName}”`
          : `No search term appears in “${fullName}”`,
    });
  }

  // --- description --------------------------------------------------------
  if (terms.length > 0) {
    const description = (repo.description ?? "").toLowerCase();
    if (description.length === 0) {
      factors.push({
        key: "descriptionMatch",
        label: "Description match",
        value: 0,
        weight: RELEVANCE_WEIGHTS.descriptionMatch,
        detail: "This repository has no description, so nothing could be matched",
      });
    } else {
      const matched = terms.filter((term) => description.includes(term));
      const value = matched.length / terms.length;
      factors.push({
        key: "descriptionMatch",
        label: "Description match",
        value,
        weight: RELEVANCE_WEIGHTS.descriptionMatch,
        detail: `${matched.length} of ${terms.length} term(s) found in the description`,
      });
    }
  }

  // --- topics -------------------------------------------------------------
  if (topics.length > 0) {
    const repoTopics = repo.topics.map((topic) => topic.toLowerCase());
    const matched = topics.filter((topic) => repoTopics.includes(topic));
    factors.push({
      key: "topicMatch",
      label: "Topic match",
      value: matched.length / topics.length,
      weight: RELEVANCE_WEIGHTS.topicMatch,
      detail:
        matched.length > 0
          ? `Matching topics: ${matched.join(", ")}`
          : `None of ${topics.join(", ")} are set on this repository`,
    });
  }

  // --- language -----------------------------------------------------------
  if (language) {
    const matches = (repo.language ?? "").toLowerCase() === language.toLowerCase();
    factors.push({
      key: "languageMatch",
      label: "Language match",
      value: matches ? 1 : 0,
      weight: RELEVANCE_WEIGHTS.languageMatch,
      detail: matches
        ? `Primary language is ${repo.language}`
        : `Primary language is ${repo.language ?? "not reported"} (requested ${language})`,
    });
  }

  // --- popularity ---------------------------------------------------------
  const popularity = clamp(Math.log10(repo.stargazersCount + 1) / 5, 0, 1);
  factors.push({
    key: "popularity",
    label: "Popularity signal",
    value: popularity,
    weight: RELEVANCE_WEIGHTS.popularity,
    detail: `${repo.stargazersCount.toLocaleString("en-US")} stars (log scale, capped at 100k)`,
  });

  const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
  if (totalWeight === 0) {
    return { score: null, band: null, factors: [], githubRank: rank ?? null };
  }

  const weighted = factors.reduce((sum, factor) => sum + factor.value * factor.weight, 0);
  const score = Math.round(clamp((weighted / totalWeight) * 100, 0, 100));

  return { score, band: bandFor(score), factors, githubRank: rank ?? null };
}

export function bandFor(score: number): RelevanceBand {
  // Thresholds are calibrated to what this formula can actually produce:
  // an exact name + description match with strong popularity reaches ~100,
  // an exact name match alone scores ~57, an unrelated repository scores <10.
  if (score >= 90) return "exact";
  if (score >= 70) return "strong";
  if (score >= 45) return "good";
  if (score >= 20) return "partial";
  return "weak";
}

export const BAND_LABELS: Record<RelevanceBand, string> = {
  exact: "Exact",
  strong: "Strong",
  good: "Good",
  partial: "Partial",
  weak: "Weak",
};

/** Splits free text into lowercase comparison terms (no GitHub qualifiers). */
export function relevanceTerms(q: string): string[] {
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 1 && !token.includes(":"))
    .map((token) => token.replace(/[^a-z0-9+#.]/g, ""))
    .filter(Boolean);
}
