"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Bookmark, CalendarDays, ChevronLeft, ChevronRight, Clock3, ExternalLink, GitFork, GitPullRequest, Radio, ScanSearch, Star, TrendingUp } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState, ErrorState, Notice } from "@/components/ui/state";
import { Skeleton } from "@/components/ui/skeleton";
import { Metric, PageHeading, field, panel, workspace } from "@/components/ui/workspace";
import { useSaved } from "@/components/saved/saved-provider";
import { cn, formatExact } from "@/lib/utils";
import { languageColor } from "@/lib/github/language-colors";
import { repoLensUrl } from "@/lib/validation/repository";
import { defaultDates, parseTrending, periods, periodLabels, rankingLabels, trendingDefaults, type TrendingData, type TrendingFilters, type TrendingRepository } from "@/lib/trending/model";

type Controls = Pick<TrendingFilters, "period" | "ranking" | "language" | "page" | "limit"> & { startDate: string; endDate: string };
type Failure = { kind?: string; message: string; issues?: string[]; hint?: string };
const stamp = (value: string | null) => value ? `${new Date(value).toISOString().slice(0, 16).replace("T", " ")} UTC` : "Not observed";
const date = (value: string | null) => value ? value.slice(0, 10) : "Unknown";
const signed = (value: number) => `${value > 0 ? "+" : ""}${formatExact(value)}`;
const number = (value: number | null) => value === null ? "—" : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
const shortPeriod = { today: "Today", "3d": "3 days", "7d": "7 days", "14d": "14 days", "30d": "30 days", "1y": "1 year", custom: "Custom range" } as const;

function initialControls(initial: Record<string, string | undefined>): Controls {
  const parsed = parseTrending(initial);
  if (!parsed.success) return { ...trendingDefaults, ...defaultDates };
  const { period, ranking, language, page, limit, startDate, endDate } = parsed.data;
  return { period, ranking, language, page, limit, startDate: startDate ?? defaultDates.startDate, endDate: endDate ?? defaultDates.endDate };
}

