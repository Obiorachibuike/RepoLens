"use client";

import * as React from "react";
import Link from "next/link";
import { FolderOpen, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { EmptyState, Notice } from "@/components/ui/state";
import { CardsSkeleton } from "@/components/ui/skeleton";
import { useSaved } from "@/components/saved/saved-provider";
import { languageColor } from "@/lib/github/language-colors";
import { formatCompact, formatDate } from "@/lib/utils";
import type { CollectionItem } from "@/lib/storage/types";

export function CollectionsView() {
  const saved = useSaved();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [renameTarget, setRenameTarget] = React.useState<CollectionItem | null>(null);
  const [renameName, setRenameName] = React.useState("");
  const [renameDescription, setRenameDescription] = React.useState("");
  const [message, setMessage] = React.useState<string | null>(null);

  const selected = saved.collections.find((collection) => collection.id === selectedId) ?? null;
  const selectedItems = saved.items.filter((item) => item.collectionId === selectedId);

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setMessage("Give the collection a name.");
      return;
    }
    setCreating(true);
    const created = await saved.createCollection(trimmed, description.trim() || null);
    setCreating(false);
    if (created) {
      setName("");
      setDescription("");
      setMessage(null);
      setSelectedId(created.id);
    } else {
      setMessage(saved.error ?? "Could not create the collection.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-16 sm:px-6">
      <header className="py-10">
        <h1 className="text-[26px] font-semibold tracking-tight text-text-primary sm:text-[30px]">Collections</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-text-secondary">
          Group saved repositories by theme — AI projects, React libraries, backend tools, learning resources.
          {saved.mode === "local"
            ? " Collections are stored in this browser and are not synced across devices."
            : " Collections are stored in PostgreSQL for this session."}
        </p>
      </header>

      {saved.mode === "local" ? (
        <Notice tone="info" className="mb-4">
          Set <code className="font-mono">DATABASE_URL</code> to move collections and saved repositories to
          PostgreSQL.
        </Notice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface/70 p-4">
            <h2 className="text-[13px] font-semibold text-text-primary">Create a collection</h2>
            <div className="mt-3 space-y-3">
              <Field label="Name" htmlFor="collection-name">
                <Input
                  id="collection-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="AI Projects"
                  maxLength={60}
                />
              </Field>
              <Field label="Description" htmlFor="collection-description" hint="Optional.">
                <Textarea
                  id="collection-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What belongs here?"
                  maxLength={280}
                />
              </Field>
              <Button size="sm" variant="primary" onClick={create} disabled={creating}>
                <Plus className="size-3.5" />
                {creating ? "Creating…" : "Create collection"}
              </Button>
              {message ? <p className="text-[11px] text-danger">{message}</p> : null}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface/70">
            <div className="border-b border-border-subtle px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-muted">
              Your collections
            </div>
            {!saved.ready ? (
              <div className="p-4">
                <CardsSkeleton cards={2} />
              </div>
            ) : saved.collections.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12px] text-text-muted">No collections yet.</p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {saved.collections.map((collection) => (
                  <li key={collection.id} className="flex items-center gap-2 px-3 py-2.5">
                    <button
                      type="button"
                      onClick={() => setSelectedId(collection.id === selectedId ? null : collection.id)}
                      aria-pressed={selectedId === collection.id}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 text-left hover:text-text-primary"
                    >
                      <FolderOpen className="size-3.5 shrink-0 text-text-muted" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-text-secondary">{collection.name}</span>
                        {collection.description ? (
                          <span className="block truncate text-[11px] text-text-muted">{collection.description}</span>
                        ) : null}
                      </span>
                      <Badge tone="neutral">{collection.count}</Badge>
                    </button>
                    <button
                      type="button"
                      aria-label={`Rename ${collection.name}`}
                      onClick={() => {
                        setRenameTarget(collection);
                        setRenameName(collection.name);
                        setRenameDescription(collection.description ?? "");
                      }}
                      className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${collection.name}`}
                      onClick={async () => {
                        const ok = await saved.deleteCollection(collection.id);
                        if (!ok) setMessage(saved.error ?? "Could not delete the collection.");
                        if (selectedId === collection.id) setSelectedId(null);
                      }}
                      className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-hover hover:text-danger"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div>
          {!selected ? (
            <div className="rounded-lg border border-border bg-surface/60 p-6">
              <EmptyState
                title="Select a collection"
                description="Pick a collection on the left to see the repositories inside it. Assign repositories from the Saved page."
                action={
                  <Link href="/saved">
                    <Button size="sm" variant="secondary">
                      Go to saved repositories
                    </Button>
                  </Link>
                }
              />
            </div>
          ) : selectedItems.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface/60 p-6">
              <EmptyState
                title={`${selected.name} is empty`}
                description="Assign saved repositories to this collection from the Saved page."
                action={
                  <Link href="/saved">
                    <Button size="sm" variant="secondary">
                      Assign repositories
                    </Button>
                  </Link>
                }
              />
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-border bg-surface/70">
              <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3">
                <div className="min-w-0">
                  <h2 className="truncate text-[13px] font-semibold text-text-primary">{selected.name}</h2>
                  {selected.description ? (
                    <p className="truncate text-[11px] text-text-muted">{selected.description}</p>
                  ) : null}
                </div>
                <Badge tone="neutral">{selectedItems.length} repositories</Badge>
              </div>
              <ul className="divide-y divide-border-subtle">
                {selectedItems.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <Link
                      href={`/repository/${encodeURIComponent(item.owner)}/${encodeURIComponent(item.name)}`}
                      className="min-w-0 flex-1 truncate text-[13px] text-text-primary hover:underline"
                    >
                      <span className="text-text-muted">{item.owner}/</span>
                      {item.name}
                    </Link>
                    {item.language ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: languageColor(item.language) }}
                          aria-hidden="true"
                        />
                        {item.language}
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1 text-[11px] text-text-muted">
                      <Star className="size-3 text-[var(--star)]" />
                      {formatCompact(item.stars)}
                    </span>
                    <span className="text-[11px] text-text-muted">{formatDate(item.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRenameTarget(null);
        }}
      >
        <DialogContent
          title="Rename collection"
          description="Only you can see this collection."
          footer={
            <>
              <DialogClose asChild>
                <Button size="sm" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button
                size="sm"
                variant="primary"
                onClick={async () => {
                  if (!renameTarget) return;
                  const ok = await saved.renameCollection(renameTarget.id, renameName.trim(), renameDescription.trim() || null);
                  if (ok) setRenameTarget(null);
                }}
              >
                Save changes
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Field label="Name" htmlFor="rename-name">
              <Input id="rename-name" value={renameName} onChange={(event) => setRenameName(event.target.value)} maxLength={60} />
            </Field>
            <Field label="Description" htmlFor="rename-description">
              <Textarea
                id="rename-description"
                value={renameDescription}
                onChange={(event) => setRenameDescription(event.target.value)}
                maxLength={280}
              />
            </Field>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
