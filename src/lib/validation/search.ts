import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Shared enumerations                                                        */
/* -------------------------------------------------------------------------- */

export const SEARCH_MODES = ["repository", "find-repo", "project-idea"] as const;
export type SearchMode = (typeof SEARCH_MODES)[number];

export const SEARCH_TARGETS = ["repositories", "developers", "code"] as const;
export type SearchTarget = (typeof SEARCH_TARGETS)[number];

export const SORT_OPTIONS = ["best-match", "stars", "forks", "updated", "help-wanted-issues"] as const;
export type SortOption = (typeof SORT_OPTIONS)[number];

export const SORT_DIRECTIONS = ["desc", "asc"] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export const ARCHIVE_FILTERS = ["exclude", "include", "only"] as const;
export type ArchiveFilter = (typeof ARCHIVE_FILTERS)[number];

export const PER_PAGE_OPTIONS = [10, 20, 30, 50, 100] as const;
export type PerPage = (typeof PER_PAGE_OPTIONS)[number];

/** GitHub accepts at most 256 characters in a search query. */
export const GITHUB_QUERY_MAX_LENGTH = 256;
/** GitHub only returns the first 1,000 results of any search. */
export const GITHUB_MAX_RESULT_WINDOW = 1000;

/* -------------------------------------------------------------------------- */
/* Primitives                                                                 */
/* -------------------------------------------------------------------------- */

const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the YYYY-MM-DD date format");

/** Free-text search input: no control characters, bounded length. */
const queryText = z
  .string()
  .trim()
  .min(1, "Enter something to search for")
  .max(400, "Search text is limited to 400 characters")
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "Search text contains invalid characters");

