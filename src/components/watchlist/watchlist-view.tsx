"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Check, Plus, Radio, Trash2 } from "lucide-react";
import { useAppConfig } from "@/components/app-providers";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Notice } from "@/components/ui/state";
import { Skeleton } from "@/components/ui/skeleton";
import { field, PageHeading, panel, workspace } from "@/components/ui/workspace";
import { ensureSession } from "@/lib/storage/session-client";
import { watchLabels, type WatchItem } from "@/lib/workspace/watch-model";
import { cn, formatDateTime } from "@/lib/utils";
import { repositoryInput, repoLensUrl } from "@/lib/validation/repository";

export function WatchlistView({ initial }: { initial: string }) {
  const config = useAppConfig();
  const [repository, setRepository] = useState(initial);
  const [items, setItems] = useState<WatchItem[]>([]);
  const [hours, setHours] = useState<number>();
  const [busy, setBusy] = useState(config.database);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!await ensureSession()) throw new Error("Could not start a workspace session.");
    const response = await fetch("/api/watchlist", { signal });
    const data = await response.json() as { items: WatchItem[]; intervalHours: number; error?: { message?: string } };
    if (!response.ok) throw new Error(data.error?.message ?? "Could not load Watchtower.");
    if (!signal?.aborted) { setItems(data.items); setHours(data.intervalHours); }
  }, []);
  useEffect(() => {
    if (!config.database) return;
    const controller = new AbortController();
    refresh(controller.signal).catch((err: unknown) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Watchtower could not load."); }).finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [refresh, config.database]);

  async function change(method: "POST" | "PATCH" | "DELETE", id: string, body: object | undefined, success: string) {
    setPending(id); setError(""); setNotice("");
    try {
      const response = await fetch(method === "DELETE" ? `/api/watchlist?id=${encodeURIComponent(id)}` : "/api/watchlist", { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const result = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? "Watchtower could not save the change.");
      await refresh(); setNotice(success);
      if (method === "POST") setRepository("");
    } catch (err) { setError(err instanceof Error ? err.message : "Watchtower could not save the change."); }
    finally { setPending(null); }
  }

  return <div className={workspace}>
    <PageHeading eyebrow="Workspace / Watchtower" title="Repository watchlist" description="Monitor meaningful changes using the same observations that power Trending. Notifications appear here, not in your inbox." icon={<Radio className="size-4" />} />
    {!config.database && <Notice tone="warning" className="mb-4">Connect PostgreSQL to start a watchlist. Saved repositories still work in this browser.</Notice>}
    <form className={cn(panel, "mb-4 p-4")} onSubmit={(e) => {
      e.preventDefault();
      if (!repositoryInput.safeParse(repository).success) { setError("Enter a public GitHub repository URL or owner/repository."); return; }
      void change("POST", "new", { repository }, "Repository added to Watchtower.");
    }}>
      <label className="block text-sm font-medium" htmlFor="watch-repository">Track a public repository</label>
      <div className="mt-2 flex flex-wrap gap-2 sm:flex-nowrap"><input id="watch-repository" className={field} value={repository} maxLength={240} onChange={(e) => setRepository(e.target.value)} placeholder="owner/repository or GitHub URL" required disabled={!config.database} /><Button className="h-10" variant="primary" disabled={!config.database || busy || pending !== null} type="submit"><Plus /> {pending === "new" ? "Adding…" : "Add to watchlist"}</Button></div>
      <p className="mt-2 text-xs text-text-muted">{hours ? `Repositories become eligible for a check after ${hours} hours and are processed by the configured scheduler.` : "Checks are performed by the scheduled snapshot collector."}</p>
    </form>
    {error && <ErrorState compact title="Watchtower error" message={error} className="mb-4" />}
    {notice && <div role="status" className="mb-4"><Notice tone="success">{notice}</Notice></div>}
    {busy ? <div className="space-y-3" aria-label="Loading watchlist" role="status"><Skeleton className="h-24" /><Skeleton className="h-24" /></div> : items.length ? <section className="space-y-3" aria-label="Watched repositories">
      {items.map((item) => <article key={item.id} className={cn(panel, "space-y-3 p-4")}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h2><Link href={repoLensUrl({ owner: item.owner, repo: item.name })} className="break-words font-semibold hover:text-accent-hover">{item.owner}/{item.name}</Link></h2><p className="mt-1 text-xs text-text-muted">{item.archived ? "Archived" : item.status === "unavailable" ? "Not available on GitHub" : item.lastChecked ? `Last checked ${formatDateTime(item.lastChecked)}` : "Waiting for the first observation"}</p></div>
          <div className="flex flex-wrap items-center gap-1.5"><span className={cn("flex items-center gap-1.5 rounded-md px-2 py-1 text-xs", item.unread ? "bg-accent-soft text-accent-hover" : "text-text-muted")}>{item.unread ? <Bell className="size-3.5" /> : <BellOff className="size-3.5" />}{item.unread} unread</span>{item.unread > 0 && <Button size="sm" variant="ghost" disabled={pending !== null} onClick={() => void change("PATCH", item.id, { id: item.id, markRead: true }, "Changes marked read.")}><Check /> Mark read</Button>}<Button size="icon" variant="ghost" aria-label={`Stop watching ${item.owner}/${item.name}`} disabled={pending !== null} onClick={() => { if (window.confirm(`Stop watching ${item.owner}/${item.name}?`)) void change("DELETE", item.id, undefined, "Repository removed from your watchlist."); }}><Trash2 /></Button></div></div>
        <p className="text-xs text-text-muted">{item.lastProbe ? `Last detailed check attempted ${formatDateTime(item.lastProbe)}` : "Waiting for a detailed check"}</p>
        <details className="rounded-md border border-border-subtle bg-background/50 p-3"><summary className="cursor-pointer text-sm font-medium">Recent changes</summary>
          {item.events.length ? <ul className="mt-2 divide-y divide-border-subtle">{item.events.map((event) => <li key={event.at} className="py-2 text-xs"><p className="font-medium text-text-secondary">{formatDateTime(event.at)}{event.unread && " · New"}</p><ul className="mt-1 space-y-1 text-text-muted">{event.changes.map((change) => <li key={change.category}>{change.label}: {change.before} → {change.after}</li>)}</ul></li>)}</ul> : <p className="mt-2 text-xs text-text-muted">No changes recorded in the available observations and enabled categories.</p>}
        </details>
        <details className="rounded-md border border-border-subtle p-3"><summary className="cursor-pointer text-sm font-medium">Notification preferences</summary><div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">{(Object.keys(watchLabels) as (keyof WatchItem["preferences"])[]).map((key) => <label key={key} className="flex items-center gap-1.5 text-xs text-text-secondary"><input type="checkbox" checked={item.preferences[key]} disabled={pending !== null} onChange={(e) => void change("PATCH", item.id, { id: item.id, preferences: { [key]: e.target.checked } }, "Notification preferences saved.")} />{watchLabels[key]}</label>)}</div></details>
      </article>)}
    </section> : <div className={panel}><EmptyState icon={<Bell className="size-5" />} title="No repositories monitored" description="Add a repository to start recording changes. A baseline isn't a change notification; at least two successful observations are needed." /></div>}
    <p className="mt-4 text-xs leading-relaxed text-text-muted">Release, commit, contributor, and manifest checks rotate through a bounded number of watched repositories per run. Advisory changes use a recent matching dependency report if one is available. Missing measurements do not generate an alert.</p>
  </div>;
}
