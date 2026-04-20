"use client";
// ─── Portfolio Intelligence Hub — Split-Pane Client ───────────────────────────

import { useState, useCallback, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  Company, PortfolioKpi, PortfolioMilestone, PortfolioInitiative,
  PortfolioIntelligence, PortfolioReport, PortfolioValueAdd,
  Interaction, Contact, FeedArticle, PortfolioInvestment,
} from "@/lib/types";
import { PortfolioStatTiles } from "./portfolio-stat-tiles";
import { PortfolioCompanyList } from "./portfolio-company-list";
import { PortfolioDetailPanel } from "./portfolio-detail-panel";
import { BarChart3 } from "lucide-react";

export interface CompanyDetail {
  kpis: PortfolioKpi[];
  milestones: PortfolioMilestone[];
  initiatives: PortfolioInitiative[];
  intelligence: PortfolioIntelligence[];
  interactions: Interaction[];
  contacts: Contact[];
  reports: PortfolioReport[];
  signals: FeedArticle[];
  valueAdd: PortfolioValueAdd[];
  investments: PortfolioInvestment[];
}

interface Props {
  companies: Company[];
}

export function PortfolioClient({ companies: initial }: Props) {
  const [companies, setCompanies] = useState<Company[]>(initial);
  const [selectedId, setSelectedId] = useState<string | null>(initial[0]?.id ?? null);
  const [detail, setDetail] = useState<CompanyDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const selectedCompany = companies.find(c => c.id === selectedId) ?? null;

  const fetchDetail = useCallback(async (companyId: string) => {
    setLoadingDetail(true);
    const supabase = createClient();
    try {
      const [kpisRes, milestonesRes, initiativesRes, intelligenceRes,
             interactionsRes, contactsRes, reportsRes, signalsRes, valueAddRes, investmentsRes] =
        await Promise.all([
          supabase.from("portfolio_kpis").select("*").eq("company_id", companyId).order("created_at", { ascending: false }).limit(4),
          supabase.from("portfolio_milestones").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
          supabase.from("portfolio_initiatives").select("*").eq("company_id", companyId).order("created_at", { ascending: false }),
          supabase.from("portfolio_intelligence").select("*").eq("company_id", companyId).order("last_refreshed", { ascending: false }),
          supabase.from("interactions").select("*").eq("company_id", companyId).order("date", { ascending: false }).limit(10),
          supabase.from("contacts").select("*").eq("company_id", companyId).order("last_contact_date", { ascending: false }).limit(10),
          supabase.from("portfolio_reports").select("*").eq("company_id", companyId).order("uploaded_at", { ascending: false }).limit(10),
          supabase.from("feed_articles").select("*").contains("matched_company_ids", [companyId]).order("published_at", { ascending: false }).limit(10),
          supabase.from("portfolio_value_add").select("*").eq("company_id", companyId).order("date", { ascending: false }).limit(20),
          supabase.from("portfolio_investments").select("*").eq("company_id", companyId).order("close_date", { ascending: false }),
        ]);

      if (kpisRes.error) console.error("[portfolio] kpis:", kpisRes.error.message);
      if (milestonesRes.error) console.error("[portfolio] milestones:", milestonesRes.error.message);
      if (intelligenceRes.error) console.error("[portfolio] intelligence:", intelligenceRes.error.message);

      const interactions = (interactionsRes.data ?? []) as Interaction[];
      // Cache interactions so they appear instantly on next visit
      try { localStorage.setItem(`portfolio_timeline_${companyId}`, JSON.stringify({ interactions, cachedAt: new Date().toISOString() })); } catch {}

      setDetail({
        kpis:         (kpisRes.data ?? []) as PortfolioKpi[],
        milestones:   (milestonesRes.data ?? []) as PortfolioMilestone[],
        initiatives:  (initiativesRes.data ?? []) as PortfolioInitiative[],
        intelligence: (intelligenceRes.data ?? []) as PortfolioIntelligence[],
        interactions,
        contacts:     (contactsRes.data ?? []) as Contact[],
        reports:      (reportsRes.data ?? []) as PortfolioReport[],
        signals:      (signalsRes.data ?? []) as FeedArticle[],
        valueAdd:     (valueAddRes.data ?? []) as PortfolioValueAdd[],
        investments:  (investmentsRes.data ?? []) as PortfolioInvestment[],
      });
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  // Auto-fetch detail on initial mount and when selected company changes
  useEffect(() => {
    if (!selectedId) return;
    // Pre-populate interaction timeline from cache so it shows instantly
    try {
      const s = localStorage.getItem(`portfolio_timeline_${selectedId}`);
      if (s) {
        const { interactions } = JSON.parse(s) as { interactions: Interaction[] };
        setDetail(prev => prev
          ? { ...prev, interactions }
          : { kpis: [], milestones: [], initiatives: [], intelligence: [], interactions, contacts: [], reports: [], signals: [], valueAdd: [], investments: [] }
        );
      }
    } catch {}
    fetchDetail(selectedId);
  }, [selectedId, fetchDetail]);

  async function handleSelect(id: string) {
    if (id === selectedId) return;
    setSelectedId(id);
    setDetail(null);
  }

  function handleCompanyUpdate(id: string, updates: Partial<Company>) {
    setCompanies(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }

  async function handleUploadSuccess() {
    const supabase = createClient();
    const { data: updated } = await supabase
      .from("companies")
      .select("*")
      .eq("deal_status", "portfolio")
      .order("runway_months", { ascending: true, nullsFirst: false });
    if (updated) setCompanies(updated as Company[]);
    if (selectedId) await fetchDetail(selectedId);
  }

  async function handleDetailRefresh() {
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
      <div className="px-5 pt-4 flex-shrink-0">
        <PortfolioStatTiles companies={companies} />
      </div>
      <div className="flex flex-1 overflow-hidden">
        <PortfolioCompanyList
          companies={companies}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
        <div className="flex-1 overflow-hidden">
          {selectedCompany ? (
            <PortfolioDetailPanel
              company={selectedCompany}
              detail={loadingDetail ? null : detail}
              onUploadSuccess={handleUploadSuccess}
              onDetailRefresh={handleDetailRefresh}
              onCompanyUpdate={handleCompanyUpdate}
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
