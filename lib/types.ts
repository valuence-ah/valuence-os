// ─── TypeScript types mirroring the Supabase database schema ─────────────────
// These are used throughout the app for type safety.

export type CompanyType = "startup" | "lp" | "limited partner" | "investor" | "strategic partner" | "ecosystem_partner" | "fund" | "corporate" | "government" | "other";
export type ContactType = "founder" | "lp" | "corporate" | "ecosystem_partner" | "fund_manager" | "government" | "advisor" | "other";
export type ContactStatus = "active" | "pending" | "archived";
export type DealStage = "sourced" | "first_meeting" | "deep_dive" | "ic_memo" | "term_sheet" | "due_diligence" | "closed" | "passed";
export type DealStatus = "sourced" | "active_deal" | "portfolio" | "passed" | "monitoring" | "exited";
export type LpStage = "target" | "intro_made" | "meeting_scheduled" | "meeting_done" | "materials_sent" | "soft_commit" | "committed" | "closed" | "passed";
export type SignalSource = "arxiv" | "sbir" | "nsf" | "uspto" | "crunchbase" | "news" | "linkedin" | "exa" | "semantic_scholar" | "nih" | "nrel" | "manual" | "other";

// ── Row types (what comes back from Supabase) ─────────────────────────────────

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: "partner" | "principal" | "analyst" | "admin";
  created_at: string;
  updated_at: string;
}

export interface Company {
  id: string;
  name: string;
  type: CompanyType;
  types: string[] | null;
  sub_type: string | null;
  stage: string | null;
  sectors: string[] | null;
  description: string | null;
  website: string | null;
  website_domain: string | null;
  linkedin_url: string | null;
  crunchbase_url: string | null;
  logo_url: string | null;
  location_city: string | null;
  location_country: string | null;
  founded_year: number | null;
  employee_count: string | null;
  funding_raised: number | null;
  last_funding_date: string | null;
  last_funding_stage: string | null;
  pitch_deck_url: string | null;
  deal_status: DealStatus | null;
  priority: "High" | "Medium" | "Low" | null;
  aum: number | null;
  fund_focus: string | null;
  lp_type: string | null;
  source: string | null;
  first_contact_date: string | null;
  last_contact_date: string | null;
  last_meeting_date: string | null;
  lp_stage: string | null;
  commitment_goal: number | null;
  is_strategic_partner: boolean | null;
  owner_id: string | null;
  notes: string | null;
  tags: string[] | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  drive_folder_url: string | null;
  investor_type: string | null;
  strategic_type: string | null;
}

export interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  title: string | null;
  company_id: string | null;
  type: ContactType;
  relationship_strength: "strong" | "medium" | "weak" | "new" | null;
  is_primary_contact: boolean;
  last_contact_date: string | null;
  location_city: string | null;
  location_country: string | null;
  notes: string | null;
  tags: string[] | null;
  emails: string[] | null;
  status: ContactStatus;
  relationship_stage: "active" | "warm" | "cold" | "dormant" | null;
  owner_id: string | null;
  source: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  company?: Company;
}

export interface MeetingAttendee {
  name: string;
  email: string;
  response_status?: string;
}

export interface Interaction {
  id: string;
  type: "meeting" | "email" | "call" | "note" | "event" | "intro";
  subject: string | null;
  body: string | null;
  date: string;
  company_id: string | null;
  contact_ids: string[] | null;
  fireflies_id: string | null;
  transcript_url: string | null;
  transcript_text: string | null;
  summary: string | null;
  action_items: string[] | null;
  sentiment: "positive" | "neutral" | "negative" | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Fellow integration
  fellow_id: string | null;
  attendees: MeetingAttendee[] | null;
  duration_minutes: number | null;
  source: "fellow" | "fireflies" | "manual" | "transcript_upload" | null;
  resolution_status: "resolved" | "partial" | "unresolved" | "no_external" | "deferred" | null;
  pending_resolutions: import("./meeting-resolution").PendingResolutions | null;
  ai_summary: string | null;
  archived: boolean;
  // joined
  company?: Company;
}

export interface Deal {
  id: string;
  company_id: string;
  stage: DealStage;
  investment_amount: number | null;
  ownership_pct: number | null;
  valuation_cap: number | null;
  discount_pct: number | null;
  instrument: "safe" | "convertible_note" | "equity" | "other" | null;
  lead_partner: string | null;
  co_investors: string[] | null;
  ic_date: string | null;
  close_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  company?: Company;
}

