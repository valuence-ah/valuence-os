-- ─── Migration 031: Access Requests ──────────────────────────────────────────
-- Stores self-signup requests pending admin approval.

CREATE TABLE IF NOT EXISTS access_requests (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email        TEXT NOT NULL,
  full_name    TEXT NOT NULL,
  message      TEXT,
  status       TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at  TIMESTAMPTZ,
  reviewed_by  UUID REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_access_requests_status ON access_requests(status);
CREATE INDEX IF NOT EXISTS idx_access_requests_email  ON access_requests(email);

-- RLS: only admins can read/write; public can insert (to submit requests)
ALTER TABLE access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can submit a request"
  ON access_requests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can view and update requests"
  ON access_requests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );
