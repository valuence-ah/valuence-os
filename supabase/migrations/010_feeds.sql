-- ─── News/RSS Feed Sources and Articles ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS feed_sources (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  website_url  TEXT NOT NULL,
  feed_url     TEXT,
  type         TEXT NOT NULL DEFAULT 'rss', -- 'rss' | 'atom' | 'website'
  keywords     TEXT[] DEFAULT '{}',
  is_active    BOOLEAN DEFAULT TRUE,
  last_fetched_at TIMESTAMPTZ,
  article_count INT DEFAULT 0,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feed_articles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   UUID REFERENCES feed_sources(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  url         TEXT NOT NULL UNIQUE,
  summary     TEXT,
  content     TEXT,
  published_at TIMESTAMPTZ,
  author      TEXT,
  tags        TEXT[] DEFAULT '{}',
  relevance_score FLOAT,
  is_read     BOOLEAN DEFAULT FALSE,
  is_starred  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS feed_articles_source_id_idx ON feed_articles(source_id);
CREATE INDEX IF NOT EXISTS feed_articles_published_at_idx ON feed_articles(published_at DESC);
CREATE INDEX IF NOT EXISTS feed_articles_is_read_idx ON feed_articles(is_read);
