-- ─── Migration 027: RLS Auth Subquery Rewrite ───────────────────────────────
-- Replaces all auth.role() = 'authenticated' patterns with the safer
-- (select auth.uid()) IS NOT NULL pattern (avoids per-row auth function calls).
-- Uses create-before-drop to ensure zero downtime / no access gap.
-- Covers 28 tables.

-- ── companies ─────────────────────────────────────────────────────────────────
CREATE POLICY "companies_select_v2" ON public.companies FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "companies_insert_v2" ON public.companies FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "companies_update_v2" ON public.companies FOR UPDATE USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "companies_delete_v2" ON public.companies FOR DELETE USING ((select auth.uid()) IS NOT NULL);
DROP POLICY IF EXISTS "companies_select" ON public.companies;
DROP POLICY IF EXISTS "companies_insert" ON public.companies;
DROP POLICY IF EXISTS "companies_update" ON public.companies;
DROP POLICY IF EXISTS "companies_delete" ON public.companies;
DROP POLICY IF EXISTS "Authenticated users can read companies" ON public.companies;
DROP POLICY IF EXISTS "Authenticated users can insert companies" ON public.companies;
DROP POLICY IF EXISTS "Authenticated users can update companies" ON public.companies;
DROP POLICY IF EXISTS "Authenticated users can delete companies" ON public.companies;

-- ── contacts ──────────────────────────────────────────────────────────────────
CREATE POLICY "contacts_select_v2" ON public.contacts FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "contacts_insert_v2" ON public.contacts FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "contacts_update_v2" ON public.contacts FOR UPDATE USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "contacts_delete_v2" ON public.contacts FOR DELETE USING ((select auth.uid()) IS NOT NULL);
DROP POLICY IF EXISTS "contacts_select" ON public.contacts;
DROP POLICY IF EXISTS "contacts_insert" ON public.contacts;
DROP POLICY IF EXISTS "contacts_update" ON public.contacts;
DROP POLICY IF EXISTS "contacts_delete" ON public.contacts;
DROP POLICY IF EXISTS "Authenticated users can read contacts" ON public.contacts;
DROP POLICY IF EXISTS "Authenticated users can insert contacts" ON public.contacts;
DROP POLICY IF EXISTS "Authenticated users can update contacts" ON public.contacts;
DROP POLICY IF EXISTS "Authenticated users can delete contacts" ON public.contacts;

-- ── interactions ──────────────────────────────────────────────────────────────
CREATE POLICY "interactions_select_v2" ON public.interactions FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "interactions_insert_v2" ON public.interactions FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "interactions_update_v2" ON public.interactions FOR UPDATE USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "interactions_delete_v2" ON public.interactions FOR DELETE USING ((select auth.uid()) IS NOT NULL);
DROP POLICY IF EXISTS "interactions_select" ON public.interactions;
DROP POLICY IF EXISTS "interactions_insert" ON public.interactions;
DROP POLICY IF EXISTS "interactions_update" ON public.interactions;
DROP POLICY IF EXISTS "interactions_delete" ON public.interactions;
DROP POLICY IF EXISTS "Authenticated users can read interactions" ON public.interactions;
DROP POLICY IF EXISTS "Authenticated users can insert interactions" ON public.interactions;
DROP POLICY IF EXISTS "Authenticated users can update interactions" ON public.interactions;
DROP POLICY IF EXISTS "Authenticated users can delete interactions" ON public.interactions;

-- ── deals ─────────────────────────────────────────────────────────────────────
CREATE POLICY "deals_select_v2" ON public.deals FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "deals_insert_v2" ON public.deals FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "deals_update_v2" ON public.deals FOR UPDATE USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "deals_delete_v2" ON public.deals FOR DELETE USING ((select auth.uid()) IS NOT NULL);
DROP POLICY IF EXISTS "deals_select" ON public.deals;
DROP POLICY IF EXISTS "deals_insert" ON public.deals;
DROP POLICY IF EXISTS "deals_update" ON public.deals;
DROP POLICY IF EXISTS "deals_delete" ON public.deals;
DROP POLICY IF EXISTS "Authenticated users can read deals" ON public.deals;
DROP POLICY IF EXISTS "Authenticated users can insert deals" ON public.deals;
DROP POLICY IF EXISTS "Authenticated users can update deals" ON public.deals;
DROP POLICY IF EXISTS "Authenticated users can delete deals" ON public.deals;

