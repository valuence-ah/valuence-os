"use client";
import { useState } from "react";
import { ExternalLink, Upload } from "lucide-react";
import type {
  Company, PortfolioKpi, PortfolioMilestone, PortfolioInitiative,
  PortfolioIntelligence, PortfolioReport, Interaction, Contact, FeedArticle,
} from "@/lib/types";
import { PortfolioOverviewTab } from "./portfolio-overview-tab";
import { PortfolioIntelligenceTab } from "./portfolio-intelligence-tab";
import { PortfolioRelationshipsTab } from "./portfolio-relationships-tab";
import { PortfolioDocumentsTab } from "./portfolio-documents-tab";
import { PortfolioReportUpload } from "./portfolio-report-upload";

type TabId = "overview" | "intelligence" | "relationships" | "documents";

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
  company: Company;
  detail: CompanyDetail | null;
  onUploadSuccess: () => void;
  onIntelligenceRefresh: () => void;
}

const RAISE_STATUS_BADGE: Record<string, string> = {
  actively_raising: "bg-emerald-100 text-emerald-700",
  closing:          "bg-teal-100 text-teal-700",
  preparing:        "bg-amber-100 text-amber-700",
  not_raising:      "",
};

export function PortfolioDetailPanel({ company, detail, onUploadSuccess, onIntelligenceRefresh }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [showUpload, setShowUpload] = useState(false);

  const raiseBadge = company.current_raise_status ? RAISE_STATUS_BADGE[company.current_raise_status] : "";
  const sectors = company.sectors ?? [];
  const primarySector = sectors[0] ?? "";

  async function handleIntelRefresh(type: "ma_acquirer" | "pilot_partner") {
    await fetch("/api/portfolio/intelligence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_id: company.id, type }),
    });
    onIntelligenceRefresh();
  }

  const TABS: { id: TabId; label: string }[] = [
    { id: "overview",       label: "Overview" },
    { id: "intelligence",   label: "Intelligence" },
    { id: "relationships",  label: "Relationships" },
    { id: "documents",      label: "Documents" },
  ];

  return (
    <div className="flex flex-col h-full flex-1 overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-200 px-5 pt-4 pb-0 bg-white flex-shrink-0">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-[17px] font-bold text-slate-900 leading-tight">{company.name}</h2>
                {primarySector && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                    {primarySector}
                  </span>
                )}
                {company.stage && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                    {company.stage}
                  </span>
                )}
                {company.current_raise_status && raiseBadge && (
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${raiseBadge}`}>
                    {company.current_raise_target
                      ? `Raising ${company.current_raise_target}`
                      : company.current_raise_status.replace("_", " ")}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white text-xs font-medium rounded-lg hover:bg-teal-700 transition-colors"
            >
              <Upload size={12} /> Upload report
            </button>
            {company.website && (
              <a
                href={company.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-lg hover:bg-slate-50 transition-colors"
              >
                <ExternalLink size={12} /> Website
              </a>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-0">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {!detail ? (
          <div className="flex items-center justify-center h-full text-slate-400 text-sm">
            Loading…
          </div>
        ) : (
          <>
            {activeTab === "overview" && (
              <PortfolioOverviewTab
                company={company}
                kpis={detail.kpis}
                milestones={detail.milestones}
                initiatives={detail.initiatives}
                intelligence={detail.intelligence}
                interactions={detail.interactions}
                signals={detail.signals}
                onIntelligenceRefresh={handleIntelRefresh}
              />
            )}
            {activeTab === "intelligence" && (
              <PortfolioIntelligenceTab
                companyId={company.id}
                intelligence={detail.intelligence}
                onRefresh={onIntelligenceRefresh}
              />
            )}
            {activeTab === "relationships" && (
              <PortfolioRelationshipsTab
                companyId={company.id}
                interactions={detail.interactions}
                contacts={detail.contacts}
              />
            )}
            {activeTab === "documents" && (
              <PortfolioDocumentsTab
                companyId={company.id}
                reports={detail.reports}
                onReportReExtracted={onUploadSuccess}
              />
            )}
          </>
        )}
      </div>

      {/* Upload modal */}
      {showUpload && (
        <PortfolioReportUpload
          company={company}
          onClose={() => setShowUpload(false)}
          onSuccess={onUploadSuccess}
        />
      )}
    </div>
  );
}
