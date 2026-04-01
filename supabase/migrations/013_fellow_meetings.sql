-- ─── Migration 013: Fellow Meetings Integration ───────────────────────────────

-- Extend interactions table for Fellow/meeting data
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS fellow_id TEXT;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS transcript_text TEXT;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS attendees JSONB;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS source TEXT
  CHECK (source IN ('fellow', 'fireflies', 'manual', 'transcript_upload'));
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS resolution_status TEXT
  CHECK (resolution_status IN ('resolved','partial','unresolved','no_external','deferred'))
  DEFAULT 'unresolved';
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS pending_resolutions JSONB;
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS ai_summary TEXT;

-- Unique index on fellow_id (allow nulls)
CREATE UNIQUE INDEX IF NOT EXISTS idx_interactions_fellow_id
  ON interactions(fellow_id) WHERE fellow_id IS NOT NULL;

-- Add website_domain to companies
ALTER TABLE companies ADD COLUMN IF NOT EXISTS website_domain TEXT;

-- Backfill website_domain from existing website
UPDATE companies
SET website_domain = lower(
  regexp_replace(
    regexp_replace(website, '^https?://(www\.)?', '', 'gi'),
    '/.*$', ''
  )
)
WHERE website IS NOT NULL AND website_domain IS NULL;

-- meeting_action_items
CREATE TABLE IF NOT EXISTS meeting_action_items (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id       UUID REFERENCES interactions(id) ON DELETE CASCADE,
  description      TEXT NOT NULL,
  owner_contact_id UUID REFERENCES contacts(id),
  due_date         DATE,
  completed        BOOLEAN DEFAULT false,
  synced_to_tasks  BOOLEAN DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- meeting_contacts junction
CREATE TABLE IF NOT EXISTS meeting_contacts (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id       UUID REFERENCES interactions(id) ON DELETE CASCADE,
  contact_id       UUID REFERENCES contacts(id) ON DELETE CASCADE,
  role             TEXT DEFAULT 'attendee',
  is_internal      BOOLEAN DEFAULT false,
  match_confidence TEXT CHECK (match_confidence IN ('high','medium','low','manual')),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (meeting_id, contact_id)
);

-- interaction_timeline
CREATE TABLE IF NOT EXISTS interaction_timeline (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
  contact_id  UUID REFERENCES contacts(id),
  meeting_id  UUID REFERENCES interactions(id),
  type        TEXT CHECK (type IN ('meeting','email','call','note','milestone')),
  date        DATE NOT NULL,
  description TEXT,
  created_by  UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log
CREATE TABLE IF NOT EXISTS meeting_crm_sync_log (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  meeting_id   UUID REFERENCES interactions(id),
  entity_type  TEXT CHECK (entity_type IN ('contact','company','pipeline','timeline')),
  entity_id    UUID,
  action       TEXT CHECK (action IN ('created','updated','linked')),
  confidence   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_interactions_source ON interactions(source);
CREATE INDEX IF NOT EXISTS idx_interactions_resolution ON interactions(resolution_status);
CREATE INDEX IF NOT EXISTS idx_meeting_contacts_meeting ON meeting_contacts(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_action_items_meeting ON meeting_action_items(meeting_id);
CREATE INDEX IF NOT EXISTS idx_companies_website_domain ON companies(website_domain);