-- ── documents ─────────────────────────────────────────────────────────────────
CREATE POLICY "documents_select_v2" ON public.documents FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "documents_insert_v2" ON public.documents FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "documents_update_v2" ON public.documents FOR UPDATE USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "documents_delete_v2" ON public.documents FOR DELETE USING ((select auth.uid()) IS NOT NULL);
DROP POLICY IF EXISTS "documents_select" ON public.documents;
DROP POLICY IF EXISTS "documents_insert" ON public.documents;
DROP POLICY IF EXISTS "documents_update" ON public.documents;
DROP POLICY IF EXISTS "documents_delete" ON public.documents;
DROP POLICY IF EXISTS "Authenticated users can read documents" ON public.documents;
DROP POLICY IF EXISTS "Authenticated users can insert documents" ON public.documents;
DROP POLICY IF EXISTS "Authenticated users can update documents" ON public.documents;
DROP POLICY IF EXISTS "Authenticated users can delete documents" ON public.documents;

-- ── ic_memos ──────────────────────────────────────────────────────────────────
CREATE POLICY "ic_memos_select_v2" ON public.ic_memos FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "ic_memos_insert_v2" ON public.ic_memos FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "ic_memos_update_v2" ON public.ic_memos FOR UPDATE USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "ic_memos_delete_v2" ON public.ic_memos FOR DELETE USING ((select auth.uid()) IS NOT NULL);
DROP POLICY IF EXISTS "ic_memos_select" ON public.ic_memos;
DROP POLICY IF EXISTS "ic_memos_insert" ON public.ic_memos;
DROP POLICY IF EXISTS "ic_memos_update" ON public.ic_memos;
DROP POLICY IF EXISTS "ic_memos_delete" ON public.ic_memos;
DROP POLICY IF EXISTS "Authenticated users can read ic_memos" ON public.ic_memos;
DROP POLICY IF EXISTS "Authenticated users can insert ic_memos" ON public.ic_memos;
DROP POLICY IF EXISTS "Authenticated users can update ic_memos" ON public.ic_memos;
DROP POLICY IF EXISTS "Authenticated users can delete ic_memos" ON public.ic_memos;

-- ── kpi_entries ───────────────────────────────────────────────────────────────
CREATE POLICY "kpi_entries_select_v2" ON public.kpi_entries FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "kpi_entries_insert_v2" ON public.kpi_entries FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "kpi_entries_update_v2" ON public.kpi_entries FOR UPDATE USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "kpi_entries_delete_v2" ON public.kpi_entries FOR DELETE USING ((select auth.uid()) IS NOT NULL);
DROP POLICY IF EXISTS "kpi_entries_select" ON public.kpi_entries;
DROP POLICY IF EXISTS "kpi_entries_insert" ON public.kpi_entries;
DROP POLICY IF EXISTS "kpi_entries_update" ON public.kpi_entries;
DROP POLICY IF EXISTS "kpi_entries_delete" ON public.kpi_entries;
DROP POLICY IF EXISTS "Authenticated users can read kpi_entries" ON public.kpi_entries;
DROP POLICY IF EXISTS "Authenticated users can insert kpi_entries" ON public.kpi_entries;
DROP POLICY IF EXISTS "Authenticated users can update kpi_entries" ON public.kpi_entries;
DROP POLICY IF EXISTS "Authenticated users can delete kpi_entries" ON public.kpi_entries;

