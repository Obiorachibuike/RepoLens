import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDatabase } from "./client";
import {
  collectionRepositories,
  collections,
  defaultPreferences,
  savedRepositories,
  savedSearches,
  searchHistory,
  users,
  type SavedSearchFilters,
  type UserPreferences,
} from "./schema";
import type { SearchMode, SortOption } from "@/lib/validation/search";

/**
 * Data access for persisted features.
 *
 * Every function is scoped by `userId` and returns `null` when PostgreSQL is
 * not configured, so routes can report "not configured" instead of failing.
 * Ownership is enforced here *and* in the SQL WHERE clauses — an id belonging
 * to another user simply matches nothing.
 */

function db() {
  return getDatabase();
}

/* ------------------------------- Saved repos ----------------------------- */

export interface SaveRepositoryInput {
  owner: string;
  name: string;
  fullName: string;
  url: string;
  description?: string | null;
  language?: string | null;
  stars?: number | null;
  note?: string | null;
  collectionId?: string | null;
}

export async function listSaved(userId: string) {
  const database = db();
  if (!database) return null;
  return database
    .select()
    .from(savedRepositories)
    .where(eq(savedRepositories.userId, userId))
    .orderBy(desc(savedRepositories.createdAt));
}

export async function saveRepository(userId: string, input: SaveRepositoryInput) {
  const database = db();
  if (!database) return null;
  const [row] = await database
    .insert(savedRepositories)
    .values({
      userId,
      owner: input.owner,
      name: input.name,
      fullName: input.fullName,
      url: input.url,
      description: input.description ?? null,
      language: input.language ?? null,
      stars: input.stars ?? 0,
      note: input.note ?? null,
      collectionId: input.collectionId ?? null,
    })
    .onConflictDoUpdate({
      target: [savedRepositories.userId, savedRepositories.fullName],
      set: {
        note: input.note ?? null,
        description: input.description ?? null,
        language: input.language ?? null,
        stars: input.stars ?? 0,
        url: input.url,
      },
    })
    .returning();
  return row ?? null;
}

export async function deleteSaved(userId: string, id: string): Promise<boolean> {
  const database = db();
  if (!database) return false;
  const rows = await database
    .delete(savedRepositories)
    .where(and(eq(savedRepositories.id, id), eq(savedRepositories.userId, userId)))
    .returning({ id: savedRepositories.id });
  return rows.length > 0;
}

export async function updateSaved(
  userId: string,
  id: string,
  patch: { note?: string | null; collectionId?: string | null },
) {
  const database = db();
  if (!database) return null;
  const [row] = await database
    .update(savedRepositories)
    .set(patch)
    .where(and(eq(savedRepositories.id, id), eq(savedRepositories.userId, userId)))
    .returning();
  return row ?? null;
}

/* ------------------------------- Collections ----------------------------- */

export async function listCollections(userId: string) {
  const database = db();
  if (!database) return null;
  const rows = await database
    .select({
      id: collections.id,
      name: collections.name,
      description: collections.description,
      createdAt: collections.createdAt,
      updatedAt: collections.updatedAt,
      count: sql<number>`count(${collectionRepositories.savedRepositoryId})::int`,
    })
    .from(collections)
    .leftJoin(collectionRepositories, eq(collectionRepositories.collectionId, collections.id))
    .where(eq(collections.userId, userId))
    .groupBy(collections.id)
    .orderBy(collections.createdAt);
  return rows;
}

export async function createCollection(userId: string, name: string, description?: string | null) {
  const database = db();
  if (!database) return null;
  const [row] = await database
    .insert(collections)
    .values({ userId, name, description: description ?? null })
    .returning();
  return row ?? null;
}

