"use client";

import * as React from "react";
import {
  collectionCounts,
  createLocalCollection,
  deleteLocalCollection,
  isSavedLocally,
  listLocalCollections,
  listLocalSaved,
  moveLocalToCollection,
  removeLocally,
  renameLocalCollection,
  saveLocally,
  updateLocalNote,
} from "@/lib/storage/local";
import {
  fromServerCollection,
  fromServerRow,
  type CollectionItem,
  type RepositorySeed,
  type SavedRepositoryItem,
} from "@/lib/storage/types";

export type StorageMode = "server" | "local";

export interface SavedContextValue {
  ready: boolean;
  mode: StorageMode;
  items: SavedRepositoryItem[];
  collections: CollectionItem[];
  error: string | null;
  isSaved: (fullName: string) => boolean;
  toggle: (seed: RepositorySeed) => Promise<boolean>;
  save: (seed: RepositorySeed) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  updateNote: (id: string, note: string | null) => Promise<boolean>;
  moveToCollection: (id: string, collectionId: string | null) => Promise<boolean>;
  createCollection: (name: string, description?: string | null) => Promise<CollectionItem | null>;
  renameCollection: (id: string, name: string, description: string | null) => Promise<boolean>;
  deleteCollection: (id: string) => Promise<boolean>;
  refresh: () => Promise<void>;
  exportData: () => { saved: SavedRepositoryItem[]; collections: CollectionItem[] };
  clearError: () => void;
}

const SavedContext = React.createContext<SavedContextValue | null>(null);

class ApiFailure extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function api(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await response.json().catch(() => null)) as {
    items?: unknown[];
    item?: Record<string, unknown>;
    error?: { message?: string };
  } | null;
  if (!response.ok) {
    throw new ApiFailure(body?.error?.message ?? `Request failed (${response.status})`, response.status);
  }
  return body;
}

