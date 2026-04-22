"use client";
import { useState, useEffect } from "react";
import { RefreshCw, FileText, Plus, X, Check, Pencil, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Company, PortfolioKpi, PortfolioMilestone, PortfolioInitiative, PortfolioIntelligence, Interaction, PortfolioInvestment } from "@/lib/types";

function stripCiteTags(text: string): string {
  if (!text) return "";
  return text
    .replace(/<\/?cite[^>]*>/gi, "")
    .replace(/<\/?antml:cite[^>]*>/gi, "")
    .trim();
}

interface Props {
  company: Company;
  kpis: PortfolioKpi[];
  milestones: PortfolioMilestone[];
  initiatives: PortfolioInitiative[];
  intelligence: PortfolioIntelligence[];
  interactions: Interaction[];
  investments: PortfolioInvestment[];
  onIntelligenceRefresh: (type: "ma_acquirer" | "pilot_partner" | "competitor") => Promise<void>;
  onDetailRefresh: () => void;
  onCompanyUpdate: (id: string, updates: Partial<Company>) => void;
}

function fmtMoney(v: number | null): string {
  if (v === null || v === undefined) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v}`;
}

async function openInvestmentDoc(storagePath: string) {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const { data } = await supabase.storage.from("investment-memos").createSignedUrl(storagePath, 3600);
  if (data?.signedUrl) window.open(data.signedUrl, "_blank");
}

const BOARD_LABEL: Record<string, string> = {
  board_seat:     "Board Seat",
  board_observer: "Board Observer",
  no:             "No",
};


const MILESTONE_STATUS_DOT: Record<string, string> = {
  done:        "bg-emerald-500",
  in_progress: "bg-amber-500",
  blocked:     "bg-red-500",
  upcoming:    "bg-slate-300",
};

const MILESTONE_STATUS_COLOR: Record<string, string> = {
  done:        "text-emerald-600",
  in_progress: "text-amber-600",
  blocked:     "text-red-500",
  upcoming:    "text-slate-400",
};

const INITIATIVE_STATUS_DOT: Record<string, string> = {
  complete:    "bg-emerald-500",
  in_progress: "bg-amber-500",
  planned:     "bg-slate-300",
  paused:      "bg-slate-300",
};

const FIT_BADGE: Record<string, string> = {
  high:   "bg-emerald-100 text-emerald-700",
  medium: "bg-amber-100 text-amber-700",
  low:    "bg-slate-100 text-slate-500",
};

const WARMTH_BADGE: Record<string, string> = {
  warm:           "bg-orange-100 text-orange-700",
  lp_connection:  "bg-violet-100 text-violet-700",
  cold:           "bg-slate-100 text-slate-500",
};

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  done:        { bg: "#E1F5EE", text: "#085041", border: "#5DCAA5" },
  in_progress: { bg: "#FAEEDA", text: "#633806", border: "#EF9F27" },
  upcoming:    { bg: "#F1EFE8", text: "#5F5E5A", border: "#B4B2A9" },
  blocked:     { bg: "#FCEBEB", text: "#791F1F", border: "#F09595" },
};

function EditableText({
  value,
  onSave,
  className = "",
  placeholder = "",
}: {
  value: string;
  onSave: (val: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { onSave(draft); setEditing(false); }}
        onKeyDown={e => {
          if (e.key === "Enter") { onSave(draft); setEditing(false); }
          if (e.key === "Escape") { setDraft(value); setEditing(false); }
        }}
        className={`${className} px-1 py-0.5 border border-blue-300 rounded bg-white focus:outline-none focus:ring-1 focus:ring-blue-400/40 w-full`}
        placeholder={placeholder}
      />
    );
  }
  return (
    <div
      onDoubleClick={() => setEditing(true)}
      className={`${className} cursor-pointer hover:bg-slate-100 rounded px-1 py-0.5 -mx-1 transition-colors min-h-[18px]`}
      title="Double-click to edit"
    >
      {value || <span className="text-slate-300 italic text-[10px]">{placeholder}</span>}
    </div>
  );
}

function RunwayBar({ months }: { months: number }) {
  const pct = Math.min(100, (months / 24) * 100);
  const color = months >= 12 ? "bg-emerald-500" : months >= 6 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="w-full bg-slate-200 rounded-full h-1 mt-1.5">
      <div className={`h-1 rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}


