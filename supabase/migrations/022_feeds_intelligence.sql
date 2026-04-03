-- ─── Migration 022: Feeds Intelligence Upgrade ────────────────────────────────
-- Adds AI categorization columns to feed_articles, bucket_affinity to
-- feed_sources, and creates the feed_watchlist table.

-- ── 1. New intelligence columns on feed_articles ──────────────────────────────

ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS
  bucket TEXT DEFAULT 'uncategorized'
  CHECK (bucket IN ('fund_raise', 'startup_round', 'ma_partnership', 'uncategorized'));

ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS
  sectors TEXT[] DEFAULT '{}';

ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS
  deal_stage TEXT;

ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS
  deal_amount TEXT;

ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS
  deal_amount_usd NUMERIC;

ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS
  mentioned_companies TEXT[] DEFAULT '{}';

ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS
  mentioned_investors TEXT[] DEFAULT '{}';

ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS
  matched_company_ids UUID[] DEFAULT '{}';

ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS
  thesis_keywords TEXT[] DEFAULT '{}';

ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS
  relevance_tags TEXT[] DEFAULT '{}';

ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS
  ai_categorized BOOLEAN DEFAULT FALSE;

ALTER TABLE feed_articles ADD COLUMN IF NOT EXISTS
  saved BOOLEAN DEFAULT FALSE;

