import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Flame, Sparkles, Telescope } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/state";
import { searchRepositories } from "@/lib/github/search";
import { GithubApiError } from "@/lib/github/errors";
import { formatCompact, timeAgo } from "@/lib/utils";
import { languageColor } from "@/lib/github/language-colors";
import type { RepositorySummary } from "@/lib/github/types";
import { isoDateDaysAgo } from "@/lib/query/build";

export const metadata: Metadata = {
  title: "Discover",
  description: "Curated, live GitHub discovery lists and one-click research searches.",
};

export const dynamic = "force-dynamic";

interface Category {
  title: string;
  description: string;
  href: string;
  mode: string;
}

const CATEGORIES: Category[] = [
  {
    title: "React component libraries",
    description: "UI primitives, design systems and component kits for React apps.",
    href: "/search/repositories?mode=find-repo&q=Find%20a%20React%20component%20library%20for%20building%20user%20interfaces&sort=stars",
    mode: "find-repo",
  },
  {
    title: "Python AI agents",
    description: "Frameworks for building autonomous LLM agents and tool-using assistants.",
    href: "/search/repositories?mode=find-repo&q=Python%20framework%20for%20building%20autonomous%20AI%20agents&sort=stars",
    mode: "find-repo",
  },
  {
    title: "Next.js SaaS templates",
    description: "Starters with auth, billing and multi-tenancy already wired up.",
    href: "/search/repositories?mode=find-repo&q=Next.js%20SaaS%20starter%20with%20authentication%20and%20billing&sort=stars",
    mode: "find-repo",
  },
  {
    title: "FastAPI authentication",
    description: "Reference implementations of JWT, OAuth2 and session auth in FastAPI.",
    href: "/search/repositories?mode=repository&q=fastapi%20authentication%20language%3APython%20stars%3A%3E200&sort=stars",
    mode: "repository",
  },
  {
    title: "Self-hosted alternatives",
    description: "Open-source replacements for commercial SaaS products.",
    href: "/search/repositories?mode=repository&q=topic%3Aself-hosted%20stars%3A%3E%3D500&sort=stars",
    mode: "repository",
  },
  {
    title: "Blockchain tooling",
    description: "Smart contract frameworks, wallets, indexers and dev tools.",
    href: "/search/repositories?mode=find-repo&q=Blockchain%20developer%20tools%20and%20smart%20contract%20frameworks&sort=stars",
    mode: "find-repo",
  },
  {
    title: "Machine learning",
    description: "Training frameworks, model hubs and MLOps tooling.",
    href: "/search/repositories?mode=repository&q=topic%3Amachine-learning%20stars%3A%3E%3D2000&sort=stars",
    mode: "repository",
  },
  {
    title: "Beginner-friendly projects",
    description: "Repositories that welcome first-time contributors.",
    href: "/search/repositories?mode=repository&q=topic%3Agood-first-issue%20archived%3Afalse&sort=updated",
    mode: "repository",
  },
];

interface LiveList {
  id: string;
  title: string;
  description: string;
  query: string;
  sort: "stars" | "updated";
  badge: string;
}

const LIVE_LISTS: LiveList[] = [
  {
    id: "rising",
    title: "Rising this fortnight",
    description: "Repositories created in the last 14 days that already passed 50 stars.",
    query: `created:>=${isoDateDaysAgo(14)} stars:>=50`,
    sort: "stars",
    badge: "new",
  },
  {
    id: "active",
    title: "Popular and actively pushed",
    description: "Established projects (5k+ stars) with commits in the last week.",
    query: `stars:>=5000 pushed:>=${isoDateDaysAgo(7)}`,
    sort: "updated",
    badge: "active",
  },
  {
    id: "alternatives",
    title: "Open-source alternatives",
    description: "Projects tagged as alternatives, pushed in the last 90 days.",
    query: `topic:open-source-alternative pushed:>=${isoDateDaysAgo(90)} stars:>=200`,
    sort: "stars",
    badge: "alternatives",
  },
];

interface ListResult {
  list: LiveList;
  items: RepositorySummary[];
  totalCount: number;
  error: string | null;
}