-- ── kpi_templates ─────────────────────────────────────────────────────────────
CREATE POLICY "kpi_templates_select_v2" ON public.kpi_templates FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "kpi_templates_insert_v2" ON public.kpi_templates FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "kpi_templates_update_v2" ON public.kpi_templates FOR UPDATE USING ((select auth.uid()) IS NOT NULL);
DROP POLICY IF EXISTS "kpi_templates_select" ON public.kpi_templates;
DROP POLICY IF EXISTS "kpi_templates_insert" ON public.kpi_templates;
DROP POLICY IF EXISTS "kpi_templates_update" ON public.kpi_templates;
DROP POLICY IF EXISTS "Authenticated users can read kpi_templates" ON public.kpi_templates;
DROP POLICY IF EXISTS "Authenticated users can insert kpi_templates" ON public.kpi_templates;
DROP POLICY IF EXISTS "Authenticated users can update kpi_templates" ON public.kpi_templates;

-- ── sourcing_signals ──────────────────────────────────────────────────────────
CREATE POLICY "sourcing_signals_select_v2" ON public.sourcing_signals FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "sourcing_signals_insert_v2" ON public.sourcing_signals FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "sourcing_signals_update_v2" ON public.sourcing_signals FOR UPDATE USING ((select auth.uid()) IS NOT NULL);
DROP POLICY IF EXISTS "sourcing_signals_select" ON public.sourcing_signals;
DROP POLICY IF EXISTS "sourcing_signals_insert" ON public.sourcing_signals;
DROP POLICY IF EXISTS "sourcing_signals_update" ON public.sourcing_signals;
DROP POLICY IF EXISTS "Authenticated users can read sourcing_signals" ON public.sourcing_signals;
DROP POLICY IF EXISTS "Authenticated users can insert sourcing_signals" ON public.sourcing_signals;
DROP POLICY IF EXISTS "Authenticated users can update sourcing_signals" ON public.sourcing_signals;

-- ── lp_relationships ──────────────────────────────────────────────────────────
CREATE POLICY "lp_relationships_select_v2" ON public.lp_relationships FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "lp_relationships_insert_v2" ON public.lp_relationships FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "lp_relationships_update_v2" ON public.lp_relationships FOR UPDATE USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "lp_relationships_delete_v2" ON public.lp_relationships FOR DELETE USING ((select auth.uid()) IS NOT NULL);
DROP POLICY IF EXISTS "lp_relationships_select" ON public.lp_relationships;
DROP POLICY IF EXISTS "lp_relationships_insert" ON public.lp_relationships;
DROP POLICY IF EXISTS "lp_relationships_update" ON public.lp_relationships;
DROP POLICY IF EXISTS "lp_relationships_delete" ON public.lp_relationships;
DROP POLICY IF EXISTS "Authenticated users can read lp_relationships" ON public.lp_relationships;
DROP POLICY IF EXISTS "Authenticated users can insert lp_relationships" ON public.lp_relationships;
DROP POLICY IF EXISTS "Authenticated users can update lp_relationships" ON public.lp_relationships;
DROP POLICY IF EXISTS "Authenticated users can delete lp_relationships" ON public.lp_relationships;

-- ── chat_sessions ─────────────────────────────────────────────────────────────
CREATE POLICY "chat_sessions_select_v2" ON public.chat_sessions FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "chat_sessions_insert_v2" ON public.chat_sessions FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "chat_sessions_update_v2" ON public.chat_sessions FOR UPDATE USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "chat_sessions_delete_v2" ON public.chat_sessions FOR DELETE USING ((select auth.uid()) IS NOT NULL);
DROP POLICY IF EXISTS "chat_sessions_select" ON public.chat_sessions;
DROP POLICY IF EXISTS "chat_sessions_insert" ON public.chat_sessions;
DROP POLICY IF EXISTS "chat_sessions_update" ON public.chat_sessions;
DROP POLICY IF EXISTS "chat_sessions_delete" ON public.chat_sessions;
DROP POLICY IF EXISTS "Authenticated users can read chat_sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Authenticated users can insert chat_sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Authenticated users can update chat_sessions" ON public.chat_sessions;
DROP POLICY IF EXISTS "Authenticated users can delete chat_sessions" ON public.chat_sessions;

