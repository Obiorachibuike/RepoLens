"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronDown, SearchX, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, Notice } from "@/components/ui/state";
import { ResultsSkeleton } from "@/components/ui/skeleton";
import { useHistory } from "@/components/history/history-provider";
import { useSaved } from "@/components/saved/saved-provider";
import type { RepositorySearchResponse, SearchRequestState } from "@/lib/api/shapes";
import { PER_PAGE_OPTIONS, SORT_OPTIONS, type SortOption } from "@/lib/validation/search";
import { cn, formatExact } from "@/lib/utils";
import { EMPTY_FILTERS, FilterPanel, countActiveFilters } from "./filter-panel";
import { InterpretationPanel } from "./interpretation-panel";
import { ModeTabs } from "./mode-tabs";
import { SEARCH_MODES_CONFIG } from "./modes";
import { Pagination } from "./pagination";
import { ResultsTable } from "./results-table";
import { SearchBar } from "./search-bar";
import { searchStateToQueryString, useRepositorySearch } from "./use-repository-search";
import { readPreferences } from "@/lib/storage/preferences";
import type { FollowUpSearch } from "@/lib/query/followups";

/** Shown before the user types anything: real data, clearly labelled. */
const DEFAULT_BROWSE_QUERY = "stars:>=1000";

const SORT_LABELS: Record<SortOption, string> = {
  "best-match": "Best match",
  stars: "Most stars",
  forks: "Most forks",
  updated: "Recently updated",
  "help-wanted-issues": "Most help-wanted issues",
};

const EXAMPLES: Array<{ label: string; mode: SearchRequestState["mode"]; q: string }> = [
  { label: "React component libraries", mode: "find-repo", q: "Find a React component library for building dashboards" },
  { label: "Python AI agents", mode: "find-repo", q: "Python framework for building autonomous AI agents" },
  { label: "Next.js SaaS template", mode: "find-repo", q: "Next.js SaaS starter template with authentication and billing" },
  { label: "Self-hosted analytics", mode: "project-idea", q: "I want a self-hosted, privacy-friendly web analytics tool" },
  { label: "FastAPI authentication", mode: "repository", q: "fastapi authentication language:Python stars:>200" },
];

