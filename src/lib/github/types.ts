/**
 * Normalized shapes used across RepoLens. These are mapped from the raw GitHub
 * REST payloads (see lib/github/types.ts) so UI code never depends on GitHub's
 * snake_case wire format.
 */

export interface OwnerSummary {
  login: string;
  avatarUrl: string | null;
  type: string;
  htmlUrl: string;
}

export interface LicenseSummary {
  key: string;
  name: string;
  spdxId: string | null;
}

/** Repository as returned by the search endpoint (subset of the repo payload). */
export interface RepositorySummary {
  id: number;
  fullName: string;
  name: string;
  owner: OwnerSummary;
  description: string | null;
  htmlUrl: string;
  homepage: string | null;
  language: string | null;
  topics: string[];
  stargazersCount: number;
  forksCount: number;
  openIssuesCount: number;
  watchersCount: number;
  archived: boolean;
  disabled: boolean;
  fork: boolean;
  license: LicenseSummary | null;
  defaultBranch: string;
  size: number;
  createdAt: string;
  updatedAt: string;
  pushedAt: string;
  /** GitHub's own relevance score, only present on search results. */
  searchScore: number | null;
}

/** Full repository detail (GET /repos/{owner}/{repo}). */
export interface RepositoryDetail extends RepositorySummary {
  networkCount: number | null;
  subscribersCount: number | null;
  hasIssues: boolean;
  hasWiki: boolean;
  hasPages: boolean;
  hasDiscussions: boolean;
  visibility: string;
  isTemplate: boolean;
}

export interface DeveloperSummary {
  login: string;
  id: number;
  avatarUrl: string | null;
  htmlUrl: string;
  type: string;
  /** Enriched from GET /users/{login}; null when enrichment failed. */
  name: string | null;
  bio: string | null;
  company: string | null;
  location: string | null;
  blog: string | null;
  publicRepos: number | null;
  followers: number | null;
  following: number | null;
  createdAt: string | null;
  searchScore: number | null;
  /** True when the profile enrichment call failed (partial data). */
  partial: boolean;
}

export interface CodeMatch {
  repository: string | null;
  path: string | null;
  fragment: string | null;
  language: string | null;
  htmlUrl: string | null;
}

export interface CodeSearchItem {
  id: string;
  name: string;
  path: string;
  sha: string;
  htmlUrl: string;
  repository: RepositorySummary | null;
  textMatches: CodeMatch[];
}

export interface LanguageStat {
  language: string;
  bytes: number;
  percentage: number;
}

export interface ContributorSummary {
  login: string;
  avatarUrl: string | null;
  htmlUrl: string;
  contributions: number;
  type: string;
}

export interface CommitSummary {
  sha: string;
  htmlUrl: string;
  message: string;
  authorName: string | null;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  date: string | null;
}

export interface TreeEntry {
  path: string;
  name: string;
  type: "file" | "directory";
  size: number | null;
  downloadUrl: string | null;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetAt: string | null;
  resource: "core" | "search";
  used?: number;
}

/** Failure kinds surfaced to the UI so it can render actionable messages. */
export type GithubErrorKind =
  | "rate_limited"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "unavailable"
  | "timeout"
  | "network"
  | "unknown";
