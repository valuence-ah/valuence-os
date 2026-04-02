-- ── 017: Meetings archive + company_documents meeting_id uniqueness ────────────

-- Add archived flag to interactions
ALTER TABLE interactions
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

-- Index for efficient WHERE archived = false filtering
CREATE INDEX IF NOT EXISTS idx_interactions_archived
  ON interactions(archived) WHERE archived = false;

-- Table to permanently block re-syncing of archived Fireflies meetings
CREATE TABLE IF NOT EXISTS archived_external_meetings (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text        NOT NULL UNIQUE,  -- Fireflies transcript ID
  source      text        NOT NULL DEFAULT 'fireflies',
  archived_at timestamptz DEFAULT now(),
  archived_by text
);

CREATE INDEX IF NOT EXISTS idx_archived_external_meetings_external_id
  ON archived_external_meetings(external_id);

-- Ensure company_documents.meeting_id is unique so upsert-on-conflict works
-- (safe to run even if there are no duplicates)
CREATE UNIQUE INDEX IF NOT EXISTS idx_company_documents_meeting_id_unique
  ON company_documents(meeting_id)
  WHERE meeting_id IS NOT NULL;
