-- ── 018: Per-user column preferences ─────────────────────────────────────────
-- Stores resizable/reorderable/hideable column settings per user per table.

CREATE TABLE IF NOT EXISTS user_column_preferences (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  table_key       text        NOT NULL,   -- e.g. 'crm_contacts', 'crm_pipeline', 'meetings'
  column_widths   jsonb       NOT NULL DEFAULT '{}',   -- { "Name": 240, "Company": 180 }
  column_order    jsonb       NOT NULL DEFAULT '[]',   -- ["Name", "Company", "Email", ...]
  hidden_columns  jsonb       NOT NULL DEFAULT '[]',   -- ["Phone", "Tags"]
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, table_key)
);

-- RLS: users can only read/write their own preferences
ALTER TABLE user_column_preferences ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_column_preferences'
      AND policyname = 'Users can manage own column prefs'
  ) THEN
    CREATE POLICY "Users can manage own column prefs"
      ON user_column_preferences
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_column_prefs_user_table
  ON user_column_preferences(user_id, table_key);
