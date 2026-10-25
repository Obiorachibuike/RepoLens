"use client";

import * as React from "react";
import Link from "next/link";
import { Bookmark, Download, ExternalLink, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState, Notice } from "@/components/ui/state";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { useSaved } from "./saved-provider";
import { languageColor } from "@/lib/github/language-colors";
import { formatCompact, formatDate } from "@/lib/utils";
import type { SavedRepositoryItem } from "@/lib/storage/types";

export function SavedView() {
  const saved = useSaved();
  const [query, setQuery] = React.useState("");
  const [collectionFilter, setCollectionFilter] = React.useState("all");
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase();
    return saved.items.filter((item) => {
      const matchesCollection =
        collectionFilter === "all" ||
        (collectionFilter === "none" ? !item.collectionId : item.collectionId === collectionFilter);
      const matchesQuery =
        !needle ||
        item.fullName.toLowerCase().includes(needle) ||
        (item.description ?? "").toLowerCase().includes(needle) ||
        (item.note ?? "").toLowerCase().includes(needle);
      return matchesCollection && matchesQuery;
    });
  }, [saved.items, query, collectionFilter]);

  const exportData = (format: "json" | "csv") => {
    const payload =
      format === "json"
        ? JSON.stringify({ saved: saved.items, collections: saved.collections, exportedAt: new Date().toISOString() }, null, 2)
        : toCsv(saved.items);
    const blob = new Blob([payload], { type: format === "json" ? "application/json" : "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `repolens-saved-${new Date().toISOString().slice(0, 10)}.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-16 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3 py-10">
        <div>
          <h1 className="text-[26px] font-semibold tracking-tight text-text-primary sm:text-[30px]">
            Saved repositories
          </h1>
          <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-text-secondary">
            {saved.mode === "server"
              ? "Stored in PostgreSQL and tied to your browser session. Available on any device using the same session."
              : "Stored in this browser only (localStorage). They are not synced across devices — set DATABASE_URL to enable server storage."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => exportData("json")} disabled={saved.items.length === 0}>
            <Download className="size-3.5" />
            Export JSON
          </Button>
          <Button size="sm" variant="secondary" onClick={() => exportData("csv")} disabled={saved.items.length === 0}>
            <Download className="size-3.5" />
            Export CSV
          </Button>
        </div>
      </header>

      {saved.mode === "local" ? (
        <Notice tone="info" className="mb-4">
          Local saves live in this browser only and are not synchronized across devices.
        </Notice>
      ) : null}

      {saved.error ? (
        <Notice tone="warning" className="mb-4">
          {saved.error}
        </Notice>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Search saved" htmlFor="saved-q" className="min-w-[220px] flex-1">
          <Input
            id="saved-q"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by name, description or note"
          />
        </Field>
        <Field label="Collection" htmlFor="saved-collection" className="w-[200px]">
          <Select
            ariaLabel="Filter by collection"
            value={collectionFilter}
            onValueChange={setCollectionFilter}
            options={[
              { value: "all", label: "All saved" },
              { value: "none", label: "No collection" },
              ...saved.collections.map((collection) => ({ value: collection.id, label: collection.name })),
            ]}
          />
        </Field>
        <Link href="/collections">
          <Button size="md" variant="secondary">
            Manage collections
          </Button>
        </Link>
      </div>

      {!saved.ready ? (
        <CardsSkeleton cards={4} />
      ) : saved.items.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface/70">
          <EmptyState
            title="Nothing saved yet"
            description="Use the bookmark button on any search result or repository page to keep it here."
            action={
              <Link href="/">
                <Button size="sm" variant="secondary">
                  Search repositories
                </Button>
              </Link>
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface/70">
          <EmptyState
            title="No matches in your saved list"
            description="Adjust the filter or clear the search box."
            action={
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setQuery("");
                  setCollectionFilter("all");
                }}
              >
                Reset filters
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((item) => (
            <SavedRow
              key={item.id}
              item={item}
              busy={pendingId === item.id}
              onBusy={setPendingId}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function SavedRow({
  item,
  busy,
  onBusy,
}: {
  item: SavedRepositoryItem;
  busy: boolean;
  onBusy: (id: string | null) => void;
}) {
  const saved = useSaved();
  const [note, setNote] = React.useState(item.note ?? "");
  const [editing, setEditing] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);

  const collection = saved.collections.find((entry) => entry.id === item.collectionId);

  const saveNote = async () => {
    onBusy(item.id);
    const ok = await saved.updateNote(item.id, note.trim() ? note.trim() : null);
    onBusy(null);
    setMessage(ok ? "Note saved." : saved.error ?? "Could not save the note.");
    if (ok) setEditing(false);
  };

  return (
    <li className="rounded-lg border border-border bg-surface/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/repository/${encodeURIComponent(item.owner)}/${encodeURIComponent(item.name)}`}
              className="text-[14px] font-medium text-text-primary hover:underline"
            >
              <span className="text-text-muted">{item.owner}/</span>
              {item.name}
            </Link>
            {collection ? <Badge tone="accent">{collection.name}</Badge> : null}
          </div>
          {item.description ? (
            <p className="mt-1 line-clamp-2 max-w-2xl text-[12px] leading-relaxed text-text-muted">
              {item.description}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-text-muted">
            {item.language ? (
              <span className="inline-flex items-center gap-1">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: languageColor(item.language) }}
                  aria-hidden="true"
                />
                {item.language}
              </span>
            ) : (
              <span>Language not reported</span>
            )}
            <span className="inline-flex items-center gap-1">
              <Star className="size-3 text-[var(--star)]" />
              {formatCompact(item.stars)}
            </span>
            <span>saved {formatDate(item.createdAt)}</span>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-text-secondary"
            >
              GitHub
              <ExternalLink className="size-3" />
            </a>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select
            ariaLabel={`Collection for ${item.fullName}`}
            size="sm"
            value={item.collectionId ?? "none"}
            onValueChange={async (value) => {
              onBusy(item.id);
              const ok = await saved.moveToCollection(item.id, value === "none" ? null : value);
              onBusy(null);
              setMessage(ok ? null : (saved.error ?? "Could not move the repository."));
            }}
            options={[
              { value: "none", label: "No collection" },
              ...saved.collections.map((entry) => ({ value: entry.id, label: entry.name })),
            ]}
          />
          <Button size="sm" variant="ghost" onClick={() => setEditing((value) => !value)}>
            {editing ? "Cancel" : item.note ? "Edit note" : "Add note"}
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={busy}
            aria-label={`Remove ${item.fullName} from saved`}
            onClick={async () => {
              onBusy(item.id);
              const ok = await saved.remove(item.id);
              onBusy(null);
              if (!ok) setMessage(saved.error ?? "Could not remove the repository.");
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {editing ? (
        <div className="mt-3">
          <Field label="Note" htmlFor={`note-${item.id}`} hint="Private to you — stored with your saved list.">
            <Textarea
              id={`note-${item.id}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Why is this repository interesting?"
            />
          </Field>
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" variant="primary" onClick={saveNote} disabled={busy}>
              {busy ? "Saving…" : "Save note"}
            </Button>
            {message ? <span className="text-[11px] text-text-muted">{message}</span> : null}
          </div>
        </div>
      ) : item.note ? (
        <p className="mt-3 rounded-md border border-border-subtle bg-background-secondary/60 px-3 py-2 text-[12px] leading-relaxed text-text-secondary">
          <Bookmark className="mr-1.5 inline size-3 text-accent-hover" />
          {item.note}
        </p>
      ) : null}
    </li>
  );
}

function toCsv(items: SavedRepositoryItem[]): string {
  const header = ["full_name", "url", "language", "stars", "collection", "note", "saved_at"];
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const rows = items.map((item) =>
    [
      item.fullName,
      item.url,
      item.language ?? "",
      String(item.stars),
      item.collectionId ?? "",
      item.note ?? "",
      item.createdAt,
    ]
      .map(escape)
      .join(","),
  );
  return [header.join(","), ...rows].join("\n");
}
