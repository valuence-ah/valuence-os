"use client";
import { useState, useEffect, useRef } from "react";
import { ExternalLink, Upload, Check, X, Pencil, GitBranch, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import type { Company } from "@/lib/types";
import type { CompanyDetail } from "./portfolio-client";
import { PortfolioOverviewTab } from "./portfolio-overview-tab";
import { PortfolioIntelligenceTab } from "./portfolio-intelligence-tab";
import { PortfolioRelationshipsTab } from "./portfolio-relationships-tab";
import { PortfolioDocumentsTab } from "./portfolio-documents-tab";
import { PortfolioReportUpload } from "./portfolio-report-upload";
import { PortfolioInvestmentsTab } from "./portfolio-investments-tab";
import { PortfolioAssistantTab } from "./portfolio-assistant-tab";

type TabId = "overview" | "intelligence" | "relationships" | "documents" | "investments";

interface Props {
  company: Company;
  detail: CompanyDetail | null;
  onUploadSuccess: () => void;
  onDetailRefresh: () => void;
  onCompanyUpdate: (id: string, updates: Partial<Company>) => void;
}

const RAISE_STATUS_OPTIONS: { value: Company["current_raise_status"]; label: string }[] = [
  { value: "not_raising",     label: "Not raising" },
  { value: "preparing",       label: "Preparing" },
  { value: "actively_raising", label: "Actively raising" },
  { value: "closing",         label: "Closing" },
];

const RAISE_STATUS_BADGE: Record<string, string> = {
  actively_raising: "bg-emerald-100 text-emerald-700",
  closing:          "bg-teal-100 text-teal-700",
  preparing:        "bg-amber-100 text-amber-700",
  not_raising:      "bg-slate-100 text-slate-500",
};

const SECTOR_LABEL: Record<string, string> = {
  cleantech:            "Cleantech",
  climate:              "Climate",
  energy:               "Energy",
  biotech:              "Biotech",
  techbio:              "TechBio",
  "advanced materials": "Adv. Materials",
  advanced_materials:   "Adv. Materials",
  deeptech:             "DeepTech",
  sustainability:       "Sustainability",
  robotics:             "Robotics",
  ai:                   "AI",
  agritech:             "AgriTech",
};

function formatSector(s: string): string {
  return SECTOR_LABEL[s.toLowerCase()] ?? s;
}

const SECTOR_BADGE: Record<string, string> = {
  cleantech:            "bg-emerald-100 text-emerald-700",
  climate:              "bg-emerald-100 text-emerald-700",
  energy:               "bg-emerald-100 text-emerald-700",
  sustainability:       "bg-emerald-100 text-emerald-700",
  biotech:              "bg-purple-100 text-purple-700",
  techbio:              "bg-purple-100 text-purple-700",
  "advanced materials": "bg-blue-100 text-blue-700",
  advanced_materials:   "bg-blue-100 text-blue-700",
  deeptech:             "bg-indigo-100 text-indigo-700",
  robotics:             "bg-sky-100 text-sky-700",
  ai:                   "bg-violet-100 text-violet-700",
  agritech:             "bg-lime-100 text-lime-700",
};

function sectorBadgeClass(s: string): string {
  return SECTOR_BADGE[s.toLowerCase()] ?? "bg-slate-100 text-slate-600";
}

const STAGE_LABEL: Record<string, string> = {
  pre_seed: "Pre-seed", preseed: "Pre-seed", seed: "Seed",
  pre_a: "Pre-A", series_a: "Series A", series_b: "Series B", series_c: "Series C",
};
function formatStage(s: string): string {
  return STAGE_LABEL[s.toLowerCase().replace(/[\s-]/g, "_")] ?? s;
}

function InlineTextField({
  value, placeholder, onSave,
}: { value: string; placeholder: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  function startEdit() { setDraft(value); setEditing(true); setTimeout(() => inputRef.current?.focus(), 0); }
  function commit() { setEditing(false); if (draft.trim() !== value) onSave(draft.trim()); }
  function cancel() { setEditing(false); setDraft(value); }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") cancel(); }}
          onBlur={commit}
          className="text-[17px] font-bold text-slate-900 bg-white border-b-2 border-blue-500 outline-none px-0 leading-tight min-w-0 w-48"
        />
        <button onClick={commit} className="text-emerald-600 hover:text-emerald-700"><Check size={14} /></button>
        <button onClick={cancel} className="text-slate-400 hover:text-slate-600"><X size={14} /></button>
      </div>
    );
  }
  return (
    <span
      onDoubleClick={startEdit}
      title="Double-click to edit"
      className="text-[17px] font-bold text-slate-900 leading-tight cursor-pointer hover:bg-slate-100 rounded px-0.5 -mx-0.5 transition-colors"
    >
      {value || <span className="text-slate-400 font-normal italic">{placeholder}</span>}
    </span>
  );
}

function extractDomain(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    return website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  } catch {
    return null;
  }
}

