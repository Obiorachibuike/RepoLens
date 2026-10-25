"use client";

import * as React from "react";
import Link from "next/link";
import { FileCode2, KeyRound, Loader2, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState, Notice } from "@/components/ui/state";
import { Tooltip } from "@/components/ui/tooltip";
import type { ApiErrorShape, CodeSearchResponse } from "@/lib/api/shapes";
import type { CodeSearchItem } from "@/lib/github/types";
import { formatExact } from "@/lib/utils";

export function CodeSearch({
  authenticated,
  initialQuery = "",
}: {
  authenticated: boolean;
  initialQuery?: string;
}) {
  const [q, setQ] = React.useState(initialQuery);
  const [language, setLanguage] = React.useState("");
  const [repository, setRepository] = React.useState("");
  const [extension, setExtension] = React.useState("");
  const [data, setData] = React.useState<CodeSearchResponse | null>(null);
  const [status, setStatus] = React.useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = React.useState<{ message: string; hint: string | null; kind?: string } | null>(null);
  const controllerRef = React.useRef<AbortController | null>(null);

  const run = React.useCallback(async (page = 1) => {
    if (!q.trim()) {
      setError({ message: "Enter code to search for, such as a function name or string.", hint: null });
      setStatus("error");
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus("loading");
    setError(null);

    const params = new URLSearchParams({ q: q.trim(), page: String(page) });
    if (language) params.set("language", language);
    if (repository) params.set("repository", repository);
    if (extension) params.set("extension", extension);

    try {
      const response = await fetch(`/api/search/code?${params.toString()}`, { signal: controller.signal });
      const body = (await response.json().catch(() => null)) as CodeSearchResponse | ApiErrorShape | null;
      if (!response.ok) {
        const apiError = body && "error" in body ? body.error : null;
        throw {
          kind: apiError?.kind ?? "unknown",
          message: apiError?.message ?? `Code search failed (${response.status}).`,
          hint: apiError?.hint ?? null,
        };
      }
      setData(body as CodeSearchResponse);
      setStatus("success");
    } catch (failure) {
      if ((failure as { name?: string })?.name === "AbortError") return;
      const typed = failure as { kind?: string; message?: string; hint?: string | null };
      setError({ kind: typed?.kind, message: typed?.message ?? "Could not reach GitHub.", hint: typed?.hint ?? null });
      setStatus("error");
    }
  }, [q, language, repository, extension]);

  React.useEffect(() => () => controllerRef.current?.abort(), []);

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-16 sm:px-6">
      <header className="py-10 text-center sm:py-12">
        <h1 className="text-balance text-[28px] font-semibold tracking-tight text-text-primary sm:text-[34px]">
          Code search
        </h1>
        <p className="mx-auto mt-2.5 max-w-xl text-sm leading-relaxed text-text-secondary">
          Search file contents across public GitHub repositories using GitHub&apos;s official code search API, with
          matching fragments highlighted.
        </p>
        <div className="mt-3 flex justify-center">
          {authenticated ? (
            <Badge tone="success">
              <KeyRound className="size-3" />
              GitHub token configured — code search enabled
            </Badge>
          ) : (
            <Badge tone="warning">
              <KeyRound className="size-3" />
              GITHUB_TOKEN not set — code search unavailable
            </Badge>
          )}
        </div>
      </header>

      {!authenticated ? (
        <div className="mx-auto max-w-2xl space-y-3">
          <Notice tone="warning">
            GitHub requires authentication for <code className="font-mono">GET /search/code</code>. RepoLens will not
            pretend repository results are code results, so this feature stays disabled until a token is provided.
          </Notice>
          <div className="rounded-lg border border-border bg-surface/70 p-5">
            <h2 className="text-sm font-semibold text-text-primary">How to enable it</h2>
            <ol className="mt-2 space-y-1.5 text-xs leading-relaxed text-text-secondary">
              <li>
                1. Create a classic personal access token on GitHub with <strong>no scopes</strong> (public data
                only — no repository permissions needed).
              </li>
              <li>
                2. Set it as a <strong>server-side</strong> environment variable:{" "}
                <code className="font-mono text-text-primary">GITHUB_TOKEN=ghp_…</code>
              </li>
              <li>3. Restart RepoLens. It is never sent to the browser.</li>
            </ol>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/settings">
                <Button size="sm" variant="secondary">
                  Open settings
                </Button>
              </Link>
              <Link href={`/search/repositories?q=${encodeURIComponent(q || "")}`}>
                <Button size="sm" variant="ghost">
                  Search repositories instead
                </Button>
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(1);
            }}
            className="space-y-4"
          >
            <div className="relative mx-auto flex w-full max-w-[720px] items-center rounded-lg border border-border bg-background-secondary/80 focus-within:border-accent/60 focus-within:ring-2 focus-within:ring-accent/20">
              <Search className="pointer-events-none absolute left-3.5 size-4 text-text-muted" />
              <label htmlFor="code-q" className="sr-only">
                Search code
              </label>
              <input
                id="code-q"
                type="search"
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder='e.g. "createServer" useRepositorySearch'
                className="h-[50px] w-full rounded-lg bg-transparent pl-10 pr-28 text-[15px] text-text-primary placeholder:text-text-muted focus:outline-none"
              />
              <Button type="submit" variant="primary" disabled={status === "loading"} className="absolute right-1.5 h-10">
                {status === "loading" ? <Loader2 className="size-4 animate-spin-slow" /> : null}
                Search
              </Button>
            </div>

            <div className="mx-auto grid w-full max-w-[720px] gap-3 sm:grid-cols-3">
              <Field label="Language" htmlFor="code-language">
                <Input id="code-language" value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="TypeScript" />
              </Field>
              <Field label="Repository" htmlFor="code-repo" hint="owner/repo">
                <Input id="code-repo" value={repository} onChange={(e) => setRepository(e.target.value)} placeholder="vercel/next.js" />
              </Field>
              <Field label="Extension" htmlFor="code-ext">
                <Input id="code-ext" value={extension} onChange={(e) => setExtension(e.target.value)} placeholder="tsx" />
              </Field>
            </div>
          </form>

          <section aria-label="Code results" className="mt-8 space-y-3">
            {status === "loading" ? <CardsSkeleton cards={5} /> : null}

            {status === "error" && error ? (
              <ErrorState title="Code search failed" message={error.message} hint={error.hint} onRetry={() => void run(1)} />
            ) : null}

            {status === "success" && data ? (
              data.items.length === 0 ? (
                <div className="rounded-lg border border-border bg-surface/70">
                  <EmptyState
                    title="No code matches"
                    description="GitHub code search needs fairly specific terms. Try a distinctive identifier or narrow it to one repository."
                  />
                </div>
              ) : (
                <>
                  <p className="text-xs text-text-muted">
                    <span className="text-text-secondary">{formatExact(data.totalCount)}</span> files matched
                    {data.incompleteResults ? " (partial result set from GitHub)" : ""}
                  </p>
                  <ul className="space-y-2">
                    {data.items.map((item) => (
                      <CodeResult key={`${item.repository?.fullName ?? ""}:${item.path}:${item.id}`} item={item} />
                    ))}
                  </ul>
                </>
              )
            ) : null}

            {status === "idle" ? (
              <div className="rounded-lg border border-border bg-surface/60 p-6 text-center">
                <FileCode2 className="mx-auto size-5 text-text-muted" />
                <p className="mt-2 text-sm text-text-secondary">Search inside public repository files.</p>
                <p className="mt-1 text-xs text-text-muted">
                  Code search shares GitHub&apos;s 10 requests/minute search budget with repository search.
                </p>
              </div>
            ) : null}
          </section>
        </>
      )}
    </div>
  );
}

