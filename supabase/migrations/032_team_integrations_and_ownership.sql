-- ─── Migration 032: Team Integrations & Ownership Tagging ───────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS outlook_mailbox    TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fireflies_email    TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fireflies_user_id  TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS initials           TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_outlook_mailbox  ON profiles(LOWER(outlook_mailbox));
CREATE INDEX IF NOT EXISTS idx_profiles_fireflies_email  ON profiles(LOWER(fireflies_email));

UPDATE profiles SET initials = (
  CASE
    WHEN full_name IS NULL OR full_name = '' THEN UPPER(SUBSTRING(email FROM 1 FOR 2))
    ELSE UPPER(
      SUBSTRING(SPLIT_PART(full_name, ' ', 1) FROM 1 FOR 1)
      || COALESCE(SUBSTRING(SPLIT_PART(full_name, ' ', 2) FROM 1 FOR 1), '')
    )
  END
) WHERE initials IS NULL;

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS received_by_user_id UUID REFERENCES profiles(id);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS received_in_mailbox TEXT;
CREATE INDEX IF NOT EXISTS idx_contacts_received_by ON contacts(received_by_user_id) WHERE received_by_user_id IS NOT NULL;

ALTER TABLE interactions ADD COLUMN IF NOT EXISTS host_user_id UUID REFERENCES profiles(id);
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS host_email   TEXT;
CREATE INDEX IF NOT EXISTS idx_interactions_host_user ON interactions(host_user_id) WHERE host_user_id IS NOT NULL;

ALTER TABLE ic_memos ADD COLUMN IF NOT EXISTS regenerated_by UUID REFERENCES profiles(id);
ALTER TABLE ic_memos ADD COLUMN IF NOT EXISTS regenerated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id           UUID REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  pipeline_last_company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own preferences"
  ON user_preferences FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
