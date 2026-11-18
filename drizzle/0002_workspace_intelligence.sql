-- Preserves the anonymous-session identity system and all existing workspace data.
CREATE TABLE ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repository text NOT NULL, title text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_conversations_user_repo_updated_idx ON ai_conversations(user_id, repository, updated_at DESC);
CREATE TABLE ai_messages (
  id serial PRIMARY KEY, conversation_id uuid NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')), content text NOT NULL, citations jsonb NOT NULL DEFAULT '[]',
  confidence text CHECK (confidence IN ('confirmed','partial','insufficient')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_messages_conversation_id_idx ON ai_messages(conversation_id, id);
CREATE TABLE analysis_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL, model text NOT NULL, prompt_version text NOT NULL, state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','success','failed')),
  input_tokens integer, output_tokens integer, cost_micros integer, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX analysis_usage_created_idx ON analysis_usage(created_at);
CREATE INDEX analysis_usage_user_created_idx ON analysis_usage(user_id, created_at);
CREATE TABLE repository_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repository text NOT NULL, health_score integer CHECK (health_score BETWEEN 0 AND 100), evidence_coverage integer CHECK (evidence_coverage BETWEEN 0 AND 100),
  viewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX repository_analyses_user_repo_idx ON repository_analyses(user_id, repository);
CREATE INDEX repository_analyses_user_viewed_idx ON repository_analyses(user_id, viewed_at DESC);
