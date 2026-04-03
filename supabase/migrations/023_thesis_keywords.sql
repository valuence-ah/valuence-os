-- ─── Migration 023: Thesis Keywords + Feed Articles Intelligence Columns ────────

-- ── 1. Thesis Keywords table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS thesis_keywords (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keyword        TEXT NOT NULL UNIQUE,
  category       TEXT NOT NULL DEFAULT 'general',
  source         TEXT NOT NULL DEFAULT 'manual',
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  match_count    INTEGER NOT NULL DEFAULT 0,
  last_matched_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_thesis_kw_active
  ON thesis_keywords(active) WHERE active = TRUE;

-- Seed core thesis keywords
INSERT INTO thesis_keywords (keyword, category) VALUES
  ('biomining',              'cleantech'),
  ('bioleaching',            'cleantech'),
  ('perovskite',             'cleantech'),
  ('perovskite solar',       'cleantech'),
  ('green hydrogen',         'cleantech'),
  ('hydrogen catalyst',      'cleantech'),
  ('carbon capture',         'cleantech'),
  ('direct air capture',     'cleantech'),
  ('green steel',            'cleantech'),
  ('critical mineral',       'cleantech'),
  ('critical materials',     'cleantech'),
  ('rare earth',             'cleantech'),
  ('battery recycling',      'cleantech'),
  ('solid state battery',    'cleantech'),
  ('electrochemical',        'cleantech'),
  ('electrolysis',           'cleantech'),
  ('thermoelectric',         'cleantech'),
  ('synthetic biology',      'biotech'),
  ('synbio',                 'biotech'),
  ('cell-free synthesis',    'biotech'),
  ('cell-free protein',      'biotech'),
  ('directed evolution',     'biotech'),
  ('protein design',         'biotech'),
  ('computational protein',  'biotech'),
  ('biosensor',              'biotech'),
  ('CRISPR',                 'biotech'),
  ('microbiome engineering', 'biotech'),
  ('enzymatic recycling',    'biotech'),
  ('biomanufacturing',       'biotech'),
  ('fermentation platform',  'biotech'),
  ('biomineralization',      'biotech'),
  ('carbon nanotube',        'advanced_materials'),
  ('barrier coating',        'advanced_materials'),
  ('nanomaterial',           'advanced_materials'),
  ('metal foam',             'advanced_materials'),
  ('metal organic framework','advanced_materials'),
  ('MOF',                    'advanced_materials'),
  ('membrane separation',    'advanced_materials'),
  ('atomic layer deposition','advanced_materials'),
  ('plasma processing',      'advanced_materials'),
  ('materials informatics',  'enabling_tech'),
  ('molecular simulation',   'enabling_tech'),
  ('autonomous lab',         'enabling_tech'),
  ('high-throughput screening','enabling_tech'),
  ('lab-in-the-loop',        'enabling_tech')
ON CONFLICT (keyword) DO NOTHING;

-- RPC function to increment match counts
CREATE OR REPLACE FUNCTION increment_keyword_match(kw TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE thesis_keywords
  SET match_count    = match_count + 1,
      last_matched_at = NOW()
  WHERE LOWER(keyword) = LOWER(kw) AND active = TRUE;
END;
$$ LANGUAGE plpgsql;

-- ── 2. New intelligence columns on feed_articles ──────────────────────────────

ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS
  relevance_score INTEGER DEFAULT 0;

ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS
  ai_summary TEXT;

ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS
  ai_why_relevant TEXT;

ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS
  dismissed BOOLEAN DEFAULT FALSE;

-- Indexes for brief filtering
CREATE INDEX IF NOT EXISTS idx_articles_relevance_score
  ON feed_articles(relevance_score DESC);

CREATE INDEX IF NOT EXISTS idx_articles_dismissed
  ON feed_articles(dismissed);
