import Link from "next/link";
import { Activity, Clock3 } from "lucide-react";
import { EmptyState } from "@/components/ui/state";
import { buttonVariants } from "@/components/ui/button";
import { PageHeading, panel, workspace } from "@/components/ui/workspace";
import { recentAnalyses } from "@/lib/workspace/dashboard";
import { repoLensUrl, repositoryInput } from "@/lib/validation/repository";
import { cn, formatDateTime } from "@/lib/utils";
export const dynamic = "force-dynamic";
export const metadata = { title: "Analysis history" };
export default async function AnalysisHistory() {
  const history = await recentAnalyses(50);
  const rows = (history ?? []).flatMap((entry) => { const ref = repositoryInput.safeParse(entry.repository); return ref.success ? [{ ...entry, ref: ref.data }] : []; });
  return <div className={workspace}><PageHeading eyebrow="Workspace / Analysis history" title="Analysis history" icon={<Clock3 className="size-4" />} description="Revisit the most recent public-repository reports read from this browser session." />
    <section className={cn(panel, "overflow-hidden")}>
      {rows.length ? <ul className="divide-y divide-border-subtle">{rows.map((entry) => <li className="flex flex-wrap justify-between gap-3 px-4 py-3 text-sm" key={entry.repository}>
        <Link className="break-words font-medium text-accent-hover hover:underline" href={`${repoLensUrl(entry.ref)}/${entry.healthScore === null ? "analyze" : "intelligence"}`}>{entry.repository}</Link><p className="flex flex-wrap gap-3 text-xs text-text-muted"><span>{entry.healthScore === null ? "Metadata report" : `Health ${entry.healthScore}/100 · ${entry.evidenceCoverage}% evidence`}</span><span>{formatDateTime(entry.viewedAt.toISOString())}</span></p>
      </li>)}</ul> : <EmptyState icon={<Activity className="size-5" />} title={history === null ? "Analysis history unavailable" : "No reports recorded yet"} description={history === null ? "Analysis history requires a working PostgreSQL connection. Reports remain usable without storage." : "Open a metadata or health report to add it to your recent work."} action={<Link className={buttonVariants()} href="/analyze">Analyze a repository</Link>} />}
    </section></div>;
}
