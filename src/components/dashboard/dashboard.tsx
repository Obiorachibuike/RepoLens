import Link from "next/link";
import { Activity, ArrowRight, ArrowUpRight, Bookmark, Clock3, Code2, GitCompare, GitFork, Layers3, MessageSquareText, Radio, ScanSearch, Sparkles, Star, TrendingUp } from "lucide-react";
import { QuickLookup } from "./quick-lookup";
import { SavedPreview } from "./saved-preview";
import { buttonVariants } from "@/components/ui/button";
import { Metric, panel, workspace } from "@/components/ui/workspace";
import type { loadDashboard } from "@/lib/workspace/dashboard";
import { repoLensUrl, repositoryInput } from "@/lib/validation/repository";
import { languageColor } from "@/lib/github/language-colors";
import { cn, formatCompact, formatDateTime, formatExact } from "@/lib/utils";

const actions = [
  { icon: ScanSearch, title: "Repository intelligence", body: "Health, architecture, security and dependencies", href: "/analyze" },
  { icon: MessageSquareText, title: "AI repository chat", body: "Ask a question and open its source citations", href: "/analyze?tool=chat" },
  { icon: GitCompare, title: "Compare repositories", body: "Evaluate GitHub metrics side by side", href: "/compare" },
] as const;

type DashboardData = Awaited<ReturnType<typeof loadDashboard>>;
function SectionTitle({ icon, title, detail, href, action }: { icon: React.ReactNode; title: string; detail: string; href: string; action: string }) {
  return <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-subtle px-4 py-4 sm:px-5">
    <div className="min-w-0"><h2 className="flex items-center gap-2 text-sm font-semibold">{icon}{title}</h2><p className="mt-1 text-xs text-text-muted">{detail}</p></div>
    <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-accent-hover hover:underline">{action} <ArrowRight className="size-3.5" /></Link>
  </div>;
}
function StatusDot({ live = false }: { live?: boolean }) { return <span className={cn("size-2 shrink-0 rounded-full", live ? "bg-success" : "bg-warning")} aria-hidden="true" />; }

