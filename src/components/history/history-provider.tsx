"use client";

import * as React from "react";
import {
  addLocalHistory,
  clearLocalHistory,
  listLocalHistory,
  type LocalHistoryEntry,
} from "@/lib/storage/local";
import type { RepositoryFilters, SearchMode, SortOption } from "@/lib/validation/search";

export interface HistoryEntry {
  id: string;
  query: string;
  mode: SearchMode;
  sort: SortOption;
  filters: Partial<RepositoryFilters>;
  resultCount: number | null;
  createdAt: string;
}

interface HistoryContextValue {
  entries: HistoryEntry[];
  mode: "server" | "local";
  ready: boolean;
  error: string | null;
  record: (entry: {
    query: string;
    mode: SearchMode;
    sort: SortOption;
    filters: Partial<RepositoryFilters>;
    resultCount?: number | null;
  }) => void;
  clear: () => Promise<void>;
  refresh: () => Promise<void>;
}

const HistoryContext = React.createContext<HistoryContextValue | null>(null);

function toEntry(row: Record<string, unknown>): HistoryEntry {
  return {
    id: String(row.id ?? ""),
    query: String(row.query ?? ""),
    mode: (row.mode as SearchMode) ?? "repository",
    sort: (row.sort as SortOption) ?? "best-match",
    filters: (row.filters as Partial<RepositoryFilters>) ?? {},
    resultCount: typeof row.resultCount === "number" ? row.resultCount : null,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString(),
  };
}

export function HistoryProvider({
  children,
  databaseConfigured,
}: {
  children: React.ReactNode;
  databaseConfigured: boolean;
}) {
  const [entries, setEntries] = React.useState<HistoryEntry[]>([]);
  const [mode, setMode] = React.useState<"server" | "local">(databaseConfigured ? "server" : "local");
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadLocal = React.useCallback(() => {
    setEntries(
      listLocalHistory(40).map((entry) => ({
        ...entry,
        mode: (entry.mode as SearchMode) ?? "repository",
        sort: (entry.sort as SortOption) ?? "best-match",
        filters: entry.filters as Partial<RepositoryFilters>,
      })),
    );
  }, []);

  const refresh = React.useCallback(async () => {
    loadLocal();
    if (!databaseConfigured) {
      setMode("local");
      setReady(true);
      return;
    }
    try {
      const response = await fetch("/api/history?limit=40");
      if (!response.ok) {
        if (response.status === 503) {
          setMode("local");
        }
        setReady(true);
        return;
      }
      const body = (await response.json()) as { items?: Record<string, unknown>[] };
      setEntries((body.items ?? []).map(toEntry));
      setMode("server");
    } catch {
      setMode("local");
    } finally {
      setReady(true);
    }
  }, [databaseConfigured, loadLocal]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = React.useMemo<HistoryContextValue>(
    () => ({
      entries,
      mode,
      ready,
      error,
      record: ({ query, mode: searchMode, sort, filters, resultCount }) => {
        // Always record locally for an instant UI, then sync when possible.
        addLocalHistory({ query, mode: searchMode, sort, filters, resultCount: resultCount ?? null });
        loadLocal();
        if (mode !== "server") return;
        void fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, mode: searchMode, sort, filters, resultCount: resultCount ?? null }),
        })
          .then((response) => {
            if (!response.ok) throw new Error("history sync failed");
            return void refresh();
          })
          .catch(() => setError("Search history could not be synced to the server."));
      },
      clear: async () => {
        clearLocalHistory();
        loadLocal();
        if (mode === "server") {
          try {
            await fetch("/api/history", { method: "DELETE" });
            await refresh();
          } catch {
            setError("Could not clear server history.");
          }
        }
      },
      refresh,
    }),
    [entries, mode, ready, error, loadLocal, refresh],
  );

  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}

export function useHistory(): HistoryContextValue {
  const context = React.useContext(HistoryContext);
  if (!context) throw new Error("useHistory must be used inside <HistoryProvider>");
  return context;
}

export type { LocalHistoryEntry };
