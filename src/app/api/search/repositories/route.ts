import { fromError, ok, searchParamsToRecord, validationError } from "@/lib/api/respond";
import { searchRepositories } from "@/lib/github/search";
import { buildRepositoryQuery } from "@/lib/query/build";
import { extractIntent } from "@/lib/query/intent";
import { suggestFollowUps } from "@/lib/query/followups";
import { relevanceTerms, scoreRelevance } from "@/lib/query/relevance";
import { parseRepositorySearch, type RepositoryFilters } from "@/lib/validation/search";
import { currentUserId } from "@/lib/session";
import { addHistory } from "@/lib/db/queries";
import type { SavedSearchFilters } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * GET /api/search/repositories
 *
 * Handles all three search modes:
 *  - repository    → the user's text is passed to GitHub verbatim
 *  - find-repo     → deterministic keyword/technology extraction
 *  - project-idea  → same extraction plus follow-up suggestions
 */
export async function GET(request: Request) {
  try {
    const record = searchParamsToRecord(new URL(request.url));
    const parsed = parseRepositorySearch(record);
    if (!parsed.success) return validationError(parsed.errors);

    const { q, mode, page, perPage, sort, direction, filters } = parsed.data;
    const intent = mode === "repository" ? null : extractIntent(q);
    const built = buildRepositoryQuery({ mode, q, filters, intent });

    let result = await searchRepositories({
      query: built.query,
      sort,
      direction,
      page,
      perPage,
      signal: request.signal,
    });

    // Discovery modes AND several inferred qualifiers together, which is often
    // stricter than the visitor intended. If nothing matched, retry with the
    // broader variants and say exactly what was relaxed.
    let executedQuery = built.query;
    const warnings = [...built.warnings];
    let relaxed: { dropped: string[]; reason: string } | null = null;

    if (mode !== "repository" && result.totalCount === 0 && result.items.length === 0) {
      for (const fallback of built.fallbacks) {
        const attempt = await searchRepositories({
          query: fallback.query,
          sort,
          direction,
          page,
          perPage,
          signal: request.signal,
        });
        if (attempt.items.length > 0) {
          result = attempt;
          executedQuery = fallback.query;
          relaxed = { dropped: fallback.dropped, reason: fallback.reason };
          warnings.push(
            `Nothing matched every inferred term, so RepoLens retried without ${fallback.reason}. ${fallback.dropped.join(
              ", ",
            )} no longer apply to these results.`,
          );
          break;
        }
      }
    }

    const terms =
      mode === "repository"
        ? relevanceTerms(q)
        : relevanceTerms((intent?.keywords.slice(0, 4) ?? []).join(" "));
    const languagePreference = filters.language ?? intent?.technologies[0]?.language ?? null;
    const topicsPreference = filters.topics?.length ? filters.topics : (intent?.topics ?? []);

    const items = result.items.map((repository, index) => ({
      repository,
      relevance: scoreRelevance({
        repo: repository,
        terms,
        topics: topicsPreference,
        language: languagePreference,
        rank: (page - 1) * perPage + index + 1,
      }),
    }));

    // Persist history for the first page of a real search (no-op without a DB).
    if (page === 1) {
      await recordHistory({
        query: q,
        mode,
        sort,
        filters,
        resultCount: result.totalCount,
      });
    }

    return ok({
      mode,
      userQuery: q,
      query: executedQuery,
      relaxed,
      items,
      totalCount: result.totalCount,
      incompleteResults: result.incompleteResults,
      beyondWindow: result.beyondWindow,
      page,
      perPage,
      sort,
      direction,
      qualifiers: built.qualifiers,
      warnings,
      interpretation: intent
        ? {
            keywords: intent.keywords,
            technologies: intent.technologies,
            topics: intent.topics,
            signals: intent.signals,
            ignored: intent.ignored,
            passthroughQualifiers: intent.qualifiers,
          }
        : null,
      followUps: intent ? suggestFollowUps({ intent, mode, filters, usedKeywords: terms }) : [],
      rateLimit: result.rateLimit,
    });
  } catch (error) {
    return fromError(error);
  }
}

async function recordHistory(entry: {
  query: string;
  mode: "repository" | "find-repo" | "project-idea";
  sort: "best-match" | "stars" | "forks" | "updated" | "help-wanted-issues";
  filters: RepositoryFilters;
  resultCount: number;
}): Promise<void> {
  try {
    const userId = await currentUserId();
    if (!userId) return;
    const filters: SavedSearchFilters = {
      language: entry.filters.language ?? null,
      topics: entry.filters.topics ?? [],
      minStars: entry.filters.minStars ?? null,
      minForks: entry.filters.minForks ?? null,
      pushedAfter: entry.filters.pushedAfter ?? null,
      license: entry.filters.license ?? null,
      archived: entry.filters.archived,
    };
    await addHistory(userId, {
      query: entry.query,
      mode: entry.mode,
      sort: entry.sort,
      filters,
      resultCount: entry.resultCount,
    });
  } catch (error) {
    // History is a convenience — never fail a search because of it.
    console.error("[repolens] history write failed:", error instanceof Error ? error.message : error);
  }
}
