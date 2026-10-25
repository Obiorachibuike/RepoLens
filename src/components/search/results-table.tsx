"use client";

import * as React from "react";
import Link from "next/link";
import { Archive, Info, Star } from "lucide-react";
import { Badge, RepoName } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { languageColor } from "@/lib/github/language-colors";
import { formatCompact, formatExact } from "@/lib/utils";
import { BAND_LABELS, RELEVANCE_WEIGHTS } from "@/lib/query/relevance";
import type { RepositoryResultItem } from "@/lib/api/shapes";
import { RepoActions, RepoActionsMenu } from "./repo-actions";

export function ResultsTable({ items }: { items: RepositoryResultItem[] }) {
  return (
    <>
      {/* Desktop / tablet table */}
      <div className="hidden md:block">
        <table className="w-full table-fixed border-collapse text-left">
          <caption className="sr-only">
            GitHub repository search results with language, stars, RepoLens relevance score and actions
          </caption>
          <colgroup>
            <col />
            <col className="w-[130px]" />
            <col className="w-[96px]" />
            <col className="w-[132px]" />
            <col className="w-[188px]" />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-background-secondary/60">
              <Th>Repository</Th>
              <Th>Language</Th>
              <Th className="text-right">Stars</Th>
              <Th className="text-right">
                <span className="inline-flex items-center justify-end gap-1">
                  Relevance
                  <Tooltip
                    side="bottom"
                    content={
                      <span className="block max-w-[240px]">
                        RepoLens score, not a GitHub value. Weighted from name match (
                        {Math.round(RELEVANCE_WEIGHTS.nameMatch * 100)}%), description match (
                        {Math.round(RELEVANCE_WEIGHTS.descriptionMatch * 100)}%), topic match (
                        {Math.round(RELEVANCE_WEIGHTS.topicMatch * 100)}%), language (
                        {Math.round(RELEVANCE_WEIGHTS.languageMatch * 100)}%) and a small popularity signal (
                        {Math.round(RELEVANCE_WEIGHTS.popularity * 100)}%). Inapplicable factors are removed and
                        the rest renormalised.
                      </span>
                    }
                  >
                    <span
                      tabIndex={0}
                      role="button"
                      aria-label="How relevance is calculated"
                      className="inline-flex cursor-help items-center text-text-muted hover:text-text-secondary"
                    >
                      <Info className="size-3" />
                    </span>
                  </Tooltip>
                </span>
              </Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {items.map((item) => (
              <ResultRow key={item.repository.id} item={item} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="divide-y divide-border-subtle md:hidden">
        {items.map((item) => (
          <ResultCard key={item.repository.id} item={item} />
        ))}
      </ul>
    </>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

function ResultRow({ item }: { item: RepositoryResultItem }) {
  const { repository, relevance } = item;
  return (
    <tr className="group align-top transition-colors hover:bg-surface-hover/50">
      <td className="px-4 py-3.5">
        <div className="min-w-0">
          <Link
            href={`/repository/${encodeURIComponent(repository.owner.login)}/${encodeURIComponent(repository.name)}`}
            className="inline-flex max-w-full items-center gap-1.5 text-[14px] leading-tight hover:underline"
          >
            <RepoName owner={repository.owner.login} name={repository.name} />
          </Link>
          {repository.archived ? (
            <Badge tone="warning" className="ml-2 align-middle" title="This repository is archived (read-only)">
              <Archive className="size-3" />
              archived
            </Badge>
          ) : null}
          {repository.description ? (
            <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-text-muted">
              {repository.description}
            </p>
          ) : (
            <p className="mt-1 text-[13px] italic text-text-muted/70">No description provided.</p>
          )}
          <TopicBadges topics={repository.topics} />
        </div>
      </td>
      <td className="px-4 py-3.5">
        <LanguageLabel language={repository.language} />
      </td>
      <td className="px-4 py-3.5 text-right">
        <StarCount count={repository.stargazersCount} />
      </td>
      <td className="px-4 py-3.5 text-right">
        <RelevanceCell relevance={relevance} />
      </td>
      <td className="px-4 py-3.5">
        <RepoActions repository={repository} />
      </td>
    </tr>
  );
}

function ResultCard({ item }: { item: RepositoryResultItem }) {
  const { repository, relevance } = item;
  return (
    <li className="px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/repository/${encodeURIComponent(repository.owner.login)}/${encodeURIComponent(repository.name)}`}
            className="block truncate text-[14px] font-medium hover:underline"
          >
            <RepoName owner={repository.owner.login} name={repository.name} />
          </Link>
          {repository.description ? (
            <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-text-muted">
              {repository.description}
            </p>
          ) : (
            <p className="mt-1 text-[13px] italic text-text-muted/70">No description provided.</p>
          )}
        </div>
        {repository.archived ? (
          <Badge tone="warning" title="Archived (read-only)">
            <Archive className="size-3" />
          </Badge>
        ) : null}
      </div>

      <TopicBadges topics={repository.topics} />

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-text-muted">
        <LanguageLabel language={repository.language} />
        <StarCount count={repository.stargazersCount} />
        <RelevanceCell relevance={relevance} compact />
      </div>

      <div className="mt-3 flex justify-end">
        <RepoActionsMenu repository={repository} />
      </div>
    </li>
  );
}

function TopicBadges({ topics }: { topics: string[] }) {
  if (topics.length === 0) return null;
  const visible = topics.slice(0, 3);
  const rest = topics.length - visible.length;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      {visible.map((topic) => (
        <Badge key={topic} tone="accent">
          {topic}
        </Badge>
      ))}
      {rest > 0 ? (
        <Badge tone="neutral" title={topics.slice(3).join(", ")}>
          +{rest} more
        </Badge>
      ) : null}
    </div>
  );
}

function LanguageLabel({ language }: { language: string | null }) {
  if (!language) {
    return <span className="text-[12px] text-text-muted">Not reported</span>;
  }
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 text-[12px] text-text-secondary">
      <span
        aria-hidden="true"
        className="size-2.5 shrink-0 rounded-full ring-1 ring-black/20"
        style={{ backgroundColor: languageColor(language) }}
      />
      <span className="truncate">{language}</span>
    </span>
  );
}

function StarCount({ count }: { count: number }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[12px] font-medium text-text-secondary"
      title={`${formatExact(count)} stars`}
    >
      <Star className="size-3.5 fill-[var(--star)] text-[var(--star)]" aria-hidden="true" />
      {formatCompact(count)}
    </span>
  );
}

function RelevanceCell({
  relevance,
  compact,
}: {
  relevance: RepositoryResultItem["relevance"];
  compact?: boolean;
}) {
  if (relevance.score === null) {
    return <span className="text-[12px] text-text-muted">No score</span>;
  }

  const tone =
    relevance.band === "exact" || relevance.band === "strong"
      ? "success"
      : relevance.band === "good"
        ? "accent"
        : relevance.band === "partial"
          ? "warning"
          : "neutral";

  const label = relevance.band ? BAND_LABELS[relevance.band] : null;

  const content = (
    <span className="inline-flex items-center gap-1.5">
      {!compact ? (
        <span
          aria-hidden="true"
          className="h-1 w-10 overflow-hidden rounded-full bg-surface-hover"
          title={`${relevance.score}% match`}
        >
          <span
            className="block h-full rounded-full bg-accent"
            style={{ width: `${Math.max(4, relevance.score)}%` }}
          />
        </span>
      ) : null}
      <span className="text-[12px] font-medium tabular-nums text-text-primary">{relevance.score}%</span>
      {label && !compact ? <Badge tone={tone}>{label}</Badge> : null}
      {compact && label ? <span className="text-text-muted">{label}</span> : null}
    </span>
  );

  return (
    <Tooltip
      content={
        <span className="block max-w-[260px] space-y-1">
          <span className="block font-medium text-text-primary">
            {relevance.score}% — {label}
          </span>
          {relevance.factors.map((factor) => (
            <span key={factor.key} className="block text-text-muted">
              · {factor.label}: {factor.detail}
            </span>
          ))}
          {relevance.githubRank ? (
            <span className="block pt-1 text-text-muted">
              Position #{relevance.githubRank} in GitHub&apos;s response order.
            </span>
          ) : null}
        </span>
      }
    >
      <span tabIndex={0} className="inline-flex cursor-help justify-end">
        {content}
      </span>
    </Tooltip>
  );
}