-- ── 2. Indexes for fast filtering ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_articles_bucket     ON feed_articles(bucket);
CREATE INDEX IF NOT EXISTS idx_articles_ai_cat     ON feed_articles(ai_categorized);
CREATE INDEX IF NOT EXISTS idx_articles_deal_usd   ON feed_articles(deal_amount_usd DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_articles_sectors    ON feed_articles USING gin(sectors);
CREATE INDEX IF NOT EXISTS idx_articles_thesis     ON feed_articles USING gin(thesis_keywords);
CREATE INDEX IF NOT EXISTS idx_articles_relevance  ON feed_articles USING gin(relevance_tags);

-- ── 3. bucket_affinity on feed_sources ────────────────────────────────────────

ALTER TABLE feed_sources ADD COLUMN IF NOT EXISTS
  bucket_affinity TEXT DEFAULT 'uncategorized';

-- Tag existing + seeded sources with bucket affinity
-- Fund launches + raises
UPDATE feed_sources SET bucket_affinity = 'fund_raise'     WHERE name ILIKE '%vcwire%';
UPDATE feed_sources SET bucket_affinity = 'fund_raise'     WHERE name ILIKE '%crunchbase news%';
UPDATE feed_sources SET bucket_affinity = 'fund_raise'     WHERE name ILIKE '%pitchbook%';
UPDATE feed_sources SET bucket_affinity = 'fund_raise'     WHERE name ILIKE '%nvca%';
UPDATE feed_sources SET bucket_affinity = 'fund_raise'     WHERE name ILIKE '%pe insights%';
UPDATE feed_sources SET bucket_affinity = 'fund_raise'     WHERE name ILIKE '%life sci vc%';
UPDATE feed_sources SET bucket_affinity = 'fund_raise'     WHERE name ILIKE '%fierce biotech (vc)%';
-- Startup rounds
UPDATE feed_sources SET bucket_affinity = 'startup_round'  WHERE name ILIKE '%finsmes%';
UPDATE feed_sources SET bucket_affinity = 'startup_round'  WHERE name ILIKE '%techcrunch%';
UPDATE feed_sources SET bucket_affinity = 'startup_round'  WHERE name ILIKE '%sifted%';
UPDATE feed_sources SET bucket_affinity = 'startup_round'  WHERE name ILIKE '%ctvc%';
UPDATE feed_sources SET bucket_affinity = 'startup_round'  WHERE name ILIKE '%synbiobeta%';
UPDATE feed_sources SET bucket_affinity = 'startup_round'  WHERE name ILIKE '%greenbiz%';
UPDATE feed_sources SET bucket_affinity = 'startup_round'  WHERE name ILIKE '%cleantech group%';
UPDATE feed_sources SET bucket_affinity = 'startup_round'  WHERE name ILIKE '%fierce biotech%' AND name NOT ILIKE '%deals%' AND name NOT ILIKE '%(vc)%';
UPDATE feed_sources SET bucket_affinity = 'startup_round'  WHERE name ILIKE '%endpoints%';
UPDATE feed_sources SET bucket_affinity = 'startup_round'  WHERE name ILIKE '%labiotech%';
UPDATE feed_sources SET bucket_affinity = 'startup_round'  WHERE name ILIKE '%genetic eng%' OR name ILIKE '%gen (%';
UPDATE feed_sources SET bucket_affinity = 'startup_round'  WHERE name ILIKE '%biospace%';
UPDATE feed_sources SET bucket_affinity = 'startup_round'  WHERE name ILIKE '%stat news%';
UPDATE feed_sources SET bucket_affinity = 'startup_round'  WHERE name ILIKE '%nature biotech%';
-- M&A + partnerships
UPDATE feed_sources SET bucket_affinity = 'ma_partnership' WHERE name ILIKE '%crunchbase m&a%' OR name ILIKE '%crunchbase m%a%';
UPDATE feed_sources SET bucket_affinity = 'ma_partnership' WHERE name ILIKE '%pr newswire%';
UPDATE feed_sources SET bucket_affinity = 'ma_partnership' WHERE name ILIKE '%gcv%' OR name ILIKE '%global corporate%';
UPDATE feed_sources SET bucket_affinity = 'ma_partnership' WHERE name ILIKE '%fierce biotech (deals)%';
UPDATE feed_sources SET bucket_affinity = 'ma_partnership' WHERE name ILIKE '%fierce pharma%';
UPDATE feed_sources SET bucket_affinity = 'ma_partnership' WHERE name ILIKE '%biopharma dive%';

-- ── 4. Watchlist table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feed_watchlist (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'fund'
             CHECK (type IN ('fund', 'accelerator', 'corporate', 'keyword')),
  keywords   TEXT[] DEFAULT '{}',
  notify     BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Valuence's watchlist
INSERT INTO feed_watchlist (name, type, keywords) VALUES
  -- Original defaults
  ('SOSV',                   'fund',        ARRAY['SOSV', 'HAX']),
  ('Breakthrough Energy',    'fund',        ARRAY['Breakthrough Energy', 'BEV', 'Breakthrough Energy Ventures']),
  ('Lux Capital',            'fund',        ARRAY['Lux Capital']),
  ('DCVC',                   'fund',        ARRAY['DCVC', 'Data Collective']),
  ('Third Derivative',       'accelerator', ARRAY['Third Derivative', 'D3']),
  ('Clean Energy Ventures',  'fund',        ARRAY['Clean Energy Ventures', 'CEV']),
  ('Novozymes',              'corporate',   ARRAY['Novozymes']),
  ('Ginkgo Bioworks',        'corporate',   ARRAY['Ginkgo Bioworks', 'Ginkgo']),
  -- Extended watchlist
  ('BASF Ventures',          'corporate',   ARRAY['BASF Ventures', 'BASF']),
  ('Dow Ventures',           'corporate',   ARRAY['Dow Ventures', 'Dow Chemical']),
  ('IndieBio',               'accelerator', ARRAY['IndieBio']),
  ('Prelude Ventures',       'fund',        ARRAY['Prelude Ventures', 'Prelude']),
  ('Congruent Ventures',     'fund',        ARRAY['Congruent Ventures', 'Congruent']),
  ('Fifty Years',            'fund',        ARRAY['Fifty Years']),
  ('Synthesis Capital',      'fund',        ARRAY['Synthesis Capital']),
  ('Toyota Ventures',        'corporate',   ARRAY['Toyota Ventures', 'Toyota']),
  ('Dimension',              'fund',        ARRAY['Dimension', 'Dimension Ventures']),
  ('Harpoon Ventures',       'fund',        ARRAY['Harpoon Ventures', 'Harpoon']),
  ('a16z',                   'fund',        ARRAY['a16z', 'Andreessen Horowitz', 'Andreessen']),
  ('Antler',                 'accelerator', ARRAY['Antler']),
  ('Sequoia',                'fund',        ARRAY['Sequoia', 'Sequoia Capital']),
  ('500 Global',             'fund',        ARRAY['500 Global', '500 Startups']),
  ('5AM Ventures',           'fund',        ARRAY['5AM Ventures', '5AM', '5 AM Ventures']),
  ('Aera VC',                'fund',        ARRAY['Aera VC', 'Aera']),
  ('Alix Ventures',          'fund',        ARRAY['Alix Ventures', 'Alix']),
  ('Bain Capital Ventures',  'fund',        ARRAY['Bain Capital Ventures', 'Bain Capital', 'BCV']),
  ('Eclipse Ventures',       'fund',        ARRAY['Eclipse Ventures', 'Eclipse']),
  ('Energy Impact Partners', 'fund',        ARRAY['Energy Impact Partners', 'EIP']),
  ('First Round Capital',    'fund',        ARRAY['First Round Capital', 'First Round']),
  ('Gigafund',               'fund',        ARRAY['Gigafund']),
  ('Activate.org',           'accelerator', ARRAY['Activate', 'Activate.org', 'Activate Fellowship']),
  ('In-Q-Tel',               'corporate',   ARRAY['In-Q-Tel', 'IQT']),
  ('Lowercarbon Capital',    'fund',        ARRAY['Lowercarbon', 'Lowercarbon Capital']),
  ('Playground Global',      'fund',        ARRAY['Playground Global', 'Playground']),
  ('Spark Capital',          'fund',        ARRAY['Spark Capital', 'Spark']),
  ('Union Square Ventures',  'fund',        ARRAY['Union Square Ventures', 'USV']),
  ('Voyager',                'fund',        ARRAY['Voyager', 'Voyager Capital']),
  ('Y Combinator',           'accelerator', ARRAY['Y Combinator', 'YC']),
  ('3CC',                    'fund',        ARRAY['3CC']),
  ('ARCH Venture Partners',  'fund',        ARRAY['ARCH Venture Partners', 'ARCH Venture', 'ARCH']),
  ('Atlas Venture',          'fund',        ARRAY['Atlas Venture', 'Atlas']),
  ('BoxOne Ventures',        'fund',        ARRAY['BoxOne Ventures', 'BoxOne']),
  ('Flagship Pioneering',    'fund',        ARRAY['Flagship Pioneering', 'Flagship'])
ON CONFLICT DO NOTHING;