export function PortfolioOverviewTab({
  company, kpis, milestones, initiatives, intelligence, interactions, investments,
  onIntelligenceRefresh, onDetailRefresh, onCompanyUpdate,
}: Props) {
  const [refreshing, setRefreshing] = useState<"ma_acquirer" | "pilot_partner" | "competitor" | null>(null);
  const [selectedInvestment, setSelectedInvestment] = useState<PortfolioInvestment | null>(null);
  const [openingDoc, setOpeningDoc] = useState<string | null>(null); // tracks which doc is opening

  // Fundraise tracker editing
  const [editingFt, setEditingFt] = useState(false);
  const [ftForm, setFtForm] = useState({
    raise_round: "",
    current_raise_status: "not_raising",
    current_raise_target: "",
    raise_target_close: "",
    investors_approached: 0,
    term_sheets: 0,
  });
  const [savingFt, setSavingFt] = useState(false);

  // KPI editing
  const [editingKpis, setEditingKpis] = useState(false);
  const [kpiDraft, setKpiDraft] = useState({ monthly_burn: "", cash_on_hand: "", runway_months: "", headcount: "" });
  const [savingKpis, setSavingKpis] = useState(false);

  // Strategic initiatives editing
  const [editingInitId, setEditingInitId] = useState<string | null>(null);
  const [editInitForm, setEditInitForm] = useState({ title: "", description: "", status: "in_progress" });
  const [savingInitEdit, setSavingInitEdit] = useState(false);
  const [addingInit, setAddingInit] = useState(false);
  const [addInitForm, setAddInitForm] = useState({ title: "", description: "", status: "in_progress" });
  const [savingInitAdd, setSavingInitAdd] = useState(false);

  // Milestone state — local copy for optimistic updates
  const [localMilestones, setLocalMilestones] = useState<PortfolioMilestone[]>(milestones);
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [msForm, setMsForm] = useState({ title: "", status: "upcoming" as PortfolioMilestone["status"], target_date: "" });
  const [savingMs, setSavingMs] = useState(false);
  const [editingMsId, setEditingMsId] = useState<string | null>(null);
  const [editMsForm, setEditMsForm] = useState({ title: "", description: "", status: "upcoming" as PortfolioMilestone["status"], target_date: "", category: "general" });
  const [savingMsEdit, setSavingMsEdit] = useState(false);

  // Interaction timeline slide-out
  const [showFullTimeline, setShowFullTimeline] = useState(false);
  const [selectedInteraction, setSelectedInteraction] = useState<Interaction | null>(null);

  // Risk flags state (kept for data integrity even though UI is removed)
  const [riskInput, setRiskInput] = useState("");
  const [savingRisk, setSavingRisk] = useState(false);

  const latestKpi = kpis[0] ?? null;
  const prevKpi = kpis[1] ?? null;

  const burnChange = latestKpi && prevKpi && latestKpi.monthly_burn !== null && prevKpi.monthly_burn !== null
    ? latestKpi.monthly_burn - prevKpi.monthly_burn : null;

  const headcountChange = latestKpi?.headcount_change;

  async function handleRefresh(type: "ma_acquirer" | "pilot_partner" | "competitor") {
    setRefreshing(type);
    await onIntelligenceRefresh(type);
    setRefreshing(null);
  }

  // Sync local milestones when parent re-fetches
  useEffect(() => { setLocalMilestones(milestones); }, [milestones]);

  async function handleSaveKpis() {
    setSavingKpis(true);
    const supabase = createClient();
    const updates: Record<string, number | null> = {
      monthly_burn: kpiDraft.monthly_burn ? Number(kpiDraft.monthly_burn) : null,
      cash_on_hand: kpiDraft.cash_on_hand ? Number(kpiDraft.cash_on_hand) : null,
      runway_months: kpiDraft.runway_months ? Number(kpiDraft.runway_months) : null,
      headcount: kpiDraft.headcount ? Number(kpiDraft.headcount) : null,
    };
    if (latestKpi?.id) {
      await supabase.from("portfolio_kpis").update(updates).eq("id", latestKpi.id);
    } else {
      await supabase.from("portfolio_kpis").insert({ company_id: company.id, period: "Current", ...updates });
    }
    setSavingKpis(false);
    setEditingKpis(false);
    onDetailRefresh();
  }

  async function handleUpdateMilestone(id: string, updates: Partial<PortfolioMilestone>) {
    setLocalMilestones(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
    const supabase = createClient();
    await supabase.from("portfolio_milestones")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  async function handleDeleteMilestone(id: string) {
    setLocalMilestones(prev => prev.filter(m => m.id !== id));
    const supabase = createClient();
    await supabase.from("portfolio_milestones").delete().eq("id", id);
  }

  function handleStartEditMs(ms: PortfolioMilestone) {
    setEditingMsId(ms.id);
    setEditMsForm({ title: ms.title, description: ms.description ?? "", status: ms.status, target_date: ms.target_date ?? "", category: ms.category ?? "general" });
  }

  async function handleSaveEditMs() {
    if (!editingMsId) return;
    setSavingMsEdit(true);
    await handleUpdateMilestone(editingMsId, {
      title: editMsForm.title,
      description: (editMsForm.description || null) as string | null,
      status: editMsForm.status,
      target_date: (editMsForm.target_date || null) as string | null,
      category: editMsForm.category,
    });
    setEditingMsId(null);
    setSavingMsEdit(false);
  }

  async function handleAddMilestone() {
    if (!msForm.title.trim()) return;
    setSavingMs(true);
    const supabase = createClient();
    await supabase.from("portfolio_milestones").insert({
      company_id: company.id,
      title: msForm.title.trim(),
      status: msForm.status,
      target_date: msForm.target_date || null,
      category: "general",
      source: "manual",
    });
    setMsForm({ title: "", status: "upcoming", target_date: "" });
    setAddingMilestone(false);
    setSavingMs(false);
    onDetailRefresh();
  }

  async function handleAddRiskFlag() {
    const flag = riskInput.trim();
    if (!flag) return;
    setSavingRisk(true);
    const current = company.risk_flags ?? [];
    if (current.includes(flag)) { setRiskInput(""); setSavingRisk(false); return; }
    const updated = [...current, flag];
    const supabase = createClient();
    await supabase.from("companies").update({ risk_flags: updated }).eq("id", company.id);
    onCompanyUpdate(company.id, { risk_flags: updated });
    setRiskInput("");
    setSavingRisk(false);
  }

  async function handleRemoveRiskFlag(flag: string) {
    const updated = (company.risk_flags ?? []).filter(f => f !== flag);
    const supabase = createClient();
    await supabase.from("companies").update({ risk_flags: updated }).eq("id", company.id);
    onCompanyUpdate(company.id, { risk_flags: updated });
  }

  function handleStartEditFt() {
    setFtForm({
      raise_round: company.raise_round ?? "",
      current_raise_status: company.current_raise_status ?? "not_raising",
      current_raise_target: company.current_raise_target ?? "",
      raise_target_close: company.raise_target_close ?? "",
      investors_approached: company.investors_approached ?? 0,
      term_sheets: company.term_sheets ?? 0,
    });
    setEditingFt(true);
  }

  async function handleSaveFundraiseTracker() {
    setSavingFt(true);
    const supabase = createClient();
    await supabase.from("companies").update({
      raise_round: ftForm.raise_round || null,
      current_raise_status: ftForm.current_raise_status || null,
      current_raise_target: ftForm.current_raise_target || null,
      raise_target_close: ftForm.raise_target_close || null,
      investors_approached: Number(ftForm.investors_approached) || 0,
      term_sheets: Number(ftForm.term_sheets) || 0,
    }).eq("id", company.id);
    onCompanyUpdate(company.id, {
      current_raise_status: ftForm.current_raise_status as Company["current_raise_status"],
      current_raise_target: ftForm.current_raise_target || null,
      raise_round: ftForm.raise_round || null,
    });
    setSavingFt(false);
    setEditingFt(false);
  }

  function handleStartEditInit(init: PortfolioInitiative) {
    setEditingInitId(init.id);
    setEditInitForm({ title: init.title, description: init.description ?? "", status: init.status });
  }

  async function handleSaveInitEdit() {
    if (!editingInitId) return;
    setSavingInitEdit(true);
    const supabase = createClient();
    await supabase.from("portfolio_initiatives").update({
      title: editInitForm.title,
      description: editInitForm.description || null,
      status: editInitForm.status,
      updated_at: new Date().toISOString(),
    }).eq("id", editingInitId);
    setEditingInitId(null);
    setSavingInitEdit(false);
    onDetailRefresh();
  }

  async function handleDeleteInit(id: string) {
    const supabase = createClient();
    await supabase.from("portfolio_initiatives").delete().eq("id", id);
    onDetailRefresh();
  }

  async function handleAddInit() {
    if (!addInitForm.title.trim()) return;
    setSavingInitAdd(true);
    const supabase = createClient();
    await supabase.from("portfolio_initiatives").insert({
      company_id: company.id,
      title: addInitForm.title.trim(),
      description: addInitForm.description || null,
      status: addInitForm.status,
      category: "general",
      source: "manual",
    });
    setAddInitForm({ title: "", description: "", status: "in_progress" });
    setAddingInit(false);
    setSavingInitAdd(false);
    onDetailRefresh();
  }

  const FIT_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const acquirers = intelligence
    .filter(i => i.type === "ma_acquirer")
    .sort((a, b) => (FIT_ORDER[a.fit_level] ?? 3) - (FIT_ORDER[b.fit_level] ?? 3));
  const pilots = intelligence
    .filter(i => i.type === "pilot_partner")
    .sort((a, b) => (FIT_ORDER[a.fit_level] ?? 3) - (FIT_ORDER[b.fit_level] ?? 3));

  return (
    <div className="p-5 space-y-4 overflow-y-auto h-full">

      {/* ═══ ROW 1: Valuence Investment (left) + Fundraise Tracker (right) ══════ */}
      <div className="grid grid-cols-2 gap-4 items-stretch">

        {/* Left: Valuence Investment — compact clickable cards */}
        <div className="bg-white border border-slate-200 rounded-lg p-3 flex flex-col min-h-[110px]">
          <div className="flex items-center justify-between mb-2 flex-shrink-0">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Valuence Investment</h3>
            <button
              onClick={onDetailRefresh}
              className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
              title="Refresh overview with latest investment data"
            >
              <RefreshCw size={10} /> Refresh
            </button>
          </div>
          {investments.length === 0 ? (
            <p className="text-xs text-slate-400 flex-1 flex items-center">No investments recorded yet.</p>
          ) : (
            <div className="space-y-1.5 overflow-y-auto max-h-[160px] pr-0.5">
              {investments.map(inv => {
                const isSafe = inv.investment_type === "safe";
                const closeDate = inv.close_date
                  ? new Date(inv.close_date).toLocaleDateString("en-GB", { month: "short", year: "numeric" })
                  : null;
                return (
                  <button
                    key={inv.id}
                    onClick={() => setSelectedInvestment(inv)}
                    className={`w-full text-left rounded-lg px-2.5 py-2 transition-colors ${isSafe ? "bg-violet-50 hover:bg-violet-100" : "bg-blue-50 hover:bg-blue-100"}`}
                  >
                    {/* Single grid row — 8 data cells + 1 docs cell, all equal width */}
                    <div
                      className="w-full items-start"
                      style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.1fr 1fr 1.1fr 1fr 1fr 36px" }}
                    >
                      {/* Date */}
                      <div className="min-w-0 pr-1">
                        <p className={`text-[8px] font-semibold uppercase tracking-wide mb-0.5 ${isSafe ? "text-violet-400" : "text-blue-400"}`}>Date</p>
                        <p className="text-[11px] font-semibold text-slate-800 truncate">{closeDate ?? "—"}</p>
                      </div>
                      {/* Round */}
                      <div className="min-w-0 pr-1">
                        <p className={`text-[8px] font-semibold uppercase tracking-wide mb-0.5 ${isSafe ? "text-violet-400" : "text-blue-400"}`}>Round</p>
                        <p className="text-[11px] font-semibold text-slate-800 truncate">{inv.funding_round ?? "—"}</p>
                      </div>
                      {/* Investment */}
                      <div className="min-w-0 pr-1">
                        <p className={`text-[8px] font-semibold uppercase tracking-wide mb-0.5 ${isSafe ? "text-violet-400" : "text-blue-400"}`}>Investment</p>
                        <p className="text-[11px] font-semibold text-slate-800 truncate">{fmtMoney(inv.investment_amount)}</p>
                      </div>
                      {/* Type */}
                      <div className="min-w-0 pr-1">
                        <p className={`text-[8px] font-semibold uppercase tracking-wide mb-0.5 ${isSafe ? "text-violet-400" : "text-blue-400"}`}>Type</p>
                        <p className="text-[11px] font-semibold text-slate-800 truncate">{isSafe ? "SAFE / CN" : "Priced"}</p>
                      </div>
                      {/* F1: Val. Cap / Pre-Money */}
                      <div className="min-w-0 pr-1">
                        <p className={`text-[8px] font-semibold uppercase tracking-wide mb-0.5 ${isSafe ? "text-violet-400" : "text-blue-400"}`}>{isSafe ? "Val. Cap" : "Pre-Money"}</p>
                        <p className="text-[11px] font-semibold text-slate-800 truncate">
                          {isSafe ? fmtMoney(inv.valuation_cap) : fmtMoney(inv.pre_money_valuation)}
                        </p>
                      </div>
                      {/* F2: Discount / Ownership */}
                      <div className="min-w-0 pr-1">
                        <p className={`text-[8px] font-semibold uppercase tracking-wide mb-0.5 ${isSafe ? "text-violet-400" : "text-blue-400"}`}>{isSafe ? "Discount" : "Ownership"}</p>
                        <p className="text-[11px] font-semibold text-slate-800 truncate">
                          {isSafe
                            ? (inv.discount !== null ? `${inv.discount}%` : "—")
                            : (inv.ownership_pct !== null ? `${inv.ownership_pct}%` : "—")}
                        </p>
                      </div>
                      {/* F3: Interest / Price per Share */}
                      <div className="min-w-0 pr-1">
                        <p className={`text-[8px] font-semibold uppercase tracking-wide mb-0.5 ${isSafe ? "text-violet-400" : "text-blue-400"}`}>{isSafe ? "Interest" : "Price/Share"}</p>
                        <p className="text-[11px] font-semibold text-slate-800 truncate">
                          {isSafe
                            ? (inv.interest_rate !== null ? `${inv.interest_rate}%` : "—")
                            : (inv.price_per_share !== null ? `$${inv.price_per_share?.toFixed(4)}` : "—")}
                        </p>
                      </div>
                      {/* Doc icons */}
                      <div className="flex flex-col items-end justify-center gap-0.5 pt-2">
                        {inv.memo_file_name && (
                          <span title={`Memo: ${inv.memo_file_name}`}><FileText size={10} className={isSafe ? "text-violet-400" : "text-blue-400"} /></span>
                        )}
                        {inv.subscription_doc_file_name && (
                          <span title={`Sub doc: ${inv.subscription_doc_file_name}`}><FileText size={10} className="text-slate-400" /></span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Fundraise tracker */}
        <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3 flex flex-col min-h-[110px]">
          <div className="flex items-center justify-between mb-2 flex-shrink-0">
            <h3 className="text-[10px] font-bold text-emerald-700 uppercase tracking-[0.1em]">Fundraise tracker</h3>
            {!editingFt ? (
              <button onClick={handleStartEditFt} className="flex items-center gap-1 text-[10px] text-emerald-600 hover:text-emerald-800">
                <Pencil size={10} /> Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setEditingFt(false)} className="text-[10px] text-slate-500 hover:text-slate-700">Cancel</button>
                <button onClick={handleSaveFundraiseTracker} disabled={savingFt} className="text-[10px] text-emerald-700 font-semibold hover:text-emerald-900 disabled:opacity-50">
                  {savingFt ? "Saving…" : "Save"}
                </button>
              </div>
            )}
          </div>
          {!editingFt ? (
            <div className="grid grid-cols-4 gap-x-4">
              <div>
                <p className="text-[10px] text-emerald-600 mb-0.5">Round</p>
                <p className="text-xs font-semibold text-slate-800">{company.raise_round ?? company.stage ?? "—"}</p>
              </div>
              <div>
                <p className="text-[10px] text-emerald-600 mb-0.5">Status</p>
                <p className="text-xs font-semibold text-slate-800 capitalize">{(company.current_raise_status ?? "not_raising").replace(/_/g, " ")}</p>
              </div>
              <div>
                <p className="text-[10px] text-emerald-600 mb-0.5">Target</p>
                <p className="text-xs font-semibold text-slate-800">{company.current_raise_target ?? "—"}</p>
              </div>
              <div>
                <p className="text-[10px] text-emerald-600 mb-0.5">Target close</p>
                <p className="text-xs font-semibold text-slate-800">{company.raise_target_close ?? "—"}</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-x-3">
              <div>
                <p className="text-[10px] text-emerald-600 mb-0.5">Round</p>
                <select value={ftForm.raise_round} onChange={e => setFtForm(p => ({ ...p, raise_round: e.target.value }))}
                  className="w-full text-xs border border-emerald-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400">
                  <option value="">—</option>
                  <option value="Pre-seed">Pre-seed</option>
                  <option value="Seed">Seed</option>
                  <option value="Series A">Series A</option>
                  <option value="Series B">Series B</option>
                  <option value="Bridge">Bridge</option>
                  <option value="SAFE">SAFE</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <p className="text-[10px] text-emerald-600 mb-0.5">Status</p>
                <select value={ftForm.current_raise_status} onChange={e => setFtForm(p => ({ ...p, current_raise_status: e.target.value }))}
                  className="w-full text-xs border border-emerald-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-400">
                  <option value="not_raising">Not raising</option>
                  <option value="preparing">Preparing</option>
                  <option value="actively_raising">Actively raising</option>
                  <option value="closing">Closing</option>
                </select>
              </div>
              <div>
                <p className="text-[10px] text-emerald-600 mb-0.5">Target</p>
                <input type="text" value={ftForm.current_raise_target} onChange={e => setFtForm(p => ({ ...p, current_raise_target: e.target.value }))}
                  placeholder="e.g. $5M" className="w-full text-xs border border-emerald-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
              </div>
              <div>
                <p className="text-[10px] text-emerald-600 mb-0.5">Target close</p>
                <input type="text" value={ftForm.raise_target_close} onChange={e => setFtForm(p => ({ ...p, raise_target_close: e.target.value }))}
                  placeholder="e.g. Q3 2026" className="w-full text-xs border border-emerald-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-emerald-400" />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ ROW 2: Key Metrics (left) + Meeting History (right) ═════════════════ */}
      <div className="grid grid-cols-2 gap-4 items-start">

        {/* Left: Key metrics */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-2 flex-shrink-0">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Key metrics</h3>
            {editingKpis ? (
              <div className="flex items-center gap-2">
                <button onClick={() => setEditingKpis(false)} className="text-[10px] text-slate-500 hover:text-slate-700">Cancel</button>
                <button onClick={handleSaveKpis} disabled={savingKpis} className="text-[10px] text-teal-600 font-semibold hover:text-teal-800 disabled:opacity-50">
                  {savingKpis ? "Saving…" : "Save"}
                </button>
              </div>
            ) : (
              <button onClick={() => { setKpiDraft({ monthly_burn: latestKpi?.monthly_burn?.toString() ?? "", cash_on_hand: latestKpi?.cash_on_hand?.toString() ?? "", runway_months: latestKpi?.runway_months?.toString() ?? "", headcount: latestKpi?.headcount?.toString() ?? "" }); setEditingKpis(true); }}
                className="text-[10px] text-teal-600 hover:text-teal-700">Edit KPIs</button>
            )}
          </div>
          <div className="h-[120px] overflow-y-auto pr-0.5">
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-slate-50 rounded-lg p-2.5">
              <p className="text-[10px] text-slate-400 mb-1">Monthly burn</p>
              {editingKpis ? (
                <input type="number" value={kpiDraft.monthly_burn} onChange={e => setKpiDraft(p => ({ ...p, monthly_burn: e.target.value }))}
                  placeholder="e.g. 150000" className="w-full text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400" />
              ) : (
                <>
                  <p className="text-sm font-bold text-slate-800">{fmtMoney(latestKpi?.monthly_burn ?? null)}</p>
                  {burnChange !== null && <p className={`text-[10px] mt-0.5 ${burnChange <= 0 ? "text-emerald-600" : "text-red-500"}`}>{burnChange > 0 ? "+" : ""}{fmtMoney(burnChange)} vs prev</p>}
                </>
              )}
            </div>
            <div className="bg-slate-50 rounded-lg p-2.5">
              <p className="text-[10px] text-slate-400 mb-1">Cash on hand</p>
              {editingKpis ? (
                <input type="number" value={kpiDraft.cash_on_hand} onChange={e => setKpiDraft(p => ({ ...p, cash_on_hand: e.target.value }))}
                  placeholder="e.g. 2000000" className="w-full text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400" />
              ) : (
                <p className="text-sm font-bold text-slate-800">{fmtMoney(latestKpi?.cash_on_hand ?? null)}</p>
              )}
            </div>
            <div className="bg-slate-50 rounded-lg p-2.5">
              <p className="text-[10px] text-slate-400 mb-1">Runway</p>
              {editingKpis ? (
                <input type="number" value={kpiDraft.runway_months} onChange={e => setKpiDraft(p => ({ ...p, runway_months: e.target.value }))}
                  placeholder="months" className="w-full text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400" />
              ) : (
                <>
                  <p className="text-sm font-bold text-slate-800">{latestKpi?.runway_months != null ? `${Math.round(latestKpi.runway_months)}mo` : "—"}</p>
                  {latestKpi?.runway_months != null && <RunwayBar months={latestKpi.runway_months} />}
                </>
              )}
            </div>
            <div className="bg-slate-50 rounded-lg p-2.5">
              <p className="text-[10px] text-slate-400 mb-1">Headcount</p>
              {editingKpis ? (
                <input type="number" value={kpiDraft.headcount} onChange={e => setKpiDraft(p => ({ ...p, headcount: e.target.value }))}
                  placeholder="e.g. 12" className="w-full text-xs border border-slate-200 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400" />
              ) : (
                <>
                  <p className="text-sm font-bold text-slate-800">{latestKpi?.headcount != null ? latestKpi.headcount : "—"}</p>
                  {headcountChange != null && <p className={`text-[10px] mt-0.5 ${headcountChange > 0 ? "text-emerald-600" : headcountChange < 0 ? "text-red-500" : "text-slate-400"}`}>{headcountChange > 0 ? "+" : ""}{headcountChange} vs prev</p>}
                </>
              )}
            </div>
          </div>
          </div>
          {latestKpi && !editingKpis && <p className="text-[10px] text-slate-400 mt-1">Period: {latestKpi.period}</p>}
        </div>

        {/* Right: Meeting history */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-2 flex-shrink-0">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Meeting history</h3>
            <button onClick={() => setShowFullTimeline(true)} className="text-[10px] text-blue-500 hover:text-blue-700">View all →</button>
          </div>
          <div className="h-[120px] overflow-y-auto pr-0.5">
            {interactions.filter(i => i.type === "meeting").length === 0 ? (
              <p className="text-xs text-slate-400">No meetings logged yet</p>
            ) : (
              <div className="space-y-1">
                {interactions.filter(i => i.type === "meeting").slice(0, 8).map(i => (
                  <button key={i.id} onClick={() => setSelectedInteraction(i)}
                    className="flex items-start gap-2.5 w-full text-left hover:bg-violet-50 rounded-lg px-2 py-1.5 -mx-2 transition-colors group">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 bg-violet-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-semibold text-slate-800 truncate">{i.subject ?? "Meeting"}</p>
                      {i.summary && <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{i.summary}</p>}
                      <p className="text-[10px] text-slate-400 mt-0.5">{new Date(i.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ ROW 3: Key Milestones (left) + Strategic Initiatives (right) ════════ */}
      <div className="grid grid-cols-2 gap-4 items-start">

        {/* Left: Key milestones */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-2 flex-shrink-0">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Key milestones</h3>
            <button onClick={() => setAddingMilestone(true)} className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-700">
              <Plus size={10} /> Add
            </button>
          </div>
          {addingMilestone && (
            <div className="mb-2 p-2.5 bg-slate-50 rounded-lg space-y-2 border border-slate-200">
              <input autoFocus placeholder="Milestone title" value={msForm.title} onChange={e => setMsForm(p => ({ ...p, title: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") handleAddMilestone(); if (e.key === "Escape") setAddingMilestone(false); }}
                className="w-full text-xs border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500/30" />
              <div className="flex gap-2">
                <select value={msForm.status} onChange={e => setMsForm(p => ({ ...p, status: e.target.value as PortfolioMilestone["status"] }))} className="flex-1 text-xs border border-slate-200 rounded px-2.5 py-1.5">
                  <option value="upcoming">Upcoming</option><option value="in_progress">In progress</option><option value="done">Done</option><option value="blocked">Blocked</option>
                </select>
                <input type="text" placeholder="Target date" value={msForm.target_date} onChange={e => setMsForm(p => ({ ...p, target_date: e.target.value }))}
                  className="flex-1 text-xs border border-slate-200 rounded px-2.5 py-1.5" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setAddingMilestone(false)} className="text-xs px-3 py-1 border border-slate-200 rounded text-slate-600 hover:bg-slate-50">Cancel</button>
                <button onClick={handleAddMilestone} disabled={savingMs || !msForm.title.trim()} className="text-xs px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50">
                  {savingMs ? "Saving…" : "Add"}
                </button>
              </div>
            </div>
          )}
          <div className="h-[120px] overflow-y-auto space-y-1 pr-0.5">
            {localMilestones.length === 0 && !addingMilestone && (
              <p className="text-xs text-slate-400">No milestones yet.</p>
            )}
            {localMilestones.map(ms => (
              <div key={ms.id}>
                {editingMsId === ms.id ? (
                  <div className="p-2 bg-slate-50 rounded-lg space-y-1.5 border border-slate-200">
                    <input autoFocus value={editMsForm.title} onChange={e => setEditMsForm(p => ({ ...p, title: e.target.value }))} placeholder="Milestone title"
                      className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    <input value={editMsForm.description} onChange={e => setEditMsForm(p => ({ ...p, description: e.target.value }))} placeholder="Description (optional)"
                      className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    <div className="flex gap-1.5">
                      <select value={editMsForm.status} onChange={e => setEditMsForm(p => ({ ...p, status: e.target.value as PortfolioMilestone["status"] }))} className="flex-1 text-xs border border-slate-200 rounded px-2 py-1">
                        <option value="upcoming">Upcoming</option><option value="in_progress">In progress</option><option value="done">Done</option><option value="blocked">Blocked</option>
                      </select>
                      <select value={editMsForm.category} onChange={e => setEditMsForm(p => ({ ...p, category: e.target.value }))} className="flex-1 text-xs border border-slate-200 rounded px-2 py-1">
                        <option value="fundraise">Fundraise</option><option value="regulatory">Regulatory</option><option value="product">Product</option>
                        <option value="partnership">Partnership</option><option value="hiring">Hiring</option><option value="general">General</option>
                      </select>
                      <input value={editMsForm.target_date} onChange={e => setEditMsForm(p => ({ ...p, target_date: e.target.value }))} placeholder="Target date"
                        className="flex-1 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none" />
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => setEditingMsId(null)} className="text-[11px] px-2 py-1 text-slate-500 border border-slate-200 rounded hover:bg-slate-50">Cancel</button>
                      <button onClick={handleSaveEditMs} disabled={savingMsEdit || !editMsForm.title.trim()} className="text-[11px] px-2 py-1 bg-blue-600 text-white rounded disabled:opacity-50">
                        {savingMsEdit ? "…" : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 group py-1">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${MILESTONE_STATUS_DOT[ms.status] ?? "bg-slate-300"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-slate-800 leading-tight truncate">{ms.title}</p>
                      {ms.target_date && <p className="text-[10px] text-slate-400 leading-tight">{ms.target_date}</p>}
                    </div>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0"
                      style={{ backgroundColor: statusColors[ms.status]?.bg ?? "#F1EFE8", color: statusColors[ms.status]?.text ?? "#5F5E5A" }}>
                      {ms.status.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                    </span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      <button onClick={() => handleStartEditMs(ms)} className="text-slate-400 hover:text-slate-600"><Pencil size={10} /></button>
                      <button onClick={() => handleDeleteMilestone(ms.id)} className="text-red-300 hover:text-red-500"><Trash2 size={10} /></button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Strategic initiatives */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-2 flex-shrink-0">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Strategic initiatives</h3>
            <button onClick={() => setAddingInit(true)} className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-700"><Plus size={10} /> Add</button>
          </div>
          <div className="h-[120px] overflow-y-auto pr-0.5">
            {addingInit && (
              <div className="mb-2 p-2.5 bg-slate-50 rounded-lg space-y-1.5 border border-slate-200">
                <input autoFocus placeholder="Initiative title" value={addInitForm.title} onChange={e => setAddInitForm(p => ({ ...p, title: e.target.value }))}
                  className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                <input placeholder="Short description (optional)" value={addInitForm.description} onChange={e => setAddInitForm(p => ({ ...p, description: e.target.value }))}
                  className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                <div className="flex items-center gap-2">
                  <select value={addInitForm.status} onChange={e => setAddInitForm(p => ({ ...p, status: e.target.value }))} className="flex-1 text-xs border border-slate-200 rounded px-2 py-1.5">
                    <option value="planned">Planned</option><option value="in_progress">In progress</option>
                    <option value="complete">Complete</option><option value="paused">Paused</option>
                  </select>
                  <button onClick={() => setAddingInit(false)} className="text-[11px] px-2 py-1 text-slate-500 border border-slate-200 rounded hover:bg-slate-50">Cancel</button>
                  <button onClick={handleAddInit} disabled={savingInitAdd || !addInitForm.title.trim()} className="text-[11px] px-2 py-1 bg-blue-600 text-white rounded disabled:opacity-50">
                    {savingInitAdd ? "…" : "Add"}
                  </button>
                </div>
              </div>
            )}
            {initiatives.length === 0 && !addingInit && <p className="text-xs text-slate-400">No initiatives yet</p>}
            <div className="space-y-1.5">
              {initiatives.slice(0, 6).map(init => (
                <div key={init.id}>
                  {editingInitId === init.id ? (
                    <div className="p-2 bg-slate-50 rounded-lg space-y-1.5 border border-slate-200">
                      <input value={editInitForm.title} onChange={e => setEditInitForm(p => ({ ...p, title: e.target.value }))}
                        className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      <input value={editInitForm.description} onChange={e => setEditInitForm(p => ({ ...p, description: e.target.value }))} placeholder="Description"
                        className="w-full text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      <div className="flex items-center gap-2">
                        <select value={editInitForm.status} onChange={e => setEditInitForm(p => ({ ...p, status: e.target.value }))} className="flex-1 text-xs border border-slate-200 rounded px-2 py-1">
                          <option value="planned">Planned</option><option value="in_progress">In progress</option>
                          <option value="complete">Complete</option><option value="paused">Paused</option>
                        </select>
                        <button onClick={() => setEditingInitId(null)} className="text-[11px] px-2 py-1 text-slate-500 border border-slate-200 rounded hover:bg-slate-50">Cancel</button>
                        <button onClick={handleSaveInitEdit} disabled={savingInitEdit} className="text-[11px] px-2 py-1 bg-blue-600 text-white rounded disabled:opacity-50">
                          {savingInitEdit ? "…" : "Save"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2 group">
                      <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${INITIATIVE_STATUS_DOT[init.status] ?? "bg-slate-300"}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-medium text-slate-800 leading-tight">{init.title}</p>
                        {init.description && <p className="text-[11px] text-slate-500 line-clamp-1">{stripCiteTags(init.description)}</p>}
                      </div>
                      <div className="flex-shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleStartEditInit(init)} className="text-slate-400 hover:text-slate-600"><Pencil size={10} /></button>
                        <button onClick={() => handleDeleteInit(init.id)} className="text-red-300 hover:text-red-500"><Trash2 size={10} /></button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══ ROW 4: M&A Acquirers (left) + Pilot Partners (right) ═══════════════ */}
      <div className="grid grid-cols-2 gap-4 items-start">

        {/* Left: M&A acquirers */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-2 flex-shrink-0">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">M&A acquirers</h3>
            <button onClick={() => handleRefresh("ma_acquirer")} disabled={refreshing !== null}
              className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-700 disabled:opacity-50">
              <RefreshCw size={10} className={refreshing === "ma_acquirer" ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
          <div className="h-[200px] overflow-y-auto pr-0.5">
            {acquirers.length === 0 ? (
              <p className="text-xs text-slate-400">Click Refresh to generate candidates</p>
            ) : (
              <div className="space-y-2">
                {acquirers.slice(0, 4).map(a => (
                  <div key={a.id} className="bg-slate-50 rounded-lg p-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <p className="text-[12px] font-semibold text-slate-800">{a.entity_name}</p>
                      <span className={`text-[9px] px-1 py-px rounded font-medium ${FIT_BADGE[a.fit_level] ?? "bg-slate-100 text-slate-500"}`}>{a.fit_level}</span>
                      <span className={`text-[9px] px-1 py-px rounded font-medium ${WARMTH_BADGE[a.warmth] ?? "bg-slate-100 text-slate-500"}`}>{a.warmth.replace("_", " ")}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug line-clamp-2">
                      {stripCiteTags(a.description || "No rationale yet — click Refresh to generate.")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Pilot partners */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-2 flex-shrink-0">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Pilot partners</h3>
            <button onClick={() => handleRefresh("pilot_partner")} disabled={refreshing !== null}
              className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-700 disabled:opacity-50">
              <RefreshCw size={10} className={refreshing === "pilot_partner" ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
          <div className="h-[200px] overflow-y-auto pr-0.5">
            {pilots.length === 0 ? (
              <p className="text-xs text-slate-400">Click Refresh to generate candidates</p>
            ) : (
              <div className="space-y-2">
                {pilots.slice(0, 4).map(p => (
                  <div key={p.id} className="bg-slate-50 rounded-lg p-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <p className="text-[12px] font-semibold text-slate-800">{p.entity_name}</p>
                      <span className={`text-[9px] px-1 py-px rounded font-medium ${FIT_BADGE[p.fit_level] ?? "bg-slate-100 text-slate-500"}`}>{p.fit_level}</span>
                      <span className={`text-[9px] px-1 py-px rounded font-medium ${WARMTH_BADGE[p.warmth] ?? "bg-slate-100 text-slate-500"}`}>{p.warmth.replace("_", " ")}</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug line-clamp-2">
                      {stripCiteTags(p.description || "No rationale yet — click Refresh to generate.")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>


      {/* Full timeline slide-out panel */}
      {showFullTimeline && (
        <div
          className="fixed inset-0 bg-black/30 z-50 flex justify-end"
          onClick={e => { if (e.target === e.currentTarget) setShowFullTimeline(false); }}
        >
          <div className="w-[560px] bg-white h-full overflow-y-auto shadow-xl flex flex-col">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
              <div>
                <p className="text-sm font-semibold text-slate-900">Interaction timeline</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {company.name} — {interactions.length} interaction{interactions.length !== 1 ? "s" : ""}
                </p>
              </div>
              <button onClick={() => setShowFullTimeline(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-4 flex-1">
              {interactions.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm text-slate-400">No interactions recorded</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {interactions.map((i, idx) => (
                    <div
                      key={i.id}
                      className="relative pl-6 pb-4 cursor-pointer hover:bg-slate-50 rounded-lg px-3 -mx-3 transition-colors"
                      onClick={() => setSelectedInteraction(i)}
                    >
                      {idx < interactions.length - 1 && (
                        <div className="absolute left-[19px] top-8 bottom-0 w-px bg-slate-200" />
                      )}
                      <div className={`absolute left-3 top-4 w-2.5 h-2.5 rounded-full border-2 border-white ${
                        i.type === "meeting" ? "bg-blue-500" :
                        i.type === "email"   ? "bg-slate-400" :
                        i.type === "call"    ? "bg-emerald-500" :
                        i.type === "intro"   ? "bg-violet-500" : "bg-amber-500"
                      }`} />
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{i.subject ?? i.type}</p>
                          {i.attendees && i.attendees.length > 0 && (
                            <p className="text-xs text-slate-500 mt-0.5">
                              {i.attendees.slice(0, 3).map(a => a.name).join(", ")}
                              {i.attendees.length > 3 ? ` +${i.attendees.length - 3}` : ""}
                            </p>
                          )}
                          {i.summary && (
                            <p className="text-xs text-slate-500 mt-1 line-clamp-2">{i.summary}</p>
                          )}
                          <div className="flex gap-1.5 mt-1.5">
                            {i.transcript_url && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">Transcript</span>
                            )}
                            {i.ai_summary && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700">AI summary</span>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400 flex-shrink-0 ml-3">
                          {new Date(i.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Investment detail modal ── */}
      {selectedInvestment && (() => {
        const inv = selectedInvestment;
        const isSafe = inv.investment_type === "safe";
        const accentBg  = isSafe ? "bg-violet-50"  : "bg-blue-50";
        const accentText = isSafe ? "text-violet-700" : "text-blue-700";
        const accentBorder = isSafe ? "border-violet-200" : "border-blue-200";

        const fields: { label: string; value: string }[] = [
          { label: "Close Date",        value: inv.close_date ? new Date(inv.close_date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—" },
          { label: "Investment Amount", value: fmtMoney(inv.investment_amount) },
          { label: "Round Size",        value: fmtMoney(inv.round_size) },
          { label: "Funding Round",     value: inv.funding_round ?? "—" },
          { label: "Investment Type",   value: isSafe ? "SAFE / Convertible Note" : "Priced Round" },
          { label: "Board",             value: inv.board_representation ? (BOARD_LABEL[inv.board_representation] ?? "—") : "—" },
          ...(isSafe ? [
            { label: "Valuation Cap",   value: fmtMoney(inv.valuation_cap) },
            { label: "Discount",        value: inv.discount !== null ? `${inv.discount}%` : "—" },
            { label: "Interest Rate",   value: inv.interest_rate !== null ? `${inv.interest_rate}%` : "—" },
          ] : [
            { label: "Pre-Money Val.",  value: fmtMoney(inv.pre_money_valuation) },
            { label: "Ownership",       value: inv.ownership_pct !== null ? `${inv.ownership_pct}%` : "—" },
            { label: "Price per Share", value: inv.price_per_share !== null ? `$${inv.price_per_share?.toFixed(4)}` : "—" },
          ]),
        ];

        return (
          <div
            className="fixed inset-0 bg-black/30 z-[60] flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setSelectedInvestment(null); }}
          >
            <div className="bg-white rounded-2xl w-[620px] max-h-[85vh] overflow-y-auto overflow-x-hidden shadow-2xl">
              {/* Header */}
              <div className={`sticky top-0 ${accentBg} border-b ${accentBorder} px-6 py-4 flex items-start justify-between rounded-t-2xl`}>
                <div>
                  <p className={`text-sm font-bold ${accentText}`}>
                    {inv.funding_round ?? (isSafe ? "SAFE / Convertible Note" : "Priced Round")}
                  </p>
                  <p className={`text-xs mt-0.5 ${accentText} opacity-70`}>
                    {isSafe ? "SAFE / Convertible Note" : "Priced Round"}
                    {inv.close_date && ` · ${new Date(inv.close_date).toLocaleDateString("en-GB", { month: "short", year: "numeric" })}`}
                  </p>
                </div>
                <button onClick={() => setSelectedInvestment(null)} className="text-slate-400 hover:text-slate-600 mt-0.5">
                  <X size={18} />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-5">
                {/* Fields grid */}
                <div className="grid grid-cols-3 gap-x-4 gap-y-3">
                  {fields.map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
                      <p className="text-sm font-semibold text-slate-800">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Notes */}
                {inv.notes && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Notes</p>
                    <p className="text-xs text-slate-600 leading-relaxed">{inv.notes}</p>
                  </div>
                )}

                {/* Documents — always show both slots, equal width, N/A if missing */}
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Documents</p>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Investment Memo */}
                    {inv.memo_storage_path ? (
                      <button
                        onClick={async () => {
                          setOpeningDoc("memo");
                          await openInvestmentDoc(inv.memo_storage_path!);
                          setOpeningDoc(null);
                        }}
                        className="flex items-center gap-2 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-xl hover:bg-blue-100 transition-colors min-w-0"
                      >
                        <FileText size={14} className="text-blue-600 flex-shrink-0" />
                        <span className="text-xs text-blue-700 font-medium truncate flex-1 text-left">{inv.memo_file_name ?? "Investment Memo"}</span>
                        {openingDoc === "memo" ? <Loader2 size={12} className="animate-spin text-blue-400 flex-shrink-0" /> : <ExternalLink size={12} className="text-blue-400 flex-shrink-0" />}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border border-slate-200 border-dashed rounded-xl min-w-0">
                        <FileText size={14} className="text-slate-300 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] text-slate-400 font-medium">Investment Memo</p>
                          <p className="text-xs font-semibold text-slate-400">N/A</p>
                        </div>
                      </div>
                    )}
                    {/* Subscription Document */}
                    {inv.subscription_doc_storage_path ? (
                      <button
                        onClick={async () => {
                          setOpeningDoc("subdoc");
                          await openInvestmentDoc(inv.subscription_doc_storage_path!);
                          setOpeningDoc(null);
                        }}
                        className="flex items-center gap-2 px-3 py-2.5 bg-violet-50 border border-violet-200 rounded-xl hover:bg-violet-100 transition-colors min-w-0"
                      >
                        <FileText size={14} className="text-violet-600 flex-shrink-0" />
                        <span className="text-xs text-violet-700 font-medium truncate flex-1 text-left">{inv.subscription_doc_file_name ?? "Subscription Doc"}</span>
                        {openingDoc === "subdoc" ? <Loader2 size={12} className="animate-spin text-violet-400 flex-shrink-0" /> : <ExternalLink size={12} className="text-violet-400 flex-shrink-0" />}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border border-slate-200 border-dashed rounded-xl min-w-0">
                        <FileText size={14} className="text-slate-300 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] text-slate-400 font-medium">Subscription Doc</p>
                          <p className="text-xs font-semibold text-slate-400">N/A</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Individual interaction detail modal — z-[60] floats above slide-out */}
      {selectedInteraction && (
        <div
          className="fixed inset-0 bg-black/30 z-[60] flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setSelectedInteraction(null); }}
        >
          <div className="bg-white rounded-xl w-[640px] max-h-[80vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">{selectedInteraction.subject ?? selectedInteraction.type}</p>
              <button onClick={() => setSelectedInteraction(null)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="flex gap-4 text-xs text-slate-500">
                <span>{new Date(selectedInteraction.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
                <span className="capitalize">{selectedInteraction.type}</span>
                {selectedInteraction.attendees && selectedInteraction.attendees.length > 0 && (
                  <span>{selectedInteraction.attendees.map(a => a.name).join(", ")}</span>
                )}
              </div>
              {selectedInteraction.summary && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-1">Summary</p>
                  <p className="text-xs text-slate-700 leading-relaxed">{selectedInteraction.summary}</p>
                </div>
              )}
              {selectedInteraction.ai_summary && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-1">AI summary</p>
                  <p className="text-xs text-slate-700 leading-relaxed">{selectedInteraction.ai_summary}</p>
                </div>
              )}
              {selectedInteraction.body && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-1">Notes</p>
                  <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{selectedInteraction.body}</p>
                </div>
              )}
              {selectedInteraction.action_items && selectedInteraction.action_items.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-1">Action items</p>
                  <ul className="space-y-1">
                    {selectedInteraction.action_items.map((item, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-xs text-slate-700">
                        <span className="text-slate-300 mt-0.5">•</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {selectedInteraction.transcript_url && (
                <a
                  href={selectedInteraction.transcript_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                >
                  <FileText size={12} /> View transcript
                </a>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
