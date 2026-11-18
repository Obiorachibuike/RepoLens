import "server-only";
import { githubRequest } from "./client";
import { repoRefSchema, repoFilePath, type RepoRef } from "@/lib/validation/repository";
export type { RepoRef } from "@/lib/validation/repository";
import { GithubApiError } from "./errors";
import {
  mapCommits,
  mapContents,
  mapContributors,
  mapLanguages,
  mapRepositoryDetail,
  type RawRepository,
} from "./mappers";
import type {
  CommitSummary,
  ContributorSummary,
  LanguageStat,
  RateLimitInfo,
  RepositoryDetail,
  TreeEntry,
} from "./types";

export function assertRef(ref: RepoRef): void {
  if (!repoRefSchema.safeParse(ref).success) {
    throw new GithubApiError({ kind: "validation", status: 422, message: "That does not look like a valid GitHub owner/repository path." });
  }
}

export function encodeRepoPath(path: string) {
  if (!repoFilePath.safeParse(path).success) throw new GithubApiError({ kind: "validation", message: "Invalid repository file path." });
  return path.split("/").map(encodeURIComponent).join("/");
}

/** GET /repos/{owner}/{repo} */
export async function getRepository(
  ref: RepoRef,
  signal?: AbortSignal,
  refresh?: "validate",
): Promise<{ data: RepositoryDetail; rateLimit: RateLimitInfo | null; observedAt: string; stale: boolean; hasSnapshotCounts: boolean }> {
  assertRef(ref);
  const { data, meta } = await githubRequest<RawRepository>({
    path: `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`,

    signal, refresh,
  });
  return {
    data: mapRepositoryDetail(data), rateLimit: meta.rateLimit, observedAt: meta.observedAt, stale: meta.freshness === "stale",
    hasSnapshotCounts: [data.stargazers_count, data.forks_count, data.open_issues_count].every((count) => typeof count === "number" && Number.isSafeInteger(count) && count >= 0),
  };
}

export interface ReadmeResult {
  content: string | null;
  /** True when GitHub returned 404 for the README. */
  missing: boolean;
  truncated: boolean;
  bytes: number;
}

const MAX_README_BYTES = 512 * 1024;

/** GET /repos/{owner}/{repo}/readme (raw markdown). */
export async function getReadme(ref: RepoRef, signal?: AbortSignal): Promise<ReadmeResult> {
  assertRef(ref);
  try {
    const { data } = await githubRequest<string>({
      path: `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/readme`,
      accept: "application/vnd.github.raw+json",
      responseType: "text",

      signal,
    });
    const content = typeof data === "string" ? data : "";
    const tooBig = content.length > MAX_README_BYTES;
    return {
      content: tooBig ? content.slice(0, MAX_README_BYTES) : content,
      missing: false,
      truncated: tooBig,
      bytes: content.length,
    };
  } catch (error) {
    if (error instanceof GithubApiError && error.kind === "not_found") {
      return { content: null, missing: true, truncated: false, bytes: 0 };
    }
    throw error;
  }
}

/** GET /repos/{owner}/{repo}/languages — byte counts per language. */
export async function getLanguages(
  ref: RepoRef,
  signal?: AbortSignal,
): Promise<{ data: LanguageStat[]; rateLimit: RateLimitInfo | null }> {
  assertRef(ref);
  const { data, meta } = await githubRequest<Record<string, number>>({
    path: `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/languages`,

    signal,
  });
  return { data: mapLanguages(data), rateLimit: meta.rateLimit };
}

/** GET /repos/{owner}/{repo}/contributors */
export async function getContributors(
  ref: RepoRef,
  perPage = 12,
  signal?: AbortSignal,
): Promise<{ data: ContributorSummary[]; rateLimit: RateLimitInfo | null }> {
  assertRef(ref);
  try {
    const { data, meta } = await githubRequest<unknown>({
      path: `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/contributors`,
      query: { per_page: Math.min(100, Math.max(1, perPage)) },

      signal,
    });
    return { data: mapContributors(data), rateLimit: meta.rateLimit };
  } catch (error) {
    // 204 No Content: repositories with only anonymous commits.
    if (error instanceof GithubApiError && (error.status === 204 || error.kind === "unknown")) {
      return { data: [], rateLimit: null };
    }
    throw error;
  }
}

/** GET /repos/{owner}/{repo}/commits */
export async function getCommits(
  ref: RepoRef,
  perPage = 20,
  signal?: AbortSignal,
): Promise<{ data: CommitSummary[]; rateLimit: RateLimitInfo | null }> {
  assertRef(ref);
  try {
    const { data, meta } = await githubRequest<unknown>({
      path: `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/commits`,
      query: { per_page: Math.min(100, Math.max(1, perPage)) },

      signal,
    });
    return { data: mapCommits(data), rateLimit: meta.rateLimit };
  } catch (error) {
    // Empty repositories return 409.
    if (error instanceof GithubApiError && (error.status === 409 || error.kind === "not_found")) {
      return { data: [], rateLimit: null };
    }
    throw error;
  }
}

/** GET /repos/{owner}/{repo}/contents — a single directory listing. */
export async function getContents(
  ref: RepoRef,
  path = "",
  signal?: AbortSignal,
): Promise<{ data: TreeEntry[]; rateLimit: RateLimitInfo | null }> {
  assertRef(ref);
  const safePath = path ? encodeRepoPath(path) : "";
  try {
    const { data, meta } = await githubRequest<unknown>({
      path: `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/contents${
        safePath ? `/${safePath}` : ""
      }`,
      query: safePath ? undefined : { ref: undefined },

      signal,
    });
    if (!Array.isArray(data)) {
      // A file was requested rather than a directory.
      return { data: [], rateLimit: meta.rateLimit };
    }
    return { data: mapContents(data), rateLimit: meta.rateLimit };
  } catch (error) {
    if (error instanceof GithubApiError && (error.kind === "not_found" || error.status === 409)) {
      return { data: [], rateLimit: null };
    }
    throw error;
  }
}

export interface CommunityProfile {
  healthPercentage: number | null;
  files: Record<string, unknown> | null;
}

/** GET /repos/{owner}/{repo}/community/profile — documentation evidence. */
export async function getCommunityProfile(
  ref: RepoRef,
  signal?: AbortSignal,
): Promise<CommunityProfile | null> {
  assertRef(ref);
  try {
    const { data } = await githubRequest<Record<string, unknown>>({
      path: `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/community/profile`,

      signal,
    });
    return {
      healthPercentage: typeof data.health_percentage === "number" ? data.health_percentage : null,
      files: (data.files as Record<string, unknown> | undefined) ?? null,
    };
  } catch {
    return null; // Best-effort evidence — never fatal for the analysis page.
  }
}

export interface ReleaseSummary {
  tagName: string;
  name: string | null;
  publishedAt: string | null;
  htmlUrl: string;
  prerelease: boolean;
}

/** GET /repos/{owner}/{repo}/releases/latest */
export async function getLatestRelease(
  ref: RepoRef,
  signal?: AbortSignal,
): Promise<ReleaseSummary | null> {
  assertRef(ref);
  try {
    const { data } = await githubRequest<Record<string, unknown>>({
      path: `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}/releases/latest`,

      signal,
    });
    return {
      tagName: typeof data.tag_name === "string" ? data.tag_name : "",
      name: typeof data.name === "string" ? data.name : null,
      publishedAt: typeof data.published_at === "string" ? data.published_at : null,
      htmlUrl: typeof data.html_url === "string" ? data.html_url : "",
      prerelease: Boolean(data.prerelease),
    };
  } catch {
    return null;
  }
}
