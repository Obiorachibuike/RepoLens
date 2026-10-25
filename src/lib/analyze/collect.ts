import "server-only";
import {
  getCommunityProfile,
  getCommits,
  getContents,
  getContributors,
  getLanguages,
  getLatestRelease,
  getReadme,
  getRepository,
  type RepoRef,
} from "@/lib/github/repos";
import type { RateLimitInfo } from "@/lib/github/types";
import type { AnalysisEvidence } from "./analyze";

export interface CollectedEvidence extends AnalysisEvidence {
  rateLimit: RateLimitInfo | null;
  /** Which supporting calls failed — surfaced instead of guessed data. */
  failed: string[];
}

/**
 * Gathers every piece of public evidence the analysis and visualization pages
 * need. Supporting calls are best-effort: a failure is recorded in `failed`
 * rather than turning into fabricated content.
 */
export async function collectEvidence(ref: RepoRef, signal?: AbortSignal): Promise<CollectedEvidence> {
  const { data: repository, rateLimit } = await getRepository(ref, signal);
  const failed: string[] = [];

  const [languages, contributors, commits, readme, root, community, release] = await Promise.all([
    getLanguages(ref, signal).then(
      (result) => result.data,
      () => {
        failed.push("languages");
        return [];
      },
    ),
    getContributors(ref, 12, signal).then(
      (result) => result.data,
      () => {
        failed.push("contributors");
        return [];
      },
    ),
    getCommits(ref, 20, signal).then(
      (result) => result.data,
      () => {
        failed.push("commits");
        return [];
      },
    ),
    getReadme(ref, signal).catch(() => {
      failed.push("readme");
      return { content: null, missing: true, truncated: false, bytes: 0 };
    }),
    getContents(ref, "", signal).then(
      (result) => result.data,
      () => {
        failed.push("contents");
        return [];
      },
    ),
    getCommunityProfile(ref, signal),
    getLatestRelease(ref, signal),
  ]);

  return {
    repository,
    languages,
    contributors,
    commits,
    readme,
    root,
    community,
    release,
    rateLimit,
    failed,
  };
}
