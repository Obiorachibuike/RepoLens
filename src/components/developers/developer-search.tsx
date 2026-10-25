"use client";

import * as React from "react";
import { Building2, Loader2, MapPin, Search, Users } from "lucide-react";
import { GithubMark } from "@/components/icons/github-mark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Notice } from "@/components/ui/state";
import type { ApiErrorShape, DeveloperSearchResponse } from "@/lib/api/shapes";
import type { DeveloperSummary } from "@/lib/github/types";
import { formatCompact, formatExact } from "@/lib/utils";

interface DeveloperState {
  q: string;
  language: string;
  location: string;
  minFollowers: string;
  minRepos: string;
  type: "any" | "user" | "org";
  sort: "best-match" | "followers" | "repositories" | "recently-joined";
  page: number;
}

const INITIAL: DeveloperState = {
  q: "",
  language: "",
  location: "",
  minFollowers: "",
  minRepos: "",
  type: "any",
  sort: "best-match",
  page: 1,
};

export function DeveloperSearch({ initialQuery = "" }: { initialQuery?: string }) {
  const [state, setState] = React.useState<DeveloperState>({ ...INITIAL, q: initialQuery });
  const [data, setData] = React.useState<DeveloperSearchResponse | null>(null);
  const [status, setStatus] = React.useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = React.useState<{ message: string; hint: string | null } | null>(null);
  const controllerRef = React.useRef<AbortController | null>(null);

  const run = React.useCallback(async (target: DeveloperState) => {
    if (!target.q.trim()) {
      setError({ message: "Enter a name, username, company or location to search for developers.", hint: null });
      setStatus("error");
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus("loading");
    setError(null);

    const params = new URLSearchParams({ q: target.q.trim(), page: String(target.page) });
    if (target.language) params.set("language", target.language);
    if (target.location) params.set("location", target.location);
    if (target.minFollowers) params.set("minFollowers", target.minFollowers);
    if (target.minRepos) params.set("minRepos", target.minRepos);
    if (target.type !== "any") params.set("type", target.type);
    params.set("sort", target.sort);

    try {
      const response = await fetch(`/api/search/developers?${params.toString()}`, { signal: controller.signal });
      const body = (await response.json().catch(() => null)) as DeveloperSearchResponse | ApiErrorShape | null;
      if (!response.ok) {
        const apiError = body && "error" in body ? body.error : null;
        throw {
          message: apiError?.message ?? `Developer search failed (${response.status}).`,
          hint: apiError?.hint ?? null,
        };
      }
      setData(body as DeveloperSearchResponse);
      setStatus("success");
    } catch (failure) {
      if ((failure as { name?: string })?.name === "AbortError") return;
      const typed = failure as { message?: string; hint?: string | null };
      setError({
        message: typed?.message ?? "Could not reach GitHub.",
        hint: typed?.hint ?? null,
      });
      setStatus("error");
    }
  }, []);

  React.useEffect(() => () => controllerRef.current?.abort(), []);

  const patch = (partial: Partial<DeveloperState>) => setState((current) => ({ ...current, page: 1, ...partial }));

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-16 sm:px-6">
      <header className="py-10 text-center sm:py-12">
        <h1 className="text-balance text-[28px] font-semibold tracking-tight text-text-primary sm:text-[34px]">
          Developer search
        </h1>
        <p className="mx-auto mt-2.5 max-w-xl text-sm leading-relaxed text-text-secondary">
          Find public GitHub profiles by name, username, company, location or the language they publish in.
          Only publicly visible profile data is shown — RepoLens never infers expertise.
        </p>
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run(state);
        }}
        className="space-y-4"
      >
        <div className="relative mx-auto flex w-full max-w-[720px] items-center rounded-lg border border-border bg-background-secondary/80 focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/20">
          <Search className="pointer-events-none absolute left-3.5 size-4 text-text-muted" />
          <label htmlFor="developer-q" className="sr-only">
            Search developers
          </label>
          <input
            id="developer-q"
            type="search"
            value={state.q}
            onChange={(event) => setState((current) => ({ ...current, q: event.target.value }))}
            placeholder="e.g. torvalds, google, location:Berlin, language:Rust"
            className="h-[50px] w-full rounded-lg bg-transparent pl-10 pr-28 text-[15px] text-text-primary placeholder:text-text-muted focus:outline-none"
          />
          <Button type="submit" variant="primary" disabled={status === "loading"} className="absolute right-1.5 h-10">
            {status === "loading" ? <Loader2 className="size-4 animate-spin-slow" /> : null}
            Search
          </Button>
        </div>

        <div className="mx-auto grid w-full max-w-[720px] gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Language" htmlFor="dev-language">
            <Input
              id="dev-language"
              value={state.language}
              onChange={(event) => patch({ language: event.target.value })}
              placeholder="Rust"
            />
          </Field>
          <Field label="Location" htmlFor="dev-location">
            <Input
              id="dev-location"
              value={state.location}
              onChange={(event) => patch({ location: event.target.value })}
              placeholder="Lagos"
            />
          </Field>
          <Field label="Min followers" htmlFor="dev-followers">
            <Input
              id="dev-followers"
              type="number"
              min={0}
              value={state.minFollowers}
              onChange={(event) => patch({ minFollowers: event.target.value })}
              placeholder="100"
            />
          </Field>
          <Field label="Sort" htmlFor="dev-sort">
            <Select
              ariaLabel="Sort developers"
              value={state.sort}
              onValueChange={(value) => patch({ sort: value as DeveloperState["sort"] })}
              options={[
                { value: "best-match", label: "Best match" },
                { value: "followers", label: "Most followers" },
                { value: "repositories", label: "Most repositories" },
                { value: "recently-joined", label: "Recently joined" },
              ]}
            />
          </Field>
        </div>

        <div className="mx-auto flex w-full max-w-[720px] items-center gap-4">
          <span className="text-[11px] uppercase tracking-[0.06em] text-text-muted">Account type</span>
          {(["any", "user", "org"] as const).map((type) => (
            <label key={type} className="flex cursor-pointer items-center gap-1.5 text-xs text-text-secondary">
              <input
                type="radio"
                name="dev-type"
                className="accent-[var(--accent)]"
                checked={state.type === type}
                onChange={() => patch({ type })}
              />
              {type === "any" ? "Any" : type === "user" ? "Users" : "Organizations"}
            </label>
          ))}
        </div>
      </form>

      <section aria-label="Developer results" className="mt-8 space-y-3">
        {status === "loading" ? <CardsSkeleton cards={6} /> : null}

        {status === "error" && error ? (
          <ErrorState title="Developer search failed" message={error.message} hint={error.hint} onRetry={() => void run(state)} />
        ) : null}

        {status === "success" && data ? (
          data.items.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface/70">
              <EmptyState
                title="No developers found"
                description="Try a different name or remove the location and follower filters."
              />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-text-muted">
                <span>
                  <span className="text-text-secondary">{formatExact(data.totalCount)}</span> developers matched
                  {data.incompleteResults ? " (GitHub returned a partial result set)" : ""}
                </span>
                <span>
                  Profile details enriched for {data.enriched} of {data.items.length} results
                </span>
              </div>
              {data.items.some((item) => item.partial) ? (
                <Notice tone="info">
                  Some profiles could not be enriched (GitHub rate limit), so their bio and follower counts are
                  missing rather than guessed.
                </Notice>
              ) : null}
              <ul className="grid gap-3 sm:grid-cols-2">
                {data.items.map((developer) => (
                  <DeveloperCard key={developer.id || developer.login} developer={developer} />
                ))}
              </ul>
              {data.totalCount > data.items.length ? (
                <div className="flex justify-center gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={state.page <= 1}
                    onClick={() => {
                      const next = { ...state, page: state.page - 1 };
                      setState(next);
                      void run(next);
                    }}
                  >
                    Previous page
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={state.page * 10 >= Math.min(data.totalCount, 1000)}
                    onClick={() => {
                      const next = { ...state, page: state.page + 1 };
                      setState(next);
                      void run(next);
                    }}
                  >
                    Next page
                  </Button>
                </div>
              ) : null}
            </>
          )
        ) : null}

        {status === "idle" ? (
          <div className="rounded-lg border border-border bg-surface/60 p-6 text-center">
            <Users className="mx-auto size-5 text-text-muted" />
            <p className="mt-2 text-sm text-text-secondary">Search GitHub&apos;s public developer directory.</p>
            <p className="mt-1 text-xs text-text-muted">
              Developer search uses the same 10 requests/minute search budget as repository search.
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function DeveloperCard({ developer }: { developer: DeveloperSummary }) {
  return (
    <li className="rounded-lg border border-border bg-surface/70 p-4 transition-colors hover:border-accent/30">
      <div className="flex items-start gap-3">
        {developer.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={developer.avatarUrl}
            alt=""
            width={44}
            height={44}
            className="size-11 shrink-0 rounded-full border border-border"
            loading="lazy"
          />
        ) : (
          <div className="flex size-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface-elevated text-text-muted">
            <Users className="size-4" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <a
              href={developer.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-sm font-medium text-text-primary hover:underline"
            >
              {developer.login}
            </a>
            {developer.type === "Organization" ? (
              <Badge tone="neutral" title="Organization account">
                <Building2 className="size-3" />
                org
              </Badge>
            ) : null}
            {developer.partial ? (
              <Badge tone="warning" title="Profile details could not be loaded">
                partial
              </Badge>
            ) : null}
          </div>
          {developer.name ? <p className="truncate text-xs text-text-secondary">{developer.name}</p> : null}
          {developer.bio ? (
            <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-text-muted">{developer.bio}</p>
          ) : null}

          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-text-muted">
            {developer.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3" />
                {developer.location}
              </span>
            ) : null}
            {developer.company ? (
              <span className="inline-flex items-center gap-1">
                <Building2 className="size-3" />
                {developer.company}
              </span>
            ) : null}
            {developer.publicRepos !== null ? (
              <span>{formatCompact(developer.publicRepos)} public repos</span>
            ) : null}
            {developer.followers !== null ? <span>{formatCompact(developer.followers)} followers</span> : null}
            {developer.following !== null ? <span>following {formatCompact(developer.following)}</span> : null}
          </div>
        </div>
        <a
          href={developer.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${developer.login} on GitHub`}
          className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          <GithubMark className="size-4" />
        </a>
      </div>
    </li>
  );
}
