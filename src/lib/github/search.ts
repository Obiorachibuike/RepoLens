import "server-only";
import { githubRequest } from "./client";
import { GithubApiError } from "./errors";
import {
  mapCodeSearchItem,
  mapDeveloper,
  mapRepositorySummary,
  type RawRepository,
} from "./mappers";
import type {
  CodeSearchItem,
  DeveloperSummary,
  RateLimitInfo,
  RepositorySummary,
} from "./types";
import type { SortDirection, SortOption } from "@/lib/validation/search";
import { GITHUB_MAX_RESULT_WINDOW } from "@/lib/validation/search";

export interface RepositorySearchResult {
  items: RepositorySummary[];
  totalCount: number;
  incompleteResults: boolean;
  query: string;
  rateLimit: RateLimitInfo | null;
  /** True when GitHub cannot paginate to the requested page. */
  beyondWindow: boolean;
}

interface SearchRepositoryParams {
  query: string;
  sort?: SortOption;
  direction?: SortDirection;
  page?: number;
  perPage?: number;
  /** Short in-memory cache (seconds) for curated/discovery listings. */
  cacheSeconds?: number;
  signal?: AbortSignal;
}

function sortToGithub(sort: SortOption = "best-match"): string | undefined {
  switch (sort) {
    case "stars":
      return "stars";
    case "forks":
      return "forks";
    case "updated":
      return "updated";
    case "help-wanted-issues":
      return "help-wanted-issues";
    case "best-match":
    default:
      return undefined; // GitHub's own best-match ordering.
  }
}

/** GET /search/repositories */
export async function searchRepositories(
  params: SearchRepositoryParams,
): Promise<RepositorySearchResult> {
  const { query, sort = "best-match", direction = "desc", page = 1, perPage = 20, cacheSeconds = 0, signal } = params;
  if (!query.trim()) {
    throw new GithubApiError({ kind: "validation", message: "A search query is required." });
  }

  const { data, meta } = await githubRequest<{
    total_count?: number;
    incomplete_results?: boolean;
    items?: RawRepository[];
  }>({
    path: "/search/repositories",
    resource: "search",
    cacheSeconds,
    query: {
      q: query,
      sort: sortToGithub(sort),
      order: sort === "best-match" ? undefined : direction,
      page,
      per_page: perPage,
    },
    signal,
  });

  const totalCount = typeof data.total_count === "number" ? data.total_count : 0;
  const items = Array.isArray(data.items) ? data.items.map(mapRepositorySummary) : [];

  return {
    items,
    totalCount,
    incompleteResults: Boolean(data.incomplete_results),
    query,
    rateLimit: meta.rateLimit,
    beyondWindow: page * perPage > GITHUB_MAX_RESULT_WINDOW,
  };
}

export interface DeveloperSearchResult {
  items: DeveloperSummary[];
  totalCount: number;
  incompleteResults: boolean;
  query: string;
  rateLimit: RateLimitInfo | null;
  enriched: number;
}

interface SearchDeveloperParams {
  query: string;
  sort?: "best-match" | "followers" | "repositories" | "recently-joined";
  direction?: SortDirection;
  page?: number;
  perPage?: number;
  /** Enrich at most this many profiles with GET /users/{login}. */
  enrichLimit?: number;
  signal?: AbortSignal;
}

/**
 * GET /search/users, then enriches the visible profiles.
 *
 * GitHub's user search returns only login/avatar, so bio, location, repository
 * count and follower counts come from a second call per profile. Failures are
 * tolerated and reported as `partial` — never invented.
 */
export async function searchDevelopers(
  params: SearchDeveloperParams,
): Promise<DeveloperSearchResult> {
  const {
    query,
    sort = "best-match",
    direction = "desc",
    page = 1,
    perPage = 10,
    enrichLimit = 8,
    signal,
  } = params;

  if (!query.trim()) {
    throw new GithubApiError({ kind: "validation", message: "A search query is required." });
  }

  const githubSort = sort === "best-match" ? undefined : sort;
  const { data, meta } = await githubRequest<{
    total_count?: number;
    incomplete_results?: boolean;
    items?: Array<Record<string, unknown>>;
  }>({
    path: "/search/users",
    resource: "search",
    query: {
      q: query,
      sort: githubSort,
      order: githubSort ? direction : undefined,
      page,
      per_page: perPage,
    },
    signal,
  });

  const rawItems = Array.isArray(data.items) ? data.items : [];
  const base = rawItems.map((item) =>
    mapDeveloper(item, typeof item.score === "number" ? item.score : null),
  );

  const toEnrich = base.slice(0, Math.max(0, enrichLimit));
  const details = await Promise.all(
    toEnrich.map(async (developer) => {
      try {
        const { data: profile } = await githubRequest<Record<string, unknown>>({
          path: `/users/${encodeURIComponent(developer.login)}`,
          cacheSeconds: 300,
          signal,
        });
        return mapDeveloper(profile, developer.searchScore);
      } catch {
        return { ...developer, partial: true };
      }
    }),
  );

  const enrichedLogins = new Set(details.filter((d) => !d.partial).map((d) => d.login));
  const items = base.map((developer, index) => {
    const replacement = index < details.length ? details[index] : undefined;
    if (replacement && !replacement.partial) return replacement;
    return { ...developer, partial: !enrichedLogins.has(developer.login) };
  });

  return {
    items,
    totalCount: typeof data.total_count === "number" ? data.total_count : 0,
    incompleteResults: Boolean(data.incomplete_results),
    query,
    rateLimit: meta.rateLimit,
    enriched: details.filter((d) => !d.partial).length,
  };
}

export interface CodeSearchResult {
  items: CodeSearchItem[];
  totalCount: number;
  incompleteResults: boolean;
  query: string;
  rateLimit: RateLimitInfo | null;
}

interface SearchCodeParams {
  query: string;
  page?: number;
  perPage?: number;
  signal?: AbortSignal;
}

/**
 * GET /search/code — requires authentication (GitHub rejects anonymous calls
 * with 401). The client throws an explanatory error before the call is made.
 */
export async function searchCode(params: SearchCodeParams): Promise<CodeSearchResult> {
  const { query, page = 1, perPage = 10, signal } = params;
  if (!query.trim()) {
    throw new GithubApiError({ kind: "validation", message: "A search query is required." });
  }

  const { data, meta } = await githubRequest<{
    total_count?: number;
    incomplete_results?: boolean;
    items?: Array<Record<string, unknown>>;
  }>({
    path: "/search/code",
    resource: "search",
    requiresAuth: true,
    accept: "application/vnd.github.text-match+json",
    query: { q: query, page, per_page: perPage },
    signal,
  });

  const rawItems = Array.isArray(data.items) ? data.items : [];
  return {
    items: rawItems.map(mapCodeSearchItem),
    totalCount: typeof data.total_count === "number" ? data.total_count : 0,
    incompleteResults: Boolean(data.incomplete_results),
    query,
    rateLimit: meta.rateLimit,
  };
}
