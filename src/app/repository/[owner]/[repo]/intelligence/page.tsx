import Link from "next/link";
import { notFound } from "next/navigation";
import { Activity, BookOpen, Download, ExternalLink, PackageSearch, ShieldCheck, Waypoints } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState, ErrorState, Notice } from "@/components/ui/state";
import { Metric, PageHeading, panel, workspace } from "@/components/ui/workspace";
import { RepoHeader } from "@/components/repository/repo-header";
import { ArchitectureMap } from "@/components/intelligence/architecture-map";
import { getRepository } from "@/lib/github/repos";
import { GithubApiError } from "@/lib/github/errors";
import { cn, formatDateTime } from "@/lib/utils";
import { intelligenceTabs, loadReport, tabLabel } from "@/lib/intelligence/reports";
import { sourceLink } from "@/lib/intelligence/source";
import type { HealthReport } from "@/lib/intelligence/health";
import type { Dependency, DependencyReport } from "@/lib/intelligence/dependencies";
import type { ReviewFinding } from "@/lib/intelligence/static-review";
import { repoLensUrl, repoFilePath, type RepoRef } from "@/lib/validation/repository";
import { enforceBudget } from "@/lib/infra/budget";
import { recordAnalysis } from "@/lib/workspace/analysis-history";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const metadata = { title: "Repository intelligence" };

