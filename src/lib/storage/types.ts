/** Shared shapes for saved repositories and collections (server + browser). */

export interface SavedRepositoryItem {
  id: string;
  owner: string;
  name: string;
  fullName: string;
  url: string;
  description: string | null;
  language: string | null;
  stars: number;
  note: string | null;
  collectionId: string | null;
  createdAt: string;
}

export interface CollectionItem {
  id: string;
  name: string;
  description: string | null;
  count: number;
  createdAt: string;
}

export interface RepositorySeed {
  owner: string;
  name: string;
  fullName: string;
  url: string;
  description?: string | null;
  language?: string | null;
  stars?: number | null;
}

/** Normalises a server row into the shared client shape. */
export function fromServerRow(row: Record<string, unknown>): SavedRepositoryItem {
  return {
    id: String(row.id ?? ""),
    owner: String(row.owner ?? ""),
    name: String(row.name ?? ""),
    fullName: String(row.fullName ?? `${row.owner}/${row.name}`),
    url: String(row.url ?? `https://github.com/${row.owner}/${row.name}`),
    description: typeof row.description === "string" ? row.description : null,
    language: typeof row.language === "string" ? row.language : null,
    stars: typeof row.stars === "number" ? row.stars : 0,
    note: typeof row.note === "string" ? row.note : null,
    collectionId: typeof row.collectionId === "string" ? row.collectionId : null,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString(),
  };
}

export function fromServerCollection(row: Record<string, unknown>): CollectionItem {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    description: typeof row.description === "string" ? row.description : null,
    count: typeof row.count === "number" ? row.count : 0,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : new Date().toISOString(),
  };
}
