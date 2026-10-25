import type {
  CodeSearchItem,
  DeveloperSummary,
  RateLimitInfo,
  RepositorySummary,
} from "@/lib/github/types";
import type { RelevanceResult } from "@/lib/query/relevance";
import type { QueryQualifier } from "@/lib/query/build";
import type { FollowUpSearch } from "@/lib/query/followups";
import type { DetectedTechnology, IntentSignals } from "@/lib/query/intent";
import type { RepositoryFilters, SearchMode, SortDirection, SortOption } from "@/lib/validation/search";

/** Shared request/response shapes for RepoLens' own API routes. */

export interface RepositoryResultItem {
  repository: RepositorySummary;
  relevance: RelevanceResult;
}

export interface SearchInterpretation {
  keywords: string[];
  technologies: DetectedTechnology[];
  topics: string[];
  signals: IntentSignals;
  ignored: string[];
  passthroughQualifiers: string[];
}

export interface RepositorySearchResponse {
  mode: SearchMode;
  userQuery: string;
  query: string;
  items: RepositoryResultItem[];
  totalCount: number;
  incompleteResults: boolean;
  beyondWindow: boolean;
  page: number;
  perPage: number;
  sort: SortOption;
  direction: SortDirection;
  qualifiers: QueryQualifier[];
  warnings: string[];
  /** Set when the precise query found nothing and a broader one was used. */
  relaxed: { dropped: string[]; reason: string } | null;
  interpretation: SearchInterpretation | null;
  followUps: FollowUpSearch[];
  rateLimit: RateLimitInfo | null;
}

export interface DeveloperSearchResponse {
  userQuery: string;
  query: string;
  items: DeveloperSummary[];
  totalCount: number;
  incompleteResults: boolean;
  enriched: number;
  page: number;
  perPage: number;
  sort: string;
  direction: SortDirection;
  rateLimit: RateLimitInfo | null;
}

export interface CodeSearchResponse {
  userQuery: string;
  query: string;
  items: CodeSearchItem[];
  totalCount: number;
  incompleteResults: boolean;
  page: number;
  perPage: number;
  authenticated: boolean;
  rateLimit: RateLimitInfo | null;
}

export interface ApiErrorShape {
  error: {
    kind: string;
    message: string;
    hint?: string | null;
    issues?: string[];
    retryAfterSeconds?: number | null;
  };
}

export interface SearchRequestState {
  mode: SearchMode;
  q: string;
  page: number;
  perPage: number;
  sort: SortOption;
  direction: SortDirection;
  filters: RepositoryFilters;
}
