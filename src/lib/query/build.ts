import type { SearchMode } from "@/lib/validation/search";
import { GITHUB_QUERY_MAX_LENGTH } from "@/lib/validation/search";
import type { RepositoryFilters } from "@/lib/validation/search";
import type { ExtractedIntent } from "./intent";

export interface QueryQualifier {
  /** Human-readable label shown in the "how we searched" panel. */
  label: string;
  /** The exact GitHub qualifier that was added. */
  qualifier: string;
  /** Where it came from, so the UI can separate user input from inference. */
  source: "user" | "inferred" | "filter";
}

export interface QueryFallback {
  /** A broader query to try when the precise one returns nothing. */
  query: string;
  /** The qualifiers that were removed to broaden it. */
  dropped: string[];
  /** Plain-English description of what was relaxed. */
  reason: string;
}

export interface BuiltQuery {
  query: string;
  qualifiers: QueryQualifier[];
  /** Terms that were dropped (e.g. to respect GitHub's 256-character limit). */
  warnings: string[];
  /**
   * Discovery modes combine several inferred qualifiers with AND, which GitHub
   * often matches too strictly. These are progressively broader alternatives,
   * tried in order only when the precise query returns zero results.
   */
  fallbacks: QueryFallback[];
}

interface BuildInput {
  mode: SearchMode;
  q: string;
  filters: RepositoryFilters;
  intent?: ExtractedIntent | null;
  /** Maximum free-text keywords for discovery modes. */
  maxKeywords?: number;
}

/**
 * Builds a real GitHub `q` string.
 *
 * - `repository` mode passes the user's text through verbatim so power users can
 *   type qualifiers such as `topic:machine-learning language:Python stars:>100`.
 * - Discovery modes combine extracted keywords, topics and the technology
 *   language with the structured filters.
 */
export function buildRepositoryQuery(input: BuildInput): BuiltQuery {
  const { mode, q, filters, intent } = input;
  const maxKeywords = input.maxKeywords ?? 4;
  const qualifiers: QueryQualifier[] = [];
  const warnings: string[] = [];

  const parts: string[] = [];
  /** Parts inferred from the description, safe to drop when nothing matches. */
  const inferredParts: string[] = [];

  if (mode === "repository") {
    const trimmed = q.trim();
    if (trimmed) {
      parts.push(trimmed);
      qualifiers.push({ label: "Your search text", qualifier: trimmed, source: "user" });
    }
  } else if (intent) {
    const keywords = intent.keywords.slice(0, maxKeywords);
    if (keywords.length > 0) {
      parts.push(keywords.join(" "));
      qualifiers.push({
        label: keywords.length === 1 ? `Keyword “${keywords[0]}”` : `Keywords ${keywords.map((k) => `“${k}”`).join(", ")}`,
        qualifier: keywords.join(" "),
        source: "inferred",
      });
    } else if (intent.technologies.length === 0) {
      // Nothing extractable — fall back to the raw text so the search still runs.
      parts.push(q.trim());
      warnings.push("No specific keywords were detected, so the full text was used as the search term.");
    }

    const topics = intent.topics.slice(0, 3);
    for (const topic of topics) {
      parts.push(`topic:${topic}`);
      inferredParts.push(`topic:${topic}`);
      qualifiers.push({ label: `Topic match: ${topic}`, qualifier: `topic:${topic}`, source: "inferred" });
    }

    const technology = intent.technologies[0];
    if (technology?.language && !filters.language) {
      parts.push(`language:${technology.language}`);
      inferredParts.push(`language:${technology.language}`);
      qualifiers.push({
        label: `${technology.name} → language:${technology.language}`,
        qualifier: `language:${technology.language}`,
        source: "inferred",
      });
    }

    for (const passthrough of intent.qualifiers) {
      parts.push(passthrough);
      qualifiers.push({ label: `Qualifier you typed`, qualifier: passthrough, source: "user" });
    }

    if (intent.signals.activelyMaintained) {
      const date = isoDateDaysAgo(365);
      parts.push(`pushed:>${date}`);
      inferredParts.push(`pushed:>${date}`);
      qualifiers.push({
        label: "Actively maintained → pushed within the last year",
        qualifier: `pushed:>${date}`,
        source: "inferred",
      });
    }
    if (intent.signals.popular && filters.minStars === undefined) {
      parts.push("stars:>=100");
      inferredParts.push("stars:>=100");
      qualifiers.push({ label: "Popular → at least 100 stars", qualifier: "stars:>=100", source: "inferred" });
    }
  } else {
    parts.push(q.trim());
  }

  // Structured filters always win over inferred values.
  const filterQualifiers = filterToQualifiers(filters);
  for (const item of filterQualifiers) {
    // Avoid duplicate/conflicting qualifiers.
    const name = item.qualifier.split(":")[0];
    const existingIndex = parts.findIndex((part) => part.split(":")[0] === name && part !== item.qualifier);
    if (existingIndex >= 0 && item.source === "filter") parts.splice(existingIndex, 1);
    parts.push(item.qualifier);
    qualifiers.push(item);
  }

  let query = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  if (query.length > GITHUB_QUERY_MAX_LENGTH) {
    // Drop inferred keywords first — they are the least essential part.
    const dropped: string[] = [];
    const keywordParts = parts.filter((part) => !part.includes(":"));
    for (let i = keywordParts.length - 1; i >= 0 && query.length > GITHUB_QUERY_MAX_LENGTH; i -= 1) {
      const part = keywordParts[i];
      if (!part) continue;
      const tokens = part.split(" ");
      tokens.pop();
      const replaced = tokens.join(" ");
      const index = parts.indexOf(part);
      if (index >= 0) {
        parts[index] = replaced;
        if (replaced.length > 0) dropped.push(part.split(" ").pop() ?? "");
        else dropped.push(part);
      }
      query = parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    }
    if (query.length > GITHUB_QUERY_MAX_LENGTH) {
      query = query.slice(0, GITHUB_QUERY_MAX_LENGTH).trim();
    }
    warnings.push(
      `GitHub limits search queries to ${GITHUB_QUERY_MAX_LENGTH} characters. Dropped: ${
        dropped.filter(Boolean).join(", ") || "some terms"
      }.`,
    );
  }

  const fallbacks = buildFallbacks(mode, parts, query, inferredParts);

  return { query, qualifiers, warnings, fallbacks };
}

