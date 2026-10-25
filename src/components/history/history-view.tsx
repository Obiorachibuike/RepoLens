"use client";

import * as React from "react";
import Link from "next/link";
import { History, RotateCcw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Notice } from "@/components/ui/state";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { useHistory } from "./history-provider";
import { SEARCH_MODES_CONFIG } from "@/components/search/modes";
import { searchStateToQueryString } from "@/components/search/use-repository-search";
import { DEFAULT_FILTERS } from "@/lib/search/initial-state";
import { formatDateTime, timeAgo } from "@/lib/utils";
import type { RepositoryFilters } from "@/lib/validation/search";

export function HistoryView() {
  const history = useHistory();
  const [confirming, setConfirming] = React.useState(false);

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3 py-10">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-text-primary sm:text-[30px]">Search history</h1>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-text-secondary">
            Your recent searches, with the filters that were active. {history.mode === "server"
              ? "Synced to PostgreSQL for this session."
              : "Stored in this browser only."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => void history.refresh()}>
            <RotateCcw className="size-3.5" />
            Refresh
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={history.entries.length === 0}
            onClick={async () => {
              if (!confirming) {
                setConfirming(true);
                return;
              }
              await history.clear();
              setConfirming(false);
            }}
            onBlur={() => setConfirming(false)}
          >
            <Trash2 className="size-3.5" />
            {confirming ? "Click again to confirm" : "Clear history"}
          </Button>
        </div>
      </header>

      {history.error ? (
        <Notice tone="warning" className="mb-4">
          {history.error}
        </Notice>
      ) : null}

      {!history.ready ? (
        <CardsSkeleton cards={4} />
      ) : history.entries.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface/70">
          <EmptyState
            title="No searches yet"
            description="Searches you run will appear here so you can repeat or refine them."
            action={
              <Link href="/">
                <Button size="sm" variant="secondary">
                  Start searching
                </Button>
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-border bg-surface/70">
          {history.entries.map((entry) => {
            const query = searchStateToQueryString({
              mode: entry.mode,
              q: entry.query,
              page: 1,
              perPage: 20,
              sort: entry.sort,
              direction: "desc",
              filters: { ...DEFAULT_FILTERS, ...(entry.filters as Partial<RepositoryFilters>) },
            });
            const modeConfig = SEARCH_MODES_CONFIG[entry.mode];
            return (
              <li key={entry.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <History className="size-3.5 shrink-0 text-text-muted" />
                <Link href={`/?${query}`} className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-text-primary hover:underline">{entry.query}</span>
                  <span className="mt-0.5 block text-[11px] text-text-muted">
                    {formatDateTime(entry.createdAt)} · {timeAgo(entry.createdAt)}
                    {entry.resultCount !== null ? ` · ${entry.resultCount.toLocaleString("en-US")} results` : ""}
                  </span>
                </Link>
                <Badge tone="accent">{modeConfig.label}</Badge>
                <Badge tone="neutral">{entry.sort}</Badge>
                <Link
                  href={`/?${query}`}
                  className="rounded-md border border-border bg-surface-elevated px-2.5 py-1 text-[11px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                >
                  Repeat
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
