import "server-only";
import { collectEvidence, type CollectedEvidence } from "@/lib/analyze/collect";
import { getRepository } from "@/lib/github/repos";
import { githubRequest } from "@/lib/github/client";
import { getOrSetCachedData, getCachedData } from "@/lib/infra/cache";
import { envInt } from "@/lib/infra/config";
import type { RepoRef } from "@/lib/validation/repository";
import { getSourceIndex, type SourceIndex } from "./source";
import { inspectDependencies, type DependencyReport } from "./dependencies";

export const weightDefaults = { maintenance: 20, documentation: 15, testing: 15, organization: 15, dependencies: 15, community: 10, releases: 10 } as const;
type Category = keyof typeof weightDefaults;
const labels: Record<Category, string> = { maintenance: "Maintenance activity", documentation: "Documentation", testing: "Testing signals", organization: "Code organization", dependencies: "Dependency health", community: "Community activity", releases: "Release practices" };

type Activity = { closedIssues: number | null; pullRequests: { sampled: number; updatedIn30Days: number } | null; releases: { sampled: number; publishedInYear: number; latest: string | null } | null };
type CategoryScore = { id: Category; label: string; weight: number; score: number | null; evidence: string[]; next: string };
export type HealthReport = { score: number | null; coverage: number; categories: CategoryScore[]; generatedAt: string; strengths: string[]; concerns: string[]; suggestions: string[]; indicators: { lastCommit: string | null; commitsIn30Days: number | null; contributorsSampled: number | null; openItems: number; closedIssuesSampled: number | null; pullRequests: Activity["pullRequests"]; releases: Activity["releases"]; analyzedRevision: string | null } };
const emptyActivity: Activity = { closedIssues: null, pullRequests: null, releases: null };
const day = 86400_000;
const percent = (value: number) => Math.round(Math.max(0, Math.min(100, value)));

