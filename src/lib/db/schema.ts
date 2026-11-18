import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
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

export const trackedRepositories = pgTable("tracked_repositories", {
  id: uuid("id").primaryKey().defaultRandom(),
  githubRepositoryId: bigint("github_repository_id", { mode: "number" }).notNull(),
  owner: text("owner").notNull(),
  name: text("name").notNull(),
  fullName: text("full_name").notNull(),
  description: text("description"),
  avatarUrl: text("avatar_url"),
  primaryLanguage: text("primary_language"),
  repositoryUrl: text("repository_url").notNull(),
  topics: jsonb("topics").$type<string[]>().notNull().default([]),
  currentStars: integer("current_stars").notNull(),
  currentForks: integer("current_forks").notNull(),
  openIssues: integer("open_issues").notNull(),
  watchers: integer("watchers"),
  archived: boolean("archived").notNull().default(false),
  githubCreatedAt: timestamp("github_created_at", { withTimezone: true }),
  githubUpdatedAt: timestamp("github_updated_at", { withTimezone: true }),
  pushedAt: timestamp("pushed_at", { withTimezone: true }),
  firstTrackedAt: timestamp("first_tracked_at", { withTimezone: true }).notNull().defaultNow(),
  lastTrackedAt: timestamp("last_tracked_at", { withTimezone: true }),
  nextCheckAt: timestamp("next_check_at", { withTimezone: true }).notNull().defaultNow(),
  trackingStatus: text("tracking_status").$type<"active" | "unavailable">().notNull().default("active"),
  priority: integer("priority").notNull().default(1),
  failures: integer("failures").notNull().default(0),
}, (t) => [
  uniqueIndex("tracked_repositories_github_id_idx").on(t.githubRepositoryId),
  index("tracked_repositories_due_idx").on(t.trackingStatus, t.nextCheckAt),
  index("tracked_repositories_language_idx").on(sql`lower(${t.primaryLanguage})`),
]);

export interface WatchSignals {
  head?: string;
  release?: string;
  contributorSample?: string;
  manifestFingerprint?: string;
}

export const repositorySnapshots = pgTable("repository_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  trackedRepositoryId: uuid("tracked_repository_id").notNull().references(() => trackedRepositories.id, { onDelete: "cascade" }),
  stars: integer("stars").notNull(),
  forks: integer("forks").notNull(),
  openIssues: integer("open_issues").notNull(),
  watchers: integer("watchers"),
  archived: boolean("archived").notNull(),
  signals: jsonb("signals").$type<WatchSignals>().notNull().default({}),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
  collectionSlot: timestamp("collection_slot", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("repository_snapshots_repo_captured_idx").on(t.trackedRepositoryId, t.capturedAt),
  uniqueIndex("repository_snapshots_repo_slot_idx").on(t.trackedRepositoryId, t.collectionSlot),
  index("repository_snapshots_captured_idx").on(t.capturedAt),
]);

export const scheduledJobRuns = pgTable("scheduled_job_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  job: text("job").notNull(),
  state: text("state").$type<"running" | "success" | "partial" | "failed" | "rate_limited">().notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  collected: integer("collected").notNull().default(0),
  failed: integer("failed").notNull().default(0),
  deferred: integer("deferred").notNull().default(0),
  reason: text("reason"),
}, (t) => [index("scheduled_job_runs_job_started_idx").on(t.job, t.startedAt)]);

export const scheduledJobLeases = pgTable("scheduled_job_leases", {
  job: text("job").primaryKey(),
  owner: uuid("owner").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export interface WatchPreferences {
  stars: boolean; issues: boolean; releases: boolean; commits: boolean; contributors: boolean; dependencies: boolean; archived: boolean;
}
export const defaultWatchPreferences: WatchPreferences = { stars: true, issues: true, commits: true, releases: true, contributors: true, dependencies: true, archived: true };
export const repositoryWatchlists = pgTable("repository_watchlists", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  trackedRepositoryId: uuid("tracked_repository_id").notNull().references(() => trackedRepositories.id, { onDelete: "cascade" }),
  preferences: jsonb("preferences").$type<WatchPreferences>().notNull().default(defaultWatchPreferences),
  seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("repository_watchlists_owner_repo_idx").on(t.userId, t.trackedRepositoryId), index("repository_watchlists_repo_idx").on(t.trackedRepositoryId), index("repository_watchlists_owner_created_idx").on(t.userId, t.createdAt)]);
