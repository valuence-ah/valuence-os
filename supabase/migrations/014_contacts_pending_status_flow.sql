-- ─── Migration 014: Contacts pending status flow ─────────────────────────────
-- New contacts from Make.com should land as 'pending' so they appear in the
-- review queue. Previously defaulted to 'active', which bypassed the queue.

-- Change default so new inserts start as pending
ALTER TABLE contacts ALTER COLUMN status SET DEFAULT 'pending';

-- Backfill: contacts with no country are unreviewed → mark as pending
UPDATE contacts
SET status = 'pending'
WHERE status = 'active'
  AND location_country IS NULL;
