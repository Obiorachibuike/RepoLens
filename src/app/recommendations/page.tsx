import Link from "next/link";
import { ArrowUpRight, Sparkles, Star } from "lucide-react";
import { RecommendationForm } from "@/components/discovery/recommendation-form";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { PageHeading, panel, workspace } from "@/components/ui/workspace";
import { recommendationProfile } from "@/lib/discovery/filters";
import { recommendationSignals, recommendProjects } from "@/lib/discovery/recommendations";
import { GithubApiError } from "@/lib/github/errors";
import { firstValues } from "@/lib/validation/search";
import { repoLensUrl } from "@/lib/validation/repository";
import { cn, formatExact } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Project recommendations" };
export default async function RecommendationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const signals = await recommendationSignals();
  const search = firstValues(await searchParams);
  const parsed = recommendationProfile.safeParse({ ...signals.profile, ...search });
  const profile = parsed.success ? parsed.data : recommendationProfile.parse({});
  let result: Awaited<ReturnType<typeof recommendProjects>> | null = null, error: string | null = null;
  try { if (parsed.success) result = await recommendProjects(profile, signals); else error = "Use a valid language or a lower-case GitHub topic separated by hyphens."; } catch (err) { error = err instanceof GithubApiError ? err.message : "Could not load project recommendations."; }
  return <div className={workspace}>
    <PageHeading eyebrow="Discover / Recommendations" title="Projects matched to your interests" description="Filter maintained public projects by language, technology, and contribution goals. Saved and analyzed repositories help infer a language when you have not chosen one." icon={<Sparkles className="size-4" />} />
    <RecommendationForm key={JSON.stringify(profile)} profile={profile} persisted={signals.persisted} />
    {error && <ErrorState title="Recommendations unavailable" message={error} className="mt-4" />}
    {result && <p className="my-4 text-sm text-text-secondary">{result.reason}</p>}
    {result && (result.items.length ? <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Matching projects">{result.items.map((repo) => <article key={`${repo.ref.owner}/${repo.ref.repo}`} className={cn(panel, "space-y-2 p-4 transition-colors hover:border-accent/50")}>
      <Link className="flex justify-between gap-2 break-all font-semibold hover:text-accent-hover" href={repoLensUrl(repo.ref)}><span>{repo.ref.owner}/{repo.ref.repo}</span><ArrowUpRight className="size-4 shrink-0 text-accent-hover" /></Link><p className="line-clamp-2 text-sm text-text-secondary">{repo.description || "No description provided."}</p><p className="flex flex-wrap items-center gap-2 text-xs text-text-muted"><Star className="size-3.5" /> {formatExact(repo.stars)} · {repo.language ?? "Unknown language"}</p><p className="text-xs text-accent-hover">{repo.reason}</p>
    </article>)}</section> : <div className={panel}><EmptyState title={result.coverageMissing ? "Not enough measured growth yet" : "No projects match these preferences"} description={result.coverageMissing ? "Fast-growing recommendations need two real historical observations. Try an active category instead." : "Try a broader interest, language or topic. Recent projects already seen in the workspace can be excluded."} /></div>)}
  </div>;
}
