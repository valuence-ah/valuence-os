-- ============================================================
-- VALUENCE OS — Complete Database Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- PROFILES (extends Supabase's built-in auth.users table)
-- ============================================================
CREATE TABLE profiles (
  id          UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email       TEXT NOT NULL,
  full_name   TEXT,
  avatar_url  TEXT,
  role        TEXT DEFAULT 'analyst' CHECK (role IN ('partner', 'principal', 'analyst', 'admin')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- COMPANIES
-- Covers: startups, LPs, corporates, ecosystem partners, funds, government
-- ============================================================
CREATE TABLE companies (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name                TEXT NOT NULL,
  type                TEXT NOT NULL CHECK (type IN ('startup','lp','corporate','ecosystem_partner','fund','government')),
  sub_type            TEXT,       -- e.g. 'family_office', 'institutional_lp', 'accelerator'
  stage               TEXT,       -- startup stage: 'pre-seed','seed','series_a', etc.
  sectors             TEXT[],     -- e.g. ['cleantech','advanced_materials']
  description         TEXT,
  website             TEXT,
  linkedin_url        TEXT,
  crunchbase_url      TEXT,
  logo_url            TEXT,
  location_city       TEXT,
  location_country    TEXT,
  founded_year        INTEGER,
  employee_count      TEXT,       -- '1-10', '11-50', etc.

  -- Startup-specific fields
  funding_raised      NUMERIC,    -- total raised in USD
  last_funding_date   DATE,
  last_funding_stage  TEXT,
  pitch_deck_url      TEXT,

  -- Portfolio / deal status
  deal_status         TEXT CHECK (deal_status IN ('sourced','active_deal','portfolio','passed','monitoring','exited')),

  -- LP-specific fields
  aum                 NUMERIC,    -- assets under management
  fund_focus          TEXT,
  lp_type             TEXT CHECK (lp_type IN ('family_office','institutional','corporate_vc','foundation','sovereign','hni','other')),

  -- CRM fields
  source              TEXT,       -- how we found them
  first_contact_date  DATE,
  last_contact_date   DATE,
  owner_id            UUID REFERENCES profiles(id),   -- who manages this relationship
  notes               TEXT,
  tags                TEXT[],

  created_by          UUID REFERENCES profiles(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Full-text search index on companies
CREATE INDEX idx_companies_name ON companies USING gin(to_tsvector('english', name));
CREATE INDEX idx_companies_type ON companies(type);
CREATE INDEX idx_companies_deal_status ON companies(deal_status);
CREATE INDEX idx_companies_sectors ON companies USING gin(sectors);

-- ============================================================
-- CONTACTS
-- Covers: founders, LPs, corporates, ecosystem partners, fund managers, government
-- ============================================================
CREATE TABLE contacts (
  id                    UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  first_name            TEXT NOT NULL,
  last_name             TEXT NOT NULL,
  email                 TEXT,
  phone                 TEXT,
  linkedin_url          TEXT,
  title                 TEXT,
  company_id            UUID REFERENCES companies(id) ON DELETE SET NULL,
  type                  TEXT NOT NULL CHECK (type IN ('founder','lp','corporate','ecosystem_partner','fund_manager','government','advisor','other')),
  relationship_strength TEXT CHECK (relationship_strength IN ('strong','medium','weak','new')),
  is_primary_contact    BOOLEAN DEFAULT FALSE,
  last_contact_date     DATE,
  notes                 TEXT,
  tags                  TEXT[],
  created_by            UUID REFERENCES profiles(id),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contacts_company ON contacts(company_id);
CREATE INDEX idx_contacts_type ON contacts(type);

-- ============================================================
-- INTERACTIONS (meetings, emails, calls, notes)
-- ============================================================
CREATE TABLE interactions (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  type           TEXT NOT NULL CHECK (type IN ('meeting','email','call','note','event','intro')),
  subject        TEXT,
  body           TEXT,
  date           TIMESTAMPTZ DEFAULT NOW(),
  company_id     UUID REFERENCES companies(id) ON DELETE CASCADE,
  contact_ids    UUID[],          -- array of contact UUIDs involved
  -- Fireflies integration
  fireflies_id   TEXT,
  transcript_url TEXT,
  summary        TEXT,
  action_items   TEXT[],
  sentiment      TEXT CHECK (sentiment IN ('positive','neutral','negative')),
  created_by     UUID REFERENCES profiles(id),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_interactions_company ON interactions(company_id);
CREATE INDEX idx_interactions_date ON interactions(date DESC);

-- ============================================================
-- DEALS (investment pipeline)
-- ============================================================
CREATE TABLE deals (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id        UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  stage             TEXT NOT NULL CHECK (stage IN ('sourced','first_meeting','deep_dive','ic_memo','term_sheet','due_diligence','closed','passed')),
  investment_amount NUMERIC,
  ownership_pct     NUMERIC,
  valuation_cap     NUMERIC,
  discount_pct      NUMERIC,
  instrument        TEXT CHECK (instrument IN ('safe','convertible_note','equity','other')),
  lead_partner      TEXT,
  co_investors      TEXT[],
  ic_date           DATE,
  close_date        DATE,
  notes             TEXT,
  created_by        UUID REFERENCES profiles(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- DOCUMENTS (decks, memos, diligence docs, transcripts)
-- ============================================================
CREATE TABLE documents (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name             TEXT NOT NULL,
  type             TEXT CHECK (type IN ('deck','memo','diligence','financials','transcript','contract','other')),
  company_id       UUID REFERENCES companies(id) ON DELETE CASCADE,
  deal_id          UUID REFERENCES deals(id) ON DELETE SET NULL,
  storage_path     TEXT,          -- Supabase Storage path
  google_drive_url TEXT,
  file_size        INTEGER,
  mime_type        TEXT,
  -- AI processing
  extracted_text   TEXT,
  embedding        vector(1536),  -- pgvector for semantic search
  ai_summary       TEXT,
  uploaded_by      UUID REFERENCES profiles(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- IC MEMOS (investment committee memos)
-- ============================================================
CREATE TABLE ic_memos (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id          UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  deal_id             UUID REFERENCES deals(id) ON DELETE SET NULL,
  title               TEXT NOT NULL,
  -- Structured sections (Claude fills these in)
  executive_summary   TEXT,
  problem_solution    TEXT,
  market_opportunity  TEXT,
  business_model      TEXT,
  traction            TEXT,
  team                TEXT,
  competition         TEXT,
  risks               TEXT,
  financials          TEXT,
  investment_thesis   TEXT,
  recommendation      TEXT CHECK (recommendation IN ('invest','pass','more_diligence','pending')),
  -- Review workflow
  status              TEXT DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','rejected')),
  reviewed_by         UUID REFERENCES profiles(id),
  review_notes        TEXT,
  -- Full text + semantic search
  full_text           TEXT,
  embedding           vector(1536),
  created_by          UUID REFERENCES profiles(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- KPI TRACKING (portfolio monitoring)
-- ============================================================
CREATE TABLE kpi_templates (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name        TEXT NOT NULL,
  unit        TEXT,               -- '$', '%', 'users', 'months', etc.
  description TEXT,
  frequency   TEXT CHECK (frequency IN ('monthly','quarterly','annually')),
  category    TEXT CHECK (category IN ('revenue','growth','users','efficiency','team','custom')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE kpi_entries (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id        UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  kpi_template_id   UUID REFERENCES kpi_templates(id),
  name              TEXT NOT NULL,
  value             NUMERIC NOT NULL,
  unit              TEXT,
  period_start      DATE NOT NULL,
  period_end        DATE NOT NULL,
  notes             TEXT,
  reported_by       UUID REFERENCES profiles(id),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kpi_entries_company ON kpi_entries(company_id);
CREATE INDEX idx_kpi_entries_period ON kpi_entries(period_start DESC);

-- ============================================================
-- SOURCING SIGNALS (arXiv, SBIR, NSF, USPTO, Crunchbase, news)
-- ============================================================
CREATE TABLE sourcing_signals (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  source           TEXT NOT NULL CHECK (source IN ('arxiv','sbir','nsf','uspto','crunchbase','news','linkedin','exa','manual','other')),
  signal_type      TEXT CHECK (signal_type IN ('paper','grant','patent','funding','news','job_posting','other')),
  title            TEXT,
  url              TEXT,
  content          TEXT,
  summary          TEXT,
  relevance_score  NUMERIC,       -- AI-scored 0-1
  sector_tags      TEXT[],
  authors          TEXT[],
  published_date   DATE,
  -- Matched company (if we already track them)
  company_id       UUID REFERENCES companies(id) ON DELETE SET NULL,
  -- Review status
  status           TEXT DEFAULT 'new' CHECK (status IN ('new','reviewed','contacted','archived')),
  reviewed_by      UUID REFERENCES profiles(id),
  embedding        vector(1536),
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_signals_source ON sourcing_signals(source);
CREATE INDEX idx_signals_status ON sourcing_signals(status);
CREATE INDEX idx_signals_relevance ON sourcing_signals(relevance_score DESC);

-- ============================================================
-- LP RELATIONSHIPS (fundraising pipeline)
-- ============================================================
CREATE TABLE lp_relationships (
  id                UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  company_id        UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  contact_id        UUID REFERENCES contacts(id) ON DELETE SET NULL,
  stage             TEXT CHECK (stage IN ('target','intro_made','meeting_scheduled','meeting_done','materials_sent','soft_commit','committed','closed','passed')),
  target_allocation NUMERIC,
  committed_amount  NUMERIC,
  called_amount     NUMERIC,
  fund_vehicle      TEXT,         -- 'Fund I', 'Fund II', 'SPV', etc.
  next_step         TEXT,
  next_step_date    DATE,
  notes             TEXT,
  created_by        UUID REFERENCES profiles(id),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CHAT (AI chat interface)
-- ============================================================
CREATE TABLE chat_sessions (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title       TEXT DEFAULT 'New Chat',
  created_by  UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE chat_messages (
  id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id   UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  role         TEXT CHECK (role IN ('user','assistant')),
  content      TEXT NOT NULL,
  context_used TEXT[],           -- which data was retrieved for this response
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- All authenticated users in the org can read/write everything.
-- In production you'd scope this per-org.
-- ============================================================
ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts           ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals              ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ic_memos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_entries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sourcing_signals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE lp_relationships   ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages      ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "Auth users can view profiles"  ON profiles FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users update own profile"      ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users insert own profile"      ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Helper macro: authenticated CRUD for a table
-- Companies
CREATE POLICY "Auth read companies"   ON companies FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth insert companies" ON companies FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update companies" ON companies FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Auth delete companies" ON companies FOR DELETE USING (auth.role() = 'authenticated');

-- Contacts
CREATE POLICY "Auth read contacts"   ON contacts FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth insert contacts" ON contacts FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update contacts" ON contacts FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Auth delete contacts" ON contacts FOR DELETE USING (auth.role() = 'authenticated');

-- Interactions
CREATE POLICY "Auth read interactions"   ON interactions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth insert interactions" ON interactions FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update interactions" ON interactions FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Auth delete interactions" ON interactions FOR DELETE USING (auth.role() = 'authenticated');

-- Deals
CREATE POLICY "Auth read deals"   ON deals FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth insert deals" ON deals FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update deals" ON deals FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Auth delete deals" ON deals FOR DELETE USING (auth.role() = 'authenticated');

-- Documents
CREATE POLICY "Auth read documents"   ON documents FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth insert documents" ON documents FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update documents" ON documents FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Auth delete documents" ON documents FOR DELETE USING (auth.role() = 'authenticated');

-- IC Memos
CREATE POLICY "Auth read ic_memos"   ON ic_memos FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth insert ic_memos" ON ic_memos FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update ic_memos" ON ic_memos FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Auth delete ic_memos" ON ic_memos FOR DELETE USING (auth.role() = 'authenticated');

-- KPI Templates
CREATE POLICY "Auth read kpi_templates"   ON kpi_templates FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth insert kpi_templates" ON kpi_templates FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update kpi_templates" ON kpi_templates FOR UPDATE USING (auth.role() = 'authenticated');

-- KPI Entries
CREATE POLICY "Auth read kpi_entries"   ON kpi_entries FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth insert kpi_entries" ON kpi_entries FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update kpi_entries" ON kpi_entries FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Auth delete kpi_entries" ON kpi_entries FOR DELETE USING (auth.role() = 'authenticated');

-- Sourcing Signals
CREATE POLICY "Auth read signals"   ON sourcing_signals FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth insert signals" ON sourcing_signals FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update signals" ON sourcing_signals FOR UPDATE USING (auth.role() = 'authenticated');

-- LP Relationships
CREATE POLICY "Auth read lp"   ON lp_relationships FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth insert lp" ON lp_relationships FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update lp" ON lp_relationships FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Auth delete lp" ON lp_relationships FOR DELETE USING (auth.role() = 'authenticated');

-- Chat
CREATE POLICY "Auth read sessions"   ON chat_sessions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth insert sessions" ON chat_sessions FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Auth update sessions" ON chat_sessions FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Auth delete sessions" ON chat_sessions FOR DELETE USING (auth.role() = 'authenticated');
CREATE POLICY "Auth read messages"   ON chat_messages FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Auth insert messages" ON chat_messages FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at        BEFORE UPDATE ON profiles        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_companies_updated_at       BEFORE UPDATE ON companies       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_contacts_updated_at        BEFORE UPDATE ON contacts        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_interactions_updated_at    BEFORE UPDATE ON interactions    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_deals_updated_at           BEFORE UPDATE ON deals           FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_documents_updated_at       BEFORE UPDATE ON documents       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_ic_memos_updated_at        BEFORE UPDATE ON ic_memos        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_lp_relationships_updated_at BEFORE UPDATE ON lp_relationships FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_chat_sessions_updated_at   BEFORE UPDATE ON chat_sessions   FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Auto-create profile row when a new user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- SEED DATA — default KPI templates
-- ============================================================
INSERT INTO kpi_templates (name, unit, description, frequency, category) VALUES
  ('Monthly Recurring Revenue',   '$',        'Total MRR',                          'monthly',   'revenue'),
  ('Annual Recurring Revenue',    '$',        'Total ARR',                          'monthly',   'revenue'),
  ('Revenue Growth MoM',          '%',        'Month-over-month revenue growth',    'monthly',   'growth'),
  ('Gross Margin',                '%',        'Gross profit as % of revenue',       'quarterly', 'efficiency'),
  ('Burn Rate',                   '$',        'Monthly cash burn',                  'monthly',   'efficiency'),
  ('Runway',                      'months',   'Months of runway remaining',         'monthly',   'efficiency'),
  ('Cash Balance',                '$',        'Total cash on hand',                 'monthly',   'efficiency'),
  ('Total Customers',             'customers','Total paying customers',             'monthly',   'users'),
  ('Monthly Active Users',        'users',    'MAU',                                'monthly',   'users'),
  ('Net Revenue Retention',       '%',        'NRR including expansions and churn', 'quarterly', 'growth'),
  ('Customer Acquisition Cost',   '$',        'Blended CAC',                        'quarterly', 'efficiency'),
  ('Customer Lifetime Value',     '$',        'Expected LTV per customer',          'quarterly', 'revenue'),
  ('Headcount',                   'people',   'Total full-time employees',          'monthly',   'team'),
  ('Pipeline Value',              '$',        'Total sales pipeline value',         'monthly',   'revenue');
