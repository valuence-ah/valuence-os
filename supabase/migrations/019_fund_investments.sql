-- ── 019: Fund investments cache ────────────────────────────────────────────────
-- Persists Claude-generated recent investments per fund so they survive page
-- refreshes and can be shown without regenerating on every panel open.

CREATE TABLE IF NOT EXISTS fund_investments (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id      uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  company_name text        NOT NULL,
  round        text        NOT NULL DEFAULT '',
  sector       text        NOT NULL DEFAULT '',
  year         text        NOT NULL DEFAULT '',
  source       text        NOT NULL DEFAULT 'ai_generated', -- 'ai_generated' | 'manual'
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fund_id, company_name)
);

-- RLS: fund investments are readable by authenticated users (internal tool)
ALTER TABLE fund_investments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'fund_investments'
      AND policyname = 'Authenticated users can read fund investments'
  ) THEN
    CREATE POLICY "Authenticated users can read fund investments"
      ON fund_investments FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'fund_investments'
      AND policyname = 'Authenticated users can write fund investments'
  ) THEN
    CREATE POLICY "Authenticated users can write fund investments"
      ON fund_investments FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fund_investments_fund_id
  ON fund_investments(fund_id);
