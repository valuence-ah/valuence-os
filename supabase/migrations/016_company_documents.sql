-- ── Company Documents (meeting transcripts, etc.) ────────────────────────────
-- Stores metadata for files uploaded to Supabase Storage per company.

CREATE TABLE IF NOT EXISTS company_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid REFERENCES companies(id) ON DELETE CASCADE,
  meeting_id      uuid REFERENCES interactions(id) ON DELETE SET NULL,
  document_type   text NOT NULL DEFAULT 'meeting_transcript',
  file_name       text NOT NULL,
  storage_path    text NOT NULL,
  uploaded_at     timestamptz NOT NULL DEFAULT now(),
  created_by      text
);

CREATE INDEX IF NOT EXISTS company_documents_company_id_idx  ON company_documents(company_id);
CREATE INDEX IF NOT EXISTS company_documents_meeting_id_idx  ON company_documents(meeting_id);

-- Enable RLS
ALTER TABLE company_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read company_documents"
  ON company_documents FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert company_documents"
  ON company_documents FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete company_documents"
  ON company_documents FOR DELETE
  USING (auth.role() = 'authenticated');
