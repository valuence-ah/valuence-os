-- ── Migration 033: Profile approval gating ─────────────────────────────────────
-- Every profile now has an `approved` flag. Only admins can flip it to true.
-- Existing profiles are grandfathered in as approved so nobody gets locked out.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS approved      BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approved_by   UUID        REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at   TIMESTAMPTZ;

-- Grandfather all current profiles — they already have access
UPDATE profiles SET approved = true, approved_at = NOW() WHERE approved = false;

-- Index for the dashboard layout check (hot path on every page load)
CREATE INDEX IF NOT EXISTS idx_profiles_approved ON profiles(id, approved);
