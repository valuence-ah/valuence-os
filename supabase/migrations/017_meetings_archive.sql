-- ── 017: Company documents + meetings archive ────────────────────────────────

-- ── company_documents (from 016, idempotent) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS company_documents (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid        REFERENCES companies(id) ON DELETE CASCADE,
  meeting_id      uuid        REFERENCES interactions(id) ON DELETE SET NULL,
  document_type   text        NOT NULL DEFAULT 'meeting_transcript',
  file_name       text        NOT NULL,
  storage_path    text        NOT NULL,
  uploaded_at     timestamptz NOT NULL DEFAULT now(),
  created_by      text
);

CREATE INDEX IF NOT EXISTS company_documents_company_id_idx
  ON company_documents(company_id);
CREATE INDEX IF NOT EXISTS company_documents_meeting_id_idx
  ON company_documents(meeting_id);

ALTER TABLE company_documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'company_documents'
      AND policyname = 'Authenticated users can read company_documents'
  ) THEN
    CREATE POLICY "Authenticated users can read company_documents"
      ON company_documents FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'company_documents'
      AND policyname = 'Authenticated users can insert company_documents'
  ) THEN
    CREATE POLICY "Authenticated users can insert company_documents"
      ON company_documents FOR INSERT
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'company_documents'
      AND policyname = 'Authenticated users can delete company_documents'
  ) THEN
    CREATE POLICY "Authenticated users can delete company_documents"
      ON company_documents FOR DELETE
      USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- Unique index on meeting_id so upsert-on-conflict works in save-meeting-transcript
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_documents_meeting_id_unique
  ON company_documents(meeting_id)
  WHERE meeting_id IS NOT NULL;

-- ── Archive flag on interactions ──────────────────────────────────────────────
ALTER TABLE interactions
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_interactions_archived
  ON interactions(archived) WHERE archived = false;

-- ── archived_external_meetings — blocks Fireflies IDs from re-syncing ─────────
CREATE TABLE IF NOT EXISTS archived_external_meetings (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text        NOT NULL UNIQUE,
  source      text        NOT NULL DEFAULT 'fireflies',
  archived_at timestamptz DEFAULT now(),
  archived_by text
);

CREATE INDEX IF NOT EXISTS idx_archived_external_meetings_external_id
  ON archived_external_meetings(external_id);
