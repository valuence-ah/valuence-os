-- Add types array column to companies table
ALTER TABLE companies ADD COLUMN IF NOT EXISTS types TEXT[] DEFAULT '{}';

-- Populate types from existing type column, mapping old DB values to Excel values
UPDATE companies SET types = ARRAY[
  CASE type
    WHEN 'lp'                THEN 'limited partner'
    WHEN 'ecosystem_partner' THEN 'strategic partner'
    WHEN 'fund'              THEN 'investor'
    WHEN 'startup'           THEN 'startup'
    WHEN 'other'             THEN 'other'
    WHEN 'government'        THEN 'other'
    WHEN 'corporate'         THEN 'strategic partner'
    WHEN 'investor'          THEN 'investor'
    ELSE type::TEXT
  END
] WHERE type IS NOT NULL AND (types IS NULL OR types = '{}');

-- Index for array queries
CREATE INDEX IF NOT EXISTS idx_companies_types ON companies USING GIN (types);