/**
 * Derives up to two broader variants of a discovery query:
 *  1. without the inferred topic filters
 *  2. without the inferred topic and language filters
 *
 * User-typed qualifiers and structured filters are always kept — relaxing those
 * would silently change what the visitor asked for.
 */
function buildFallbacks(
  mode: SearchMode,
  parts: string[],
  query: string,
  inferredParts: string[],
): QueryFallback[] {
  if (mode === "repository") return [];

  const inferredTopics = inferredParts.filter((part) => part.startsWith("topic:"));
  const inferredLanguage = inferredParts.filter((part) => part.startsWith("language:"));
  if (inferredTopics.length === 0 && inferredLanguage.length === 0) return [];

  const steps: Array<{ excluded: string[]; reason: string }> = [];
  if (inferredTopics.length > 0) {
    steps.push({
      excluded: inferredTopics,
      reason: `the inferred topic filter${inferredTopics.length > 1 ? "s" : ""} ${inferredTopics.join(", ")}`,
    });
  }
  steps.push({
    excluded: [...inferredTopics, ...inferredLanguage],
    reason: "the inferred topic and language filters",
  });

  const seen = new Set([query]);
  const fallbacks: QueryFallback[] = [];
  for (const step of steps) {
    const candidate = parts
      .filter((part) => part && !step.excluded.includes(part))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    fallbacks.push({ query: candidate, dropped: step.excluded, reason: step.reason });
    if (fallbacks.length >= 2) break;
  }
  return fallbacks;
}

/** Maps validated filters to GitHub qualifiers with an audit trail. */
export function filterToQualifiers(filters: RepositoryFilters): QueryQualifier[] {
  const out: QueryQualifier[] = [];
  if (filters.language) {
    out.push({ label: `Language: ${filters.language}`, qualifier: `language:${filters.language}`, source: "filter" });
  }
  for (const topic of filters.topics ?? []) {
    out.push({ label: `Topic: ${topic}`, qualifier: `topic:${topic}`, source: "filter" });
  }
  if (filters.minStars !== undefined && filters.minStars > 0) {
    out.push({ label: `At least ${filters.minStars} stars`, qualifier: `stars:>=${filters.minStars}`, source: "filter" });
  }
  if (filters.minForks !== undefined && filters.minForks > 0) {
    out.push({ label: `At least ${filters.minForks} forks`, qualifier: `forks:>=${filters.minForks}`, source: "filter" });
  }
  if (filters.createdAfter) {
    out.push({ label: `Created on/after ${filters.createdAfter}`, qualifier: `created:>=${filters.createdAfter}`, source: "filter" });
  }
  if (filters.createdBefore) {
    out.push({ label: `Created on/before ${filters.createdBefore}`, qualifier: `created:<=${filters.createdBefore}`, source: "filter" });
  }
  if (filters.pushedAfter) {
    out.push({ label: `Pushed on/after ${filters.pushedAfter}`, qualifier: `pushed:>=${filters.pushedAfter}`, source: "filter" });
  }
  if (filters.pushedBefore) {
    out.push({ label: `Pushed on/before ${filters.pushedBefore}`, qualifier: `pushed:<=${filters.pushedBefore}`, source: "filter" });
  }
  if (filters.license) {
    out.push({ label: `License: ${filters.license}`, qualifier: `license:${filters.license}`, source: "filter" });
  }
  if (filters.owner) {
    out.push({ label: `Owner: ${filters.owner}`, qualifier: `user:${filters.owner}`, source: "filter" });
  }
  if (filters.archived === "exclude") {
    out.push({ label: "Excluding archived repositories", qualifier: "archived:false", source: "filter" });
  } else if (filters.archived === "only") {
    out.push({ label: "Archived repositories only", qualifier: "archived:true", source: "filter" });
  }
  return out;
}

export function isoDateDaysAgo(days: number, from: Date = new Date()): string {
  const date = new Date(from.getTime() - days * 86_400_000);
  return date.toISOString().slice(0, 10);
}