export function SavedProvider({
  children,
  databaseConfigured,
}: {
  children: React.ReactNode;
  databaseConfigured: boolean;
}) {
  const [mode, setMode] = React.useState<StorageMode>(databaseConfigured ? "server" : "local");
  const [items, setItems] = React.useState<SavedRepositoryItem[]>([]);
  const [collections, setCollections] = React.useState<CollectionItem[]>([]);
  const [ready, setReady] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadLocal = React.useCallback(() => {
    setItems(listLocalSaved());
    const counts = collectionCounts();
    setCollections(
      listLocalCollections().map((collection) => ({ ...collection, count: counts[collection.id] ?? 0 })),
    );
  }, []);

  const refresh = React.useCallback(async () => {
    if (!databaseConfigured) {
      loadLocal();
      setMode("local");
      setReady(true);
      return;
    }
    try {
      // Ensure an anonymous session exists before reading.
      await api("/api/session", { method: "POST" });
      const saved = (await api("/api/saved")) as { items?: Record<string, unknown>[] };
      const collectionResponse = (await api("/api/collections")) as { items?: Record<string, unknown>[] };
      setItems((saved.items ?? []).map(fromServerRow));
      setCollections((collectionResponse.items ?? []).map(fromServerCollection));
      setMode("server");
      setError(null);
    } catch (failure) {
      // 503 = feature not configured → fall back to browser storage.
      if (failure instanceof ApiFailure && failure.status === 503) {
        setMode("local");
        loadLocal();
      } else {
        setError(failure instanceof Error ? failure.message : "Could not load saved repositories.");
        loadLocal();
      }
    } finally {
      setReady(true);
    }
  }, [databaseConfigured, loadLocal]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = React.useMemo<SavedContextValue>(() => {
    const server = mode === "server";

    return {
      ready,
      mode,
      items,
      collections,
      error,
      clearError: () => setError(null),
      isSaved: (fullName: string) =>
        server
          ? items.some((item) => item.fullName.toLowerCase() === fullName.toLowerCase())
          : isSavedLocally(fullName),

      async save(seed) {
        try {
          if (server) {
            const result = (await api("/api/saved", { method: "POST", body: JSON.stringify(seed) })) as {
              item?: Record<string, unknown>;
            };
            if (!result.item) throw new ApiFailure("The repository was not saved.", 500);
            await refresh();
          } else {
            saveLocally(seed);
            loadLocal();
          }
          setError(null);
          return true;
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : "Save failed.");
          return false;
        }
      },

      async toggle(seed) {
        const existing = items.find(
          (item) => item.fullName.toLowerCase() === seed.fullName.toLowerCase(),
        );
        if (existing) {
          const removed = server
            ? await (async () => {
                try {
                  await api(`/api/saved/${existing.id}`, { method: "DELETE" });
                  await refresh();
                  return true;
                } catch (failure) {
                  setError(failure instanceof Error ? failure.message : "Could not remove.");
                  return false;
                }
              })()
            : (removeLocally(existing.id), loadLocal(), true);
          return !removed;
        }
        const saved = await (async () => {
          try {
            if (server) {
              await api("/api/saved", { method: "POST", body: JSON.stringify(seed) });
              await refresh();
            } else {
              saveLocally(seed);
              loadLocal();
            }
            setError(null);
            return true;
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Save failed.");
            return false;
          }
        })();
        return saved;
      },

      async remove(id) {
        try {
          if (server) {
            await api(`/api/saved/${id}`, { method: "DELETE" });
            await refresh();
          } else {
            removeLocally(id);
            loadLocal();
          }
          return true;
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : "Could not remove.");
          return false;
        }
      },

      async updateNote(id, note) {
        try {
          if (server) {
            await api(`/api/saved/${id}`, { method: "PATCH", body: JSON.stringify({ note }) });
            await refresh();
          } else {
            updateLocalNote(id, note);
            loadLocal();
          }
          return true;
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : "Could not update the note.");
          return false;
        }
      },

      async moveToCollection(id, collectionId) {
        try {
          if (server) {
            const item = items.find((entry) => entry.id === id);
            if (!item) return false;
            if (item.collectionId) {
              await api(`/api/collections/${item.collectionId}/repositories`, {
                method: "DELETE",
                body: JSON.stringify({ savedRepositoryId: id }),
              });
            }
            if (collectionId) {
              await api(`/api/collections/${collectionId}/repositories`, {
                method: "POST",
                body: JSON.stringify({ savedRepositoryId: id }),
              });
            } else {
              await api(`/api/saved/${id}`, { method: "PATCH", body: JSON.stringify({ collectionId: null }) });
            }
            await refresh();
          } else {
            moveLocalToCollection(id, collectionId);
            loadLocal();
          }
          return true;
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : "Could not move the repository.");
          return false;
        }
      },

      async createCollection(name, description = null) {
        try {
          if (server) {
            const result = (await api("/api/collections", {
              method: "POST",
              body: JSON.stringify({ name, description }),
            })) as { item?: Record<string, unknown> };
            await refresh();
            return result.item ? fromServerCollection(result.item) : null;
          }
          const collection = createLocalCollection(name, description);
          loadLocal();
          return collection;
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : "Could not create the collection.");
          return null;
        }
      },

      async renameCollection(id, name, description) {
        try {
          if (server) {
            await api(`/api/collections/${id}`, { method: "PATCH", body: JSON.stringify({ name, description }) });
            await refresh();
          } else {
            renameLocalCollection(id, name, description);
            loadLocal();
          }
          return true;
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : "Could not rename the collection.");
          return false;
        }
      },

      async deleteCollection(id) {
        try {
          if (server) {
            await api(`/api/collections/${id}`, { method: "DELETE" });
            await refresh();
          } else {
            deleteLocalCollection(id);
            loadLocal();
          }
          return true;
        } catch (failure) {
          setError(failure instanceof Error ? failure.message : "Could not delete the collection.");
          return false;
        }
      },

      refresh,
      exportData: () => ({ saved: items, collections }),
    };
  }, [ready, mode, items, collections, error, refresh, loadLocal]);

  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>;
}

export function useSaved(): SavedContextValue {
  const context = React.useContext(SavedContext);
  if (!context) throw new Error("useSaved must be used inside <SavedProvider>");
  return context;
}
