import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Activity, BarChart3, FolderTree, Layers, Users } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/state";
import { RepoHeader } from "@/components/repository/repo-header";
import { FileTree } from "@/components/repository/file-tree";
import { GithubApiError } from "@/lib/github/errors";
import { collectEvidence } from "@/lib/analyze/collect";
import { languageColor } from "@/lib/github/language-colors";
import { formatCompact, formatExact, percentage, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Params {
  owner: string;
  repo: string;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { owner, repo } = await params;
  return { title: `Visualize ${owner}/${repo}` };
}

export default async function VisualizePage({ params }: { params: Promise<Params> }) {
  const { owner, repo } = await params;

  let evidence;
  try {
    evidence = await collectEvidence({ owner, repo });
  } catch (error) {
    if (error instanceof GithubApiError && error.kind === "not_found") notFound();
    throw error;
  }

  const { repository, languages, contributors, commits, root, failed } = evidence;

  const totalBytes = languages.reduce((sum, entry) => sum + entry.bytes, 0);
  const commitsByDay = groupCommitsByDay(commits);
  const maxContributions = contributors.reduce((max, entry) => Math.max(max, entry.contributions), 0);
  const totalContributions = contributors.reduce((sum, entry) => sum + entry.contributions, 0);

  return (
    <div className="pb-16">
      <RepoHeader repository={repository} active="visualize" />

      <div className="mx-auto w-full max-w-[1100px] space-y-4 px-4 pt-5 sm:px-6">
        {failed.length > 0 ? (
          <Notice tone="warning">
            Some data could not be retrieved from GitHub ({failed.join(", ")}). Those panels show what is actually
            missing instead of estimated values.
          </Notice>
        ) : null}

        <section aria-labelledby="overview-heading" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Stars" value={formatExact(repository.stargazersCount)} note="from GET /repos" />
          <MetricCard label="Forks" value={formatExact(repository.forksCount)} note="from GET /repos" />
          <MetricCard
            label="Open issues + PRs"
            value={formatExact(repository.openIssuesCount)}
            note="GitHub combines both counts"
          />
          <MetricCard label="Repository size" value={`${formatExact(repository.size)} KB`} note="reported by GitHub" />
          <MetricCard label="Contributors shown" value={String(contributors.length)} note="first page only" />
          <MetricCard
            label="Commits sampled"
            value={String(commits.length)}
            note="most recent on the default branch"
          />
          <MetricCard label="Languages" value={String(languages.length)} note="byte-weighted" />
          <MetricCard
            label="Last push"
            value={timeAgo(repository.pushedAt || repository.updatedAt)}
            note={repository.pushedAt || repository.updatedAt}
          />
        </section>

        <Card className="overflow-hidden">
          <CardHeader
            icon={<Layers className="size-3.5" />}
            title="Language distribution"
            description="Percentages calculated from the byte counts GitHub reports for each language"
          />
          {languages.length === 0 ? (
            <p className="p-4 text-xs text-text-muted">
              GitHub did not return language data for this repository.
            </p>
          ) : (
            <div className="p-4">
              <div
                className="flex h-2.5 w-full overflow-hidden rounded-full border border-border-subtle"
                role="img"
                aria-label={`Language distribution: ${languages
                  .map((entry) => `${entry.language} ${entry.percentage}%`)
                  .join(", ")}`}
              >
                {languages.map((entry) => (
                  <div
                    key={entry.language}
                    style={{
                      width: `${Math.max(entry.percentage, 0.6)}%`,
                      backgroundColor: languageColor(entry.language),
                    }}
                    title={`${entry.language} — ${entry.percentage}% (${formatCompact(entry.bytes)} bytes)`}
                  />
                ))}
              </div>
              <ul className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {languages.map((entry) => (
                  <li key={entry.language} className="flex items-center gap-2 text-[12px]">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: languageColor(entry.language) }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 truncate text-text-secondary">{entry.language}</span>
                    <span className="ml-auto shrink-0 tabular-nums text-text-muted">{entry.percentage}%</span>
                    <span className="w-16 shrink-0 text-right tabular-nums text-[11px] text-text-muted">
                      {formatCompact(entry.bytes)} B
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-text-muted">
                Total measured: {formatExact(totalBytes)} bytes across {languages.length} language(s). Percentages
                are rounded to one decimal and may not sum to exactly 100%.
              </p>
            </div>
          )}
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="overflow-hidden">
            <CardHeader
              icon={<Users className="size-3.5" />}
              title="Contributor overview"
              description="Public contributors and their commit counts on the default branch"
            />
            {contributors.length === 0 ? (
              <p className="p-4 text-xs text-text-muted">
                No contributor data was returned. GitHub omits it for repositories whose commits are all
                anonymous.
              </p>
            ) : (
              <div className="p-4">
                <ul className="space-y-2">
                  {contributors.map((contributor) => (
                    <li key={contributor.login} className="flex items-center gap-2.5">
                      {contributor.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={contributor.avatarUrl}
                          alt=""
                          width={20}
                          height={20}
                          className="size-5 shrink-0 rounded-full border border-border"
                          loading="lazy"
                        />
                      ) : null}
                      <a
                        href={contributor.htmlUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-28 shrink-0 truncate text-[12px] text-text-secondary hover:underline"
                      >
                        {contributor.login}
                      </a>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-hover">
                        <div
                          className="h-full rounded-full bg-accent"
                          style={{
                            width: `${maxContributions > 0 ? (contributor.contributions / maxContributions) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <span className="w-14 shrink-0 text-right text-[11px] tabular-nums text-text-muted">
                        {formatCompact(contributor.contributions)}
                      </span>
                      <span className="w-10 shrink-0 text-right text-[11px] tabular-nums text-text-muted">
                        {percentage(contributor.contributions, totalContributions)}%
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[11px] text-text-muted">
                  Based on the {contributors.length} contributors returned by the API (first page). Percentages are
                  share of those {formatExact(totalContributions)} sampled commits.
                </p>
              </div>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              icon={<Activity className="size-3.5" />}
              title="Activity timeline"
              description={`Commit dates from the ${commits.length} most recent commits`}
            />
            {commits.length === 0 ? (
              <p className="p-4 text-xs text-text-muted">
                No commit history was returned (the repository may be empty).
              </p>
            ) : (
              <div className="p-4">
                <div className="flex h-24 items-end gap-[3px]" role="img" aria-label="Commits per day for the sampled history">
                  {commitsByDay.map((day) => {
                    const max = Math.max(...commitsByDay.map((entry) => entry.count), 1);
                    return (
                      <div
                        key={day.date}
                        title={`${day.date}: ${day.count} commit(s)`}
                        className="flex-1 rounded-t-[2px] bg-accent/70 transition-colors hover:bg-accent"
                        style={{ height: `${Math.max(6, (day.count / max) * 100)}%` }}
                      />
                    );
                  })}
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-text-muted">
                  <span>{commitsByDay[0]?.date ?? ""}</span>
                  <span>{commitsByDay[commitsByDay.length - 1]?.date ?? ""}</span>
                </div>
                <p className="mt-3 text-[11px] text-text-muted">
                  This is a sample of the {commits.length} newest commits, not the full history. GitHub&apos;s API does
                  not expose commit totals without walking every page.
                </p>
              </div>
            )}
          </Card>
        </div>

        <Card className="overflow-hidden">
          <CardHeader
            icon={<FolderTree className="size-3.5" />}
            title="Repository structure"
            description={`Live directory listing from the contents API — expand folders to load them`}
            actions={<Badge tone="neutral">{root.length} root entries</Badge>}
          />
          {root.length === 0 ? (
            <p className="p-4 text-xs text-text-muted">
              The root listing was not available. The repository may be empty or the request was rate limited.
            </p>
          ) : (
            <FileTree owner={owner} repo={repo} branch={repository.defaultBranch} root={root} />
          )}
        </Card>

        <p className="px-1 text-[11px] leading-relaxed text-text-muted">
          <BarChart3 className="mr-1 inline size-3" />
          All numbers on this page come from the GitHub REST API (repository details, languages, contributors,
          commits and contents). Calculated values — percentages, shares and grouped counts — are labelled with
          the sample they were derived from.
        </p>
      </div>
    </div>
  );
}

function MetricCard({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface/70 p-4">
      <p className="text-[10px] font-medium uppercase tracking-[0.07em] text-text-muted">{label}</p>
      <p className="mt-1 truncate text-[20px] font-semibold tabular-nums text-text-primary" title={value}>
        {value}
      </p>
      <p className="mt-1 truncate text-[10px] text-text-muted" title={note}>
        {note}
      </p>
    </div>
  );
}

function groupCommitsByDay(commits: Array<{ date: string | null }>): Array<{ date: string; count: number }> {
  const buckets = new Map<string, number>();
  for (const commit of commits) {
    if (!commit.date) continue;
    const day = commit.date.slice(0, 10);
    buckets.set(day, (buckets.get(day) ?? 0) + 1);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));
}
