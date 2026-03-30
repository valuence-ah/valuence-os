-- ─── pgvector Match Functions ─────────────────────────────────────────────────
-- These functions allow semantic search over documents and sourcing signals.
-- They are called from the AI chat route when VOYAGE_API_KEY is configured.
--
-- Run this migration in the Supabase SQL editor or via the CLI.

-- ── match_documents ───────────────────────────────────────────────────────────
-- Finds documents whose embeddings are closest to the query vector.
-- Returns: id, name, type, company name, extracted_text snippet, similarity

CREATE OR REPLACE FUNCTION match_documents(
  query_embedding  vector(1536),
  match_threshold  float DEFAULT 0.5,
  match_count      int   DEFAULT 5
)
RETURNS TABLE (
  id              uuid,
  name            text,
  type            text,
  company_name    text,
  text_snippet    text,
  similarity      float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.name,
    d.type,
    c.name   AS company_name,
    LEFT(d.extracted_text, 600) AS text_snippet,
    1 - (d.embedding <=> query_embedding) AS similarity
  FROM documents d
  LEFT JOIN companies c ON c.id = d.company_id
  WHERE
    d.embedding IS NOT NULL
    AND 1 - (d.embedding <=> query_embedding) >= match_threshold
  ORDER BY d.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ── match_signals ─────────────────────────────────────────────────────────────
-- Finds sourcing signals whose embeddings are closest to the query vector.

CREATE OR REPLACE FUNCTION match_signals(
  query_embedding  vector(1536),
  match_threshold  float DEFAULT 0.5,
  match_count      int   DEFAULT 5
)
RETURNS TABLE (
  id               uuid,
  title            text,
  source           text,
  summary          text,
  relevance_score  numeric,
  url              text,
  similarity       float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.title,
    s.source,
    s.summary,
    s.relevance_score,
    s.url,
    1 - (s.embedding <=> query_embedding) AS similarity
  FROM sourcing_signals s
  WHERE
    s.embedding IS NOT NULL
    AND 1 - (s.embedding <=> query_embedding) >= match_threshold
  ORDER BY s.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ── Grant execute to authenticated users ──────────────────────────────────────
GRANT EXECUTE ON FUNCTION match_documents TO authenticated;
GRANT EXECUTE ON FUNCTION match_signals TO authenticated;
