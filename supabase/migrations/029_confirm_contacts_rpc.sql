-- ─── Migration 029: confirm_contacts RPC ─────────────────────────────────────
-- Bulk-confirms or bulk-rejects pending contacts in a single call.
-- Called by the pending contacts page bulk-action buttons.

CREATE OR REPLACE FUNCTION public.confirm_contacts(
  ids        UUID[],
  updates    JSONB    DEFAULT '{}'::JSONB
)
RETURNS TABLE(id UUID, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE contacts c
  SET
    status           = 'active',
    first_name       = COALESCE((updates->>'first_name'),  c.first_name),
    last_name        = COALESCE((updates->>'last_name'),   c.last_name),
    type             = COALESCE((updates->>'type')::TEXT,  c.type::TEXT)::contacts_type,
    title            = COALESCE((updates->>'title'),       c.title),
    company_id       = COALESCE((updates->>'company_id')::UUID, c.company_id),
    location_city    = COALESCE((updates->>'location_city'),    c.location_city),
    location_country = COALESCE((updates->>'location_country'), c.location_country),
    updated_at       = NOW()
  WHERE c.id = ANY(ids)
  RETURNING c.id, c.status;
END;
$$;

-- Bulk-reject: set status to archived for a list of contact ids
CREATE OR REPLACE FUNCTION public.reject_contacts(ids UUID[])
RETURNS TABLE(id UUID, status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE contacts c
  SET status = 'archived', updated_at = NOW()
  WHERE c.id = ANY(ids)
  RETURNING c.id, c.status;
END;
$$;