-- ── chat_messages ─────────────────────────────────────────────────────────────
CREATE POLICY "chat_messages_select_v2" ON public.chat_messages FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "chat_messages_insert_v2" ON public.chat_messages FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "chat_messages_update_v2" ON public.chat_messages FOR UPDATE USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "chat_messages_delete_v2" ON public.chat_messages FOR DELETE USING ((select auth.uid()) IS NOT NULL);
DROP POLICY IF EXISTS "chat_messages_select" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_insert" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_update" ON public.chat_messages;
DROP POLICY IF EXISTS "chat_messages_delete" ON public.chat_messages;
DROP POLICY IF EXISTS "Authenticated users can read chat_messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Authenticated users can insert chat_messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Authenticated users can update chat_messages" ON public.chat_messages;
DROP POLICY IF EXISTS "Authenticated users can delete chat_messages" ON public.chat_messages;

-- ── profiles ──────────────────────────────────────────────────────────────────
-- profiles has owner-scoped policies (users only see/edit their own row)
CREATE POLICY "profiles_select_v2" ON public.profiles FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "profiles_insert_v2" ON public.profiles FOR INSERT WITH CHECK ((select auth.uid()) = id);
CREATE POLICY "profiles_update_v2" ON public.profiles FOR UPDATE USING ((select auth.uid()) = id);
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- ── agent_configs ─────────────────────────────────────────────────────────────
CREATE POLICY "agent_configs_select_v2" ON public.agent_configs FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "agent_configs_insert_v2" ON public.agent_configs FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "agent_configs_update_v2" ON public.agent_configs FOR UPDATE USING ((select auth.uid()) IS NOT NULL);
DROP POLICY IF EXISTS "agent_configs_select" ON public.agent_configs;
DROP POLICY IF EXISTS "agent_configs_insert" ON public.agent_configs;
DROP POLICY IF EXISTS "agent_configs_update" ON public.agent_configs;
DROP POLICY IF EXISTS "Authenticated users can read agent_configs" ON public.agent_configs;
DROP POLICY IF EXISTS "Authenticated users can insert agent_configs" ON public.agent_configs;
DROP POLICY IF EXISTS "Authenticated users can update agent_configs" ON public.agent_configs;

-- ── ai_configs ────────────────────────────────────────────────────────────────
CREATE POLICY "ai_configs_select_v2" ON public.ai_configs FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "ai_configs_insert_v2" ON public.ai_configs FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "ai_configs_update_v2" ON public.ai_configs FOR UPDATE USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "ai_configs_delete_v2" ON public.ai_configs FOR DELETE USING ((select auth.uid()) IS NOT NULL);
DROP POLICY IF EXISTS "ai_configs_select" ON public.ai_configs;
DROP POLICY IF EXISTS "ai_configs_insert" ON public.ai_configs;
DROP POLICY IF EXISTS "ai_configs_update" ON public.ai_configs;
DROP POLICY IF EXISTS "ai_configs_delete" ON public.ai_configs;
DROP POLICY IF EXISTS "Authenticated users can read ai_configs" ON public.ai_configs;
DROP POLICY IF EXISTS "Authenticated users can insert ai_configs" ON public.ai_configs;
DROP POLICY IF EXISTS "Authenticated users can update ai_configs" ON public.ai_configs;
DROP POLICY IF EXISTS "Authenticated users can delete ai_configs" ON public.ai_configs;

