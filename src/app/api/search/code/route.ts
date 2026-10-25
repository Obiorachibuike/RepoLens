import { fromError, ok, searchParamsToRecord, validationError } from "@/lib/api/respond";
import { isGithubAuthenticated } from "@/lib/github/client";
import { searchCode } from "@/lib/github/search";
import { parseCodeSearch } from "@/lib/validation/search";

export const dynamic = "force-dynamic";

/**
 * GET /api/search/code — GitHub code search.
 *
 * GitHub requires authentication for this endpoint. When no token is
 * configured the route returns a 401 with an explanation instead of silently
 * falling back to repository search (which would be misleading).
 */
export async function GET(request: Request) {
  try {
    const parsed = parseCodeSearch(searchParamsToRecord(new URL(request.url)));
    if (!parsed.success) return validationError(parsed.errors);

    const { q, language, repository, path, extension, size, page, perPage } = parsed.data;

    const qualifiers: string[] = [q.trim()];
    if (language) qualifiers.push(`language:${language}`);
    if (repository) qualifiers.push(`repo:${repository}`);
    if (path) qualifiers.push(`path:${path}`);
    if (extension) qualifiers.push(`extension:${extension}`);
    if (size !== "any") {
      const ranges: Record<string, string> = { small: "<1000", medium: "1000..10000", large: ">10000" };
      const range = ranges[size];
      if (range) qualifiers.push(`size:${range}`);
    }

    const query = qualifiers.filter(Boolean).join(" ").trim();
    const result = await searchCode({ query, page, perPage, signal: request.signal });

    return ok({
      userQuery: q,
      query,
      items: result.items,
      totalCount: result.totalCount,
      incompleteResults: result.incompleteResults,
      page,
      perPage,
      authenticated: isGithubAuthenticated(),
      rateLimit: result.rateLimit,
    });
  } catch (error) {
    return fromError(error);
  }
}