export function TrendingView({ initial }: { initial: Record<string, string | undefined> }) {
  const [filters, setFilters] = useState<Controls>(() => initialControls(initial));
  const [dates, setDates] = useState(() => ({ startDate: filters.startDate, endDate: filters.endDate }));
  const [dateError, setDateError] = useState("");
  const [result, setResult] = useState<TrendingData | null>(null);
  const [availableLanguages, setAvailableLanguages] = useState<string[]>([]);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [loading, setLoading] = useState(true);
  const [requestId, setRequestId] = useState(0);
  const [announcement, announce] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({ period: filters.period, ranking: filters.ranking, language: filters.language, page: String(filters.page), limit: String(filters.limit) });
    if (filters.period === "custom") { query.set("startDate", filters.startDate); query.set("endDate", filters.endDate); }
    setLoading(true); setFailure(null);
    // History state is preserved by Next's integration; changing filters doesn't fetch another RSC render.
    const href = `/trending?${query}`;
    if (window.location.pathname + window.location.search !== href) window.history.replaceState(null, "", href);
    fetch(`/api/trending?${query}`, { signal: controller.signal }).then(async (response) => {
      const body = await response.json() as TrendingData | { error: Failure };
      if (controller.signal.aborted) return;
      if (!response.ok || "error" in body) {
        setResult(null);
        setFailure("error" in body ? body.error : { message: "The historical results could not be loaded." });
        return;
      }
      setResult(body);
      setAvailableLanguages(body.languages);
    }).catch(() => {
      if (!controller.signal.aborted) { setResult(null); setFailure({ message: "Could not load trending results. Check your connection and try again." }); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, requestId]);

  function change(patch: Partial<Controls>) {
    setLoading(true); setFilters((old) => ({ ...old, page: 1, ...patch }));
  }
  function applyDates(event: React.FormEvent) {
    event.preventDefault();
    const parsed = parseTrending({ ...filters, ...dates, period: "custom" });
    if (!parsed.success) { setDateError(parsed.error.issues[0]?.message ?? "Enter a valid date range."); return; }
    setDateError(""); change({ ...dates, period: "custom" });
  }
  const stats = loading ? null : result?.summary;
  const chosenLanguage = availableLanguages.some((lang) => lang.toLowerCase() === filters.language.toLowerCase());
  const label = filters.ranking === "stars" ? "Top tracked by stars" : "Repository leaderboard";
  return <div className={workspace}>
    <PageHeading eyebrow="Discover / Trending" title="Trending repositories" description="See which open-source projects are gaining stars. Growth is measured between observations stored by RepoLens, not estimated from today’s search results." icon={<TrendingUp className="size-4" />} actions={<Link href="/discover" className={buttonVariants({ variant: "secondary" })}>Explore live lists <ArrowRight /></Link>} />
    <section aria-label="Trending filters" className={cn(panel, "mb-5 p-4 sm:p-5")}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="mb-2 block text-xs font-medium text-text-secondary">Tracking period</span>
          <div role="group" aria-label="Tracking period" className="flex flex-wrap gap-1 rounded-lg border border-border-subtle bg-background/70 p-1">
            {periods.map((period) => <button type="button" key={period} aria-pressed={period === filters.period} onClick={() => {
              if (period !== filters.period) { setDateError(""); change({ period }); }
            }} className={cn("inline-flex min-h-9 items-center gap-1 rounded-md px-2.5 text-xs font-medium transition-colors sm:px-3", period === filters.period ? "bg-accent-soft text-accent-hover" : "text-text-secondary hover:bg-surface-hover hover:text-text-primary")}>{period === "custom" && <CalendarDays className="size-3.5" />}{shortPeriod[period]}</button>)}
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-3 sm:w-auto">
          <label className="space-y-2 text-xs font-medium text-text-secondary">Ranking<select className={field} value={filters.ranking} onChange={(e) => change({ ranking: e.target.value as Controls["ranking"] })}>{Object.entries(rankingLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
          <label className="space-y-2 text-xs font-medium text-text-secondary">Language<select className={field} value={chosenLanguage ? availableLanguages.find((lang) => lang.toLowerCase() === filters.language.toLowerCase()) : filters.language} onChange={(e) => change({ language: e.target.value })}><option value="all">All languages</option>{!chosenLanguage && filters.language !== "all" && <option value={filters.language}>{filters.language}</option>}{availableLanguages.map((language) => <option key={language}>{language}</option>)}</select></label>
        </div>
      </div>
      {filters.period === "custom" && <form onSubmit={applyDates} className="mt-4 border-t border-border-subtle pt-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-2 text-xs text-text-secondary">Start date (UTC)<input type="date" required className={field} value={dates.startDate} max={today} onChange={(e) => setDates({ ...dates, startDate: e.target.value })} /></label>
          <label className="space-y-2 text-xs text-text-secondary">End date (UTC)<input type="date" required className={field} value={dates.endDate} max={today} onChange={(e) => setDates({ ...dates, endDate: e.target.value })} /></label>
          <Button type="submit" variant="primary" className="h-10">Apply dates</Button>
        </div>
        {dateError ? <p role="alert" className="mt-2 text-xs text-danger">{dateError}</p> : <p className="mt-2 text-xs text-text-muted">Applied: {filters.startDate} through {filters.endDate}, inclusive. Dates and observations use UTC.</p>}
      </form>}
    </section>
    <section aria-label="Trending summary" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Metric label="Qualifying repositories" value={stats?.totalQualifying ?? "—"} detail={periodLabels[filters.period]} icon={<TrendingUp className="size-4" />} />
      <Metric label="Total stars gained" value={number(stats?.totalStarsGained ?? null)} detail="Across comparable results" icon={<Star className="size-4" />} />
      <Metric label="Average star growth" value={number(stats?.averageGrowth ?? null)} detail={stats?.fastest ? <Link className="break-words text-accent-hover hover:underline" href={repoLensUrl({ owner: stats.fastest.owner, repo: stats.fastest.name })}>Fastest: {stats.fastest.fullName} ({signed(stats.fastest.growth)})</Link> : "No leader with verified growth"} icon={<ArrowUpRight className="size-4" />} />
      <Metric label="Historical coverage" value={stats ? `${stats.coverageCount} / ${stats.trackedCount}` : "—"} detail="Tracked repositories with two observations" icon={<Radio className="size-4" />} />
    </section>
    <section aria-label={label} aria-busy={loading} className={cn(panel, "overflow-hidden")}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-4 py-4 sm:px-5">
        <div><h2 className="text-base font-semibold">{label}</h2><p className="mt-1 text-xs text-text-muted">{periodLabels[filters.period]} · Non-archived repositories</p></div>
        <div className="flex items-center gap-1.5 text-xs text-text-muted"><Clock3 className="size-3.5 shrink-0" /> {result?.lastSuccessfulCollectionAt ? `Collected ${stamp(result.lastSuccessfulCollectionAt)}` : "No successful collection yet"}</div>
      </div>
      {loading ? <div className="space-y-3 p-5" role="status" aria-label="Loading historical results">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-23 w-full rounded-xl" />)}</div> : failure ? <div className="p-4 sm:p-5"><ErrorState title={failure.kind === "unavailable" ? "Historical tracking unavailable" : failure.kind === "rate_limited" ? "Rate limit reached" : "Trending could not load"} message={failure.message} hint={failure.issues?.join(" ") ?? failure.hint} onRetry={() => setRequestId((n) => n + 1)} /><p className="mt-3 text-sm text-text-secondary">You can still <Link href="/search/repositories" className="text-accent-hover hover:underline">search current repositories on GitHub</Link>.</p></div> : result && <>
        {(result.freshness === "stale" || result.redisMode === "degraded" || ["running", "rate_limited", "failed", "partial"].includes(result.collectionState)) && <div className="space-y-2 px-4 pt-4 sm:px-5">
          {result.freshness === "stale" && <Notice tone="warning">Observations for this filter are stale. Last snapshot: {stamp(result.lastUpdatedAt)}.</Notice>}
          {result.redisMode === "degraded" && <Notice tone="warning">Shared cache is unavailable. RepoLens is using in-process limits; stored results are unaffected.</Notice>}
          {result.collectionState === "running" && <Notice>Snapshot collection is running. Refresh the page after it finishes.</Notice>}
          {result.collectionState === "rate_limited" && <Notice tone="warning">Collection paused after reaching a GitHub or RepoLens request limit. Existing observations are retained.</Notice>}
          {result.collectionState === "failed" && <Notice tone="warning">The latest collection did not complete. Results, when available, use previous observations.</Notice>}
          {result.collectionState === "partial" && <Notice>The latest collection was partial. Unprocessed repositories remain scheduled for a later run.</Notice>}
        </div>}
        {result.repositories.length === 0 ? <div className="p-4 sm:p-5"><EmptyState
          icon={<TrendingUp className="size-6" />}
          title={result.pagination.total > 0 ? "No results on this page" : result.summary.coverageCount === 0 && filters.ranking !== "stars" ? "Not enough historical observations" : "No repositories match these filters"}
          description={result.summary.coverageCount === 0 && filters.ranking !== "stars" ? `Growth needs two distinct observations at or before the chosen boundaries (within ${result.historicalCoverage.toleranceHours} hours). RepoLens never estimates missing starts or backfills them using today’s counts.` : "Try another period, language, or ranking. Only repositories in the tracked pool are eligible."}
          action={result.pagination.total > 0 ? <Button onClick={() => change({ page: 1 })}>Return to page 1</Button> : filters.ranking !== "stars" ? <Button onClick={() => change({ ranking: "stars" })}>View most starred <ArrowRight /></Button> : <Link className={buttonVariants()} href="/watchlist">Track a repository <ArrowRight /></Link>}
        /></div> : <ol className="divide-y divide-border-subtle" start={(filters.page - 1) * filters.limit + 1}>{result.repositories.map((repo) => <TrendingRow key={repo.id} repo={repo} filters={result.filters} announce={announce} />)}</ol>}
        {result.pagination.pages > 1 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-4 py-3 sm:px-5">
          <p className="text-xs text-text-muted">Page {filters.page} of {result.pagination.pages} · {result.pagination.total} repositories</p>
          <div className="flex gap-2"><Button size="sm" disabled={filters.page <= 1} onClick={() => change({ page: filters.page - 1 })}><ChevronLeft /> Previous</Button><Button size="sm" disabled={filters.page >= result.pagination.pages} onClick={() => change({ page: filters.page + 1 })}>Next <ChevronRight /></Button></div>
        </div>}
      </>}
    </section>
    <p className="mt-4 flex gap-2 text-xs leading-relaxed text-text-muted"><CalendarDays className="mt-0.5 size-3.5 shrink-0" /> Most Starred orders the tracked pool by the latest known total. Growth and Growth Percentage include only measured gains during the selected period. Open items can include pull requests.</p>
    <div role="status" className={cn("fixed bottom-5 right-5 z-50 max-w-[calc(100vw-2.5rem)] rounded-lg border border-border bg-surface-elevated px-4 py-3 text-sm shadow-lg", !announcement && "sr-only")}>{announcement}{announcement && <button className="ml-3 text-text-muted hover:text-text-primary" onClick={() => announce("")} aria-label="Dismiss notification">×</button>}</div>
  </div>;
}

function TrendingRow({ repo, filters, announce }: { repo: TrendingRepository; filters: TrendingFilters; announce: (message: string) => void }) {
  const saved = useSaved();
  const [pending, setPending] = useState(false);
  const active = saved.isSaved(repo.fullName);
  const base = repoLensUrl({ owner: repo.owner, repo: repo.name });
  const coverage = { complete: "Measured", missing_start: "No starting observation", missing_end: "No ending observation", same_snapshot: "Only one observation" }[repo.coverage];
  const change = repo.starGrowth;
  return <li className="group px-4 py-4 transition-colors hover:bg-surface-hover/35 sm:px-5">
    <div className="grid items-start gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <div className="flex items-center gap-2 sm:pt-1"><span className="rounded-md border border-border-subtle bg-background/70 px-2 py-1 font-mono text-xs text-text-secondary">#{repo.rank}</span>{repo.avatarUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" src={repo.avatarUrl} width={32} height={32} loading="lazy" className="size-8 rounded-md border border-border" />)}</div>
      <div className="min-w-0"><Link href={base} className="break-words text-sm font-semibold hover:text-accent-hover"><span className="font-normal text-text-muted">{repo.owner} / </span>{repo.name}</Link><p className="mt-1 text-xs leading-relaxed text-text-secondary">{repo.description || "No description provided."}</p>
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted">
          <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ backgroundColor: languageColor(repo.language) }} />{repo.language ?? "Unknown language"}</span>
          <span className="inline-flex items-center gap-1"><Star className="size-3.5" /> {formatExact(repo.currentStars)} stars</span>
          <span className="inline-flex items-center gap-1"><GitFork className="size-3.5" /> {formatExact(repo.forks)} forks</span>
          <span className="inline-flex items-center gap-1"><GitPullRequest className="size-3.5" /> {formatExact(repo.openIssues)} open</span>
        </div>
      </div>
      <div className="flex items-center gap-3 sm:justify-end">
        <div className={cn("flex items-center gap-1.5 rounded-lg border border-border-subtle bg-surface-elevated px-3 py-2 text-sm font-semibold tabular-nums", (change ?? 0) > 0 && "text-success", (change ?? 0) < 0 && "text-warning")}>{change === null ? "Growth unavailable" : <>{change >= 0 ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}{signed(change)} stars</>}</div>
        <span className="text-xs text-text-muted">{repo.growthPercentage === null ? "N/A" : `${repo.growthPercentage > 0 ? "+" : ""}${repo.growthPercentage}%`}</span>
      </div>
    </div>
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 sm:pl-20">
      <details className="min-w-0 text-xs text-text-muted"><summary className="cursor-pointer text-text-secondary hover:text-text-primary">{periodLabels[filters.period]} · {coverage}{repo.startingStars !== null ? ` · Started at ${formatExact(repo.startingStars)} stars` : ""}</summary>
        <dl className="mt-2 grid gap-x-4 gap-y-1 pl-3 sm:grid-cols-2"><div>Start: {stamp(repo.startingObservedAt)}</div><div>End: {stamp(repo.endingObservedAt)}{repo.endingStars !== null && ` · ${formatExact(repo.endingStars)} stars`}</div><div>Created: {date(repo.createdAt)}</div><div>Updated: {date(repo.updatedAt)}</div></dl>
      </details>
      <div className="flex items-center gap-2">
        <a href={repo.url} target="_blank" rel="noreferrer" className={buttonVariants({ size: "sm", variant: "ghost" })}>GitHub <ExternalLink /></a>
        <Link href={`${base}/analyze`} className={buttonVariants({ size: "sm", variant: "secondary" })}><ScanSearch /> Analyze</Link>
        <Button size="icon" variant={active ? "subtle" : "ghost"} aria-label={active ? `Remove ${repo.fullName} from saved` : `Save ${repo.fullName}`} aria-pressed={active} disabled={pending || !saved.ready} onClick={async () => {
          setPending(true);
          try {
            const isSaved = await saved.toggle({ owner: repo.owner, name: repo.name, fullName: repo.fullName, url: repo.url, description: repo.description, language: repo.language, stars: repo.currentStars });
            announce(isSaved !== active ? (isSaved ? `Saved ${repo.fullName}` : `Removed ${repo.fullName}`) : "Could not update saved repositories.");
          } finally { setPending(false); }
        }}><Bookmark className={cn("size-4", active && "fill-current")} /></Button>
      </div>
    </div>
  </li>;
}
