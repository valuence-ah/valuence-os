-- ── Agent Configs + Additional AI Configs ───────────────────────────────────
-- Run this in the Supabase SQL editor.

-- ── 1. New ai_config rows for LP + scoring features ─────────────────────────
INSERT INTO ai_configs (name, label, model, max_tokens, temperature, system_prompt, user_prompt)
VALUES
  ('lp_outreach_draft', 'LP Outreach Email',   'claude-opus-4-5-20251001', 800,  0.50, null, ''),
  ('lp_prep_brief',     'LP Meeting Brief',    'claude-opus-4-5-20251001', 1500, 0.30, null, ''),
  ('lp_meeting_summary','LP Meeting Summary',  'claude-haiku-4-5-20251001',800, 0.30, null, ''),
  ('sourcing_scorer',   'Sourcing Scorer',     'claude-haiku-4-5-20251001',2048, 0.10, null, ''),
  ('exa_research',      'Exa Company Research','claude-haiku-4-5-20251001',1024, 0.20, null, '')
ON CONFLICT (name) DO NOTHING;

-- ── 2. agent_configs table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_configs (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  agent_name  TEXT NOT NULL UNIQUE,
  label       TEXT NOT NULL,
  config      JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE agent_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth read agent_configs"   ON agent_configs FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth update agent_configs" ON agent_configs FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Auth insert agent_configs" ON agent_configs FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ── 3. Seed default agent configs ────────────────────────────────────────────
INSERT INTO agent_configs (agent_name, label, config) VALUES
(
  'exa',
  'Exa.ai Sourcing',
  '{
    "queries": [
      "cleantech startup seed funding 2025 energy storage carbon capture",
      "synthetic biology startup series A investment biotech 2025",
      "advanced materials startup funding graphene nanomaterials 2025",
      "deeptech startup pre-seed seed round cleantech techbio 2025",
      "green hydrogen fuel cell startup investment 2025",
      "biomanufacturing precision fermentation startup funding 2025",
      "climate tech startup seed series A investment 2025"
    ],
    "numResults": 8,
    "maxCharacters": 800,
    "lookbackDays": 90,
    "searchType": "neural",
    "includeDomains": [],
    "excludeDomains": [],
    "minScore": 0.45
  }'
),
(
  'arxiv',
  'arXiv Papers',
  '{
    "queries": [
      "cleantech energy storage carbon capture hydrogen fuel cell solar",
      "synthetic biology bioengineering biomanufacturing metabolic engineering",
      "advanced materials graphene perovskite nanomaterials solid-state battery"
    ],
    "maxResults": 25,
    "sortBy": "submittedDate",
    "sortOrder": "descending",
    "minScore": 0.45
  }'
),
(
  'sbir',
  'SBIR Grants',
  '{
    "keywords": [
      "clean energy",
      "synthetic biology",
      "advanced materials",
      "carbon capture",
      "battery",
      "hydrogen"
    ],
    "rowsPerKeyword": 15,
    "programs": ["SBIR", "STTR"],
    "yearOffset": 0,
    "minScore": 0.40
  }'
),
(
  'nsf',
  'NSF Grants',
  '{
    "keywords": [
      "clean energy",
      "synthetic biology",
      "advanced materials",
      "graphene",
      "bioprocess engineering"
    ],
    "resultsPerPage": 20,
    "lookbackMonths": 6,
    "minScore": 0.40
  }'
)
ON CONFLICT (agent_name) DO NOTHING;
