-- Additive: no changes to existing user, save, collection or history rows.
CREATE TABLE tracked_repositories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  github_repository_id bigint NOT NULL,
  owner text NOT NULL, name text NOT NULL, full_name text NOT NULL,
  description text, avatar_url text, primary_language text, repository_url text NOT NULL,
  topics jsonb NOT NULL DEFAULT '[]',
  current_stars integer NOT NULL CHECK (current_stars >= 0),
  current_forks integer NOT NULL CHECK (current_forks >= 0),
  open_issues integer NOT NULL CHECK (open_issues >= 0),
  watchers integer, archived boolean NOT NULL DEFAULT false,
  github_created_at timestamptz, github_updated_at timestamptz, pushed_at timestamptz,
  first_tracked_at timestamptz NOT NULL DEFAULT now(), last_tracked_at timestamptz,
  next_check_at timestamptz NOT NULL DEFAULT now(),
  tracking_status text NOT NULL DEFAULT 'active' CHECK (tracking_status IN ('active', 'unavailable')),
  priority integer NOT NULL DEFAULT 1, failures integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX tracked_repositories_github_id_idx ON tracked_repositories (github_repository_id);
CREATE INDEX tracked_repositories_due_idx ON tracked_repositories (tracking_status, next_check_at);
CREATE INDEX tracked_repositories_language_idx ON tracked_repositories (lower(primary_language));

CREATE TABLE repository_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracked_repository_id uuid NOT NULL REFERENCES tracked_repositories(id) ON DELETE CASCADE,
  stars integer NOT NULL CHECK (stars >= 0), forks integer NOT NULL CHECK (forks >= 0),
  open_issues integer NOT NULL CHECK (open_issues >= 0), watchers integer, archived boolean NOT NULL,
  signals jsonb NOT NULL DEFAULT '{}',
  captured_at timestamptz NOT NULL, collection_slot timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX repository_snapshots_repo_captured_idx ON repository_snapshots (tracked_repository_id, captured_at);
CREATE UNIQUE INDEX repository_snapshots_repo_slot_idx ON repository_snapshots (tracked_repository_id, collection_slot);
CREATE INDEX repository_snapshots_captured_idx ON repository_snapshots (captured_at);

CREATE TABLE scheduled_job_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job text NOT NULL,
  state text NOT NULL CHECK (state IN ('running', 'success', 'partial', 'failed', 'rate_limited')),
  started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
  collected integer NOT NULL DEFAULT 0, failed integer NOT NULL DEFAULT 0, deferred integer NOT NULL DEFAULT 0,
  reason text
);
CREATE INDEX scheduled_job_runs_job_started_idx ON scheduled_job_runs (job, started_at DESC);
CREATE TABLE scheduled_job_leases (
  job text PRIMARY KEY, owner uuid NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE repository_watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tracked_repository_id uuid NOT NULL REFERENCES tracked_repositories(id) ON DELETE CASCADE,
  preferences jsonb NOT NULL DEFAULT '{"stars":true,"issues":true,"releases":true,"commits":true,"contributors":true,"dependencies":true,"advisories":true,"archived":true}',
  seen_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX repository_watchlists_owner_repo_idx ON repository_watchlists(user_id, tracked_repository_id);
CREATE INDEX repository_watchlists_repo_idx ON repository_watchlists(tracked_repository_id);
CREATE INDEX repository_watchlists_owner_created_idx ON repository_watchlists(user_id, created_at);