export function SearchExperience({
  initialState,
  variant = "home",
  fromUrl = false,
}: {
  initialState: SearchRequestState;
  variant?: "home" | "results";
  /** True when the URL supplied search parameters — user prefs are then ignored. */
  fromUrl?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const history = useHistory();
  const saved = useSaved();

  const [state, setState] = React.useState<SearchRequestState>(initialState);
  const [draft, setDraft] = React.useState(initialState.q);
  const [nonce, setNonce] = React.useState(0);
  const [showFilters, setShowFilters] = React.useState(false);
  const [prefsApplied, setPrefsApplied] = React.useState(fromUrl);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  // Apply the visitor's saved defaults (mode/sort/per-page) before the first
  // search runs, but only when the URL did not already specify parameters.
  React.useEffect(() => {
    if (fromUrl) {
      setPrefsApplied(true);
      return;
    }
    const prefs = readPreferences();
    setState((current) => ({
      ...current,
      mode: prefs.defaultMode,
      sort: prefs.defaultSort,
      perPage: prefs.defaultPerPage,
    }));
    setPrefsApplied(true);
  }, [fromUrl]);

  // Keep the text box in sync when state.q changes from outside (history, follow-ups).
  React.useEffect(() => {
    setDraft(initialState.q);
    setState(initialState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchStateToQueryString(initialState)]);

  const mode = SEARCH_MODES_CONFIG[state.mode];
  const activeFilters = countActiveFilters(state.filters);

  /** Empty query → a labelled default browse so the page is never blank. */
  const isDefaultView = !state.q.trim();
  const effectiveState = React.useMemo<SearchRequestState>(
    () => (isDefaultView ? { ...state, q: DEFAULT_BROWSE_QUERY } : state),
    [isDefaultView, state],
  );

  const onResult = React.useCallback(
    (response: RepositorySearchResponse, runState: SearchRequestState) => {
      if (!runState.q.trim()) return; // default browse is not a user search
      history.record({
        query: runState.q,
        mode: runState.mode,
        sort: runState.sort,
        filters: runState.filters,
        resultCount: response.totalCount,
      });
    },
    [history],
  );

  const { data, status, error, retry, loading } = useRepositorySearch({
    state: effectiveState,
    nonce,
    paused: !prefsApplied,
    onResult,
  });

  // Reflect state in the URL so searches are shareable and back-button friendly.
  const lastUrlRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    const query = searchStateToQueryString(state);
    const url = query ? `${pathname}?${query}` : pathname ?? "/";
    if (lastUrlRef.current === url) return;
    lastUrlRef.current = url;
    router.replace(url, { scroll: false });
  }, [state, pathname, router]);

  const submit = React.useCallback(
    (overrides: Partial<SearchRequestState> = {}) => {
      setState((current) => ({ ...current, page: 1, ...overrides }));
      setNonce((value) => value + 1);
    },
    [],
  );

  const handleSubmit = React.useCallback(() => {
    if (!draft.trim()) return;
    submit({ q: draft.trim() });
  }, [draft, submit]);

  const applyFollowUp = React.useCallback(
    (followUp: FollowUpSearch) => {
      setDraft(followUp.q);
      setState((current) => ({
        ...current,
        q: followUp.q,
        mode: followUp.mode,
        page: 1,
        filters: { ...current.filters, ...(followUp.filters ?? {}) },
      }));
      setNonce((value) => value + 1);
    },
    [],
  );

  const changeMode = React.useCallback(
    (next: SearchRequestState["mode"]) => {
      setState((current) => ({ ...current, mode: next, page: 1 }));
      setNonce((value) => value + 1);
      inputRef.current?.focus();
    },
    [],
  );

  const resultsMeta = data
    ? `${formatExact(data.totalCount)} ${data.totalCount === 1 ? "repository" : "repositories"}`
    : null;

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pb-16 sm:px-6">
      {/* ------------------------------- Hero ------------------------------- */}
      <section
        className={cn(
          "flex flex-col items-center text-center",
          variant === "home" ? "pb-7 pt-12 sm:pt-16" : "pb-6 pt-7",
        )}
      >
        {variant === "home" ? (
          <>
            <h1 className="text-balance text-[34px] font-semibold leading-[1.08] tracking-[-0.02em] text-text-primary sm:text-[46px] lg:text-[52px]">
              Find Your Next Project
            </h1>
            <p className="mt-3.5 max-w-xl text-[15px] leading-relaxed text-text-secondary sm:text-[16px]">
              Enter a concept to discover and analyze relevant open-source projects.
            </p>
          </>
        ) : (
          <div className="flex w-full flex-wrap items-center justify-between gap-3">
            <h1 className="text-[20px] font-semibold tracking-tight text-text-primary">Repository search</h1>
            <p className="text-xs text-text-muted">Real-time results from the official GitHub API.</p>
          </div>
        )}

        <div className="mt-6">
          <ModeTabs value={state.mode} onChange={changeMode} disabled={loading} />
        </div>

        <div className="mt-4 w-full">
          <SearchBar
            inputRef={inputRef}
            value={draft}
            onChange={setDraft}
            onSubmit={handleSubmit}
            placeholder={mode.placeholder}
            loading={loading}
            ariaLabel={`${mode.label} search`}
          />
        </div>

        <p className="mt-2.5 max-w-xl text-center text-[12px] leading-relaxed text-text-muted">
          {mode.helper}
        </p>

        {variant === "home" ? (
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <span className="text-[11px] text-text-muted">Try:</span>
            {EXAMPLES.map((example) => (
              <button
                key={example.label}
                type="button"
                onClick={() => {
                  setDraft(example.q);
                  submit({ q: example.q, mode: example.mode });
                }}
                className="rounded-full border border-border bg-surface/60 px-2.5 py-1 text-[11px] text-text-secondary transition-colors hover:border-accent/40 hover:bg-surface-hover hover:text-text-primary"
              >
                {example.label}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {/* ----------------------------- Results ------------------------------ */}
      <section aria-label="Search results" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="text-[13px] font-semibold text-text-primary">
              {status === "loading" && !data ? "Searching GitHub…" : (resultsMeta ?? "Results")}
            </h2>
            <Badge tone="accent">{mode.label}</Badge>
            {isDefaultView ? (
              <Badge tone="neutral" title="Run a search to replace this default view">
                default view: <code className="font-mono">{DEFAULT_BROWSE_QUERY}</code>
              </Badge>
            ) : null}
            {data && data.incompleteResults ? (
              <Badge tone="warning" title="GitHub timed out part of the search; the count may be approximate">
                partial results
              </Badge>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              size="sm"
              variant={showFilters ? "subtle" : "secondary"}
              onClick={() => setShowFilters((value) => !value)}
              aria-expanded={showFilters}
              aria-controls="filter-panel"
            >
              <SlidersHorizontal className="size-3.5" />
              Filters
              {activeFilters > 0 ? (
                <span className="ml-0.5 rounded-full bg-accent px-1.5 text-[10px] font-semibold text-white">
                  {activeFilters}
                </span>
              ) : null}
              <ChevronDown className={cn("size-3.5 transition-transform", showFilters && "rotate-180")} />
            </Button>

            <Select
              ariaLabel="Sort results"
              size="sm"
              value={state.sort}
              onValueChange={(value) => submit({ sort: value as SortOption })}
              options={SORT_OPTIONS.map((option) => ({ value: option, label: SORT_LABELS[option] }))}
            />

            <Button
              size="icon-sm"
              variant="secondary"
              onClick={() => submit({ direction: state.direction === "desc" ? "asc" : "desc" })}
              aria-label={`Sort direction: ${state.direction === "desc" ? "descending" : "ascending"}`}
              title={`Sort direction: ${state.direction === "desc" ? "descending" : "ascending"}`}
              disabled={state.sort === "best-match"}
            >
              {state.direction === "desc" ? (
                <ArrowDownWideNarrow className="size-3.5" />
              ) : (
                <ArrowUpNarrowWide className="size-3.5" />
              )}
            </Button>

            <Select
              ariaLabel="Results per page"
              size="sm"
              value={String(state.perPage)}
              onValueChange={(value) => submit({ perPage: Number(value), page: 1 })}
              options={PER_PAGE_OPTIONS.map((option) => ({ value: String(option), label: `${option} / page` }))}
            />
          </div>
        </div>

        {showFilters ? (
          <div id="filter-panel">
            <FilterPanel
              filters={state.filters}
              onChange={(filters) => submit({ filters, page: 1 })}
              onClear={() => submit({ filters: EMPTY_FILTERS, page: 1 })}
            />
          </div>
        ) : null}

        {data?.relaxed ? (
          <Notice tone="warning">
            Nothing matched every inferred term, so these results come from a broader search without{" "}
            {data.relaxed.dropped.join(", ")}. Run the exact query{" "}
            <code className="font-mono">{data.query}</code> to see what changed.
          </Notice>
        ) : null}

        {data?.interpretation ? (
          <InterpretationPanel
            interpretation={data.interpretation}
            qualifiers={data.qualifiers}
            query={data.query}
            warnings={data.warnings}
            followUps={data.followUps}
            onFollowUp={applyFollowUp}
          />
        ) : null}

        {saved.mode === "local" && saved.ready ? (
          <Notice tone="info">
            Saves are stored in this browser only and are not synced across devices. Set{" "}
            <code className="font-mono">DATABASE_URL</code> to enable server-side saved repositories and
            collections.
          </Notice>
        ) : null}

        {saved.error ? (
          <Notice tone="warning">
            {saved.error}{" "}
            <button type="button" className="underline" onClick={saved.clearError}>
              dismiss
            </button>
          </Notice>
        ) : null}

        <div className="overflow-hidden rounded-lg border border-border bg-surface/70 shadow-[var(--shadow-card)] backdrop-blur-[1px]">
          {status === "loading" && !data ? (
            <ResultsSkeleton rows={6} />
          ) : status === "error" && error ? (
            <div className="p-4">
              <ErrorState
                title="GitHub search failed"
                message={error.message}
                hint={error.hint}
                onRetry={retry}
              />
              {error.issues?.length ? (
                <ul className="mt-3 list-inside list-disc space-y-1 text-[11px] text-danger">
                  {error.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : data && data.items.length === 0 ? (
            <EmptyState
              title="No repositories found. Try a different keyword or adjust your filters."
              description={
                isDefaultView
                  ? "The default view returned nothing — check the GitHub connection status in Settings."
                  : `GitHub query: ${data.query}`
              }
              action={
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setState((current) => ({ ...current, filters: EMPTY_FILTERS, page: 1 }));
                      setNonce((value) => value + 1);
                    }}
                  >
                    Clear filters
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => inputRef.current?.focus()}>
                    <SearchX className="size-3.5" />
                    Edit search
                  </Button>
                </div>
              }
            />
          ) : data ? (
            <>
              {status === "loading" ? (
                <div className="flex items-center gap-2 border-b border-border-subtle bg-background-secondary/60 px-4 py-1.5 text-[11px] text-text-muted">
                  <span className="size-1.5 animate-pulse rounded-full bg-accent" />
                  Updating results…
                </div>
              ) : null}
              <ResultsTable items={data.items} />
              <Pagination
                page={data.page}
                perPage={data.perPage}
                totalCount={data.totalCount}
                disabled={loading}
                onPageChange={(page) => submit({ page })}
              />
            </>
          ) : null}
        </div>

        {data && data.items.length > 0 ? (
          <p className="px-1 text-[11px] leading-relaxed text-text-muted">
            Relevance is a RepoLens score computed from name, description, topic and language overlap with your
            search terms plus a small popularity signal — it is not a value returned by GitHub. Actions open the
            repository detail, visualization and analysis pages, or GitHub itself.
            {data.rateLimit ? (
              <>
                {" "}
                GitHub search quota: {data.rateLimit.remaining}/{data.rateLimit.limit} requests left this window.
              </>
            ) : null}
          </p>
        ) : null}
      </section>
    </div>
  );
}
