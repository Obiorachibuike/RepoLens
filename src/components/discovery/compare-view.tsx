"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, GitCompare, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Notice } from "@/components/ui/state";
import { Skeleton } from "@/components/ui/skeleton";
import { field, PageHeading, panel, workspace } from "@/components/ui/workspace";
import { cn, formatDate, formatExact } from "@/lib/utils";
import { repoLensUrl, repositoryInput } from "@/lib/validation/repository";
import type { compareRepositories } from "@/lib/intelligence/compare";

type Rows = Awaited<ReturnType<typeof compareRepositories>>;
const show = (value: string | number | null | undefined) => value === null || value === undefined ? "Unavailable" : typeof value === "number" ? formatExact(value) : value;
export function CompareView({ initial }: { initial: string[] }) {
  const [inputs, setInputs] = useState(() => initial.length >= 2 ? initial : [initial[0] ?? "", ""]);
  const [rows, setRows] = useState<Rows>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const compare = useCallback(async (values: string[], signal?: AbortSignal) => {
    const repos = values.map((value) => value.trim()).filter(Boolean);
    if (repos.length < 2 || repos.some((value) => !repositoryInput.safeParse(value).success)) { setError("Enter at least two valid GitHub repositories."); return; }
    setPending(true); setError(""); setRows(undefined);
    const query = new URLSearchParams(); repos.forEach((repo) => query.append("repo", repo));
    window.history.replaceState(null, "", `/compare?${query}`);
    try {
      const response = await fetch(`/api/compare?${query}`, { signal });
      const data = await response.json() as { items: Rows; error?: { message?: string; issues?: string[] } };
      if (!response.ok) throw new Error(data.error?.issues?.join(" ") ?? data.error?.message ?? "Could not compare these repositories.");
      if (!signal?.aborted) setRows(data.items);
    } catch (err) { if (!signal?.aborted) setError(err instanceof Error ? err.message : "Could not compare repositories."); }
    finally { if (!signal?.aborted) setPending(false); }
  }, []);
  useEffect(() => {
    if (initial.length < 2) return;
    const controller = new AbortController(); void compare(initial, controller.signal);
    return () => controller.abort();
  }, [compare, initial]);
  const metrics = [
    ["Stars", (r: Rows[number]) => r.repo?.stargazersCount], ["Forks", (r: Rows[number]) => r.repo?.forksCount], ["Primary language", (r: Rows[number]) => r.repo?.language],
    ["License", (r: Rows[number]) => r.repo?.license?.name], ["Created", (r: Rows[number]) => r.repo?.createdAt ? formatDate(r.repo.createdAt) : null],
    ["Open issues + pull requests", (r: Rows[number]) => r.repo?.openIssuesCount], ["Contributors in first page", (r: Rows[number]) => r.metrics?.contributorSample],
    ["30-day commits in 20-commit sample", (r: Rows[number]) => r.metrics?.commitSample30Days], ["Latest GitHub release", (r: Rows[number]) => r.metrics?.latestRelease],
    ["Releases in past year (sample)", (r: Rows[number]) => r.metrics?.releasesInYearSample], ["README", (r: Rows[number]) => r.metrics?.readme === null || !r.metrics ? null : r.metrics.readme ? "Available" : "Not observed"],
    ["Root test indicators", (r: Rows[number]) => r.metrics?.rootTestIndicator === null || !r.metrics ? null : r.metrics.rootTestIndicator ? "Observed" : "Not observed"],
    ["Health / evidence coverage", (r: Rows[number]) => r.metrics?.health === null || !r.metrics ? null : `${r.metrics.health}/100 · ${r.metrics.coverage}% covered`],
    ["Dependency score", (r: Rows[number]) => r.metrics?.dependencyHealth], ["Maintenance score", (r: Rows[number]) => r.metrics?.maintenance],
  ] as const;
  return <div className={workspace}>
    <PageHeading eyebrow="Analyze / Compare" title="Repository comparison" description="Compare public repositories side by side. Counts come from GitHub; sampled signals and unknown values are labeled." icon={<GitCompare className="size-4" />} />
    <form className={cn(panel, "space-y-3 p-4 sm:p-5")} onSubmit={(event) => { event.preventDefault(); void compare(inputs); }}>
      <div className="grid gap-3 lg:grid-cols-3">{inputs.map((value, index) => <label key={index} className="block space-y-1.5 text-xs font-medium text-text-secondary">Repository {index + 1}<span className="flex items-center gap-1"><input className={field} maxLength={240} value={value} required={index < 2} onChange={(e) => setInputs((old) => old.map((item, i) => i === index ? e.target.value : item))} placeholder="owner/repository or GitHub URL" />{index === 2 && <Button size="icon" variant="ghost" aria-label="Remove third repository" onClick={() => setInputs(inputs.slice(0, 2))}><X /></Button>}</span></label>)}</div>
      <div className="flex flex-wrap gap-2"><Button variant="primary" type="submit" disabled={pending}>Compare repositories <ArrowRight /></Button>{inputs.length < 3 && <Button variant="outline" onClick={() => setInputs([...inputs, ""])}><Plus /> Add a third</Button>}</div>
    </form>
    {error && <ErrorState className="mt-4" title="Comparison could not load" message={error} />}
    {pending ? <div className="mt-4 grid gap-3 sm:grid-cols-2" role="status" aria-label="Loading comparison"><Skeleton className="h-40" /><Skeleton className="h-40" /></div> : rows ? <div className="mt-5 space-y-4">
      <section className={cn(panel, "p-4")} aria-label="GitHub star counts"><h2 className="font-semibold">GitHub stars</h2><div className="mt-3 space-y-3">{rows.map((r) => { const max = Math.max(1, ...rows.map((row) => row.repo?.stargazersCount ?? 0)); const value = r.repo?.stargazersCount; return <div key={`${r.ref.owner}/${r.ref.repo}`}><p className="mb-1 flex flex-wrap justify-between gap-2 text-xs text-text-secondary"><span>{r.ref.owner}/{r.ref.repo}</span><strong>{show(value)}</strong></p>{value !== undefined && <progress max={max} value={value} aria-label={`Stars for ${r.ref.owner}/${r.ref.repo}`} className="block h-2 w-full accent-accent" />}</div>; })}</div></section>
      {rows.some((r) => r.error) && <Notice tone="warning">{rows.filter((r) => r.error).map((r) => `${r.ref.owner}/${r.ref.repo}: ${r.error}`).join(" ")}</Notice>}
      <div className={cn(panel, "overflow-x-auto")}><table className="w-full min-w-[545px] text-left text-xs"><thead><tr className="bg-background/70"><th scope="col" className="p-3">Dimension</th>{rows.map((r) => <th scope="col" className="p-3" key={`${r.ref.owner}/${r.ref.repo}`}><Link href={`${repoLensUrl(r.ref)}/intelligence`} className="break-words text-accent-hover hover:underline">{r.ref.owner}/{r.ref.repo}</Link></th>)}</tr></thead><tbody className="divide-y divide-border-subtle">{metrics.map(([label, cell]) => <tr key={label}><th scope="row" className="p-3 font-medium text-text-secondary">{label}</th>{rows.map((r) => <td className="p-3" key={`${r.ref.owner}/${r.ref.repo}`}>{show(cell(r))}</td>)}</tr>)}</tbody></table></div>
      <p className="text-xs text-text-muted">Release and dependency scores may require a recent full health report. Open items include issues and pull requests; a root listing does not prove test coverage.</p>
    </div> : !error && <div className={cn(panel, "mt-4")}><EmptyState icon={<GitCompare className="size-5" />} title="Choose repositories to compare" description="Paste GitHub URLs or owner/repository identifiers to inspect their strengths, activity and trade-offs." /></div>}
  </div>;
}
