import Link from "next/link";
import { ExternalLink, GitPullRequest, LifeBuoy } from "lucide-react";
import { EmptyState, ErrorState, Notice } from "@/components/ui/state";
import { Button, buttonVariants } from "@/components/ui/button";
import { field, PageHeading, panel, workspace } from "@/components/ui/workspace";
import { firstValues } from "@/lib/validation/search";
import { contributionLabels, issueFilters } from "@/lib/discovery/filters";
import { findContributions } from "@/lib/discovery/issues";
import { GithubApiError } from "@/lib/github/errors";
import { repoLensUrl } from "@/lib/validation/repository";
import { cn, timeAgo } from "@/lib/utils";

export const metadata = { title: "Contribution finder" };
export const dynamic = "force-dynamic";
export default async function ContributionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const search = firstValues(await searchParams);
  const parsed = issueFilters.safeParse(search);
  const defaults = issueFilters.parse({});
  const filters = parsed.success ? parsed.data : defaults;
  let items: Awaited<ReturnType<typeof findContributions>> | null = null, error: string | null = null;
  try { if (parsed.success) items = await findContributions(filters); else error = "Choose valid issue filters."; } catch (err) { error = err instanceof GithubApiError ? err.message : "GitHub did not return contribution results."; }
  const href = (page: number) => `/contributions?${new URLSearchParams({ ...filters, page: String(page) })}`;
  return <div className={workspace}>
    <PageHeading eyebrow="Discover / Contribute" title="Find an issue worth working on" description="Search actual public GitHub issues by language and maintainer labels. Confirm scope and availability with the project before starting." icon={<GitPullRequest className="size-4" />} />
    <form action="/contributions" className={cn(panel, "mb-4 flex flex-wrap items-end gap-3 p-4")}>
      <label className="min-w-40 flex-1 space-y-2 text-xs font-medium text-text-secondary">Issue label<select name="label" className={field} defaultValue={filters.label}>{Object.entries(contributionLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label className="min-w-40 flex-1 space-y-2 text-xs font-medium text-text-secondary">Repository language<input name="language" maxLength={45} className={field} defaultValue={filters.language} placeholder="Any · e.g. TypeScript" /></label>
      <label className="min-w-32 space-y-2 text-xs font-medium text-text-secondary">Assignment<select name="unassigned" className={field} defaultValue={filters.unassigned}><option value="true">Unassigned</option><option value="false">Any</option></select></label>
      <Button type="submit" variant="primary" className="h-10">Find issues</Button>
    </form>
    {error && <ErrorState title="Contribution search unavailable" message={error} />}
    {items?.partial && <Notice className="mb-4">GitHub did not report complete results or metadata for some issues. Missing language and guide links are left unknown.</Notice>}
    {items && (items.items.length ? <section className={cn(panel, "overflow-hidden")}>
      <div className="border-b border-border-subtle p-4 text-sm font-medium">{items.total.toLocaleString()} results reported by GitHub</div>
      <ul className="divide-y divide-border-subtle">{items.items.map((issue) => <li key={issue.id} className="space-y-2 p-4">
        <div className="flex flex-wrap justify-between gap-2"><div className="min-w-0"><Link className="break-words text-xs text-accent-hover hover:underline" href={repoLensUrl(issue.ref)}>{issue.ref.owner}/{issue.ref.repo}</Link><h2 className="mt-1 break-words font-semibold">{issue.title}</h2></div><a className={buttonVariants({ size: "sm", variant: "secondary" })} href={issue.url} target="_blank" rel="noreferrer">Open issue <ExternalLink /></a></div>
        <p className="text-xs leading-relaxed text-text-secondary">{issue.description || "No issue description returned."}</p><div className="flex flex-wrap gap-1.5 text-xs text-text-muted">{issue.labels.map((label, i) => <span className="rounded-md bg-accent-soft px-2 py-1 text-accent-hover" key={`${label}:${i}`}>{label}</span>)}</div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-muted"><span>{issue.language ?? "Language unknown"}</span><span>Opened {issue.age ? timeAgo(issue.age) : "at an unknown time"}</span><span>{issue.unassigned ? "Unassigned" : "Assignment not clear or already assigned"}</span><span>{issue.estimate}</span>{issue.contributing && <a className="text-accent-hover hover:underline" target="_blank" rel="noreferrer" href={issue.contributing}>Contribution guide</a>}</div>
      </li>)}</ul>
      {items.pages > 1 && <div className="flex items-center justify-between gap-2 border-t border-border-subtle p-4 text-xs text-text-muted"><span>Page {items.page} of {items.pages}</span><div className="flex gap-2">{items.page > 1 && <Link className={buttonVariants({ size: "sm" })} prefetch={false} href={href(items.page - 1)}>Previous</Link>}{items.page < items.pages && <Link className={buttonVariants({ size: "sm" })} prefetch={false} href={href(items.page + 1)}>Next</Link>}</div></div>}
    </section> : <div className={panel}><EmptyState icon={<LifeBuoy size={20} />} title="No matching issues" description="Try another label, remove the language, or include assigned issues. Difficulty is never inferred just from a title." /></div>)}
  </div>;
}