export function Dashboard({ data }: { data: DashboardData }) {
  const trending = data.trending;
  const latest = trending?.lastSuccessfulCollectionAt;
  const health = data.recent?.filter((item) => item.healthScore !== null) ?? [];
  const topHealth = health[0]?.healthScore;
  return <div className={`${workspace} overview`}>
    <section className="overview-hero relative isolate overflow-hidden rounded-2xl border border-accent/25 px-5 py-8 sm:px-7 sm:py-10 xl:px-9 xl:py-12">
      <HeroArt />
      <div className="relative z-10 max-w-[640px]">
        <p className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent-hover"><Layers3 className="size-3.5" /> Repository intelligence workspace</p>
        <h1 className="mt-4 max-w-[600px] text-balance text-[34px] font-semibold leading-[1.03] tracking-[-.055em] sm:text-5xl xl:text-[54px]">Understand any codebase.<br /><span className="hero-highlight">Discover what’s possible.</span></h1>
        <p className="mb-5 mt-3.5 max-w-[450px] text-sm leading-6 text-text-secondary">Find open-source projects, trace how they work, and follow the changes that matter.</p>
        <QuickLookup />
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><Link href="/search/repositories?mode=project-idea" className="rounded-md px-1 py-1 text-text-secondary hover:text-accent-hover">Explore a project idea ↗</Link><span className="text-text-muted">·</span><Link href="/trending" className="rounded-md px-1 py-1 text-text-secondary hover:text-accent-hover">View measured trends ↗</Link></div>
      </div>
    </section>

    <section aria-label="Quick actions" className="mt-4 grid gap-2.5 md:grid-cols-3">
      {actions.map(({ icon: Icon, title, body, href }) => <Link key={href} href={href} className={cn(panel, "group flex min-w-0 items-center gap-3 p-3.5 transition-colors hover:border-accent/45 hover:bg-surface-hover/80")}>
        <div className="shrink-0 rounded-lg border border-accent/20 bg-accent-soft p-2 text-accent-hover"><Icon className="size-[17px]" /></div><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-xs leading-relaxed text-text-muted">{body}</p></div><ArrowUpRight className="size-4 shrink-0 text-text-muted transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-accent-hover" />
      </Link>)}
    </section>

    <div className="mt-7 flex flex-wrap items-end justify-between gap-2"><div><p className="text-xs font-medium text-accent-hover">Your research at a glance</p><h2 className="mt-1 text-[22px] font-semibold tracking-tight">Workspace overview</h2></div><p className="flex items-center gap-2 text-xs text-text-muted"><StatusDot live={trending?.freshness === "fresh"} />{latest ? trending?.freshness === "stale" ? "Snapshots are stale" : "Recent observations available" : data.configured ? "Awaiting first snapshot" : "Historical tracking not configured"}</p></div>
    <section aria-label="Workspace metrics" className="mt-3 grid grid-cols-2 gap-2.5 xl:grid-cols-4">
      <Metric label="Tracked repositories" value={trending?.summary.trackedCount ?? "—"} detail={data.configured ? "Public, non-archived pool" : "PostgreSQL required"} icon={<Radio className="size-4" />} />
      <Metric label="7-day growth coverage" value={trending ? `${trending.summary.coverageCount} / ${trending.summary.trackedCount}` : "—"} detail="Two snapshots at the boundaries" icon={<TrendingUp className="size-4" />} />
      <Metric label="Latest health score" value={topHealth === null || topHealth === undefined ? "—" : `${topHealth}/100`} detail={health[0] ? `${health[0].evidenceCoverage ?? "Unknown"}% evidence weight` : "No measured report in recent activity"} icon={<Activity className="size-4" />} />
      <Metric label="Last successful snapshot" value={<span className="text-base">{latest ? latest.slice(0, 10) : "Not recorded"}</span>} detail={latest ? formatDateTime(latest) : "Collection begins after setup"} icon={<Clock3 className="size-4" />} />
    </section>

    <div className="mt-5 grid items-start gap-4 xl:grid-cols-[1.25fr_1fr]">
      <section className={cn(panel, "min-w-0 overflow-hidden")}>
        <SectionTitle icon={<TrendingUp className="size-4 text-accent-hover" />} title="Trending now" detail="Verified star gains · Last 7 days" href="/trending" action="Full leaderboard" />
        {trending?.repositories.length ? <ol className="divide-y divide-border-subtle px-4 sm:px-5">{trending.repositories.map((repo) => <li key={repo.id} className="flex items-center gap-3 py-3 text-sm"><span className="font-mono text-xs text-text-muted">{String(repo.rank).padStart(2, "0")}</span><Link className="min-w-0 flex-1 truncate font-semibold hover:text-accent-hover" href={repoLensUrl({ owner: repo.owner, repo: repo.name })}>{repo.fullName}</Link><span className="flex shrink-0 items-center gap-1 rounded-md bg-success/10 px-2 py-1 text-xs font-semibold text-success"><ArrowUpRight className="size-3.5" />+{formatExact(repo.starGrowth ?? 0)}</span></li>)}</ol> : <div className="flex min-h-34 items-start gap-3 px-4 py-5 sm:px-5">
          <div className="rounded-lg border border-border bg-background/80 p-2 text-text-muted"><Radio className="size-5" /></div><div className="min-w-0"><h3 className="text-sm font-medium">{trending ? "No verified growth in this period yet" : "Historical tracking is not available"}</h3><p className="mt-1 max-w-sm text-xs leading-relaxed text-text-muted">{trending ? "Ranks appear after projects have real star observations at both boundaries. We don’t estimate a missing baseline." : "Trending needs a configured PostgreSQL database and scheduled snapshots. Live GitHub discovery below still works independently."}</p><Link href="/trending" className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-3")}>View snapshot coverage <ArrowRight /></Link></div>
        </div>}
      </section>
      <section className={cn(panel, "min-w-0 overflow-hidden")}>
        <SectionTitle icon={<Clock3 className="size-4 text-accent-hover" />} title="Recent activity" detail="Analyses and bookmarks in this workspace" href="/analysis-history" action="Analysis history" />
        <div className="p-4 sm:px-5">
          {data.recent?.length ? <ul className="divide-y divide-border-subtle">{data.recent.map((item) => { const ref = repositoryInput.safeParse(item.repository); return ref.success && <li key={item.repository} className="flex flex-wrap items-center justify-between gap-1 py-2.5 text-xs"><Link className="break-words font-medium text-text-secondary hover:text-accent-hover" href={`${repoLensUrl(ref.data)}/intelligence`}>{item.repository}</Link><span className="text-text-muted">{item.healthScore === null ? "Metadata report" : `Health ${item.healthScore}/100`}</span></li>; })}</ul> : <p className="text-sm text-text-muted">{data.configured ? "No analyses recorded yet." : "Analysis history needs PostgreSQL."}</p>}
          <div className="mt-3 border-t border-border-subtle pt-3"><Link href="/saved" className="flex items-center gap-2 text-xs font-medium text-text-secondary hover:text-accent-hover"><Bookmark className="size-3.5" /> Saved repositories</Link><SavedPreview /></div>
        </div>
      </section>
    </div>

    <section className={cn(panel, "mt-4 overflow-hidden")}>
      <SectionTitle icon={<Sparkles className="size-4 text-accent-hover" />} title="Recommended projects" detail={data.recommended?.reason ?? "Discover active projects using GitHub’s public metadata"} href="/recommendations" action="Explore recommendations" />
      {data.recommended?.items.length ? <ul className="grid divide-y divide-border-subtle md:grid-cols-3 md:divide-x md:divide-y-0">{data.recommended.items.slice(0, 3).map((item) => <li className="min-w-0 px-4 py-4 sm:px-5" key={`${item.ref.owner}/${item.ref.repo}`}><Link href={repoLensUrl(item.ref)} className="flex items-center justify-between gap-1 text-sm font-semibold hover:text-accent-hover"><span className="truncate">{item.ref.owner}/{item.ref.repo}</span><ArrowUpRight className="size-3.5 shrink-0 text-accent-hover" /></Link><p className="mt-1.5 line-clamp-2 min-h-8 text-xs leading-relaxed text-text-secondary">{item.description ?? "No description provided."}</p><p className="mt-2.5 flex flex-wrap gap-3 text-xs text-text-muted"><span className="flex items-center gap-1"><Star className="size-3.5" />{formatCompact(item.stars)}</span><span className="flex items-center gap-1"><i className="size-2 rounded-full" style={{ backgroundColor: languageColor(item.language) }} />{item.language ?? "Unknown language"}</span></p></li>)}</ul> : <p className="p-4 text-sm text-text-muted">{data.recommended?.coverageMissing ? "Growth data is not available yet. Try another category on the recommendations page." : "There are no recommendations to show here right now. Choose your interests to narrow discovery."}</p>}
    </section>
  </div>;
}

