-- ─── Migration 003: LP & Funds additional fields ──────────────────────────────
-- Adds lp_stage, commitment_goal, is_strategic_partner to the companies table,
-- and expands the type check constraint to cover all company types used in the app.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS lp_stage TEXT,
  ADD COLUMN IF NOT EXISTS commitment_goal NUMERIC,
  ADD COLUMN IF NOT EXISTS is_strategic_partner BOOLEAN DEFAULT FALSE;

-- Drop old type check constraint (may not exist) and recreate with full set of values
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_type_check;
ALTER TABLE companies ADD CONSTRAINT companies_type_check
  CHECK (type IN (
    'startup',
    'lp',
    'limited partner',
    'investor',
    'strategic partner',
    'ecosystem_partner',
    'fund',
    'corporate',
    'government',
    'other'
  ));
