-- Add unique constraint on google_drive_url so Drive sync upsert works correctly
-- and prevents duplicate document records for the same Drive file.
-- Use a partial index (WHERE NOT NULL) since many rows will have NULL google_drive_url.
CREATE UNIQUE INDEX IF NOT EXISTS documents_google_drive_url_unique
  ON documents (google_drive_url)
  WHERE google_drive_url IS NOT NULL;
