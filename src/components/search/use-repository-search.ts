"use client";

import * as React from "react";
import type { ApiErrorShape, RepositorySearchResponse, SearchRequestState } from "@/lib/api/shapes";

export type SearchStatus = "idle" | "loading" | "success" | "error";

export interface SearchError {
  message: string;
  hint: string | null;
  kind: string;
  issues?: string[];
}

function toQueryString(state: SearchRequestState): string {
  const params = new URLSearchParams();
  if (state.q.trim()) params.set("q", state.q.trim());
  params.set("mode", state.mode);
  if (state.sort !== "best-match") params.set("sort", state.sort);
  if (state.direction !== "desc") params.set("direction", state.direction);
  if (state.page !== 1) params.set("page", String(state.page));
  if (state.perPage !== 20) params.set("perPage", String(state.perPage));

  const { filters } = state;
  if (filters.language) params.set("language", filters.language);
  if (filters.topics?.length) params.set("topics", filters.topics.join(","));
  if (filters.minStars !== undefined) params.set("minStars", String(filters.minStars));
  if (filters.minForks !== undefined) params.set("minForks", String(filters.minForks));
  if (filters.createdAfter) params.set("createdAfter", filters.createdAfter);
  if (filters.createdBefore) params.set("createdBefore", filters.createdBefore);
  if (filters.pushedAfter) params.set("pushedAfter", filters.pushedAfter);
  if (filters.pushedBefore) params.set("pushedBefore", filters.pushedBefore);
  if (filters.license) params.set("license", filters.license);
  if (filters.owner) params.set("owner", filters.owner);
  if (filters.archived !== "exclude") params.set("archived", filters.archived);
  return params.toString();
}

export function searchStateToQueryString(state: SearchRequestState): string {
  return toQueryString(state);
}

/**
 * Runs repository searches against /api/search/repositories.
 *
 * - aborts the previous request when parameters change
 * - ignores identical requests already in flight (no duplicate submissions)
 * - reports typed, human-readable errors from the API
 */
export function useRepositorySearch(options: {
  state: SearchRequestState;
  /** Skip the automatic fetch (e.g. when the user must submit first). */
  paused?: boolean;
  /** Bumped by explicit submits so the same query can be re-run. */
  nonce?: number;
  onResult?: (response: RepositorySearchResponse, state: SearchRequestState) => void;
}) {
  const { state, paused, nonce = 0, onResult } = options;
  const [data, setData] = React.useState<RepositorySearchResponse | null>(null);
  const [status, setStatus] = React.useState<SearchStatus>("idle");
  const [error, setError] = React.useState<SearchError | null>(null);
  const [lastRunAt, setLastRunAt] = React.useState<number>(0);

  const controllerRef = React.useRef<AbortController | null>(null);
  const inFlightKeyRef = React.useRef<string | null>(null);
  const completedKeyRef = React.useRef<string | null>(null);
  const onResultRef = React.useRef(onResult);
  onResultRef.current = onResult;

  const queryString = React.useMemo(() => toQueryString(state), [state]);
  const key = React.useMemo(() => `${queryString}#${nonce}`, [queryString, nonce]);

  const run = React.useCallback(
    async (force = false) => {
      if (paused) return;
      if (!force && (inFlightKeyRef.current === key || completedKeyRef.current === key)) return;

      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      inFlightKeyRef.current = key;
      setStatus("loading");
      setError(null);

      try {
        const response = await fetch(`/api/search/repositories?${queryString}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        const body = (await response.json().catch(() => null)) as
          | RepositorySearchResponse
          | ApiErrorShape
          | null;

        if (!response.ok) {
          const apiError = body && "error" in body ? body.error : null;
          throw {
            kind: apiError?.kind ?? "unknown",
            message: apiError?.message ?? `Search failed (${response.status}).`,
            hint: apiError?.hint ?? null,
            issues: apiError?.issues,
          } as SearchError;
        }

        const payload = body as RepositorySearchResponse | null;
        if (!payload) throw { kind: "unknown", message: "GitHub returned an empty response.", hint: null };

        setData(payload);
        setStatus("success");
        setLastRunAt(Date.now());
        completedKeyRef.current = key;
        onResultRef.current?.(payload, state);
      } catch (failure) {
        if (failure instanceof DOMException && failure.name === "AbortError") return;
        if ((failure as { name?: string })?.name === "AbortError") return;
        const typed = failure as SearchError;
        setError({
          kind: typed?.kind ?? "network",
          message: typed?.message ?? "Could not reach GitHub. Check your connection and try again.",
          hint: typed?.hint ?? null,
          issues: typed?.issues,
        });
        setStatus("error");
        completedKeyRef.current = null;
      } finally {
        if (inFlightKeyRef.current === key) inFlightKeyRef.current = null;
      }
    },
    [queryString, key, paused, state],
  );

  React.useEffect(() => {
    void run();
    return () => {
      // Cancel in-flight work when parameters change or the component unmounts.
      controllerRef.current?.abort();
      inFlightKeyRef.current = null;
    };
  }, [run]);

  const retry = React.useCallback(() => {
    completedKeyRef.current = null;
    void run(true);
  }, [run]);

  return { data, status, error, retry, lastRunAt, loading: status === "loading" };
}