function CodeResult({ item }: { item: CodeSearchItem }) {
  const match = item.textMatches[0];
  return (
    <li className="rounded-lg border border-border bg-surface/70 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <FileCode2 className="size-3.5 text-text-muted" />
        <a
          href={item.htmlUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate font-mono text-[13px] text-text-primary hover:underline"
        >
          {item.repository?.fullName ?? "unknown repository"}/{item.path}
        </a>
        {item.repository ? (
          <Tooltip content={`${item.repository.stargazersCount.toLocaleString("en-US")} stars`}>
            <Badge tone="star">{item.repository.stargazersCount.toLocaleString("en-US")} ★</Badge>
          </Tooltip>
        ) : null}
      </div>
      {match?.fragment ? (
        <pre className="mt-2.5 overflow-x-auto rounded-md border border-border-subtle bg-background-secondary/80 p-3 font-mono text-[11px] leading-relaxed text-text-secondary">
          {match.fragment}
        </pre>
      ) : (
        <p className="mt-2 text-[11px] text-text-muted">GitHub did not return a preview fragment for this file.</p>
      )}
      {item.repository ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[11px] text-text-muted">
          <span>Language: {item.repository.language ?? "not reported"}</span>
          <Link className="hover:text-text-secondary hover:underline" href={`/repository/${item.repository.owner.login}/${item.repository.name}`}>
            View repository
          </Link>
        </div>
      ) : null}
    </li>
  );
}
