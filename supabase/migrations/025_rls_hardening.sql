-- ─── Migration 025: RLS Hardening ────────────────────────────────────────────
-- Enables Row Level Security and adds authenticated-only policies to tables
-- that were created without any access control in earlier migrations.
--
-- Tables fixed:
--   From 013_fellow_meetings.sql (no RLS at all):
--     interaction_timeline, meeting_action_items, meeting_contacts, meeting_crm_sync_log
--   From 017_meetings_archive.sql (no RLS at all):
--     archived_external_meetings
--   Grant tables (had policies open to anon role — tightened to authenticated):
--     grant_ai_scores, grant_checklist, grant_comments, grant_links, grant_status

-- ─────────────────────────────────────────────────────────────────────────────
-- interaction_timeline
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE interaction_timeline ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='interaction_timeline' AND policyname='Authenticated full access to interaction_timeline') THEN
    CREATE POLICY "Authenticated full access to interaction_timeline"
      ON interaction_timeline FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- meeting_action_items
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE meeting_action_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='meeting_action_items' AND policyname='Authenticated full access to meeting_action_items') THEN
    CREATE POLICY "Authenticated full access to meeting_action_items"
      ON meeting_action_items FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- meeting_contacts
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE meeting_contacts ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='meeting_contacts' AND policyname='Authenticated full access to meeting_contacts') THEN
    CREATE POLICY "Authenticated full access to meeting_contacts"
      ON meeting_contacts FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- meeting_crm_sync_log
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE meeting_crm_sync_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='meeting_crm_sync_log' AND policyname='Authenticated full access to meeting_crm_sync_log') THEN
    CREATE POLICY "Authenticated full access to meeting_crm_sync_log"
      ON meeting_crm_sync_log FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- archived_external_meetings
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE archived_external_meetings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='archived_external_meetings' AND policyname='Authenticated full access to archived_external_meetings') THEN
    CREATE POLICY "Authenticated full access to archived_external_meetings"
      ON archived_external_meetings FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Grant tables — drop insecure anon policies, replace with authenticated-only
-- (Tables may not exist if the grants module was never deployed; all wrapped in
--  DO blocks so the migration is safe to run regardless.)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'grant_ai_scores') THEN
    ALTER TABLE grant_ai_scores ENABLE ROW LEVEL SECURITY;
    -- Drop the overly-broad anon policies if they exist
    DROP POLICY IF EXISTS "allow_all_select" ON grant_ai_scores;
    DROP POLICY IF EXISTS "allow_all_insert" ON grant_ai_scores;
    DROP POLICY IF EXISTS "allow_all_update" ON grant_ai_scores;
    DROP POLICY IF EXISTS "allow_all_delete" ON grant_ai_scores;
    -- Add authenticated-only policy
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='grant_ai_scores' AND policyname='Authenticated full access to grant_ai_scores') THEN
      CREATE POLICY "Authenticated full access to grant_ai_scores"
        ON grant_ai_scores FOR ALL
        USING (auth.role() = 'authenticated')
        WITH CHECK (auth.role() = 'authenticated');
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'grant_checklist') THEN
    ALTER TABLE grant_checklist ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "allow_all_select" ON grant_checklist;
    DROP POLICY IF EXISTS "allow_all_insert" ON grant_checklist;
    DROP POLICY IF EXISTS "allow_all_update" ON grant_checklist;
    DROP POLICY IF EXISTS "allow_all_delete" ON grant_checklist;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='grant_checklist' AND policyname='Authenticated full access to grant_checklist') THEN
      CREATE POLICY "Authenticated full access to grant_checklist"
        ON grant_checklist FOR ALL
        USING (auth.role() = 'authenticated')
        WITH CHECK (auth.role() = 'authenticated');
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'grant_comments') THEN
    ALTER TABLE grant_comments ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "allow_all_select" ON grant_comments;
    DROP POLICY IF EXISTS "allow_all_insert" ON grant_comments;
    DROP POLICY IF EXISTS "allow_all_update" ON grant_comments;
    DROP POLICY IF EXISTS "allow_all_delete" ON grant_comments;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='grant_comments' AND policyname='Authenticated full access to grant_comments') THEN
      CREATE POLICY "Authenticated full access to grant_comments"
        ON grant_comments FOR ALL
        USING (auth.role() = 'authenticated')
        WITH CHECK (auth.role() = 'authenticated');
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'grant_links') THEN
    ALTER TABLE grant_links ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "allow_all_select" ON grant_links;
    DROP POLICY IF EXISTS "allow_all_insert" ON grant_links;
    DROP POLICY IF EXISTS "allow_all_update" ON grant_links;
    DROP POLICY IF EXISTS "allow_all_delete" ON grant_links;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='grant_links' AND policyname='Authenticated full access to grant_links') THEN
      CREATE POLICY "Authenticated full access to grant_links"
        ON grant_links FOR ALL
        USING (auth.role() = 'authenticated')
        WITH CHECK (auth.role() = 'authenticated');
    END IF;
  END IF;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'grant_status') THEN
    ALTER TABLE grant_status ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "allow_all_select" ON grant_status;
    DROP POLICY IF EXISTS "allow_all_insert" ON grant_status;
    DROP POLICY IF EXISTS "allow_all_update" ON grant_status;
    DROP POLICY IF EXISTS "allow_all_delete" ON grant_status;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='grant_status' AND policyname='Authenticated full access to grant_status') THEN
      CREATE POLICY "Authenticated full access to grant_status"
        ON grant_status FOR ALL
        USING (auth.role() = 'authenticated')
        WITH CHECK (auth.role() = 'authenticated');
    END IF;
  END IF;
END $$;
