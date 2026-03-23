-- ── AI Config table ────────────────────────────────────────────────────────────
-- Stores editable Claude parameters and prompts for each AI feature.

CREATE TABLE IF NOT EXISTS ai_configs (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  model       TEXT NOT NULL DEFAULT 'claude-opus-4-5',
  max_tokens  INTEGER NOT NULL DEFAULT 2000,
  temperature NUMERIC(3,2) NOT NULL DEFAULT 0.30,
  system_prompt TEXT,
  user_prompt TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_by  UUID REFERENCES profiles(id)
);

ALTER TABLE ai_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read ai_configs"   ON ai_configs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth update ai_configs" ON ai_configs FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Auth insert ai_configs" ON ai_configs FOR INSERT WITH CHECK (auth.role() = 'authenticated');
