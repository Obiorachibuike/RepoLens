"use client";

import * as React from "react";
import Link from "next/link";
import {
  Archive,
  BarChart3,
  Bookmark,
  BookmarkCheck,
  CalendarDays,
  Eye,
  GitFork,
  HardDrive,
  ScanSearch,
  Scale,
  Star,
  Users,
} from "lucide-react";
import { GithubMark } from "@/components/icons/github-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { languageColor } from "@/lib/github/language-colors";
import type { RepositoryDetail } from "@/lib/github/types";
import { formatDate, formatExact, timeAgo } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { useSaved } from "@/components/saved/saved-provider";

export type RepoTab = "details" | "visualize" | "analyze";

const TABS: Array<{ id: RepoTab; label: string; icon: typeof Eye }> = [
  { id: "details", label: "Details", icon: Eye },
  { id: "visualize", label: "Visualize", icon: BarChart3 },
  { id: "analyze", label: "Analyze", icon: ScanSearch },
];

export function RepoHeader({
  repository,
  active = "details",
}: {
  repository: RepositoryDetail;
  active?: RepoTab;
}) {
  const saved = useSaved();
  const isSaved = saved.isSaved(repository.fullName);
  const [pending, setPending] = React.useState(false);

  const basePath = `/repository/${encodeURIComponent(repository.owner.login)}/${encodeURIComponent(repository.name)}`;

  const toggle = async () => {
    setPending(true);
    await saved.toggle({
      owner: repository.owner.login,
      name: repository.name,
      fullName: repository.fullName,
      url: repository.htmlUrl,
      description: repository.description,
      language: repository.language,
      stars: repository.stargazersCount,
    });
    setPending(false);
  };

  return (
    <header className="border-b border-border-subtle bg-surface/40">
      <div className="mx-auto w-full max-w-[1100px] px-4 pb-5 pt-7 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            {repository.owner.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={repository.owner.avatarUrl}
                alt=""
                width={40}
                height={40}
                className="size-10 shrink-0 rounded-md border border-border"
                loading="lazy"
              />
            ) : null}
            <div className="min-w-0">
              <h1 className="truncate text-[22px] font-semibold tracking-tight text-text-primary sm:text-[26px]">
                <a
                  href={repository.owner.htmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-text-muted hover:underline"
                >
                  {repository.owner.login}
                </a>
                <span className="text-text-muted"> / </span>
                <Link href={basePath} className="hover:underline">
                  {repository.name}
                </Link>
              </h1>
              {repository.description ? (
                <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-text-secondary">
                  {repository.description}
                </p>
              ) : (
                <p className="mt-1.5 text-[13px] italic text-text-muted">No description provided.</p>
              )}

              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {repository.archived ? (
                  <Badge tone="warning">
                    <Archive className="size-3" />
                    archived
                  </Badge>
                ) : null}
                {repository.fork ? (
                  <Badge tone="neutral" title="This repository is a fork">
                    <GitFork className="size-3" />
                    fork
                  </Badge>
                ) : null}
                {repository.isTemplate ? <Badge tone="accent">template</Badge> : null}
                {repository.language ? (
                  <Badge tone="neutral">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: languageColor(repository.language) }}
                      aria-hidden="true"
                    />
                    {repository.language}
                  </Badge>
                ) : (
                  <Badge tone="neutral">Language not reported</Badge>
                )}
                {repository.license ? (
                  <Badge tone="neutral" title="License reported by GitHub">
                    <Scale className="size-3" />
                    {repository.license.spdxId ?? repository.license.name}
                  </Badge>
                ) : (
                  <Badge tone="danger" title="GitHub did not detect a license file">
                    <Scale className="size-3" />
                    no license
                  </Badge>
                )}
                {repository.topics.slice(0, 6).map((topic) => (
                  <Link
                    key={topic}
                    href={`/search/repositories?mode=repository&q=${encodeURIComponent(`topic:${topic}`)}`}
                    title={`Search topic:${topic}`}
                  >
                    <Badge tone="accent" className="hover:border-accent/60">
                      {topic}
                    </Badge>
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" disabled={pending} onClick={toggle} aria-pressed={isSaved}>
              {isSaved ? <BookmarkCheck className="size-3.5" /> : <Bookmark className="size-3.5" />}
              {isSaved ? "Saved" : "Save"}
            </Button>
            <a href={repository.htmlUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="secondary" size="sm">
                <GithubMark className="size-3.5" />
                GitHub
              </Button>
            </a>
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 lg:grid-cols-6">
          <Stat icon={<Star className="size-3.5" />} label="Stars" value={formatExact(repository.stargazersCount)} />
          <Stat icon={<GitFork className="size-3.5" />} label="Forks" value={formatExact(repository.forksCount)} />
          <Stat
            icon={<Users className="size-3.5" />}
            label="Watchers"
            value={
              repository.subscribersCount !== null
                ? formatExact(repository.subscribersCount)
                : formatExact(repository.watchersCount)
            }
            hint={repository.subscribersCount === null ? "watchers_count (includes stargazers in search)" : undefined}
          />
          <Stat
            icon={<Eye className="size-3.5" />}
            label="Open issues"
            value={formatExact(repository.openIssuesCount)}
            hint="includes pull requests"
          />
          <Stat
            icon={<CalendarDays className="size-3.5" />}
            label="Created"
            value={formatDate(repository.createdAt)}
          />
          <Stat
            icon={<CalendarDays className="size-3.5" />}
            label="Last push"
            value={timeAgo(repository.pushedAt || repository.updatedAt)}
          />
          <Stat icon={<HardDrive className="size-3.5" />} label="Size" value={`${formatExact(repository.size)} KB`} />
          <Stat
            icon={<GitFork className="size-3.5" />}
            label="Default branch"
            value={repository.defaultBranch}
          />
        </dl>

        <nav aria-label="Repository views" className="mt-5 flex flex-wrap items-center gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const href = tab.id === "details" ? basePath : `${basePath}/${tab.id}`;
            const isActive = tab.id === active;
            return (
              <Link
                key={tab.id}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  isActive
                    ? "border-accent/40 bg-surface-hover text-text-primary"
                    : "border-transparent text-text-muted hover:bg-surface-hover hover:text-text-primary",
                )}
              >
                <Icon className={cn("size-3.5", isActive && "text-accent-hover")} />
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.06em] text-text-muted">
        {icon}
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[13px] font-medium text-text-primary" title={hint ?? value}>
        {value}
      </dd>
    </div>
  );
}