function HeroArt() {
  return <div aria-hidden="true" className="hero-art pointer-events-none absolute inset-y-0 right-0 hidden w-[50%] select-none sm:block">
    <div className="hero-grid absolute inset-0" />
    <svg viewBox="0 0 470 312" className="absolute right-0 top-1/2 h-full w-full -translate-y-1/2" fill="none">
      <defs><linearGradient id="hero-wire" x1="90" y1="20" x2="452" y2="309" gradientUnits="userSpaceOnUse"><stop stopColor="#a596ff" stopOpacity=".18" /><stop offset=".6" stopColor="#a596ff" stopOpacity=".75" /><stop offset="1" stopColor="#6288f6" stopOpacity=".3" /></linearGradient></defs>
      <circle cx="305" cy="154" r="108" stroke="#a99bfa" strokeOpacity=".2" /><circle cx="305" cy="154" r="137" stroke="#a99bfa" strokeOpacity=".13" strokeDasharray="4 7" /><circle cx="305" cy="154" r="76" stroke="#a99bfa" strokeOpacity=".22" />
      <path d="M113 98h89l40 42m-73 92h64l25-34m99-74 30-49h56m-80 114 31 49h78" stroke="url(#hero-wire)" strokeWidth="1.5" />
      <circle cx="111" cy="98" r="4" fill="#9e89f4" /><circle cx="168" cy="232" r="4" fill="#9e89f4" /><circle cx="444" cy="75" r="4" fill="#9e89f4" /><circle cx="433" cy="238" r="4" fill="#9e89f4" />
      <rect x="246" y="96" width="118" height="118" rx="28" transform="rotate(1 305 155)" fill="#222045" fillOpacity=".9" stroke="#a89aff" strokeOpacity=".55" />
      <path d="M287 140l-16 15 16 15m37-30 16 15-16 15m-11-39-15 49" stroke="#c3b6ff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <div className="absolute right-[5%] top-[17%] hidden rounded-lg border border-accent/30 bg-surface-elevated/90 px-2.5 py-1.5 text-[11px] text-text-secondary shadow-xl lg:flex lg:items-center lg:gap-1.5"><GitFork className="size-3.5 text-accent-hover" /> Activity</div>
    <div className="absolute bottom-[17%] right-[49%] hidden rounded-lg border border-accent/30 bg-surface-elevated/90 px-2.5 py-1.5 text-[11px] text-text-secondary shadow-xl lg:flex lg:items-center lg:gap-1.5"><Code2 className="size-3.5 text-accent-hover" /> Source</div>
    <div className="absolute bottom-[17%] right-[6%] hidden rounded-lg border border-accent/30 bg-surface-elevated/90 px-2.5 py-1.5 text-[11px] text-text-secondary shadow-xl lg:flex lg:items-center lg:gap-1.5"><Activity className="size-3.5 text-accent-hover" /> Health</div>
  </div>;
}
