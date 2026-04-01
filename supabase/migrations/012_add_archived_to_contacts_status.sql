-- ─── Migration 012: Allow 'archived' in contacts.status ──────────────────────
-- The existing CHECK constraint only allowed 'active' and 'pending',
-- causing discard() to silently fail and contacts to reappear on reload.

ALTER TABLE contacts DROP CONSTRAINT contacts_status_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_status_check
  CHECK (status = ANY (ARRAY['active'::text, 'pending'::text, 'archived'::text]));