type Props = { params: Promise<RepoRef>; searchParams: Promise<{ view?: string; page?: string }> };
export default async function IntelligencePage({ params, searchParams }: Props) {
  const ref = await params;
  const search = await searchParams;
  const parsed = intelligenceTabs.safeParse(search.view ?? "health");
  const view = parsed.success ? parsed.data : "health";
  const page = typeof search.page === "string" && /^\d{1,2}$/.test(search.page) ? Math.max(1, Number(search.page)) : 1;
  let repo;
  try { repo = (await getRepository(ref)).data; }
  catch (err) { if (err instanceof GithubApiError && ["not_found", "validation"].includes(err.kind)) notFound(); throw err; }
  const base = repoLensUrl({ owner: repo.owner.login, repo: repo.name });
  let result: Awaited<ReturnType<typeof loadReport>> | null = null, failure: string | null = null;
  try {
    await enforceBudget("analysis");
    result = await loadReport(ref, view);
    if (result.tab === "health") await recordAnalysis(repo.fullName, result.report);
  } catch (error) { failure = error instanceof GithubApiError ? error.message : "RepoLens could not obtain enough evidence or the report is already running. Try again shortly."; }
  const exportUrl = `/api/repositories${base.slice("/repository".length)}/intelligence?view=dependencies&format=cyclonedx`;
  return <>
    <RepoHeader repository={repo} active="intelligence" />
    <div className={workspace}>
      <PageHeading eyebrow="Analyze / Intelligence" title="Repository intelligence" description="Read the health signals, inspect the structure, and review the source behind each finding." icon={<Activity className="size-4" />} actions={<Link className={buttonVariants({ variant: "secondary" })} href={`${base}/chat`}>Ask the codebase →</Link>} />
      <nav className="mb-5 flex flex-wrap gap-2 border-b border-border-subtle pb-3" aria-label="Intelligence views">{intelligenceTabs.options.map((item) => <Link key={item} aria-current={view === item ? "page" : undefined} prefetch={false} href={`${base}/intelligence?view=${item}`} className={buttonVariants({ variant: item === view ? "subtle" : "ghost", size: "sm" })}>{tabLabel[item]}</Link>)}</nav>
      {!parsed.success && <Notice tone="warning" className="mb-4">Unknown report view. Showing the health report.</Notice>}
      {failure && <ErrorState title="Report unavailable" message={failure} />}
      {result?.tab === "empty" && <EmptyState title="No source revision is available" description="RepoLens could not find a default-branch commit to inspect for this view." />}
      {result?.tab === "health" && <HealthView report={result.report} />}
      {result && "revision" in result && <p className="mb-4 text-xs text-text-muted">Default branch revision <code>{result.revision.slice(0, 12)}</code>{result.truncated && " · Tree is partial"} · public repository only</p>}
      {result?.tab === "architecture" && (result.nodes.length ? <ArchitectureMap name={repo.fullName} nodes={result.nodes.map((node) => ({ ...node, links: node.paths.map((path) => ({ path, url: sourceLink(result, path) })) }))} /> : <EmptyState icon={<Waypoints />} title="No recognizable components" description="No eligible paths matched the architecture rules in the available tree." />)}
      {result?.tab === "dependencies" && <DependencyView report={result.report} page={page} base={`${base}/intelligence?view=dependencies`} exportUrl={exportUrl} />}
      {(result?.tab === "quality" || result?.tab === "security") && <div className="space-y-4">
        <Notice tone={result.tab === "security" ? "warning" : "info"}>{result.scanned} sampled text files · {result.skipped} skipped · {formatDateTime(result.analyzedAt)}. These are static patterns, not proof of exploitability or coverage. No repository code was executed and detected credential values are not shown.</Notice>
        <section className={cn(panel, "overflow-hidden")}><h2 className="border-b border-border-subtle p-4 font-semibold">{result.tab === "security" ? "Potential security risks" : "Maintainability signals"}</h2>
          {result.findings.length ? <ul className="divide-y divide-border-subtle">{result.findings.map((item, index) => <FindingItem key={`${item.path}:${item.line}:${index}`} item={item} href={repoFilePath.safeParse(item.path).success && !item.path.includes("[REDACTED") ? sourceLink(result, item.path, item.line) : undefined} />)}</ul> : <EmptyState title="No matching signals in the sample" description="This limited sample does not establish that the repository is secure, tested, or free of quality issues." />}
        </section>
        {result.tab === "security" && <section className={cn(panel, "space-y-3 p-4")}><h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-accent-hover" /> Published dependency advisories</h2><p className="text-sm text-text-secondary">{result.advisoryCoverage} of {result.inventoryCount ?? "an unavailable inventory of"} entries checked by exact version. Advisory matches do not establish reachability in this repository.</p>{result.dependencyFindings.length ? <ul className="space-y-2">{result.dependencyFindings.map((dep, i) => <li key={`${dep.name}:${dep.version}:${i}`} className="flex flex-wrap items-center gap-2 text-sm"><span>{dep.name} {dep.version}</span><AdvisoryLinks dep={dep} /></li>)}</ul> : <p className="text-sm text-text-muted">{result.advisoryCoverage ? "No published matches in the checked subset." : "No advisory checks could be completed."}</p>}</section>}
      </div>}
    </div>
  </>;
}

function HealthView({ report }: { report: HealthReport }) {
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3"><Metric label="Repository health" value={report.score === null ? "Unknown" : `${report.score} / 100`} detail="Weights normalized to measured categories" icon={<Activity className="size-4" />} /><Metric label="Evidence coverage" value={`${report.coverage}%`} detail="Share of configured weight with an estimate" /><Metric label="Analyzer timestamp" value={<span className="text-xl">{report.generatedAt.slice(0, 10)}</span>} detail={formatDateTime(report.generatedAt)} /></div>
    <Notice>Scores are heuristics for the inspected evidence, not a certification. Missing categories are omitted rather than scored as zero. Contributor, issue, pull request, and release samples are not totals.</Notice>
    <div className="grid gap-3 md:grid-cols-2">{report.categories.map((category) => <section key={category.id} className={cn(panel, "p-4")}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">{category.label}</h2><span className={cn("font-mono text-sm", category.score === null ? "text-text-muted" : category.score >= 75 ? "text-success" : category.score < 55 ? "text-warning" : "text-accent-hover")}>{category.score !== null ? `${category.score}/100` : "Unknown"} · weight {category.weight}</span></div>
      {category.score !== null && <progress aria-label={`${category.label} score`} className="mt-2 block h-1.5 w-full accent-accent" max={100} value={category.score} />}
      <ul className="mt-3 space-y-1 text-xs leading-relaxed text-text-secondary">{category.evidence.map((item) => <li key={item}>• {item}</li>)}</ul>
      <p className="mt-3 flex gap-2 text-xs leading-relaxed text-text-muted"><BookOpen className="mt-0.5 size-3.5 shrink-0 text-accent-hover" />{category.next}</p>
    </section>)}</div>
    <div className={cn(panel, "grid gap-4 p-4 md:grid-cols-3")}>
      <section><h2 className="text-sm font-semibold">Strengths</h2><p className="mt-2 text-xs text-text-secondary">{report.strengths.join(", ") || "No high-scoring category in this report."}</p></section>
      <section><h2 className="text-sm font-semibold">Maintenance concerns</h2><p className="mt-2 text-xs text-text-secondary">{report.concerns.join(", ") || "No low-scoring category in the measured evidence."}</p></section>
      <section><h2 className="text-sm font-semibold">Suggested improvements</h2><ul className="mt-2 space-y-1 text-xs text-text-secondary">{report.suggestions.length ? report.suggestions.slice(0, 4).map((item) => <li key={item}>• {item}</li>) : <li>Review the underlying evidence before acting.</li>}</ul></section>
    </div>
  </div>;
}

function AdvisoryLinks({ dep }: { dep: Dependency }) {
  return dep.advisories === null ? <span className="text-text-muted">Not checked</span> : dep.advisories.length ? <span className="flex flex-wrap gap-x-2 gap-y-1">{dep.advisories.map((id) => <a key={id} href={`https://osv.dev/vulnerability/${encodeURIComponent(id)}`} target="_blank" rel="noreferrer" className="break-all text-warning hover:underline">{id}</a>)}</span> : <span className="text-text-muted">No matches</span>;
}

function DependencyView({ report, page, base, exportUrl }: { report: DependencyReport; page: number; base: string; exportUrl: string }) {
  const perPage = 30, pages = Math.max(1, Math.ceil(report.dependencies.length / perPage));
  const current = Math.min(page, pages);
  const rows = report.dependencies.slice((current - 1) * perPage, current * perPage);
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-3"><Metric label="Inventory entries" value={report.dependencies.length} detail={`${report.manifests.length} read manifests or lockfiles`} icon={<PackageSearch className="size-4" />} /><Metric label="Direct dependencies" value={report.dependencies.filter((dep) => dep.relation === "direct").length} detail="Direct relationships identified" /><Metric label="Checked by OSV" value={report.advisoryCoverage} detail="Exact versions only; capped sample" /></div>
    {report.advisoryUnavailable && <Notice tone="warning">The advisory service did not return a verified response. No unverified results were treated as clean.</Notice>}
    {(report.skipped > 0 || report.truncated) && <Notice tone="warning">The inventory is partial. {report.skipped} manifests were skipped or could not be parsed. Large trees or inventories are capped.</Notice>}
    <section className={cn(panel, "overflow-hidden")}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle p-4"><div><h2 className="font-semibold">Dependency inventory</h2><p className="mt-1 text-xs text-text-muted">Version and license evidence from manifests, lockfiles and bounded registry checks.</p></div><a className={buttonVariants({ variant: "outline", size: "sm" })} href={exportUrl}><Download /> CycloneDX SBOM</a></div>
      {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead className="bg-background/60 text-text-muted"><tr>{["Package", "Version evidence", "License", "Freshness", "OSV advisories"].map((item) => <th scope="col" className="px-3 py-3 font-medium" key={item}>{item}</th>)}</tr></thead><tbody className="divide-y divide-border-subtle">{rows.map((dep, i) => <tr key={`${dep.name}:${dep.version}:${i}`} className="align-top"><th scope="row" className="max-w-60 break-words px-3 py-3 font-medium">{dep.name}<span className="mt-1 block text-[11px] font-normal text-text-muted">{dep.ecosystem} · {dep.relation}</span></th><td className="max-w-56 break-words px-3 py-3"><span className="font-mono">{dep.version ?? dep.constraint ?? "Unknown"}</span><span className="mt-1 block text-[11px] text-text-muted">{dep.resolved ? "Lock/resolution" : "Manifest declaration"} · {dep.source}</span></td><td className="px-3 py-3">{dep.license ?? "Unknown"}</td><td className="px-3 py-3">{dep.outdated === null ? "Not compared" : dep.outdated ? `Newer: ${dep.latest}` : "No newer stable latest tag"}</td><td className="px-3 py-3"><AdvisoryLinks dep={dep} /></td></tr>)}</tbody></table></div> : <EmptyState title="No supported dependency entries" description="No matching packages were parsed from the sampled manifests. This does not prove that the repository has no dependencies." />}
      {pages > 1 && <nav aria-label="Inventory pages" className="flex items-center justify-between gap-2 border-t border-border-subtle p-4 text-xs text-text-muted">Page {current} / {pages}<div className="flex gap-2">{current > 1 && <Link className={buttonVariants({ size: "sm" })} href={`${base}&page=${current - 1}`} prefetch={false}>Previous</Link>}{current < pages && <Link className={buttonVariants({ size: "sm" })} href={`${base}&page=${current + 1}`} prefetch={false}>Next</Link>}</div></nav>}
    </section>
  </div>;
}
function FindingItem({ item, href }: { item: ReviewFinding; href?: string }) {
  return <li className="p-4"><div className="flex flex-wrap items-center gap-2 text-xs"><span className={cn("rounded px-2 py-1 font-semibold capitalize", item.severity === "high" ? "bg-danger/10 text-danger" : "bg-accent-soft text-accent-hover")}>{item.severity}</span><span className="font-semibold">{item.category}</span><span className="text-text-muted">{item.confidence} confidence</span></div>
    <p className="mt-2 break-all font-mono text-xs text-text-secondary">{href ? <a className="inline-flex gap-1.5 text-accent-hover hover:underline" target="_blank" rel="noreferrer" href={href}>{item.path}:{item.line} <ExternalLink className="size-3" /></a> : `${item.path}:${item.line}`}</p>
    <p className="mt-2 text-sm text-text-secondary">{item.evidence} {item.risk}</p><p className="mt-1 text-sm"><strong>Recommendation:</strong> {item.remediation}</p>
  </li>;
}
