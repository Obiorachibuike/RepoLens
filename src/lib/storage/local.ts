import type { CollectionItem, RepositorySeed, SavedRepositoryItem } from "./types";

/**
 * Browser-local fallback storage for anonymous visitors.
 *
 * Used when DATABASE_URL is not configured. Data lives in this browser only and
 * is never synced — the UI says so explicitly wherever local saves appear.
 */

const SAVED_KEY = "repolens:saved";
const COLLECTIONS_KEY = "repolens:collections";
const HISTORY_KEY = "repolens:history";

export interface LocalHistoryEntry {
  id: string;
  query: string;
  mode: string;
  sort: string;
  filters: Record<string, unknown>;
  resultCount: number | null;
  createdAt: string;
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota exceeded or storage disabled — callers surface the failure */
    throw new Error("Browser storage is unavailable or full.");
  }
}

function newId(): string {
  return `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function listLocalSaved(): SavedRepositoryItem[] {
  return read<SavedRepositoryItem[]>(SAVED_KEY, []);
}

export function isSavedLocally(fullName: string): boolean {
  return listLocalSaved().some((item) => item.fullName.toLowerCase() === fullName.toLowerCase());
}

export function saveLocally(seed: RepositorySeed): SavedRepositoryItem {
  const items = listLocalSaved();
  const existing = items.find((item) => item.fullName.toLowerCase() === seed.fullName.toLowerCase());
  if (existing) return existing;
  const item: SavedRepositoryItem = {
    id: newId(),
    owner: seed.owner,
    name: seed.name,
    fullName: seed.fullName,
    url: seed.url,
    description: seed.description ?? null,
    language: seed.language ?? null,
    stars: seed.stars ?? 0,
    note: null,
    collectionId: null,
    createdAt: new Date().toISOString(),
  };
  write(SAVED_KEY, [item, ...items]);
  return item;
}

export function removeLocally(id: string): void {
  write(
    SAVED_KEY,
    listLocalSaved().filter((item) => item.id !== id),
  );
}

export function updateLocalNote(id: string, note: string | null): SavedRepositoryItem | null {
  const items = listLocalSaved();
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const current = items[index];
  if (!current) return null;
  const next = { ...current, note };
  items[index] = next;
  write(SAVED_KEY, items);
  return next;
}

export function moveLocalToCollection(id: string, collectionId: string | null): SavedRepositoryItem | null {
  const items = listLocalSaved();
  const index = items.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const current = items[index];
  if (!current) return null;
  const next = { ...current, collectionId };
  items[index] = next;
  write(SAVED_KEY, items);
  return next;
}

export function listLocalCollections(): CollectionItem[] {
  return read<CollectionItem[]>(COLLECTIONS_KEY, []);
}

export function createLocalCollection(name: string, description: string | null): CollectionItem {
  const collections = listLocalCollections();
  if (collections.some((collection) => collection.name.toLowerCase() === name.toLowerCase())) {
    throw new Error("A collection with that name already exists.");
  }
  const collection: CollectionItem = {
    id: newId(),
    name,
    description,
    count: 0,
    createdAt: new Date().toISOString(),
  };
  write(COLLECTIONS_KEY, [...collections, collection]);
  return collection;
}

export function renameLocalCollection(id: string, name: string, description: string | null): void {
  const collections = listLocalCollections().map((collection) =>
    collection.id === id ? { ...collection, name, description } : collection,
  );
  write(COLLECTIONS_KEY, collections);
}

export function deleteLocalCollection(id: string): void {
  write(
    COLLECTIONS_KEY,
    listLocalCollections().filter((collection) => collection.id !== id),
  );
  write(
    SAVED_KEY,
    listLocalSaved().map((item) => (item.collectionId === id ? { ...item, collectionId: null } : item)),
  );
}

export function collectionCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of listLocalSaved()) {
    if (!item.collectionId) continue;
    counts[item.collectionId] = (counts[item.collectionId] ?? 0) + 1;
  }
  return counts;
}

/* -------------------------------- History ------------------------------- */

export function listLocalHistory(limit = 40): LocalHistoryEntry[] {
  return read<LocalHistoryEntry[]>(HISTORY_KEY, []).slice(0, limit);
}

export function addLocalHistory(entry: Omit<LocalHistoryEntry, "id" | "createdAt">): LocalHistoryEntry {
  const entries = listLocalHistory(100);
  // Collapse duplicates of the same query+mode, newest first.
  const filtered = entries.filter(
    (item) => !(item.query === entry.query && item.mode === entry.mode),
  );
  const next: LocalHistoryEntry = { ...entry, id: newId(), createdAt: new Date().toISOString() };
  write(HISTORY_KEY, [next, ...filtered].slice(0, 100));
  return next;
}

export function clearLocalHistory(): void {
  write(HISTORY_KEY, []);
}

export function clearAllLocalData(): void {
  [SAVED_KEY, COLLECTIONS_KEY, HISTORY_KEY].forEach((key) => {
    if (typeof window !== "undefined") window.localStorage.removeItem(key);
  });
}