-- ── archived_external_meetings ────────────────────────────────────────────────
CREATE POLICY "archived_external_meetings_select_v2" ON public.archived_external_meetings FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "archived_external_meetings_insert_v2" ON public.archived_external_meetings FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "archived_external_meetings_update_v2" ON public.archived_external_meetings FOR UPDATE USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "archived_external_meetings_delete_v2" ON public.archived_external_meetings FOR DELETE USING ((select auth.uid()) IS NOT NULL);
DROP POLICY IF EXISTS "archived_external_meetings_select" ON public.archived_external_meetings;
DROP POLICY IF EXISTS "archived_external_meetings_insert" ON public.archived_external_meetings;
DROP POLICY IF EXISTS "archived_external_meetings_update" ON public.archived_external_meetings;
DROP POLICY IF EXISTS "archived_external_meetings_delete" ON public.archived_external_meetings;
DROP POLICY IF EXISTS "Authenticated full access" ON public.archived_external_meetings;

-- ── company_documents ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "company_documents_select" ON public.company_documents;
DROP POLICY IF EXISTS "company_documents_insert" ON public.company_documents;
DROP POLICY IF EXISTS "company_documents_update" ON public.company_documents;
DROP POLICY IF EXISTS "company_documents_delete" ON public.company_documents;
DROP POLICY IF EXISTS "Authenticated full access" ON public.company_documents;
DROP POLICY IF EXISTS "Authenticated users can view company documents" ON public.company_documents;
DROP POLICY IF EXISTS "Authenticated users can create company documents" ON public.company_documents;
DROP POLICY IF EXISTS "Authenticated users can update company documents" ON public.company_documents;
DROP POLICY IF EXISTS "Authenticated users can delete company documents" ON public.company_documents;

CREATE POLICY "company_documents_select_v2" ON public.company_documents FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "company_documents_insert_v2" ON public.company_documents FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "company_documents_update_v2" ON public.company_documents FOR UPDATE USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "company_documents_delete_v2" ON public.company_documents FOR DELETE USING ((select auth.uid()) IS NOT NULL);

-- ── fund_investments ──────────────────────────────────────────────────────────
CREATE POLICY "fund_investments_select_v2" ON public.fund_investments FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "fund_investments_insert_v2" ON public.fund_investments FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "fund_investments_update_v2" ON public.fund_investments FOR UPDATE USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "fund_investments_delete_v2" ON public.fund_investments FOR DELETE USING ((select auth.uid()) IS NOT NULL);
DROP POLICY IF EXISTS "fund_investments_select" ON public.fund_investments;
DROP POLICY IF EXISTS "fund_investments_insert" ON public.fund_investments;
DROP POLICY IF EXISTS "fund_investments_update" ON public.fund_investments;
DROP POLICY IF EXISTS "fund_investments_delete" ON public.fund_investments;
DROP POLICY IF EXISTS "Authenticated full access" ON public.fund_investments;

-- ── fund_portfolio_overlap ────────────────────────────────────────────────────
CREATE POLICY "fund_portfolio_overlap_select_v2" ON public.fund_portfolio_overlap FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "fund_portfolio_overlap_insert_v2" ON public.fund_portfolio_overlap FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "fund_portfolio_overlap_update_v2" ON public.fund_portfolio_overlap FOR UPDATE USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "fund_portfolio_overlap_delete_v2" ON public.fund_portfolio_overlap FOR DELETE USING ((select auth.uid()) IS NOT NULL);
DROP POLICY IF EXISTS "fund_portfolio_overlap_select" ON public.fund_portfolio_overlap;
DROP POLICY IF EXISTS "fund_portfolio_overlap_insert" ON public.fund_portfolio_overlap;
DROP POLICY IF EXISTS "fund_portfolio_overlap_update" ON public.fund_portfolio_overlap;
DROP POLICY IF EXISTS "fund_portfolio_overlap_delete" ON public.fund_portfolio_overlap;
DROP POLICY IF EXISTS "Authenticated full access" ON public.fund_portfolio_overlap;