async function fetchList(list: LiveList): Promise<ListResult> {
  try {
    const result = await searchRepositories({
      query: list.query,
      sort: list.sort,
      perPage: 5,
      cacheSeconds: 300,
    });
    return { list, items: result.items, totalCount: result.totalCount, error: null };
  } catch (error) {
    const message =
      error instanceof GithubApiError
        ? error.message
        : "GitHub did not respond. Try again in a moment.";
    return { list, items: [], totalCount: 0, error: message };
  }
}

export default async function DiscoverPage() {
  const results = await Promise.all(LIVE_LISTS.map(fetchList));

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pb-16 sm:px-6">
      <header className="py-10 text-center sm:py-14">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/70 px-3 py-1 text-[11px] text-text-muted">
          <Telescope className="size-3" />
          Live from the GitHub API
        </span>
        <h1 className="mt-3.5 text-balance text-[30px] font-semibold tracking-[-0.02em] text-text-primary sm:text-[40px]">
          Discover what is worth building on
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-text-secondary">
          Curated research starting points plus live lists of what the open-source ecosystem is shipping right
          now. Every card runs a real search — nothing here is a mock list.
        </p>
      </header>

      <section aria-labelledby="categories-heading" className="space-y-3">
        <h2 id="categories-heading" className="text-[13px] font-semibold uppercase tracking-[0.08em] text-text-muted">
          Research starting points
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((category) => (
            <Link
              key={category.title}
              href={category.href}
              className="group rounded-lg border border-border bg-surface/70 p-4 transition-colors hover:border-accent/40 hover:bg-surface-hover/60"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[13px] font-medium text-text-primary">{category.title}</h3>
                <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent-hover" />
              </div>
              <p className="mt-1.5 text-[12px] leading-relaxed text-text-muted">{category.description}</p>
              <Badge tone="accent" className="mt-2.5">
                {category.mode}
              </Badge>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="live-heading" className="mt-10 space-y-3">
        <div className="flex items-center gap-2">
          <Flame className="size-3.5 text-text-muted" />
          <h2 id="live-heading" className="text-[13px] font-semibold uppercase tracking-[0.08em] text-text-muted">
            Live lists
          </h2>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          {results.map((result) => (
            <Card key={result.list.id} className="overflow-hidden">
              <CardHeader
                icon={<Sparkles className="size-3.5" />}
                title={result.list.title}
                description={result.list.description}
                actions={<Badge tone="accent">{result.list.badge}</Badge>}
              />
              {result.error ? (
                <div className="p-4">
                  <Notice tone="warning">{result.error}</Notice>
                </div>
              ) : result.items.length === 0 ? (
                <p className="p-4 text-xs text-text-muted">No repositories matched this query right now.</p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {result.items.map((repository) => (
                    <li key={repository.id} className="px-4 py-2.5 transition-colors hover:bg-surface-hover/50">
                      <div className="flex items-baseline justify-between gap-3">
                        <Link
                          href={`/repository/${encodeURIComponent(repository.owner.login)}/${encodeURIComponent(repository.name)}`}
                          className="min-w-0 truncate text-[13px] font-medium text-text-primary hover:underline"
                        >
                          {repository.fullName}
                        </Link>
                        <span className="shrink-0 text-[11px] tabular-nums text-text-muted">
                          ★ {formatCompact(repository.stargazersCount)}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-text-muted">
                        {repository.language ? (
                          <span className="inline-flex items-center gap-1">
                            <span
                              className="size-2 rounded-full"
                              style={{ backgroundColor: languageColor(repository.language) }}
                              aria-hidden="true"
                            />
                            {repository.language}
                          </span>
                        ) : (
                          <span>Language not reported</span>
                        )}
                        {repository.pushedAt ? <span>· pushed {timeAgo(repository.pushedAt)}</span> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="border-t border-border-subtle px-4 py-2.5">
                <Link
                  href={`/search/repositories?mode=repository&q=${encodeURIComponent(result.list.query)}&sort=${result.list.sort}`}
                  className="inline-flex items-center gap-1 text-[11px] text-text-secondary hover:text-text-primary"
                >
                  Open full results ({result.totalCount.toLocaleString("en-US")})
                  <ArrowRight className="size-3" />
                </Link>
              </div>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
