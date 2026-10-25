import {
  PER_PAGE_OPTIONS,
  SORT_DIRECTIONS,
  SORT_OPTIONS,
  SEARCH_MODES,
  repositoryFiltersSchema,
  type RepositoryFilters,
  type SearchMode,
  type SortDirection,
  type SortOption,
} from "@/lib/validation/search";
import type { SearchRequestState } from "@/lib/api/shapes";

export const DEFAULT_FILTERS: RepositoryFilters = {
  language: undefined,
  topics: [],
  minStars: undefined,
  minForks: undefined,
  createdAfter: undefined,
  createdBefore: undefined,
  pushedAfter: undefined,
  pushedBefore: undefined,
  license: undefined,
  archived: "exclude",
  owner: undefined,
};

/**
 * Builds the initial search state from URL params, tolerating invalid values.
 * Unlike the API (which rejects bad input with a 400), the page falls back to
 * defaults so a malformed link still renders a working UI.
 */
export function initialStateFromParams(
  params: Record<string, string | undefined>,
  fallbackMode: SearchMode = "repository",
): SearchRequestState {
  const filtersResult = repositoryFiltersSchema.safeParse({
    language: params.language,
    topics: params.topics,
    minStars: params.minStars,
    minForks: params.minForks,
    createdAfter: params.createdAfter,
    createdBefore: params.createdBefore,
    pushedAfter: params.pushedAfter,
    pushedBefore: params.pushedBefore,
    license: params.license,
    archived: params.archived,
    owner: params.owner,
  });

  const mode = (SEARCH_MODES as readonly string[]).includes(params.mode ?? "")
    ? (params.mode as SearchMode)
    : fallbackMode;
  const sort = (SORT_OPTIONS as readonly string[]).includes(params.sort ?? "")
    ? (params.sort as SortOption)
    : "best-match";
  const direction = (SORT_DIRECTIONS as readonly string[]).includes(params.direction ?? "")
    ? (params.direction as SortDirection)
    : "desc";
  const perPage = PER_PAGE_OPTIONS.includes(Number(params.perPage) as (typeof PER_PAGE_OPTIONS)[number])
    ? (Number(params.perPage) as (typeof PER_PAGE_OPTIONS)[number])
    : 20;
  const page = Math.min(100, Math.max(1, Number(params.page) || 1));

  return {
    mode,
    q: (params.q ?? "").slice(0, 400),
    page,
    perPage,
    sort,
    direction,
    filters: filtersResult.success ? filtersResult.data : DEFAULT_FILTERS,
  };
}
