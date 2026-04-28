-- ─── Migration 034: Per-user Fireflies API key + webhook token ──────────────
-- On Team plans (non-Enterprise), each user must have their own Fireflies API
-- key + webhook URL. We store the API key per profile and generate a unique
-- webhook token used in the URL each user pastes into their Fireflies settings.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fireflies_api_key       TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fireflies_webhook_token TEXT UNIQUE;

-- Backfill existing profiles with a random webhook token.
UPDATE profiles
SET fireflies_webhook_token = REPLACE(gen_random_uuid()::TEXT, '-', '')
WHERE fireflies_webhook_token IS NULL;

-- Make the token mandatory going forward (existing rows now backfilled)
ALTER TABLE profiles
  ALTER COLUMN fireflies_webhook_token SET NOT NULL,
  ALTER COLUMN fireflies_webhook_token SET DEFAULT REPLACE(gen_random_uuid()::TEXT, '-', '');

CREATE INDEX IF NOT EXISTS idx_profiles_fireflies_webhook_token
  ON profiles(fireflies_webhook_token);