export interface IcMemo {
  id: string;
  company_id: string;
  deal_id: string | null;
  title: string;
  executive_summary: string | null;
  problem_solution: string | null;
  market_opportunity: string | null;
  business_model: string | null;
  traction: string | null;
  team: string | null;
  competition: string | null;
  risks: string | null;
  financials: string | null;
  investment_thesis: string | null;
  recommendation: "invest" | "pass" | "more_diligence" | "pending" | null;
  status: "draft" | "in_review" | "approved" | "rejected";
  reviewed_by: string | null;
  review_notes: string | null;
  full_text: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  company?: Company;
}

export interface KpiTemplate {
  id: string;
  name: string;
  unit: string | null;
  description: string | null;
  frequency: "monthly" | "quarterly" | "annually" | null;
  category: "revenue" | "growth" | "users" | "efficiency" | "team" | "custom" | null;
  created_at: string;
}

export interface KpiEntry {
  id: string;
  company_id: string;
  kpi_template_id: string | null;
  name: string;
  value: number;
  unit: string | null;
  period_start: string;
  period_end: string;
  notes: string | null;
  reported_by: string | null;
  created_at: string;
}

export interface SourcingSignal {
  id: string;
  source: SignalSource;
  signal_type: "paper" | "grant" | "patent" | "funding" | "news" | "job_posting" | "other" | null;
  title: string | null;
  url: string | null;
  content: string | null;
  summary: string | null;
  relevance_score: number | null;
  sector_tags: string[] | null;
  authors: string[] | null;
  published_date: string | null;
  company_id: string | null;
  status: "new" | "reviewed" | "contacted" | "archived";
  reviewed_by: string | null;
  created_at: string;
  // v2 enrichment fields
  geography: string | null;
  technology_category: string | null;
  company_name: string | null;
  source_count: number;
  is_watchlisted: boolean;
  extra_urls: string[] | null;
}

export interface LpRelationship {
  id: string;
  company_id: string;
  contact_id: string | null;
  stage: LpStage | null;
  target_allocation: number | null;
  committed_amount: number | null;
  called_amount: number | null;
  fund_vehicle: string | null;
  next_step: string | null;
  next_step_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  company?: Company;
  contact?: Contact;
}

// ── Supabase Database type (used to type the Supabase client) ─────────────────
// Includes all required fields for Supabase v2 TypeScript inference to work
// (Relationships, Views, Functions, Enums, CompositeTypes).
export type Database = {
  public: {
    Tables: {
      profiles:           { Row: Profile;          Insert: Partial<Profile>;          Update: Partial<Profile>;          Relationships: [] };
      companies:          { Row: Company;           Insert: Partial<Company>;           Update: Partial<Company>;           Relationships: [] };
      contacts:           { Row: Contact;           Insert: Partial<Contact>;           Update: Partial<Contact>;           Relationships: [] };
      interactions:       { Row: Interaction;       Insert: Partial<Interaction>;       Update: Partial<Interaction>;       Relationships: [] };
      deals:              { Row: Deal;              Insert: Partial<Deal>;              Update: Partial<Deal>;              Relationships: [] };
      documents:          { Row: { id: string; company_id: string | null; name: string; type: string | null; file_url: string | null; storage_path: string | null; ai_summary: string | null; created_at: string }; Insert: Partial<{ company_id: string | null; name: string; type: string | null; file_url: string | null; storage_path: string | null; ai_summary: string | null }>; Update: Partial<{ name: string; type: string | null; file_url: string | null; ai_summary: string | null }>; Relationships: [] };
      ic_memos:           { Row: IcMemo;            Insert: Partial<IcMemo>;            Update: Partial<IcMemo>;            Relationships: [] };
      kpi_templates:      { Row: KpiTemplate;       Insert: Partial<KpiTemplate>;       Update: Partial<KpiTemplate>;       Relationships: [] };
      kpi_entries:        { Row: KpiEntry;          Insert: Partial<KpiEntry>;          Update: Partial<KpiEntry>;          Relationships: [] };
      sourcing_signals:   { Row: SourcingSignal;    Insert: Partial<SourcingSignal>;    Update: Partial<SourcingSignal>;    Relationships: [] };
      lp_relationships:   { Row: LpRelationship;    Insert: Partial<LpRelationship>;    Update: Partial<LpRelationship>;    Relationships: [] };
      chat_sessions:      { Row: { id: string; title: string; created_by: string | null; created_at: string; updated_at: string }; Insert: Partial<{ id: string; title: string; created_by: string | null }>; Update: Partial<{ title: string }>; Relationships: [] };
      chat_messages:      { Row: { id: string; session_id: string; role: "user" | "assistant"; content: string; context_used: string[] | null; created_at: string }; Insert: Partial<{ session_id: string; role: "user" | "assistant"; content: string; context_used: string[] | null }>; Update: never; Relationships: [] };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