export async function updateCollection(
  userId: string,
  id: string,
  patch: { name?: string; description?: string | null },
) {
  const database = db();
  if (!database) return null;
  const [row] = await database
    .update(collections)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(collections.id, id), eq(collections.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteCollection(userId: string, id: string): Promise<boolean> {
  const database = db();
  if (!database) return false;
  const rows = await database
    .delete(collections)
    .where(and(eq(collections.id, id), eq(collections.userId, userId)))
    .returning({ id: collections.id });
  return rows.length > 0;
}

export async function addToCollection(userId: string, collectionId: string, savedRepositoryId: string) {
  const database = db();
  if (!database) return null;
  // Verify both rows belong to this user before linking them.
  const [collection] = await database
    .select({ id: collections.id })
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
    .limit(1);
  const [saved] = await database
    .select({ id: savedRepositories.id })
    .from(savedRepositories)
    .where(and(eq(savedRepositories.id, savedRepositoryId), eq(savedRepositories.userId, userId)))
    .limit(1);
  if (!collection || !saved) return null;

  await database
    .insert(collectionRepositories)
    .values({ collectionId, savedRepositoryId })
    .onConflictDoNothing();
  await database
    .update(savedRepositories)
    .set({ collectionId })
    .where(eq(savedRepositories.id, savedRepositoryId));
  return { collectionId, savedRepositoryId };
}

export async function removeFromCollection(userId: string, collectionId: string, savedRepositoryId: string) {
  const database = db();
  if (!database) return false;
  const [collection] = await database
    .select({ id: collections.id })
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
    .limit(1);
  if (!collection) return false;
  await database
    .delete(collectionRepositories)
    .where(
      and(
        eq(collectionRepositories.collectionId, collectionId),
        eq(collectionRepositories.savedRepositoryId, savedRepositoryId),
      ),
    );
  await database
    .update(savedRepositories)
    .set({ collectionId: null })
    .where(
      and(eq(savedRepositories.id, savedRepositoryId), eq(savedRepositories.userId, userId)),
    );
  return true;
}

export async function listCollectionRepositories(userId: string, collectionId: string) {
  const database = db();
  if (!database) return null;
  const [collection] = await database
    .select()
    .from(collections)
    .where(and(eq(collections.id, collectionId), eq(collections.userId, userId)))
    .limit(1);
  if (!collection) return null;
  return database
    .select()
    .from(savedRepositories)
    .where(and(eq(savedRepositories.userId, userId), eq(savedRepositories.collectionId, collectionId)))
    .orderBy(desc(savedRepositories.createdAt));
}

/* -------------------------------- History -------------------------------- */

export async function listHistory(userId: string, limit = 30) {
  const database = db();
  if (!database) return null;
  return database
    .select()
    .from(searchHistory)
    .where(eq(searchHistory.userId, userId))
    .orderBy(desc(searchHistory.createdAt))
    .limit(Math.min(100, Math.max(1, limit)));
}

export async function addHistory(
  userId: string,
  entry: { query: string; mode: SearchMode; sort: SortOption; filters: SavedSearchFilters; resultCount?: number | null },
) {
  const database = db();
  if (!database) return null;
  const [row] = await database
    .insert(searchHistory)
    .values({
      userId,
      query: entry.query.slice(0, 400),
      mode: entry.mode,
      sort: entry.sort,
      filters: entry.filters,
      resultCount: entry.resultCount ?? null,
    })
    .returning();
  return row ?? null;
}

export async function clearHistory(userId: string): Promise<number> {
  const database = db();
  if (!database) return 0;
  const rows = await database
    .delete(searchHistory)
    .where(eq(searchHistory.userId, userId))
    .returning({ id: searchHistory.id });
  return rows.length;
}

export async function listSavedSearches(userId: string, limit = 20) {
  const database = db();
  if (!database) return null;
  return database
    .select()
    .from(savedSearches)
    .where(eq(savedSearches.userId, userId))
    .orderBy(desc(savedSearches.createdAt))
    .limit(Math.min(100, Math.max(1, limit)));
}

export async function pinSearch(
  userId: string,
  entry: { query: string; mode: SearchMode; filters: SavedSearchFilters; resultCount?: number | null },
) {
  const database = db();
  if (!database) return null;
  const [row] = await database
    .insert(savedSearches)
    .values({
      userId,
      query: entry.query.slice(0, 400),
      mode: entry.mode,
      filters: entry.filters,
      resultCount: entry.resultCount ?? null,
    })
    .returning();
  return row ?? null;
}

/* ------------------------------ Preferences ------------------------------ */

export async function getPreferences(userId: string): Promise<UserPreferences> {
  const database = db();
  if (!database) return defaultPreferences;
  const [row] = await database
    .select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.preferences ?? defaultPreferences;
}

export async function updatePreferences(userId: string, preferences: Partial<UserPreferences>) {
  const database = db();
  if (!database) return null;
  const current = await getPreferences(userId);
  const [row] = await database
    .update(users)
    .set({ preferences: { ...current, ...preferences }, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning({ preferences: users.preferences });
  return row?.preferences ?? { ...current, ...preferences };
}
