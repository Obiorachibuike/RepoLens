import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3, FileCode2, GitCommitHorizontal, ScanSearch, Users } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/state";
import { RepoHeader } from "@/components/repository/repo-header";
import { ReadmeViewer } from "@/components/repository/readme-viewer";
import { GithubApiError } from "@/lib/github/errors";
import { getRepository } from "@/lib/github/repos";
import { getCommits, getContributors, getContents, getLanguages, getReadme } from "@/lib/github/repos";
import { languageColor } from "@/lib/github/language-colors";
import { formatCompact, formatExact, timeAgo } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Params {
  owner: string;
  repo: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { owner, repo } = await params;
  return {
    title: `${owner}/${repo}`,
    description: `Repository details, README and metadata for ${owner}/${repo} on RepoLens.`,
  };
}

export default async function RepositoryDetailPage({ params }: { params: Promise<Params> }) {
  const { owner, repo } = await params;

  let repository;
  try {
    const result = await getRepository({ owner, repo });
    repository = result.data;
  } catch (error) {
    if (error instanceof GithubApiError && error.kind === "not_found") notFound();
    throw error;
  }

  const [readme, languages, contributors, commits, root] = await Promise.all([
    getReadme({ owner, repo }).catch(() => ({ content: null, missing: true, truncated: false, bytes: 0 })),
    getLanguages({ owner, repo }).then(
      (result) => result.data,
      () => [],
    ),
    getContributors({ owner, repo }, 8).then(
      (result) => result.data,
      () => [],
    ),
    getCommits({ owner, repo }, 8).then(
      (result) => result.data,
      () => [],
    ),
    getContents({ owner, repo }, "").then(
      (result) => result.data,
      () => [],
    ),
  ]);

  const basePath = `/repository/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  return (
    <div className="pb-16">
      <RepoHeader repository={repository} active="details" />

      <div className="mx-auto grid w-full max-w-[1100px] gap-4 px-4 pt-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          <Card className="overflow-hidden">
            <CardHeader
              icon={<FileCode2 className="size-3.5" />}
              title="README"
              description={
                readme.missing
                  ? "No README found for this repository"
                  : `${formatExact(readme.bytes)} bytes of Markdown from the ${repository.defaultBranch} branch`
              }
              actions={
                <a href={`${repository.htmlUrl}#readme`} target="_blank" rel="noopener noreferrer">
                  <Badge tone="neutral">View on GitHub</Badge>
                </a>
              }
            />
            <ReadmeViewer
              content={readme.content}
              missing={readme.missing}
              truncated={readme.truncated}
              owner={owner}
              repo={repo}
              branch={repository.defaultBranch}
            />
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              icon={<FileCode2 className="size-3.5" />}
              title="Repository structure"
              description={`${root.length} entries at the root of ${repository.defaultBranch}`}
              actions={
                <Link href={`${basePath}/visualize`}>
                  <Badge tone="accent">
                    <BarChart3 className="size-3" />
                    Visualize
                  </Badge>
                </Link>
              }
            />
            {root.length === 0 ? (
              <p className="p-4 text-xs text-text-muted">
                The directory listing was not available (the repository may be empty).
              </p>
            ) : (
              <ul className="grid gap-px bg-border-subtle sm:grid-cols-2">
                {root.slice(0, 40).map((entry) => (
                  <li key={entry.path} className="flex items-center gap-2 bg-surface px-4 py-1.5">
                    <span
                      aria-hidden="true"
                      className={`size-1.5 rounded-full ${entry.type === "directory" ? "bg-accent" : "bg-text-muted"}`}
                    />
                    <span className="truncate font-mono text-[12px] text-text-secondary">{entry.name}</span>
                    {entry.type === "directory" ? (
                      <span className="ml-auto text-[10px] text-text-muted">dir</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="space-y-4">
          <Card className="overflow-hidden">
            <CardHeader icon={<FileCode2 className="size-3.5" />} title="Languages" description="Byte counts from GitHub" />
            {languages.length === 0 ? (
              <p className="p-4 text-xs text-text-muted">Language data not available.</p>
            ) : (
              <ul className="space-y-2 p-4">
                {languages.slice(0, 8).map((entry) => (
                  <li key={entry.language} className="text-[12px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: languageColor(entry.language) }}
                          aria-hidden="true"
                        />
                        <span className="truncate text-text-secondary">{entry.language}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-text-muted">{entry.percentage}%</span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-hover">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(1.5, entry.percentage)}%`, backgroundColor: languageColor(entry.language) }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              icon={<Users className="size-3.5" />}
              title="Top contributors"
              description="Public contributors and commit counts"
            />
            {contributors.length === 0 ? (
              <p className="p-4 text-xs text-text-muted">
                Contributor data not available (the repository may have only anonymous commits).
              </p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {contributors.map((contributor) => (
                  <li key={contributor.login} className="flex items-center gap-2.5 px-4 py-2">
                    {contributor.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={contributor.avatarUrl}
                        alt=""
                        width={22}
                        height={22}
                        className="size-[22px] rounded-full border border-border"
                        loading="lazy"
                      />
                    ) : null}
                    <a
                      href={contributor.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 truncate text-[12px] text-text-secondary hover:underline"
                    >
                      {contributor.login}
                    </a>
                    <span className="ml-auto shrink-0 text-[11px] tabular-nums text-text-muted">
                      {formatCompact(contributor.contributions)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader
              icon={<GitCommitHorizontal className="size-3.5" />}
              title="Recent commits"
              description={`Latest ${commits.length} on ${repository.defaultBranch}`}
            />
            {commits.length === 0 ? (
              <p className="p-4 text-xs text-text-muted">Commit history not available.</p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {commits.map((commit) => (
                  <li key={commit.sha} className="px-4 py-2.5">
                    <a
                      href={commit.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block truncate text-[12px] text-text-secondary hover:underline"
                      title={commit.message}
                    >
                      {commit.message}
                    </a>
                    <p className="mt-0.5 text-[11px] text-text-muted">
                      {commit.authorLogin ?? commit.authorName ?? "unknown"}
                      {commit.date ? ` · ${timeAgo(commit.date)}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader icon={<ScanSearch className="size-3.5" />} title="Analyze this repository" />
            <div className="space-y-2.5 p-4">
              <p className="text-[12px] leading-relaxed text-text-muted">
                Run an evidence-based analysis: maintenance signals, documentation coverage, structure, strengths
                and limitations — each finding cites the metadata it came from.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href={`${basePath}/analyze`}>
                  <Badge tone="accent">
                    <ScanSearch className="size-3" />
                    Open analysis
                  </Badge>
                </Link>
                <Link href={`${basePath}/visualize`}>
                  <Badge tone="neutral">
                    <BarChart3 className="size-3" />
                    Visualize
                  </Badge>
                </Link>
              </div>
            </div>
          </Card>

          {repository.homepage ? (
            <Notice tone="info">
              Project website:{" "}
              <a
                className="underline underline-offset-2"
                href={repository.homepage}
                target="_blank"
                rel="noopener noreferrer nofollow"
              >
                {repository.homepage}
              </a>
            </Notice>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
