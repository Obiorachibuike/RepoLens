import type { RepositoryFilters, SearchMode } from "@/lib/validation/search";
import type { ExtractedIntent } from "./intent";
import { isoDateDaysAgo } from "./build";

export interface FollowUpSearch {
  label: string;
  description: string;
  q: string;
  mode: SearchMode;
  filters?: Partial<RepositoryFilters>;
}

interface FollowUpInput {
  intent: ExtractedIntent;
  mode: SearchMode;
  filters: RepositoryFilters;
  /** The free-text terms actually used in the executed query. */
  usedKeywords: string[];
}

/**
 * Deterministic follow-up suggestions derived from what was extracted.
 * Each one is a real, runnable search — nothing here is decorative.
 */
export function suggestFollowUps(input: FollowUpInput): FollowUpSearch[] {
  const { intent, mode, filters, usedKeywords } = input;
  const suggestions: FollowUpSearch[] = [];
  const primaryKeyword = usedKeywords[0] ?? intent.keywords[0] ?? "";

  if (usedKeywords.length > 1) {
    const broader = usedKeywords.slice(0, -1);
    suggestions.push({
      label: `Broaden: drop “${usedKeywords[usedKeywords.length - 1]}”`,
      description: "Fewer required terms usually returns more candidates.",
      q: broader.join(" "),
      mode,
    });
  }

  const technology = intent.technologies[0];
  if (technology) {
    if (technology.language && filters.language?.toLowerCase() !== technology.language.toLowerCase()) {
      suggestions.push({
        label: `${technology.name} only (${technology.language})`,
        description: `Restrict results to the ${technology.language} ecosystem.`,
        q: primaryKeyword || technology.name,
        mode,
        filters: { language: technology.language },
      });
    }
    const otherTech = intent.technologies[1];
    if (otherTech) {
      suggestions.push({
        label: `${technology.name} + ${otherTech.name}`,
        description: "Combine the two technologies you mentioned.",
        q: `${technology.name} ${otherTech.name} ${primaryKeyword}`.trim(),
        mode,
      });
    }
  }

  const topic = intent.topics[0];
  if (topic) {
    suggestions.push({
      label: `Topic: ${topic}`,
      description: "Repositories that explicitly tag this topic.",
      q: primaryKeyword || topic,
      mode,
      filters: { topics: [topic] },
    });
  }

  if (filters.minStars === undefined) {
    suggestions.push({
      label: "Established projects (100+ stars)",
      description: "Filter out experiments and early-stage repositories.",
      q: intent.rawText,
      mode,
      filters: { minStars: 100 },
    });
  } else {
    suggestions.push({
      label: "Include small projects",
      description: "Remove the star floor to see newer work.",
      q: intent.rawText,
      mode,
      filters: { minStars: 0 },
    });
  }

  if (!filters.pushedAfter) {
    suggestions.push({
      label: "Updated in the last 90 days",
      description: "Repositories with recent commits.",
      q: intent.rawText,
      mode,
      filters: { pushedAfter: isoDateDaysAgo(90) },
    });
  }

  if (primaryKeyword) {
    suggestions.push({
      label: `Curated lists about ${primaryKeyword}`,
      description: "“awesome” lists often point to the best options quickly.",
      q: `awesome ${primaryKeyword}`,
      mode: "repository",
    });
  }

  if (intent.signals.alternativeTo) {
    suggestions.push({
      label: `Open-source alternatives to ${intent.signals.alternativeTo}`,
      description: "Repositories tagged as alternatives.",
      q: intent.signals.alternativeTo,
      mode: "repository",
      filters: { topics: ["alternative", "open-source-alternative"] },
    });
  }

  return suggestions.slice(0, 6);
}
