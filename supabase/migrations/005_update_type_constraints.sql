-- ─── Migration 005: Align DB constraints with Excel values ────────────────────

-- ── Companies: update type CHECK constraint ───────────────────────────────────
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_type_check;
ALTER TABLE companies ADD CONSTRAINT companies_type_check
  CHECK (type IN ('startup','limited partner','investor','strategic partner','other'));

-- Remap any old type values to new ones
UPDATE companies SET type = 'investor'         WHERE type IN ('fund','corporate');
UPDATE companies SET type = 'other'            WHERE type IN ('lp','government');
UPDATE companies SET type = 'startup'          WHERE type NOT IN ('startup','limited partner','investor','strategic partner','other') AND type IS NOT NULL;

-- ── Contacts: drop old type constraint and add Excel-matching values ──────────
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_type_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_type_check
  CHECK (type IN (
    'Advisor / KOL',
    'Ecosystem',
    'Employee',
    'Founder / Mgmt',
    'Government/Academic',
    'Investor',
    'Lawyer',
    'Limited Partner',
    'Other',
    'Strategic'
  ));

-- Remap existing contact type values
UPDATE contacts SET type = 'Founder / Mgmt'     WHERE type IN ('founder');
UPDATE contacts SET type = 'Limited Partner'     WHERE type = 'lp';
UPDATE contacts SET type = 'Strategic'           WHERE type = 'corporate';
UPDATE contacts SET type = 'Ecosystem'           WHERE type = 'ecosystem_partner';
UPDATE contacts SET type = 'Investor'            WHERE type = 'fund_manager';
UPDATE contacts SET type = 'Government/Academic' WHERE type = 'government';
UPDATE contacts SET type = 'Advisor / KOL'      WHERE type = 'advisor';
UPDATE contacts SET type = 'Other'               WHERE type = 'other';
-- Catch any remaining values not yet mapped
UPDATE contacts SET type = 'Other'
  WHERE type NOT IN (
    'Advisor / KOL','Ecosystem','Employee','Founder / Mgmt',
    'Government/Academic','Investor','Lawyer','Limited Partner','Other','Strategic'
  );
