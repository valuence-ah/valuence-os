-- ── 021: Meeting transcripts schema ──────────────────────────────────────────
-- Adds transcript_url to interactions (for Fireflies web link)
-- and ensures company_documents has the fireflies_url column.

-- Add transcript_url to interactions if not already present
-- (may already exist from earlier migrations via lib/types.ts definition)
ALTER TABLE interactions
  ADD COLUMN IF NOT EXISTS transcript_url text;

-- Ensure company_documents exists with correct schema
-- (migration 016 may have created it already)
CREATE TABLE IF NOT EXISTS company_documents (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid        REFERENCES companies(id) ON DELETE CASCADE,
  meeting_id    uuid        REFERENCES interactions(id) ON DELETE SET NULL,
  document_type text        NOT NULL DEFAULT 'meeting_transcript',
  file_name     text        NOT NULL,
  storage_path  text        NOT NULL,
  fireflies_url text,
  google_drive_url text,
  type          text,
  name          text,
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  created_by    text        NOT NULL DEFAULT 'system',
  UNIQUE (meeting_id)
);

-- Add fireflies_url column to company_documents if missing
ALTER TABLE company_documents
  ADD COLUMN IF NOT EXISTS fireflies_url text;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_company_documents_company_id
  ON company_documents(company_id);

CREATE INDEX IF NOT EXISTS idx_company_documents_meeting_id
  ON company_documents(meeting_id);

-- RLS (table may already have policies from migration 016)
ALTER TABLE company_documents ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'company_documents'
      AND policyname = 'Authenticated users can manage company documents'
  ) THEN
    CREATE POLICY "Authenticated users can manage company documents"
      ON company_documents FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;