export function scoreHealth(evidence: CollectedEvidence, source: SourceIndex | null, dependency: DependencyReport | null, activity: Activity = emptyActivity, now = new Date()): HealthReport {
  const repo = evidence.repository;
  const paths = source?.files.map((entry) => entry.path) ?? [];
  const pathsKnown = source !== null && !source.truncated;
  const has = (r: RegExp) => paths.some((p) => r.test(p));
  const tests = paths.filter((p) => /(?:^|\/)(?:tests?|__tests__|specs?)(?:\/|\.)|\.(?:test|spec)\.[jt]sx?$/i.test(p));
  const ci = has(/(?:^|\/)(?:\.github\/workflows\/|\.gitlab-ci\.yml$|\.circleci\/config\.yml$|Jenkinsfile$)/i);
  const timestamps = evidence.commits.map((commit) => commit.date).filter((date): date is string => Boolean(date && Number.isFinite(Date.parse(date)))).sort().reverse();
  const lastCommit = timestamps[0] ?? null;
  const lastAge = lastCommit ? Math.max(0, (now.getTime() - Date.parse(lastCommit)) / day) : null;
  const counted = evidence.failed.includes("commits") ? null : timestamps.filter((date) => Date.parse(date) >= now.getTime() - 30 * day).length;
  const contributorCount = evidence.failed.includes("contributors") ? null : evidence.contributors.length;
  const readme = evidence.failed.includes("readme") ? null : evidence.readme.content ?? "";
  const headings = readme?.match(/^#{1,4}\s+\S/gm)?.length ?? 0;
  const license = repo.license?.spdxId ?? repo.license?.name ?? null;
  const documented = has(/(?:^|\/)(?:docs\/|contributing[.\/])/i);
  const majorGroups = [/(?:^|\/)(?:src|lib|app)\//, /(?:^|\/)(?:docs|examples)\//, /(?:^|\/)(?:api|services|components|packages)\//].filter(has).length;
  const verifiedDependencies = dependency?.dependencies.filter((d) => d.advisories !== null) ?? [];
  const matches = verifiedDependencies.filter((d) => d.advisories?.length).length;
  const versionsChecked = dependency?.dependencies.filter((d) => d.outdated !== null) ?? [];
  const outdated = versionsChecked.filter((d) => d.outdated).length;
  const weights = Object.fromEntries(Object.entries(weightDefaults).map(([key, value]) => [key, envInt(`REPOLENS_HEALTH_${key.toUpperCase()}_WEIGHT`, value, 0, 100)])) as Record<Category, number>;
  const categories: CategoryScore[] = [];
  const add = (id: Category, score: number | null, proof: string[], next: string) => categories.push({ id, label: labels[id], weight: weights[id], score: score === null ? null : percent(score), evidence: proof, next });

  add("maintenance", repo.archived ? 0 : lastAge === null ? (counted === 0 && !repo.pushedAt ? 10 : null) : (lastAge <= 7 ? 82 : lastAge <= 30 ? 68 : lastAge <= 90 ? 50 : lastAge <= 365 ? 30 : 12) + Math.min((counted ?? 0) * 2, 18),
    [repo.archived ? "GitHub reports this repository is archived." : "GitHub does not mark the repository as archived.", lastCommit ? `Latest dated commit in the default-branch sample: ${lastCommit}.` : "No dated commit observed.", counted === null ? "Recent commits could not be retrieved." : `${counted} dated commits from the last 30 days in the latest 20 returned commits.`], "Document the maintenance status and establish a sustainable commit/review cadence.");
  add("documentation", readme === null ? null : (readme.length ? 45 + Math.min(25, headings * 5) : 0) + (license ? 20 : 0) + (documented ? 10 : 0),
    [readme === null ? "README could not be retrieved." : readme.length ? `README sample contains ${headings} Markdown headings.` : "No populated README was observed.", license ? `GitHub reports the ${license} license.` : "GitHub did not report a recognized license.", documented ? "Documentation or contribution guide path observed." : "No documentation/guide path observed in the inspected tree."], "Add a clear setup guide, usage examples, and licensing and contribution information.");
  add("testing", tests.length ? (ci ? 100 : 75) : pathsKnown ? (ci ? 30 : 5) : null,
    [tests.length ? `${tests.length} test-like paths observed (for example ${tests[0]}).` : "No test-like file in the available path sample.", ci ? "CI configuration path observed; runs were not inspected." : "No CI definition observed in the available sample."], "Add an automated test suite and run it in CI. Report coverage from CI rather than inferring it from file names.");
  add("organization", paths.length ? Math.min(95, 38 + majorGroups * 17 + (tests.length ? 7 : 0)) : null,
    [source ? `${paths.length} eligible paths at ${source.revision.slice(0, 8)}${source.truncated ? " (partial tree)" : ""}.` : "File tree not available.", `${majorGroups} common source, documentation, or domain groupings observed. This is a structural heuristic, not a design review.`], "Document entry points and group related modules by responsibility.");
  add("dependencies", verifiedDependencies.length ? Math.max(0, 100 - Math.min(75, matches * 30) - Math.min(20, outdated * 5)) : null,
    [`${verifiedDependencies.length} of ${dependency?.dependencies.length ?? 0} inventoried entries checked by exact version against OSV.`, matches ? `${matches} checked entries matched published advisories.` : "No advisory matches reported for the checked subset.", `${versionsChecked.length} direct dependencies compared with the npm latest tag; ${outdated} have a newer stable release.`], "Pin versions in a lockfile, review published advisories and adopt automated dependency updates.");
  add("community", contributorCount === null && !activity.pullRequests && activity.closedIssues === null ? null : Math.min(100, 20 + Math.min(35, (contributorCount ?? 0) * 5) + Math.min(25, (activity.pullRequests?.updatedIn30Days ?? 0) * 5) + Math.min(20, (activity.closedIssues ?? 0) * 4)),
    [`${repo.openIssuesCount} open items reported (issues and pull requests combined).`, contributorCount === null ? "Contributor sample unavailable." : `${contributorCount} contributors in the API sample; not the total.`, activity.pullRequests ? `${activity.pullRequests.updatedIn30Days} of ${activity.pullRequests.sampled} sampled PRs updated in the last 30 days.` : "Pull request sample unavailable.", activity.closedIssues === null ? "Closed issue sample unavailable." : `${activity.closedIssues} closed issues (excluding pull requests) in the latest issue page.`], "Publish review and response expectations and triage issues regularly.");
  add("releases", activity.releases ? (activity.releases.sampled === 0 ? 10 : Math.min(100, 40 + activity.releases.publishedInYear * 12)) : evidence.release ? 50 : null,
    [activity.releases ? `${activity.releases.sampled} published releases sampled; ${activity.releases.publishedInYear} were published in the last 365 days.` : "Release list unavailable; tags and external releases are not inferred.", activity.releases?.latest ? `Most recent published timestamp in sample: ${activity.releases.latest}.` : "No dated release was observed in the list."], "Use versioned GitHub releases and document notable changes and upgrade steps.");

  const possible = categories.reduce((sum, item) => sum + item.weight, 0);
  const known = categories.filter((item) => item.score !== null && item.weight > 0);
  const measured = known.reduce((sum, item) => sum + item.weight, 0);
  const coverage = possible ? percent(measured / possible * 100) : 0;
  const score = measured ? Math.round(known.reduce((sum, item) => sum + (item.score ?? 0) * item.weight, 0) / measured) : null;
  return { score, coverage, categories, generatedAt: now.toISOString(), strengths: known.filter((item) => (item.score ?? 0) >= 75).map((item) => item.label), concerns: known.filter((item) => (item.score ?? 0) < 55).map((item) => item.label), suggestions: known.filter((item) => (item.score ?? 0) < 70).map((item) => item.next), indicators: { lastCommit, commitsIn30Days: counted, contributorsSampled: contributorCount, openItems: repo.openIssuesCount, closedIssuesSampled: activity.closedIssues, pullRequests: activity.pullRequests, releases: activity.releases, analyzedRevision: source?.revision ?? null } };
}

async function collectActivity(ref: RepoRef): Promise<Activity> {
  const base = `/repos/${ref.owner}/${ref.repo}`;
  const now = Date.now();
  const query = { per_page: 10, state: "all", sort: "updated", direction: "desc" } as const;
  const request = <T>(path: string, params: Record<string, string | number>) => githubRequest<T[]>({ path: `${base}/${path}`, query: params, timeoutMs: 5500 }).then(({ data }) => Array.isArray(data) ? data : null, () => null);
  const [issues, prs, releases] = await Promise.all([
    request<{ pull_request?: unknown }>("issues", { ...query, state: "closed" }),
    request<{ updated_at?: string }>("pulls", query),
    request<{ published_at?: string | null; draft?: boolean }>("releases", { per_page: 5 }),
  ]);
  const dates = releases?.filter((entry) => !entry.draft && entry.published_at && Number.isFinite(Date.parse(entry.published_at))).map((entry) => entry.published_at!).sort().reverse();
  return {
    closedIssues: issues?.filter((issue) => !issue.pull_request).length ?? null,
    pullRequests: prs ? { sampled: prs.length, updatedIn30Days: prs.filter((pr) => pr.updated_at && Date.parse(pr.updated_at) >= now - 30 * day).length } : null,
    releases: dates ? { sampled: dates.length, publishedInYear: dates.filter((date) => Date.parse(date) >= now - 365 * day).length, latest: dates[0] ?? null } : null,
  };
}

const healthKey = (ref: RepoRef) => `health:v1:${ref.owner.toLowerCase()}/${ref.repo.toLowerCase()}`;
export async function getHealthReport(ref: RepoRef): Promise<HealthReport> {
  const { data } = await getRepository(ref);
  const canonical = { owner: data.owner.login, repo: data.name };
  return getOrSetCachedData(healthKey(canonical), envInt("REPOLENS_HEALTH_TTL", 3600, 60, 86400), async () => {
    const [evidence, source] = await Promise.all([collectEvidence(canonical), getSourceIndex(canonical).catch(() => null)]);
    const [activity, dependencies] = await Promise.all([collectActivity(canonical), source ? inspectDependencies(source).catch(() => null) : null]);
    return scoreHealth(evidence, source, dependencies, activity);
  });
}

/** Comparison reuses a completed report; a lightweight fallback is explicitly partial. */
export async function comparisonHealth(evidence: CollectedEvidence) {
  const ref = { owner: evidence.repository.owner.login, repo: evidence.repository.name };
  const cached = await getCachedData<HealthReport>(healthKey(ref));
  return cached?.data ?? scoreHealth(evidence, null, null);
}
