-- Reuse validated assistant messages without copying private prompts or answers
-- to a shared cache. Deleting a conversation also removes its cache entries.
ALTER TABLE ai_messages ADD COLUMN answer_cache_key text
  CHECK (answer_cache_key IS NULL OR (role = 'assistant' AND answer_cache_key ~ '^[a-f0-9]{64}$'));
CREATE INDEX ai_messages_answer_cache_idx ON ai_messages(answer_cache_key, created_at DESC) WHERE answer_cache_key IS NOT NULL;

-- Rotate expensive Watchtower probes among due watched repositories.
ALTER TABLE tracked_repositories ADD COLUMN last_watch_probe_at timestamptz;

-- Preserve existing notification choices; enable this category by default on new watches.
ALTER TABLE repository_watchlists ALTER COLUMN preferences SET DEFAULT
  '{"stars":true,"issues":true,"releases":true,"commits":true,"contributors":true,"dependencies":true,"advisories":true,"archived":true}'::jsonb;
