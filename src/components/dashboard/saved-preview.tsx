"use client";
import Link from "next/link";
import { Bookmark, ChevronRight } from "lucide-react";
import { useSaved } from "@/components/saved/saved-provider";
import { Skeleton } from "@/components/ui/skeleton";
import { repoLensUrl, repoRefSchema } from "@/lib/validation/repository";

export function SavedPreview() {
  const saved = useSaved();
  if (!saved.ready) return <div className="space-y-2 py-2" aria-label="Loading saved repositories" role="status"><Skeleton className="h-9" /><Skeleton className="h-9" /></div>;
  const items = saved.items.flatMap((entry) => {
    const ref = repoRefSchema.safeParse({ owner: entry.owner, repo: entry.name });
    return ref.success ? [{ entry, ref: ref.data }] : [];
  }).slice(0, 3);
  return items.length ? <ul className="divide-y divide-border-subtle">{items.map(({ entry, ref }) => <li key={entry.id}><Link href={repoLensUrl(ref)} className="flex min-w-0 items-center gap-2 py-2.5 text-sm text-text-secondary hover:text-accent-hover"><Bookmark className="size-3.5 shrink-0 text-accent-hover" /><span className="min-w-0 flex-1 truncate">{entry.fullName}</span><ChevronRight className="size-3.5 shrink-0" /></Link></li>)}</ul> : <p className="py-2 text-sm leading-relaxed text-text-muted">{saved.error ?? "Bookmark a repository to get back to it here."}</p>;
}
