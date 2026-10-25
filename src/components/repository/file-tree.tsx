"use client";

import * as React from "react";
import { ChevronRight, File, Folder, Loader2 } from "lucide-react";
import type { TreeEntry } from "@/lib/github/types";
import { formatCompact } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface TreeResponse {
  entries?: TreeEntry[];
  error?: { message?: string };
}

export function FileTree({
  owner,
  repo,
  branch,
  root,
}: {
  owner: string;
  repo: string;
  branch: string;
  root: TreeEntry[];
}) {
  return (
    <div className="overflow-x-auto">
      <ul className="min-w-[320px] py-1 font-mono text-[12px]" role="tree" aria-label="Repository files">
        {root.map((entry) => (
          <TreeRow key={entry.path} entry={entry} depth={0} owner={owner} repo={repo} branch={branch} />
        ))}
      </ul>
    </div>
  );
}

function TreeRow({
  entry,
  depth,
  owner,
  repo,
  branch,
}: {
  entry: TreeEntry;
  depth: number;
  owner: string;
  repo: string;
  branch: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [children, setChildren] = React.useState<TreeEntry[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isDirectory = entry.type === "directory";

  const toggle = async () => {
    if (!isDirectory) return;
    const next = !open;
    setOpen(next);
    if (next && children === null && !loading) {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents?path=${encodeURIComponent(entry.path)}`,
        );
        const body = (await response.json()) as TreeResponse;
        if (!response.ok) throw new Error(body.error?.message ?? "Could not load this directory.");
        setChildren(body.entries ?? []);
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Could not load this directory.");
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <li role="none">
      <div
        role="treeitem"
        aria-expanded={isDirectory ? open : undefined}
        aria-selected={open}
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            void toggle();
          }
        }}
        style={{ paddingLeft: `${depth * 14 + 12}px` }}
        className={cn(
          "flex cursor-default items-center gap-1.5 py-[3px] pr-3 text-text-secondary transition-colors",
          isDirectory && "cursor-pointer hover:bg-surface-hover/60",
        )}
      >
        {isDirectory ? (
          <ChevronRight className={cn("size-3 shrink-0 text-text-muted transition-transform", open && "rotate-90")} />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {isDirectory ? (
          <Folder className="size-3.5 shrink-0 text-accent-hover" />
        ) : (
          <File className="size-3.5 shrink-0 text-text-muted" />
        )}
        {isDirectory ? (
          <span className="truncate">{entry.name}</span>
        ) : (
          <a
            href={`https://github.com/${owner}/${repo}/blob/${branch}/${entry.path}`}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate hover:text-text-primary hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {entry.name}
          </a>
        )}
        {!isDirectory && entry.size !== null ? (
          <span className="ml-auto shrink-0 pl-3 text-[10px] tabular-nums text-text-muted">
            {formatCompact(entry.size)} B
          </span>
        ) : null}
        {loading ? <Loader2 className="ml-auto size-3 animate-spin-slow text-text-muted" /> : null}
      </div>

      {open ? (
        <ul role="group">
          {error ? (
            <li style={{ paddingLeft: `${(depth + 1) * 14 + 12}px` }} className="py-1 text-[11px] text-danger">
              {error}
            </li>
          ) : null}
          {children?.length === 0 && !loading ? (
            <li style={{ paddingLeft: `${(depth + 1) * 14 + 12}px` }} className="py-1 text-[11px] text-text-muted">
              Empty directory
            </li>
          ) : null}
          {children?.map((child) => (
            <TreeRow key={child.path} entry={child} depth={depth + 1} owner={owner} repo={repo} branch={branch} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
