import {
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  index,
} from "drizzle-orm/pg-core";
import type { SearchMode, SortOption } from "@/lib/validation/search";

export interface UserPreferences {
  theme: "dark" | "light" | "system";
  defaultMode: SearchMode;
  defaultSort: SortOption;
  defaultPerPage: number;
}

export const defaultPreferences: UserPreferences = {
  theme: "dark",
  defaultMode: "repository",
  defaultSort: "best-match",
  defaultPerPage: 20,
};

/**
 * Users are anonymous by default: a random key stored in an httpOnly cookie
 * identifies the visitor. `githubId` is reserved for optional OAuth sign-in.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    githubId: text("github_id"),
    username: text("username"),
    anonymousKey: text("anonymous_key").notNull(),
    preferences: jsonb("preferences").$type<UserPreferences>().notNull().default(defaultPreferences),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("users_anonymous_key_idx").on(table.anonymousKey),
    uniqueIndex("users_github_id_idx").on(table.githubId),
  ],
);

export const savedRepositories = pgTable(
  "saved_repositories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    fullName: text("full_name").notNull(),
    url: text("url").notNull(),
    description: text("description"),
    language: text("language"),
    stars: integer("stars").notNull().default(0),
    note: text("note"),
    collectionId: uuid("collection_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("saved_repositories_user_full_name_idx").on(table.userId, table.fullName),
    index("saved_repositories_user_created_idx").on(table.userId, table.createdAt),
  ],
);

export const collections = pgTable(
  "collections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("collections_user_name_idx").on(table.userId, table.name)],
);

export const collectionRepositories = pgTable(
  "collection_repositories",
  {
    collectionId: uuid("collection_id")
      .notNull()
      .references(() => collections.id, { onDelete: "cascade" }),
    savedRepositoryId: uuid("saved_repository_id")
      .notNull()
      .references(() => savedRepositories.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.collectionId, table.savedRepositoryId] })],
);

export interface SavedSearchFilters {
  language?: string | null;
  topics?: string[];
  minStars?: number | null;
  minForks?: number | null;
  pushedAfter?: string | null;
  license?: string | null;
  archived?: string | null;
}

export const savedSearches = pgTable(
  "saved_searches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    mode: text("mode").$type<SearchMode>().notNull(),
    filters: jsonb("filters").$type<SavedSearchFilters>().notNull().default({}),
    resultCount: integer("result_count"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("saved_searches_user_idx").on(table.userId, table.createdAt)],
);

export const searchHistory = pgTable(
  "search_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    query: text("query").notNull(),
    mode: text("mode").$type<SearchMode>().notNull(),
    sort: text("sort").$type<SortOption>().notNull().default("best-match"),
    filters: jsonb("filters").$type<SavedSearchFilters>().notNull().default({}),
    resultCount: integer("result_count"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("search_history_user_created_idx").on(table.userId, table.createdAt)],
);

export type UserRow = typeof users.$inferSelect;
export type SavedRepositoryRow = typeof savedRepositories.$inferSelect;
export type CollectionRow = typeof collections.$inferSelect;
export type SearchHistoryRow = typeof searchHistory.$inferSelect;
export type SavedSearchRow = typeof savedSearches.$inferSelect;