function CompanyLogoHeader({ company }: { company: Company }) {
  const [imgErr, setImgErr] = useState(false);
  const domain = extractDomain(company.website);
  const logoSrc = company.logo_url
    ? company.logo_url
    : domain
    ? `https://img.logo.dev/${domain}?token=pk_FYk-9BO1QwS9yyppOxJ2vQ&format=png&size=128`
    : null;
  const initials = (company.name ?? "?").split(/\s+/).map((w: string) => w[0] ?? "").join("").slice(0, 2).toUpperCase();

  if (logoSrc && !imgErr) {
    return (
      <img
        src={logoSrc}
        alt={company.name}
        onError={() => setImgErr(true)}
        className="w-8 h-8 rounded-lg object-contain bg-white border border-slate-200 p-0.5 flex-shrink-0"
      />
    );
  }
  return (
    <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
      <span className="text-white text-[10px] font-bold">{initials}</span>
    </div>
  );
}

export function PortfolioDetailPanel({ company, detail, onUploadSuccess, onDetailRefresh, onCompanyUpdate }: Props) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  // Reset to Overview whenever a different company is selected
  useEffect(() => { setActiveTab("overview"); }, [company.id]);
  const [showUpload, setShowUpload] = useState(false);
  const [showAssistant, setShowAssistant] = useState(false);
  const [editingWebsite, setEditingWebsite] = useState(false);
  const [websiteDraft, setWebsiteDraft] = useState(company.website ?? "");
  const [editingRaiseTarget, setEditingRaiseTarget] = useState(false);
  const [raiseTargetDraft, setRaiseTargetDraft] = useState(company.current_raise_target ?? "");
  const [editingBoardDate, setEditingBoardDate] = useState(false);
  const [boardDateDraft, setBoardDateDraft] = useState(company.next_board_date ?? "");

  const sectors = company.sectors ?? [];
  const primarySector = sectors[0] ?? "";

  async function saveField(updates: Partial<Company>) {
    const supabase = createClient();
    await supabase.from("companies").update(updates).eq("id", company.id);
    onCompanyUpdate(company.id, updates);
  }

  async function handleIntelRefresh(type: "ma_acquirer" | "pilot_partner" | "competitor") {
    await fetch("/api/portfolio/intelligence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_id: company.id, type }),
    });
    onDetailRefresh();
  }

  const raiseBadge = company.current_raise_status ? RAISE_STATUS_BADGE[company.current_raise_status] ?? "bg-slate-100 text-slate-500" : "";

  const TABS: { id: TabId; label: string }[] = [
    { id: "overview",       label: "Overview" },
    { id: "intelligence",   label: "Intelligence" },
    { id: "relationships",  label: "Relationships" },
    { id: "documents",      label: "Documents" },
    { id: "investments",    label: "Valuence Investment" },
  ];

  return (
    <div className="flex flex-col h-full flex-1 overflow-hidden">
      {/* Header */}
      <div className="border-b border-slate-200 px-5 pt-4 pb-0 bg-white flex-shrink-0">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <CompanyLogoHeader company={company} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                {/* Editable company name */}
                <InlineTextField
                  value={company.name}
                  placeholder="Company name"
                  onSave={name => saveField({ name })}
                />
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Sector badge — click to edit */}
                {primarySector ? (
                  <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium cursor-pointer hover:opacity-80 transition-opacity ${sectorBadgeClass(primarySector)}`}
                    title="Sector"
                  >
                    {formatSector(primarySector)}
                  </span>
                ) : null}

                {/* Stage badge */}
                {company.stage && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                    {formatStage(company.stage)}
                  </span>
                )}

                {/* Raise status — inline dropdown */}
                {company.current_raise_status && company.current_raise_status !== "not_raising" && (
                  <select
                    value={company.current_raise_status ?? "not_raising"}
                    onChange={e => saveField({ current_raise_status: e.target.value as Company["current_raise_status"] })}
                    className={`text-[11px] px-2 py-0.5 rounded-full font-medium cursor-pointer border-none focus:outline-none ${raiseBadge}`}
                  >
                    {RAISE_STATUS_OPTIONS.map(o => (
                      <option key={o.value ?? ""} value={o.value ?? ""}>{o.label}</option>
                    ))}
                  </select>
                )}
                {(!company.current_raise_status || company.current_raise_status === "not_raising") && (
                  <select
                    value={company.current_raise_status ?? "not_raising"}
                    onChange={e => saveField({ current_raise_status: e.target.value as Company["current_raise_status"] })}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium cursor-pointer border-none focus:outline-none"
                  >
                    {RAISE_STATUS_OPTIONS.map(o => (
                      <option key={o.value ?? ""} value={o.value ?? ""}>{o.label}</option>
                    ))}
                  </select>
                )}

                {/* Raise target — editable inline */}
                {company.current_raise_status && company.current_raise_status !== "not_raising" && (
                  editingRaiseTarget ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        value={raiseTargetDraft}
                        onChange={e => setRaiseTargetDraft(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") { saveField({ current_raise_target: raiseTargetDraft }); setEditingRaiseTarget(false); }
                          if (e.key === "Escape") { setEditingRaiseTarget(false); setRaiseTargetDraft(company.current_raise_target ?? ""); }
                        }}
                        onBlur={() => { saveField({ current_raise_target: raiseTargetDraft }); setEditingRaiseTarget(false); }}
                        placeholder="e.g. $5M"
                        className="text-[11px] border border-slate-300 rounded px-1.5 py-0.5 w-20 focus:outline-none"
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => { setRaiseTargetDraft(company.current_raise_target ?? ""); setEditingRaiseTarget(true); }}
                      className="text-[11px] text-slate-500 hover:text-slate-700 flex items-center gap-0.5"
                    >
                      {company.current_raise_target ?? <span className="italic">Set target</span>}
                      <Pencil size={9} />
                    </button>
                  )
                )}

                {/* Next board date */}
                {editingBoardDate ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      type="date"
                      value={boardDateDraft}
                      onChange={e => setBoardDateDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") { saveField({ next_board_date: boardDateDraft || null }); setEditingBoardDate(false); }
                        if (e.key === "Escape") { setEditingBoardDate(false); }
                      }}
                      onBlur={() => { saveField({ next_board_date: boardDateDraft || null }); setEditingBoardDate(false); }}
                      className="text-[11px] border border-slate-300 rounded px-1.5 py-0.5 focus:outline-none"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => { setBoardDateDraft(company.next_board_date ?? ""); setEditingBoardDate(true); }}
                    className="text-[11px] text-slate-400 hover:text-slate-600 flex items-center gap-0.5"
                  >
                    {company.next_board_date
                      ? `Board: ${new Date(company.next_board_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
                      : "Set board date"}
                    <Pencil size={9} />
                  </button>
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
            {/* View in Pipeline */}
            <button
              onClick={() => router.push(`/crm/pipeline?company=${company.id}`)}
              className="flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-lg hover:bg-slate-50 transition-colors"
            >
              <GitBranch size={12} /> Pipeline
            </button>
            {/* Website link (no edit pencil) */}
            {editingWebsite ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={websiteDraft}
                  onChange={e => setWebsiteDraft(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter") { saveField({ website: websiteDraft || null }); setEditingWebsite(false); }
                    if (e.key === "Escape") { setEditingWebsite(false); setWebsiteDraft(company.website ?? ""); }
                  }}
                  onBlur={() => { saveField({ website: websiteDraft || null }); setEditingWebsite(false); }}
                  placeholder="https://..."
                  className="text-xs border border-slate-300 rounded px-2 py-1 w-36 focus:outline-none"
                />
              </div>
            ) : company.website ? (
              <a
                href={company.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2.5 py-1.5 border border-slate-200 text-slate-600 text-xs rounded-lg hover:bg-slate-50 transition-colors"
              >
                <ExternalLink size={12} /> Website
              </a>
            ) : (
              <button
                onClick={() => { setWebsiteDraft(""); setEditingWebsite(true); }}
                className="flex items-center gap-1 px-2.5 py-1.5 border border-dashed border-slate-300 text-slate-400 text-xs rounded-lg hover:bg-slate-50"
              >
                <ExternalLink size={12} /> Add website
              </button>
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
                investments={detail.investments}
                onIntelligenceRefresh={handleIntelRefresh}
                onDetailRefresh={onDetailRefresh}
                onCompanyUpdate={onCompanyUpdate}
              />
            )}
            {activeTab === "intelligence" && (
              <PortfolioIntelligenceTab
                companyId={company.id}
                companyName={company.name}
                companyDescription={company.description ?? null}
                companySectors={company.sectors ?? []}
                intelligence={detail.intelligence}
                onRefresh={onDetailRefresh}
              />
            )}
            {activeTab === "relationships" && (
              <PortfolioRelationshipsTab
                companyId={company.id}
                interactions={detail.interactions}
                contacts={detail.contacts}
                valueAdd={detail.valueAdd}
                onDetailRefresh={onDetailRefresh}
              />
            )}
            {activeTab === "documents" && (
              <PortfolioDocumentsTab
                companyId={company.id}
                reports={detail.reports}
                onReportReExtracted={onUploadSuccess}
              />
            )}
            {activeTab === "investments" && (
              <PortfolioInvestmentsTab
                companyId={company.id}
                investments={detail.investments}
                onRefresh={onDetailRefresh}
              />
            )}
          </>
        )}
      </div>

      {/* Floating AI Assistant button */}
      <button
        onClick={() => setShowAssistant(v => !v)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold rounded-full shadow-lg transition-colors"
      >
        <Sparkles size={14} />
        AI Assistant
      </button>

      {/* Floating AI Assistant panel */}
      {showAssistant && (
        <div className="fixed inset-y-0 right-0 z-50 w-[420px] bg-white shadow-2xl border-l border-slate-200 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-violet-500" />
              <span className="text-sm font-semibold text-slate-800">AI Assistant</span>
              <span className="text-xs text-slate-400">· {company.name}</span>
            </div>
            <button onClick={() => setShowAssistant(false)} className="text-slate-400 hover:text-slate-600">
              <X size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            <PortfolioAssistantTab
              companyId={company.id}
              companyName={company.name}
              investments={detail?.investments ?? []}
            />
          </div>
        </div>
      )}

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
