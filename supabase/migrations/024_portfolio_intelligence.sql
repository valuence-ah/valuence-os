-- ─── Portfolio Intelligence Hub — Migration 024 ─────────────────────────────
-- Tables: portfolio_kpis, portfolio_milestones, portfolio_initiatives,
--         portfolio_reports, portfolio_intelligence
-- Extends: companies (runway_months, health_status, raise info, board date)

-- ============================================
-- PORTFOLIO KPIs TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS portfolio_kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  period_type TEXT NOT NULL DEFAULT 'quarterly',
  mrr NUMERIC,
  mrr_growth NUMERIC,
  arr NUMERIC,
  monthly_burn NUMERIC,
  cash_on_hand NUMERIC,
  runway_months NUMERIC,
  revenue NUMERIC,
  gross_margin NUMERIC,
  headcount INTEGER,
  headcount_change INTEGER,
  customers INTEGER,
  pilots_active INTEGER,
  patents_filed INTEGER,
  patents_granted INTEGER,
  custom_kpis JSONB DEFAULT '{}',
  source TEXT DEFAULT 'manual',
  source_report_id UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, period)
);

CREATE INDEX IF NOT EXISTS idx_kpi_company ON portfolio_kpis(company_id);
CREATE INDEX IF NOT EXISTS idx_kpi_period ON portfolio_kpis(created_at DESC);

-- ============================================
-- PORTFOLIO MILESTONES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS portfolio_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'upcoming',
  target_date TEXT,
  completed_date TIMESTAMPTZ,
  category TEXT DEFAULT 'general',
  source TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_milestone_company ON portfolio_milestones(company_id);

-- ============================================
-- PORTFOLIO STRATEGIC INITIATIVES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS portfolio_initiatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress',
  category TEXT DEFAULT 'general',
  source TEXT DEFAULT 'manual',
  source_report_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_initiative_company ON portfolio_initiatives(company_id);

-- ============================================
-- PORTFOLIO REPORTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS portfolio_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  report_type TEXT NOT NULL DEFAULT 'quarterly',
  period TEXT,
  ai_extracted BOOLEAN DEFAULT FALSE,
  ai_summary TEXT,
  extracted_data JSONB DEFAULT '{}',
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_company ON portfolio_reports(company_id);

-- ============================================
-- PORTFOLIO INTELLIGENCE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS portfolio_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  entity_name TEXT NOT NULL,
  description TEXT,
  fit_level TEXT DEFAULT 'medium',
  warmth TEXT DEFAULT 'cold',
  source TEXT DEFAULT 'ai',
  last_refreshed TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intel_company ON portfolio_intelligence(company_id);
CREATE INDEX IF NOT EXISTS idx_intel_type ON portfolio_intelligence(type);

-- ============================================
-- ADD PORTFOLIO COLUMNS TO COMPANIES
-- ============================================
ALTER TABLE companies ADD COLUMN IF NOT EXISTS runway_months NUMERIC;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS health_status TEXT DEFAULT 'unknown';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS current_raise_status TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS current_raise_target TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS next_board_date TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS latest_report_date TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS latest_report_summary TEXT;

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE portfolio_kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_initiatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portfolio_kpis_auth" ON portfolio_kpis FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "portfolio_milestones_auth" ON portfolio_milestones FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "portfolio_initiatives_auth" ON portfolio_initiatives FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "portfolio_reports_auth" ON portfolio_reports FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "portfolio_intelligence_auth" ON portfolio_intelligence FOR ALL TO authenticated USING (true) WITH CHECK (true);
