-- ─── Migration 026: Fix USING(true) RLS Policies ────────────────────────────
-- Replaces all USING(true) / WITH CHECK(true) policies with proper
-- authenticated checks using (select auth.uid()) IS NOT NULL.
-- Also drops legacy allow_all_* policies on grant tables that conflict
-- with newer policies, and adds missing DELETE policies.

-- ── Feed tables ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Anyone can view feed articles" ON public.feed_articles;
DROP POLICY IF EXISTS "Anyone can manage feed articles" ON public.feed_articles;
DROP POLICY IF EXISTS "Allow all on feed_articles" ON public.feed_articles;

DROP POLICY IF EXISTS "feed_articles_select" ON public.feed_articles;
CREATE POLICY "feed_articles_select"
  ON public.feed_articles FOR SELECT
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "feed_articles_insert" ON public.feed_articles;
CREATE POLICY "feed_articles_insert"
  ON public.feed_articles FOR INSERT
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "feed_articles_update" ON public.feed_articles;
CREATE POLICY "feed_articles_update"
  ON public.feed_articles FOR UPDATE
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "feed_articles_delete" ON public.feed_articles;
CREATE POLICY "feed_articles_delete"
  ON public.feed_articles FOR DELETE
  USING ((select auth.uid()) IS NOT NULL);

-- feed_sources
DROP POLICY IF EXISTS "Anyone can view feed sources" ON public.feed_sources;
DROP POLICY IF EXISTS "Anyone can manage feed sources" ON public.feed_sources;
DROP POLICY IF EXISTS "Allow all on feed_sources" ON public.feed_sources;

DROP POLICY IF EXISTS "feed_sources_select" ON public.feed_sources;
CREATE POLICY "feed_sources_select"
  ON public.feed_sources FOR SELECT
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "feed_sources_insert" ON public.feed_sources;
CREATE POLICY "feed_sources_insert"
  ON public.feed_sources FOR INSERT
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "feed_sources_update" ON public.feed_sources;
CREATE POLICY "feed_sources_update"
  ON public.feed_sources FOR UPDATE
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "feed_sources_delete" ON public.feed_sources;
CREATE POLICY "feed_sources_delete"
  ON public.feed_sources FOR DELETE
  USING ((select auth.uid()) IS NOT NULL);

-- feed_watchlist
DROP POLICY IF EXISTS "Anyone can view feed watchlist" ON public.feed_watchlist;
DROP POLICY IF EXISTS "Anyone can manage feed watchlist" ON public.feed_watchlist;
DROP POLICY IF EXISTS "Allow all on feed_watchlist" ON public.feed_watchlist;

DROP POLICY IF EXISTS "feed_watchlist_select" ON public.feed_watchlist;
CREATE POLICY "feed_watchlist_select"
  ON public.feed_watchlist FOR SELECT
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "feed_watchlist_insert" ON public.feed_watchlist;
CREATE POLICY "feed_watchlist_insert"
  ON public.feed_watchlist FOR INSERT
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "feed_watchlist_update" ON public.feed_watchlist;
CREATE POLICY "feed_watchlist_update"
  ON public.feed_watchlist FOR UPDATE
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "feed_watchlist_delete" ON public.feed_watchlist;
CREATE POLICY "feed_watchlist_delete"
  ON public.feed_watchlist FOR DELETE
  USING ((select auth.uid()) IS NOT NULL);

-- ── Portfolio tables ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated full access" ON public.portfolio_companies;
DROP POLICY IF EXISTS "portfolio_companies_all" ON public.portfolio_companies;

DROP POLICY IF EXISTS "portfolio_companies_select" ON public.portfolio_companies;
CREATE POLICY "portfolio_companies_select"
  ON public.portfolio_companies FOR SELECT
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "portfolio_companies_insert" ON public.portfolio_companies;
CREATE POLICY "portfolio_companies_insert"
  ON public.portfolio_companies FOR INSERT
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "portfolio_companies_update" ON public.portfolio_companies;
CREATE POLICY "portfolio_companies_update"
  ON public.portfolio_companies FOR UPDATE
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "portfolio_companies_delete" ON public.portfolio_companies;
CREATE POLICY "portfolio_companies_delete"
  ON public.portfolio_companies FOR DELETE
  USING ((select auth.uid()) IS NOT NULL);

-- portfolio_kpis
DROP POLICY IF EXISTS "Authenticated full access" ON public.portfolio_kpis;
DROP POLICY IF EXISTS "portfolio_kpis_all" ON public.portfolio_kpis;

DROP POLICY IF EXISTS "portfolio_kpis_select" ON public.portfolio_kpis;
CREATE POLICY "portfolio_kpis_select"
  ON public.portfolio_kpis FOR SELECT
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "portfolio_kpis_insert" ON public.portfolio_kpis;
CREATE POLICY "portfolio_kpis_insert"
  ON public.portfolio_kpis FOR INSERT
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "portfolio_kpis_update" ON public.portfolio_kpis;
CREATE POLICY "portfolio_kpis_update"
  ON public.portfolio_kpis FOR UPDATE
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "portfolio_kpis_delete" ON public.portfolio_kpis;
CREATE POLICY "portfolio_kpis_delete"
  ON public.portfolio_kpis FOR DELETE
  USING ((select auth.uid()) IS NOT NULL);

-- portfolio_milestones
DROP POLICY IF EXISTS "Authenticated full access" ON public.portfolio_milestones;
DROP POLICY IF EXISTS "portfolio_milestones_all" ON public.portfolio_milestones;

