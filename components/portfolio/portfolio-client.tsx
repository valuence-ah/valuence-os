"use client";
// ─── Portfolio Intelligence Hub — Split-Pane Client ───────────────────────────
// Left panel: company list sorted by runway. Right panel: detail tabs.
// Fetches company detail (KPIs, milestones, initiatives, intelligence,
// interactions, contacts, reports, signals) on selection.

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  Company, PortfolioKpi, PortfolioMilestone, PortfolioInitiative,
  PortfolioIntelligence, PortfolioReport, Interaction, Contact, FeedArticle,
} from "@/lib/types";
import { PortfolioStatTiles } from "./portfolio-stat-tiles";
import { PortfolioCompanyList } from "./portfolio-company-list";
import { PortfolioDetailPanel } from "./portfolio-detail-panel";
import { BarChart3 } from "lucide-react";

interface CompanyDetail {
  kpis: PortfolioKpi[];
  milestones: PortfolioMilestone[];
  initiatives: PortfolioInitiative[];
  intelligence: PortfolioIntelligence[];
  interactions: Interaction[];
  contacts: Contact[];
  reports: PortfolioReport[];
  signals: FeedArticle[];
}

interface Props {
  companies: Company[];
}

export function PortfolioClient({ companies: initial }: Props) {
  const supabase = createClient();
  const [companies, setCompanies] = useState<Company[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  const [detail, setDetail] = useState<CompanyDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const selectedCompany = companies.find(c => c.id === selectedId) ?? null;

  const fetchDetail = useCallback(async (companyId: string) => {
    setLoadingDetail(true);
    const [kpisRes, milestonesRes, initiativesRes, intelligenceRes, interactionsRes, contactsRes, reportsRes, signalsRes] =
      await Promise.all([
        supabase.from("portfolio_kpis").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(4),
        supabase.from("portfolio_milestones").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
        supabase.from("portfolio_initiatives").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
        supabase.from("portfolio_intelligence").select("*").eq("company_id", companyId).order("last_refreshed", { ascending: false }),
        supabase.from("interactions").select("*").eq("company_id", companyId).order("date", { ascending: false }).limit(10),
        supabase.from("contacts").select("*").eq("company_id", companyId).order("last_contact_date", { ascending: false }).limit(10),
        supabase.from("portfolio_reports").select("*").eq("company_id", companyId).order("uploaded_at", { ascending: false }).limit(10),
        supabase.from("feed_articles").select("*").contains("matched_company_ids", [companyId]).order("published_at", { ascending: false }).limit(10),
      ]);

    setDetail({
      kpis:         (kpisRes.data ?? []) as PortfolioKpi[],
      milestones:   (milestonesRes.data ?? []) as PortfolioMilestone[],
      initiatives:  (initiativesRes.data ?? []) as PortfolioInitiative[],
      intelligence: (intelligenceRes.data ?? []) as PortfolioIntelligence[],
      interactions: (interactionsRes.data ?? []) as Interaction[],
      contacts:     (contactsRes.data ?? []) as Contact[],
      reports:      (reportsRes.data ?? []) as PortfolioReport[],
      signals:      (signalsRes.data ?? []) as FeedArticle[],
    });
    setLoadingDetail(false);
  }, [supabase]);

  async function handleSelect(id: string) {
    setSelectedId(id);
    setDetail(null);
    await fetchDetail(id);
  }

  async function handleUploadSuccess() {
    // Re-fetch company list to get updated health_status / runway
    const { data: updated } = await supabase
      .from("companies")
      .select("*")
      .eq("deal_status", "portfolio")
      .order("runway_months", { ascending: true, nullsFirst: false });
    if (updated) setCompanies(updated as Company[]);
    if (selectedId) await fetchDetail(selectedId);
  }

  async function handleIntelligenceRefresh() {
    if (selectedId) await fetchDetail(selectedId);
  }

  if (companies.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <BarChart3 size={36} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No portfolio companies yet</p>
          <p className="text-xs text-slate-400 mt-1">Mark companies as &ldquo;Portfolio&rdquo; in the Pipeline CRM.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Stat tiles */}
      <div className="px-5 pt-4 flex-shrink-0">
        <PortfolioStatTiles companies={companies} />
      </div>

      {/* Split pane */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: company list */}
        <PortfolioCompanyList
          companies={companies}
          selectedId={selectedId}
          onSelect={handleSelect}
        />

        {/* Right: detail panel */}
        <div className="flex-1 overflow-hidden">
          {selectedCompany ? (
            <PortfolioDetailPanel
              company={selectedCompany}
              detail={loadingDetail ? null : detail}
              onUploadSuccess={handleUploadSuccess}
              onIntelligenceRefresh={handleIntelligenceRefresh}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
              Select a company to view details
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
