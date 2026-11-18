import "server-only";
import { collectEvidence } from "@/lib/analyze/collect";
import { GithubApiError } from "@/lib/github/errors";
import { comparisonHealth } from "./health";
import type { RepoRef } from "@/lib/validation/repository";

export async function compareRepositories(refs: RepoRef[]) {
  const result = [];
  // Don't issue three repository-analysis fan-outs at the same instant.
  for (const ref of refs) {
    try {
      const evidence = await collectEvidence(ref);
      const report = await comparisonHealth(evidence);
      const { repository: repo, failed, contributors, commits, readme, release, root } = evidence;
      result.push({ ref, repo, metrics: {
        contributorSample: failed.includes("contributors") ? null : contributors.length,
        commitSample30Days: failed.includes("commits") ? null : commits.filter((commit) => commit.date && Date.parse(commit.date) >= Date.now() - 30 * 86400_000).length,
        releasesInYearSample: report.indicators.releases?.publishedInYear ?? null,
        latestRelease: release?.tagName ?? null,
        readme: failed.includes("readme") ? null : !readme.missing,
        rootTestIndicator: failed.includes("contents") ? null : root.some((item) => /^(tests?|__tests__|specs?)$|\.(spec|test)\./i.test(item.name)),
        health: report.score, coverage: report.coverage,
        dependencyHealth: report.categories.find((category) => category.id === "dependencies")?.score ?? null,
        maintenance: report.categories.find((category) => category.id === "maintenance")?.score ?? null,
      }, error: null } as const);
    } catch (error) {
      result.push({ ref, repo: null, metrics: null, error: error instanceof GithubApiError ? error.message : "Repository evidence unavailable." } as const);
    }
  }
  return result;
}
