"use client";
import { useState } from "react";
import { Loader2, RefreshCw, FileText, Plus, X, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Company, PortfolioKpi, PortfolioMilestone, PortfolioInitiative, PortfolioIntelligence, Interaction, FeedArticle } from "@/lib/types";

interface Props {
  company: Company;
  kpis: PortfolioKpi[];
  milestones: PortfolioMilestone[];
  initiatives: PortfolioInitiative[];
  intelligence: PortfolioIntelligence[];
  interactions: Interaction[];
  signals: FeedArticle[];
  onIntelligenceRefresh: (type: "ma_acquirer" | "pilot_partner") => Promise<void>;
  onDetailRefresh: () => void;
  onCompanyUpdate: (id: string, updates: Partial<Company>) => void;
}

function fmtMoney(v: number | null): string {
  if (v === null || v === undefined) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v}`;
}

function timeAgo(date: string): string {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

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
  company, kpis, milestones, initiatives, intelligence, interactions, signals,
  onIntelligenceRefresh, onDetailRefresh, onCompanyUpdate,
}: Props) {
  const [refreshing, setRefreshing] = useState<"ma_acquirer" | "pilot_partner" | null>(null);

  // Milestone state
  const [addingMilestone, setAddingMilestone] = useState(false);
  const [msForm, setMsForm] = useState({ title: "", status: "upcoming" as PortfolioMilestone["status"], target_date: "" });
  const [savingMs, setSavingMs] = useState(false);
  const [updatingMsId, setUpdatingMsId] = useState<string | null>(null);

  // Risk flags state
  const [riskInput, setRiskInput] = useState("");
  const [savingRisk, setSavingRisk] = useState(false);

  // Fundraise tracker fields (from JSONB)
  const ft = (company.fundraise_tracker ?? {}) as Record<string, string | number>;
  const isRaising = company.current_raise_status && company.current_raise_status !== "not_raising";

  const latestKpi = kpis[0] ?? null;
  const prevKpi = kpis[1] ?? null;

  const burnChange = latestKpi && prevKpi && latestKpi.monthly_burn !== null && prevKpi.monthly_burn !== null
    ? latestKpi.monthly_burn - prevKpi.monthly_burn : null;

  const headcountChange = latestKpi?.headcount_change;

  async function handleRefresh(type: "ma_acquirer" | "pilot_partner") {
    setRefreshing(type);
    await onIntelligenceRefresh(type);
    setRefreshing(null);
  }

  async function handleMilestoneStatusChange(id: string, status: PortfolioMilestone["status"]) {
    setUpdatingMsId(id);
    const supabase = createClient();
    await supabase.from("portfolio_milestones").update({ status }).eq("id", id);
    setUpdatingMsId(null);
    onDetailRefresh();
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

  const acquirers = intelligence.filter(i => i.type === "ma_acquirer");
  const pilots = intelligence.filter(i => i.type === "pilot_partner");

  return (
    <div className="p-5 space-y-5 overflow-y-auto h-full">

      {/* Latest report banner */}
      {company.latest_report_summary && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
          <p className="text-[11px] font-semibold text-blue-700 mb-0.5">
            Latest report{company.latest_report_date ? ` — uploaded ${timeAgo(company.latest_report_date)}` : ""}
          </p>
          <p className="text-xs text-blue-800">{company.latest_report_summary}</p>
        </div>
      )}

      {/* KPI tiles — deeptech focused, no MRR */}
      <div>
        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-2">KPIs</h3>
        <div className="grid grid-cols-4 gap-3">
          {/* Monthly burn */}
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[10px] text-slate-400 mb-1">Monthly burn</p>
            <p className="text-sm font-bold text-slate-800">{fmtMoney(latestKpi?.monthly_burn ?? null)}</p>
            {burnChange !== null && (
              <p className={`text-[10px] mt-0.5 ${burnChange <= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {burnChange > 0 ? "+" : ""}{fmtMoney(burnChange)} vs prev
              </p>
            )}
          </div>

          {/* Cash on hand */}
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[10px] text-slate-400 mb-1">Cash on hand</p>
            <p className="text-sm font-bold text-slate-800">{fmtMoney(latestKpi?.cash_on_hand ?? null)}</p>
          </div>

          {/* Runway */}
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[10px] text-slate-400 mb-1">Runway</p>
            <p className="text-sm font-bold text-slate-800">
              {latestKpi?.runway_months !== null && latestKpi?.runway_months !== undefined
                ? `${Math.round(latestKpi.runway_months)}mo`
                : "—"}
            </p>
            {latestKpi?.runway_months !== null && latestKpi?.runway_months !== undefined && (
              <RunwayBar months={latestKpi.runway_months} />
            )}
          </div>

          {/* Headcount */}
          <div className="bg-slate-50 rounded-lg p-3">
            <p className="text-[10px] text-slate-400 mb-1">Headcount</p>
            <p className="text-sm font-bold text-slate-800">
              {latestKpi?.headcount !== null && latestKpi?.headcount !== undefined ? latestKpi.headcount : "—"}
            </p>
            {headcountChange !== null && headcountChange !== undefined && (
              <p className={`text-[10px] mt-0.5 ${headcountChange > 0 ? "text-emerald-600" : headcountChange < 0 ? "text-red-500" : "text-slate-400"}`}>
                {headcountChange > 0 ? "+" : ""}{headcountChange} vs prev
              </p>
            )}
          </div>
        </div>
        {latestKpi && (
          <p className="text-[10px] text-slate-400 mt-1">Period: {latestKpi.period}</p>
        )}
      </div>

      {/* Key milestones */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Key milestones</h3>
          <button
            onClick={() => setAddingMilestone(true)}
            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700"
          >
            <Plus size={11} /> Add
          </button>
        </div>
        {milestones.length === 0 && !addingMilestone ? (
          <p className="text-xs text-slate-400">No milestones yet.</p>
        ) : (
          <div className="space-y-1.5">
            {milestones.map(ms => (
              <div key={ms.id} className="flex items-center gap-2.5 group">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${MILESTONE_STATUS_DOT[ms.status] ?? "bg-slate-300"}`} />
                <p className="text-[13px] text-slate-800 flex-1 min-w-0 truncate">{ms.title}</p>
                {updatingMsId === ms.id ? (
                  <Loader2 size={11} className="animate-spin text-slate-400 flex-shrink-0" />
                ) : (
                  <select
                    value={ms.status}
                    onChange={e => handleMilestoneStatusChange(ms.id, e.target.value as PortfolioMilestone["status"])}
                    className={`text-[10px] font-medium border-none bg-transparent cursor-pointer flex-shrink-0 focus:outline-none ${MILESTONE_STATUS_COLOR[ms.status] ?? "text-slate-400"}`}
                  >
                    <option value="upcoming">Upcoming</option>
                    <option value="in_progress">In progress</option>
                    <option value="done">Done</option>
                    <option value="blocked">Blocked</option>
                  </select>
                )}
                {ms.target_date && (
                  <span className="text-[10px] text-slate-400 flex-shrink-0">{ms.target_date}</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Add milestone inline form */}
        {addingMilestone && (
          <div className="mt-2 p-3 bg-slate-50 rounded-lg space-y-2">
            <input
              autoFocus
              placeholder="Milestone title"
              value={msForm.title}
              onChange={e => setMsForm(p => ({ ...p, title: e.target.value }))}
              onKeyDown={e => { if (e.key === "Enter") handleAddMilestone(); if (e.key === "Escape") setAddingMilestone(false); }}
              className="w-full text-xs border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
            />
            <div className="flex gap-2">
              <select
                value={msForm.status}
                onChange={e => setMsForm(p => ({ ...p, status: e.target.value as PortfolioMilestone["status"] }))}
                className="flex-1 text-xs border border-slate-200 rounded px-2.5 py-1.5"
              >
                <option value="upcoming">Upcoming</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
                <option value="blocked">Blocked</option>
              </select>
              <input
                type="date"
                value={msForm.target_date}
                onChange={e => setMsForm(p => ({ ...p, target_date: e.target.value }))}
                className="flex-1 text-xs border border-slate-200 rounded px-2.5 py-1.5"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setAddingMilestone(false)} className="text-xs px-3 py-1 border border-slate-200 rounded text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleAddMilestone} disabled={savingMs || !msForm.title.trim()} className="text-xs px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50">
                {savingMs ? "Saving…" : "Add"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Fundraise tracker — only when raising */}
      {isRaising && (
        <div className="bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3">
          <h3 className="text-[10px] font-bold text-emerald-700 uppercase tracking-[0.1em] mb-2">Fundraise tracker</h3>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] text-emerald-600 mb-0.5">Round</p>
              <p className="text-xs font-semibold text-slate-800">{(ft.round_type as string) ?? company.stage ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] text-emerald-600 mb-0.5">Target</p>
              <p className="text-xs font-semibold text-slate-800">{company.current_raise_target ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] text-emerald-600 mb-0.5">Lead investor</p>
              <p className="text-xs font-semibold text-slate-800">{(ft.lead_investor as string) || "—"}</p>
            </div>
          </div>
          {ft.amount_closed_usd !== undefined && ft.total_target_usd !== undefined && (
            <div className="mt-2">
              <div className="flex justify-between items-center mb-1">
                <p className="text-[10px] text-emerald-600">Closed</p>
                <p className="text-[10px] font-semibold text-slate-700">
                  {fmtMoney(ft.amount_closed_usd as number)} / {fmtMoney(ft.total_target_usd as number)}
                </p>
              </div>
              <div className="w-full bg-emerald-200 rounded-full h-1.5">
                <div
                  className="bg-emerald-500 h-1.5 rounded-full"
                  style={{ width: `${Math.min(100, ((ft.amount_closed_usd as number) / (ft.total_target_usd as number)) * 100)}%` }}
                />
              </div>
            </div>
          )}
          <p className="text-[10px] text-emerald-600 mt-1.5">
            Status: <span className="font-semibold text-slate-700">{(company.current_raise_status ?? "").replace("_", " ")}</span>
          </p>
        </div>
      )}

      {/* 2-col: Strategic initiatives + Recent interactions */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-2">Strategic initiatives</h3>
          {initiatives.length === 0 ? (
            <p className="text-xs text-slate-400">No initiatives yet</p>
          ) : (
            <div className="space-y-1.5">
              {initiatives.slice(0, 5).map(init => (
                <div key={init.id} className="flex items-start gap-2">
                  <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${INITIATIVE_STATUS_DOT[init.status] ?? "bg-slate-300"}`} />
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-slate-800 leading-tight">{init.title}</p>
                    {init.description && (
                      <p className="text-[11px] text-slate-500 line-clamp-1">{init.description}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-2">Recent interactions</h3>
          {interactions.length === 0 ? (
            <p className="text-xs text-slate-400">No interactions yet</p>
          ) : (
            <div className="space-y-2">
              {interactions.slice(0, 5).map(i => (
                <div key={i.id} className="flex items-start gap-2">
                  <FileText size={12} className="text-slate-300 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-slate-700 truncate">{i.subject ?? "Meeting"}</p>
                    <p className="text-[11px] text-slate-400">{timeAgo(i.date)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Industry signals */}
      {signals.length > 0 && (
        <div>
          <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-2">Industry signals</h3>
          <div className="space-y-2">
            {signals.slice(0, 5).map(s => (
              <div key={s.id} className="flex items-start gap-2">
                <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${s.relevance_score && s.relevance_score >= 3 ? "bg-emerald-500" : "bg-amber-400"}`} />
                <div className="min-w-0">
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[12px] font-medium text-slate-700 hover:text-blue-600 line-clamp-1 leading-tight">
                    {s.title}
                  </a>
                  {s.ai_why_relevant && (
                    <p className="text-[11px] text-slate-400 line-clamp-1">{s.ai_why_relevant}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* M&A + pilot panels */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">M&A acquirers</h3>
            <button
              onClick={() => handleRefresh("ma_acquirer")}
              disabled={refreshing !== null}
              className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-700 disabled:opacity-50"
            >
              <RefreshCw size={10} className={refreshing === "ma_acquirer" ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
          {acquirers.length === 0 ? (
            <p className="text-xs text-slate-400">Click Refresh to generate candidates</p>
          ) : (
            <div className="space-y-2">
              {acquirers.slice(0, 3).map(a => (
                <div key={a.id} className="bg-slate-50 rounded-lg p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <p className="text-[12px] font-semibold text-slate-800">{a.entity_name}</p>
                    <span className={`text-[9px] px-1 py-px rounded font-medium ${FIT_BADGE[a.fit_level] ?? "bg-slate-100 text-slate-500"}`}>{a.fit_level}</span>
                    <span className={`text-[9px] px-1 py-px rounded font-medium ${WARMTH_BADGE[a.warmth] ?? "bg-slate-100 text-slate-500"}`}>{a.warmth.replace("_", " ")}</span>
                  </div>
                  {a.description && <p className="text-[11px] text-slate-500 line-clamp-2">{a.description}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Pilot partners</h3>
            <button
              onClick={() => handleRefresh("pilot_partner")}
              disabled={refreshing !== null}
              className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-700 disabled:opacity-50"
            >
              <RefreshCw size={10} className={refreshing === "pilot_partner" ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
          {pilots.length === 0 ? (
            <p className="text-xs text-slate-400">Click Refresh to generate candidates</p>
          ) : (
            <div className="space-y-2">
              {pilots.slice(0, 3).map(p => (
                <div key={p.id} className="bg-slate-50 rounded-lg p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <p className="text-[12px] font-semibold text-slate-800">{p.entity_name}</p>
                    <span className={`text-[9px] px-1 py-px rounded font-medium ${FIT_BADGE[p.fit_level] ?? "bg-slate-100 text-slate-500"}`}>{p.fit_level}</span>
                    <span className={`text-[9px] px-1 py-px rounded font-medium ${WARMTH_BADGE[p.warmth] ?? "bg-slate-100 text-slate-500"}`}>{p.warmth.replace("_", " ")}</span>
                  </div>
                  {p.description && <p className="text-[11px] text-slate-500 line-clamp-2">{p.description}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Risk flags */}
      <div>
        <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-2">Risk flags</h3>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {(company.risk_flags ?? []).map(flag => (
            <span key={flag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-[11px] font-medium">
              {flag}
              <button onClick={() => handleRemoveRiskFlag(flag)} className="hover:text-red-900 ml-0.5">
                <X size={10} />
              </button>
            </span>
          ))}
          {(company.risk_flags ?? []).length === 0 && (
            <span className="text-xs text-slate-400">No risk flags</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            placeholder="Add flag…"
            value={riskInput}
            onChange={e => setRiskInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleAddRiskFlag(); }}
            className="text-xs border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500/30 w-44"
          />
          <button
            onClick={handleAddRiskFlag}
            disabled={savingRisk || !riskInput.trim()}
            className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-red-50 text-red-600 border border-red-200 rounded hover:bg-red-100 disabled:opacity-50"
          >
            <Check size={11} /> Add
          </button>
        </div>
      </div>

    </div>
  );
}
