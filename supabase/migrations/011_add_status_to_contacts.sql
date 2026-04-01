-- ─── Migration 011: Add status column to contacts ────────────────────────────
-- Required for pending queue discard (archived) to persist across page loads.

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending'
  CHECK (status IN ('pending', 'active', 'archived'));

-- Backfill: mark contacts that already have a type + country as active
UPDATE contacts
SET status = 'active'
WHERE status = 'pending'
  AND type != 'other'
  AND location_country IS NOT NULL;
