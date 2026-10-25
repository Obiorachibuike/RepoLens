-- RepoLens initial schema (PostgreSQL)
-- Applied by `npm run db:migrate` (scripts/migrate.mjs) or any SQL runner.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  github_id text,
  username text,
  anonymous_key text NOT NULL,
  preferences jsonb NOT NULL DEFAULT '{"theme":"dark","defaultMode":"repository","defaultSort":"best-match","defaultPerPage":20}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_anonymous_key_idx ON users (anonymous_key);
CREATE UNIQUE INDEX IF NOT EXISTS users_github_id_idx ON users (github_id);

CREATE TABLE IF NOT EXISTS collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS collections_user_name_idx ON collections (user_id, name);

CREATE TABLE IF NOT EXISTS saved_repositories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  owner text NOT NULL,
  name text NOT NULL,
  full_name text NOT NULL,
  url text NOT NULL,
  description text,
  language text,
  stars integer NOT NULL DEFAULT 0,
  note text,
  collection_id uuid REFERENCES collections (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS saved_repositories_user_full_name_idx ON saved_repositories (user_id, full_name);
CREATE INDEX IF NOT EXISTS saved_repositories_user_created_idx ON saved_repositories (user_id, created_at);
CREATE INDEX IF NOT EXISTS saved_repositories_collection_idx ON saved_repositories (collection_id);

CREATE TABLE IF NOT EXISTS collection_repositories (
  collection_id uuid NOT NULL REFERENCES collections (id) ON DELETE CASCADE,
  saved_repository_id uuid NOT NULL REFERENCES saved_repositories (id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_id, saved_repository_id)
);

CREATE TABLE IF NOT EXISTS saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  query text NOT NULL,
  mode text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_count integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_searches_user_idx ON saved_searches (user_id, created_at);

CREATE TABLE IF NOT EXISTS search_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  query text NOT NULL,
  mode text NOT NULL,
  sort text NOT NULL DEFAULT 'best-match',
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_count integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS search_history_user_created_idx ON search_history (user_id, created_at);