const language = z
  .string()
  .trim()
  .max(40)
  .regex(/^[A-Za-z0-9+#.\-_ ]+$/, "Language names may only contain letters, numbers, + # . - _ and spaces")
  .optional();

const licenseKey = z
  .string()
  .trim()
  .max(40)
  .regex(/^[a-z0-9.\-_]+$/, "License keys use lowercase letters, numbers, . - and _")
  .optional();

/** Comma-separated topic list. */
const topicList = z
  .string()
  .trim()
  .max(200)
  .transform((value) =>
    value
      .split(",")
      .map((topic) => topic.trim().toLowerCase())
      .filter((topic) => /^[a-z0-9][a-z0-9.\-+#]{0,49}$/.test(topic))
      .slice(0, 5),
  )
  .optional();

const nonNegativeInt = (max: number) =>
  z.coerce
    .number()
    .int("Use a whole number")
    .min(0, "Cannot be negative")
    .max(max, `Maximum is ${max.toLocaleString("en-US")}`);

const ownerScope = z
  .string()
  .trim()
  .max(39)
  .regex(/^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/, "Not a valid GitHub username or organization")
  .optional();

/* -------------------------------------------------------------------------- */
/* Repository search filters                                                  */
/* -------------------------------------------------------------------------- */

export const repositoryFiltersSchema = z.object({
  language,
  topics: topicList,
  minStars: nonNegativeInt(5_000_000).optional(),
  minForks: nonNegativeInt(1_000_000).optional(),
  createdAfter: dateOnly.optional(),
  createdBefore: dateOnly.optional(),
  pushedAfter: dateOnly.optional(),
  pushedBefore: dateOnly.optional(),
  license: licenseKey,
  archived: z.enum(ARCHIVE_FILTERS).default("exclude"),
  owner: ownerScope,
});

export type RepositoryFilters = z.infer<typeof repositoryFiltersSchema>;

/**
 * Flat schema: filters arrive as individual query parameters (language=…,
 * minStars=…) and are grouped into `filters` by the parse helpers below.
 */
export const repositorySearchSchema = z
  .object({
    q: queryText,
    mode: z.enum(SEARCH_MODES).default("repository"),
    page: z.coerce.number().int().min(1).max(100).default(1),
    perPage: z.coerce
      .number()
      .int()
      .refine((value): value is PerPage => (PER_PAGE_OPTIONS as readonly number[]).includes(value), {
        message: "Page size must be 10, 20, 30, 50 or 100",
      })
      .default(20),
    sort: z.enum(SORT_OPTIONS).default("best-match"),
    direction: z.enum(SORT_DIRECTIONS).default("desc"),
  })
  .merge(repositoryFiltersSchema);

export interface RepositorySearchInput {
  q: string;
  mode: SearchMode;
  page: number;
  perPage: PerPage;
  sort: SortOption;
  direction: SortDirection;
  filters: RepositoryFilters;
}

type FlatRepositorySearch = z.infer<typeof repositorySearchSchema>;

function groupFilters(flat: FlatRepositorySearch): { rest: Omit<FlatRepositorySearch, keyof RepositoryFilters>; filters: RepositoryFilters } {
  const {
    language,
    topics,
    minStars,
    minForks,
    createdAfter,
    createdBefore,
    pushedAfter,
    pushedBefore,
    license,
    archived,
    owner,
    ...rest
  } = flat;
  return {
    rest,
    filters: {
      language,
      topics,
      minStars,
      minForks,
      createdAfter,
      createdBefore,
      pushedAfter,
      pushedBefore,
      license,
      archived,
      owner,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Developer + code search                                                    */
/* -------------------------------------------------------------------------- */

export const developerSearchSchema = z.object({
  q: queryText,
  language: language,
  location: z.string().trim().max(80).optional(),
  minRepos: nonNegativeInt(10_000).optional(),
  minFollowers: nonNegativeInt(10_000_000).optional(),
  type: z.enum(["user", "org", "any"]).default("any"),
  sort: z.enum(["best-match", "followers", "repositories", "recently-joined"]).default("best-match"),
  direction: z.enum(SORT_DIRECTIONS).default("desc"),
  page: z.coerce.number().int().min(1).max(100).default(1),
  perPage: z.coerce
    .number()
    .int()
    .refine((value): value is PerPage => (PER_PAGE_OPTIONS as readonly number[]).includes(value), {
      message: "Page size must be 10, 20, 30, 50 or 100",
    })
    .default(10),
});

export type DeveloperSearchInput = z.infer<typeof developerSearchSchema>;

export const codeSearchSchema = z.object({
  q: queryText,
  language: language,
  repository: z
    .string()
    .trim()
    .max(140)
    .regex(/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/, "Use the owner/repo format")
    .optional(),
  path: z.string().trim().max(140).optional(),
  extension: z.string().trim().max(20).regex(/^[A-Za-z0-9]+$/, "Extension cannot contain symbols").optional(),
  size: z.enum(["any", "small", "medium", "large"]).default("any"),
  page: z.coerce.number().int().min(1).max(10).default(1),
  perPage: z.coerce
    .number()
    .int()
    .refine((value): value is PerPage => (PER_PAGE_OPTIONS as readonly number[]).includes(value), {
      message: "Page size must be 10, 20, 30, 50 or 100",
    })
    .default(10),
});

export type CodeSearchInput = z.infer<typeof codeSearchSchema>;

/* -------------------------------------------------------------------------- */
/* Discovery (Find Repo / Project Idea)                                       */
/* -------------------------------------------------------------------------- */

export const discoverSearchSchema = repositorySearchSchema.extend({
  mode: z.enum(["find-repo", "project-idea"]).default("find-repo"),
});

export type DiscoverSearchInput = RepositorySearchInput & { mode: "find-repo" | "project-idea" };

/* -------------------------------------------------------------------------- */
/* URL search-param parsing                                                   */
/* -------------------------------------------------------------------------- */

/** Flattens Next.js searchParams into the plain record the schemas expect. */
export function firstValues(
  params: Record<string, string | string[] | undefined> | undefined,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(params ?? {})) {
    out[key] = Array.isArray(value) ? value[0] : value;
  }
  return out;
}

/**
 * Validates raw search params for a repository search.
 * Returns either the parsed input or a list of readable field errors.
 */
export function parseRepositorySearch(
  raw: Record<string, string | undefined>,
): { success: true; data: RepositorySearchInput } | { success: false; errors: string[] } {
  const result = repositorySearchSchema.safeParse(raw);
  if (!result.success) return { success: false, errors: formatIssues(result.error) };
  const { rest, filters } = groupFilters(result.data);
  return { success: true, data: { ...rest, filters } };
}

export function parseDeveloperSearch(
  raw: Record<string, string | undefined>,
): { success: true; data: DeveloperSearchInput } | { success: false; errors: string[] } {
  const result = developerSearchSchema.safeParse(raw);
  if (result.success) return { success: true, data: result.data };
  return { success: false, errors: formatIssues(result.error) };
}

export function parseCodeSearch(
  raw: Record<string, string | undefined>,
): { success: true; data: CodeSearchInput } | { success: false; errors: string[] } {
  const result = codeSearchSchema.safeParse(raw);
  if (result.success) return { success: true, data: result.data };
  return { success: false, errors: formatIssues(result.error) };
}

export function parseDiscoverSearch(
  raw: Record<string, string | undefined>,
): { success: true; data: DiscoverSearchInput } | { success: false; errors: string[] } {
  const result = discoverSearchSchema.safeParse(raw);
  if (!result.success) return { success: false, errors: formatIssues(result.error) };
  const { rest, filters } = groupFilters(result.data);
  return { success: true, data: { ...rest, filters } as DiscoverSearchInput };
}

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".") || "query";
    return `${path}: ${issue.message}`;
  });
}

/** True when a filter object differs from the defaults (used by "clear filters"). */
export function hasActiveFilters(filters: RepositoryFilters): boolean {
  return Boolean(
    filters.language ||
      (filters.topics && filters.topics.length > 0) ||
      filters.minStars !== undefined ||
      filters.minForks !== undefined ||
      filters.createdAfter ||
      filters.createdBefore ||
      filters.pushedAfter ||
      filters.pushedBefore ||
      filters.license ||
      filters.owner ||
      filters.archived !== "exclude",
  );
}
