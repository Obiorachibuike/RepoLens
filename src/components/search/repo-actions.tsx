"use client";

import * as React from "react";
import Link from "next/link";
import { BarChart3, Bookmark, BookmarkCheck, Eye, MoreHorizontal, ScanSearch } from "lucide-react";
import { GithubMark } from "@/components/icons/github-mark";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip } from "@/components/ui/tooltip";
import { useSaved } from "@/components/saved/saved-provider";
import type { RepositorySummary } from "@/lib/github/types";
import { cn } from "@/lib/utils";

function repoPath(repository: RepositorySummary): string {
  return `/repository/${encodeURIComponent(repository.owner.login)}/${encodeURIComponent(repository.name)}`;
}

function seedOf(repository: RepositorySummary) {
  return {
    owner: repository.owner.login,
    name: repository.name,
    fullName: repository.fullName,
    url: repository.htmlUrl,
    description: repository.description,
    language: repository.language,
    stars: repository.stargazersCount,
  };
}

/** Compact icon actions shared by the desktop table rows. */
export function RepoActions({ repository }: { repository: RepositorySummary }) {
  const saved = useSaved();
  const isSaved = saved.isSaved(repository.fullName);
  const [pending, setPending] = React.useState(false);
  const base = repoPath(repository);

  const toggle = async () => {
    setPending(true);
    await saved.toggle(seedOf(repository));
    setPending(false);
  };

  const actions = [
    {
      key: "details",
      label: "View details",
      shortLabel: "Details",
      icon: Eye,
      href: base,
    },
    {
      key: "visualize",
      label: "Visualize",
      shortLabel: "Visualize",
      icon: BarChart3,
      href: `${base}/visualize`,
    },
    {
      key: "analyze",
      label: "Analyze",
      shortLabel: "Analyze",
      icon: ScanSearch,
      href: `${base}/analyze`,
    },
  ] as const;

  return (
    <div className="flex items-center justify-end gap-1">
      {actions.map((action) => (
        <Tooltip key={action.key} content={action.label}>
          <Link
            href={action.href}
            aria-label={`${action.label}: ${repository.fullName}`}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md border border-transparent px-2 text-xs text-text-muted transition-colors",
              "hover:border-border hover:bg-surface-hover hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
            )}
          >
            <action.icon className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="hidden lg:inline">{action.shortLabel}</span>
          </Link>
        </Tooltip>
      ))}

      <Tooltip content="Open on GitHub (new tab)">
        <a
          href={repository.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${repository.fullName} on GitHub in a new tab`}
          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-transparent px-2 text-xs text-text-muted transition-colors hover:border-border hover:bg-surface-hover hover:text-text-primary"
        >
          <GithubMark className="size-3.5 shrink-0" />
          <span className="hidden lg:inline">GitHub</span>
        </a>
      </Tooltip>

      <Tooltip content={isSaved ? "Remove from saved" : "Save repository"}>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={pending}
          onClick={toggle}
          aria-pressed={isSaved}
          aria-label={isSaved ? `Remove ${repository.fullName} from saved` : `Save ${repository.fullName}`}
          className={cn(isSaved && "text-accent-hover hover:text-accent-hover")}
        >
          {isSaved ? <BookmarkCheck className="size-3.5" /> : <Bookmark className="size-3.5" />}
        </Button>
      </Tooltip>
    </div>
  );
}

/** Mobile/tablet fallback: everything in one accessible menu. */
export function RepoActionsMenu({ repository }: { repository: RepositorySummary }) {
  const saved = useSaved();
  const isSaved = saved.isSaved(repository.fullName);
  const base = repoPath(repository);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" aria-label={`Actions for ${repository.fullName}`}>
          <MoreHorizontal className="size-3.5" />
          Actions
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel>{repository.fullName}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={base}>
            <Eye className="size-3.5" />
            View details
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`${base}/visualize`}>
            <BarChart3 className="size-3.5" />
            Visualize
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href={`${base}/analyze`}>
            <ScanSearch className="size-3.5" />
            Analyze
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={repository.htmlUrl} target="_blank" rel="noopener noreferrer">
            <GithubMark className="size-3.5" />
            Open on GitHub
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void saved.toggle(seedOf(repository));
          }}
        >
          {isSaved ? <BookmarkCheck className="size-3.5" /> : <Bookmark className="size-3.5" />}
          {isSaved ? "Remove from saved" : "Save repository"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
