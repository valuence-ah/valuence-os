-- ─── Migration 028: Audit Log ────────────────────────────────────────────────
-- Creates a tamper-evident change history for all core tables.
-- Uses a SECURITY DEFINER trigger function so auth.uid() is always captured.

-- 1. Audit log table
CREATE TABLE IF NOT EXISTS public.audit_log (
  id           BIGSERIAL PRIMARY KEY,
  table_name   TEXT        NOT NULL,
  record_id    TEXT        NOT NULL,
  operation    TEXT        NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data     JSONB,
  new_data     JSONB,
  changed_by   UUID,
  changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS audit_log_table_record_idx ON public.audit_log (table_name, record_id);
CREATE INDEX IF NOT EXISTS audit_log_changed_at_idx   ON public.audit_log (changed_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_changed_by_idx   ON public.audit_log (changed_by);

-- 3. Enable RLS — only authenticated users can read; nobody can modify rows directly
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_log_select" ON public.audit_log;
CREATE POLICY "audit_log_select"
  ON public.audit_log FOR SELECT
  USING ((select auth.uid()) IS NOT NULL);

-- No INSERT/UPDATE/DELETE policies — writes only happen via the trigger function below

-- 4. Trigger function (SECURITY DEFINER so it can always write to audit_log)
CREATE OR REPLACE FUNCTION public.fn_audit_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record_id TEXT;
  v_old_data  JSONB;
  v_new_data  JSONB;
BEGIN
  -- Determine the record ID (assumes a column named "id" exists)
  IF TG_OP = 'DELETE' THEN
    v_record_id := OLD.id::TEXT;
    v_old_data  := to_jsonb(OLD);
    v_new_data  := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    v_record_id := NEW.id::TEXT;
    v_old_data  := NULL;
    v_new_data  := to_jsonb(NEW);
  ELSE -- UPDATE
    v_record_id := NEW.id::TEXT;
    v_old_data  := to_jsonb(OLD);
    v_new_data  := to_jsonb(NEW);
  END IF;

  INSERT INTO public.audit_log (table_name, record_id, operation, old_data, new_data, changed_by)
  VALUES (TG_TABLE_NAME, v_record_id, TG_OP, v_old_data, v_new_data, auth.uid());

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- 5. Attach triggers to core tables

-- companies
DROP TRIGGER IF EXISTS trg_audit_companies ON public.companies;
CREATE TRIGGER trg_audit_companies
  AFTER INSERT OR UPDATE OR DELETE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

-- contacts
DROP TRIGGER IF EXISTS trg_audit_contacts ON public.contacts;
CREATE TRIGGER trg_audit_contacts
  AFTER INSERT OR UPDATE OR DELETE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

-- interactions
DROP TRIGGER IF EXISTS trg_audit_interactions ON public.interactions;
CREATE TRIGGER trg_audit_interactions
  AFTER INSERT OR UPDATE OR DELETE ON public.interactions
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

-- deals
DROP TRIGGER IF EXISTS trg_audit_deals ON public.deals;
CREATE TRIGGER trg_audit_deals
  AFTER INSERT OR UPDATE OR DELETE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

-- documents
DROP TRIGGER IF EXISTS trg_audit_documents ON public.documents;
CREATE TRIGGER trg_audit_documents
  AFTER INSERT OR UPDATE OR DELETE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

-- ic_memos
DROP TRIGGER IF EXISTS trg_audit_ic_memos ON public.ic_memos;
CREATE TRIGGER trg_audit_ic_memos
  AFTER INSERT OR UPDATE OR DELETE ON public.ic_memos
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

-- sourcing_signals
DROP TRIGGER IF EXISTS trg_audit_sourcing_signals ON public.sourcing_signals;
CREATE TRIGGER trg_audit_sourcing_signals
  AFTER INSERT OR UPDATE OR DELETE ON public.sourcing_signals
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

-- lp_relationships
DROP TRIGGER IF EXISTS trg_audit_lp_relationships ON public.lp_relationships;
CREATE TRIGGER trg_audit_lp_relationships
  AFTER INSERT OR UPDATE OR DELETE ON public.lp_relationships
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();
