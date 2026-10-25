import { fromError, ok, searchParamsToRecord, validationError } from "@/lib/api/respond";
import { searchDevelopers } from "@/lib/github/search";
import { parseDeveloperSearch } from "@/lib/validation/search";

export const dynamic = "force-dynamic";

/**
 * GET /api/search/developers — GitHub user search (GET /search/users) with
 * optional profile enrichment. Only publicly visible profile fields are
 * returned; nothing about a developer's expertise is inferred.
 */
export async function GET(request: Request) {
  try {
    const parsed = parseDeveloperSearch(searchParamsToRecord(new URL(request.url)));
    if (!parsed.success) return validationError(parsed.errors);

    const { q, language, location, minRepos, minFollowers, type, sort, direction, page, perPage } = parsed.data;

    const qualifiers: string[] = [q.trim()];
    if (language) qualifiers.push(`language:${language}`);
    if (location) qualifiers.push(`location:${location}`);
    if (minRepos && minRepos > 0) qualifiers.push(`repos:>=${minRepos}`);
    if (minFollowers && minFollowers > 0) qualifiers.push(`followers:>=${minFollowers}`);
    if (type !== "any") qualifiers.push(`type:${type}`);

    const query = qualifiers.filter(Boolean).join(" ").trim();

    const result = await searchDevelopers({
      query,
      sort,
      direction,
      page,
      perPage,
      // Unauthenticated callers get a very small core budget, so enrich fewer.
      enrichLimit: perPage > 10 ? 8 : perPage,
      signal: request.signal,
    });

    return ok({
      userQuery: q,
      query,
      items: result.items,
      totalCount: result.totalCount,
      incompleteResults: result.incompleteResults,
      enriched: result.enriched,
      page,
      perPage,
      sort,
      direction,
      rateLimit: result.rateLimit,
    });
  } catch (error) {
    return fromError(error);
  }
}