DROP POLICY IF EXISTS "portfolio_milestones_select" ON public.portfolio_milestones;
CREATE POLICY "portfolio_milestones_select"
  ON public.portfolio_milestones FOR SELECT
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "portfolio_milestones_insert" ON public.portfolio_milestones;
CREATE POLICY "portfolio_milestones_insert"
  ON public.portfolio_milestones FOR INSERT
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "portfolio_milestones_update" ON public.portfolio_milestones;
CREATE POLICY "portfolio_milestones_update"
  ON public.portfolio_milestones FOR UPDATE
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "portfolio_milestones_delete" ON public.portfolio_milestones;
CREATE POLICY "portfolio_milestones_delete"
  ON public.portfolio_milestones FOR DELETE
  USING ((select auth.uid()) IS NOT NULL);

-- portfolio_initiatives
DROP POLICY IF EXISTS "Authenticated full access" ON public.portfolio_initiatives;
DROP POLICY IF EXISTS "portfolio_initiatives_all" ON public.portfolio_initiatives;

DROP POLICY IF EXISTS "portfolio_initiatives_select" ON public.portfolio_initiatives;
CREATE POLICY "portfolio_initiatives_select"
  ON public.portfolio_initiatives FOR SELECT
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "portfolio_initiatives_insert" ON public.portfolio_initiatives;
CREATE POLICY "portfolio_initiatives_insert"
  ON public.portfolio_initiatives FOR INSERT
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "portfolio_initiatives_update" ON public.portfolio_initiatives;
CREATE POLICY "portfolio_initiatives_update"
  ON public.portfolio_initiatives FOR UPDATE
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "portfolio_initiatives_delete" ON public.portfolio_initiatives;
CREATE POLICY "portfolio_initiatives_delete"
  ON public.portfolio_initiatives FOR DELETE
  USING ((select auth.uid()) IS NOT NULL);

-- portfolio_risks
DROP POLICY IF EXISTS "Authenticated full access" ON public.portfolio_risks;
DROP POLICY IF EXISTS "portfolio_risks_all" ON public.portfolio_risks;

DROP POLICY IF EXISTS "portfolio_risks_select" ON public.portfolio_risks;
CREATE POLICY "portfolio_risks_select"
  ON public.portfolio_risks FOR SELECT
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "portfolio_risks_insert" ON public.portfolio_risks;
CREATE POLICY "portfolio_risks_insert"
  ON public.portfolio_risks FOR INSERT
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "portfolio_risks_update" ON public.portfolio_risks;
CREATE POLICY "portfolio_risks_update"
  ON public.portfolio_risks FOR UPDATE
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "portfolio_risks_delete" ON public.portfolio_risks;
CREATE POLICY "portfolio_risks_delete"
  ON public.portfolio_risks FOR DELETE
  USING ((select auth.uid()) IS NOT NULL);

-- portfolio_reports
DROP POLICY IF EXISTS "Authenticated full access" ON public.portfolio_reports;
DROP POLICY IF EXISTS "portfolio_reports_all" ON public.portfolio_reports;

DROP POLICY IF EXISTS "portfolio_reports_select" ON public.portfolio_reports;
CREATE POLICY "portfolio_reports_select"
  ON public.portfolio_reports FOR SELECT
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "portfolio_reports_insert" ON public.portfolio_reports;
CREATE POLICY "portfolio_reports_insert"
  ON public.portfolio_reports FOR INSERT
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "portfolio_reports_update" ON public.portfolio_reports;
CREATE POLICY "portfolio_reports_update"
  ON public.portfolio_reports FOR UPDATE
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "portfolio_reports_delete" ON public.portfolio_reports;
CREATE POLICY "portfolio_reports_delete"
  ON public.portfolio_reports FOR DELETE
  USING ((select auth.uid()) IS NOT NULL);

-- ── thesis_keywords ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Anyone can view thesis keywords" ON public.thesis_keywords;
DROP POLICY IF EXISTS "Anyone can manage thesis keywords" ON public.thesis_keywords;
DROP POLICY IF EXISTS "Allow all on thesis_keywords" ON public.thesis_keywords;

DROP POLICY IF EXISTS "thesis_keywords_select" ON public.thesis_keywords;
CREATE POLICY "thesis_keywords_select"
  ON public.thesis_keywords FOR SELECT
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "thesis_keywords_insert" ON public.thesis_keywords;
CREATE POLICY "thesis_keywords_insert"
  ON public.thesis_keywords FOR INSERT
  WITH CHECK ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "thesis_keywords_update" ON public.thesis_keywords;
CREATE POLICY "thesis_keywords_update"
  ON public.thesis_keywords FOR UPDATE
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "thesis_keywords_delete" ON public.thesis_keywords;
CREATE POLICY "thesis_keywords_delete"
  ON public.thesis_keywords FOR DELETE
  USING ((select auth.uid()) IS NOT NULL);

-- ── Fix missing DELETE policies ───────────────────────────────────────────────

DROP POLICY IF EXISTS "sourcing_signals_delete" ON public.sourcing_signals;
CREATE POLICY "sourcing_signals_delete"
  ON public.sourcing_signals FOR DELETE
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "kpi_templates_delete" ON public.kpi_templates;
CREATE POLICY "kpi_templates_delete"
  ON public.kpi_templates FOR DELETE
  USING ((select auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS "agent_configs_delete" ON public.agent_configs;
CREATE POLICY "agent_configs_delete"
  ON public.agent_configs FOR DELETE
  USING ((select auth.uid()) IS NOT NULL);