-- ── interaction_timeline ──────────────────────────────────────────────────────
CREATE POLICY "interaction_timeline_select_v2" ON public.interaction_timeline FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "interaction_timeline_insert_v2" ON public.interaction_timeline FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "interaction_timeline_update_v2" ON public.interaction_timeline FOR UPDATE USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "interaction_timeline_delete_v2" ON public.interaction_timeline FOR DELETE USING ((select auth.uid()) IS NOT NULL);
DROP POLICY IF EXISTS "interaction_timeline_select" ON public.interaction_timeline;
DROP POLICY IF EXISTS "interaction_timeline_insert" ON public.interaction_timeline;
DROP POLICY IF EXISTS "interaction_timeline_update" ON public.interaction_timeline;
DROP POLICY IF EXISTS "interaction_timeline_delete" ON public.interaction_timeline;
DROP POLICY IF EXISTS "Authenticated full access" ON public.interaction_timeline;

-- ── meeting_action_items ──────────────────────────────────────────────────────
CREATE POLICY "meeting_action_items_select_v2" ON public.meeting_action_items FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "meeting_action_items_insert_v2" ON public.meeting_action_items FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "meeting_action_items_update_v2" ON public.meeting_action_items FOR UPDATE USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "meeting_action_items_delete_v2" ON public.meeting_action_items FOR DELETE USING ((select auth.uid()) IS NOT NULL);
DROP POLICY IF EXISTS "meeting_action_items_select" ON public.meeting_action_items;
DROP POLICY IF EXISTS "meeting_action_items_insert" ON public.meeting_action_items;
DROP POLICY IF EXISTS "meeting_action_items_update" ON public.meeting_action_items;
DROP POLICY IF EXISTS "meeting_action_items_delete" ON public.meeting_action_items;
DROP POLICY IF EXISTS "Authenticated full access" ON public.meeting_action_items;

-- ── meeting_contacts ──────────────────────────────────────────────────────────
CREATE POLICY "meeting_contacts_select_v2" ON public.meeting_contacts FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "meeting_contacts_insert_v2" ON public.meeting_contacts FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "meeting_contacts_update_v2" ON public.meeting_contacts FOR UPDATE USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "meeting_contacts_delete_v2" ON public.meeting_contacts FOR DELETE USING ((select auth.uid()) IS NOT NULL);
DROP POLICY IF EXISTS "meeting_contacts_select" ON public.meeting_contacts;
DROP POLICY IF EXISTS "meeting_contacts_insert" ON public.meeting_contacts;
DROP POLICY IF EXISTS "meeting_contacts_update" ON public.meeting_contacts;
DROP POLICY IF EXISTS "meeting_contacts_delete" ON public.meeting_contacts;
DROP POLICY IF EXISTS "Authenticated full access" ON public.meeting_contacts;

-- ── meeting_crm_sync_log ──────────────────────────────────────────────────────
CREATE POLICY "meeting_crm_sync_log_select_v2" ON public.meeting_crm_sync_log FOR SELECT USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "meeting_crm_sync_log_insert_v2" ON public.meeting_crm_sync_log FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
CREATE POLICY "meeting_crm_sync_log_update_v2" ON public.meeting_crm_sync_log FOR UPDATE USING ((select auth.uid()) IS NOT NULL);
CREATE POLICY "meeting_crm_sync_log_delete_v2" ON public.meeting_crm_sync_log FOR DELETE USING ((select auth.uid()) IS NOT NULL);
DROP POLICY IF EXISTS "meeting_crm_sync_log_select" ON public.meeting_crm_sync_log;
DROP POLICY IF EXISTS "meeting_crm_sync_log_insert" ON public.meeting_crm_sync_log;
DROP POLICY IF EXISTS "meeting_crm_sync_log_update" ON public.meeting_crm_sync_log;
DROP POLICY IF EXISTS "meeting_crm_sync_log_delete" ON public.meeting_crm_sync_log;
DROP POLICY IF EXISTS "Authenticated full access" ON public.meeting_crm_sync_log;
