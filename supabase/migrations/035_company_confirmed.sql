-- Migration 035: add confirmed flag to companies
-- Auto-created companies (from email inbox) start as confirmed = false.
-- They are hidden from Pipeline / Strategic / Funds / LPs until a user
-- reviews and confirms the contact in CRM → Contacts → Pending.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS confirmed BOOLEAN NOT NULL DEFAULT true;

-- Back-fill: companies auto-created by the check-inbox cron (source = 'email')
-- that have NO active contacts are treated as unconfirmed.
UPDATE companies
SET confirmed = false
WHERE source = 'email'
  AND type    = 'other'
  AND NOT EXISTS (
    SELECT 1 FROM contacts
    WHERE contacts.company_id = companies.id
      AND contacts.status = 'active'
  );

-- Index for the common confirmed = true filter
CREATE INDEX IF NOT EXISTS idx_companies_confirmed ON companies (confirmed);
