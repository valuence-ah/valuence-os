-- ── 020: Fund portfolio/pipeline overlap cache ─────────────────────────────────
-- Persists detected overlap between a fund's known investments and Valuence's
-- pipeline/portfolio, so it survives page refreshes.

CREATE TABLE IF NOT EXISTS fund_portfolio_overlap (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id             uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  portfolio_company   text        NOT NULL,   -- Name of the overlapping company
  role                text        NOT NULL DEFAULT 'Co-investor',  -- 'Lead investor' | 'Co-investor'
  confidence          text        NOT NULL DEFAULT 'medium',       -- 'high' | 'medium' | 'low'
  match_method        text        NOT NULL DEFAULT 'exact',        -- 'exact' | 'contains' | 'fuzzy'
  initials            text        NOT NULL DEFAULT '',
  detected_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fund_id, portfolio_company)
);

-- RLS: readable + writable by authenticated users
ALTER TABLE fund_portfolio_overlap ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'fund_portfolio_overlap'
      AND policyname = 'Authenticated users can read fund portfolio overlap'
  ) THEN
    CREATE POLICY "Authenticated users can read fund portfolio overlap"
      ON fund_portfolio_overlap FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'fund_portfolio_overlap'
      AND policyname = 'Authenticated users can write fund portfolio overlap'
  ) THEN
    CREATE POLICY "Authenticated users can write fund portfolio overlap"
      ON fund_portfolio_overlap FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fund_portfolio_overlap_fund_id
  ON fund_portfolio_overlap(fund_id);
