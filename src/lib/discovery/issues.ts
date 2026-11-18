import "server-only";
import { githubRequest } from "@/lib/github/client";
import { getCommunityProfile, getRepository } from "@/lib/github/repos";
import { repoRefSchema, githubRepoUrl } from "@/lib/validation/repository";
import { redactSource } from "@/lib/intelligence/redact";
import { contributionLabels, type IssueFilters } from "./filters";

type RawIssue = { id: number; number: number; title: string; body?: string; assignee?: unknown; labels?: { name: string }[]; created_at: string; pull_request?: unknown; repository_url: string };
export type Contribution = { id: number; title: string; description: string | null; ref: { owner: string; repo: string }; language: string | null; labels: string[]; age: string; url: string; unassigned: boolean; estimate: string; contributing: string | null };
export async function findContributions(filters: IssueFilters) {
  const query = `is:issue is:open is:public archived:false label:"${contributionLabels[filters.label]}"${filters.unassigned === "true" ? " no:assignee" : ""}${filters.language ? ` language:"${filters.language}"` : ""}`;
  const perPage = 8;
  const { data } = await githubRequest<{ total_count: number; incomplete_results?: boolean; items: RawIssue[] }>({ path: "/search/issues", query: { q: query, page: filters.page, per_page: perPage, sort: "created", order: "desc" } });
  const valid = (data.items ?? []).flatMap((item) => {
    const match = /^https:\/\/api\.github\.com\/repos\/([\w.-]+)\/([\w.-]+)$/.exec(item.repository_url);
    const ref = repoRefSchema.safeParse({ owner: match?.[1], repo: match?.[2] });
    return ref.success && !item.pull_request && Number.isSafeInteger(item.number) && item.number > 0 && typeof item.title === "string" ? [{ item, ref: ref.data }] : [];
  });
  const unique = new Map(valid.map(({ ref }) => [`${ref.owner}/${ref.repo}`, ref]));
  const metadata = new Map<string, { language: string | null; contributing: string | null; hidden: boolean }>();
  const refs = [...unique];
  for (let index = 0; index < refs.length; index += 3) {
    await Promise.all(refs.slice(index, index + 3).map(async ([key, ref]) => {
      try {
        const repo = await getRepository(ref);
        const profile = index < 3 ? await getCommunityProfile(ref) : null;
        const guide = profile?.files?.contributing as { html_url?: unknown } | undefined;
        const contributing = typeof guide?.html_url === "string" && guide.html_url.startsWith(`${githubRepoUrl(ref)}/`) ? guide.html_url : null;
        metadata.set(key, { language: repo.data.language, contributing, hidden: repo.data.archived });
      } catch { /* Labels and links still came from a public issue query. */ }
    }));
  }
  const items: Contribution[] = valid.flatMap(({ item, ref }) => {
    const info = metadata.get(`${ref.owner}/${ref.repo}`);
    if (info?.hidden) return [];
    const labels = Array.isArray(item.labels) ? item.labels.flatMap((label) => typeof label?.name === "string" ? [redactSource(label.name.slice(0, 90))] : []).slice(0, 12) : [];
    const estimate = labels.some((label) => /^good first issue$/i.test(label)) ? "Possible starter · based on maintainer label" : labels.some((label) => /^documentation$/i.test(label)) ? "Documentation task · scope not verified" : "Difficulty not estimated";
    const description = typeof item.body === "string" ? redactSource(item.body).replace(/\s+/g, " ").trim().slice(0, 340) || null : null;
    return [{ id: item.id, title: redactSource(item.title).slice(0, 180), description, ref, labels, language: info?.language ?? null, age: item.created_at, url: `${githubRepoUrl(ref)}/issues/${item.number}`, unassigned: item.assignee === null, estimate, contributing: info?.contributing ?? null }];
  });
  return { items, total: data.total_count, page: filters.page, perPage, pages: Math.ceil(Math.min(1000, data.total_count) / perPage), partial: Boolean(data.incomplete_results) || items.some((item) => item.language === null) };
}
