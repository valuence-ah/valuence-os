"use client";
import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Plus, X, Users, Loader2, AlertTriangle } from "lucide-react";
import type { PortfolioIntelligence } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

interface Props {
  companyId: string;
  companyName: string;
  companyDescription: string | null;
  companySectors: string[];
  intelligence: PortfolioIntelligence[];
  onRefresh: () => void;
}

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

const TIMING_BADGE: Record<string, string> = {
  near_term: "bg-blue-100 text-blue-700",
  mid_term:  "bg-indigo-100 text-indigo-600",
  long_term: "bg-slate-100 text-slate-500",
};

const TIMING_LABEL: Record<string, string> = {
  near_term: "near-term",
  mid_term:  "mid-term",
  long_term: "long-term",
};

const PARTNER_TYPE_BADGE: Record<string, string> = {
  pilot:         "bg-sky-100 text-sky-700",
  commercial:    "bg-teal-100 text-teal-700",
  channel:       "bg-purple-100 text-purple-700",
  strategic:     "bg-amber-100 text-amber-700",
  manufacturing: "bg-orange-100 text-orange-700",
};

type IntelType = "ma_acquirer" | "pilot_partner" | "competitor";

interface AddForm {
  entity_name: string;
  description: string;
  fit_level: string;
  warmth: string;
}

interface LpConnection {
  id: string;
  name: string;
  lp_stage: string | null;
  sectors: string[] | null;
  aum: number | null;
}

function fmtAum(v: number | null): string {
  if (!v) return "";
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(1)}B AUM`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(0)}M AUM`;
  return `$${v.toLocaleString()} AUM`;
}

const LP_STAGE_LABEL: Record<string, string> = {
  target:            "Target",
  intro_made:        "Intro made",
  meeting_scheduled: "Meeting scheduled",
  meeting_done:      "Meeting done",
  materials_sent:    "Materials sent",
  soft_commit:       "Soft commit",
  committed:         "Committed",
  closed:            "Closed",
  passed:            "Passed",
};

const LP_STAGE_BADGE: Record<string, string> = {
  target:            "bg-slate-100 text-slate-500",
  intro_made:        "bg-blue-50 text-blue-600",
  meeting_scheduled: "bg-blue-100 text-blue-700",
  meeting_done:      "bg-indigo-100 text-indigo-700",
  materials_sent:    "bg-amber-100 text-amber-700",
  soft_commit:       "bg-emerald-100 text-emerald-700",
  committed:         "bg-emerald-200 text-emerald-800",
  closed:            "bg-teal-100 text-teal-700",
  passed:            "bg-red-50 text-red-500",
};

const TYPE_LABELS: Record<IntelType, string> = {
  ma_acquirer:   "acquirers",
  pilot_partner: "pilot partners",
  competitor:    "competitors",
};

export function PortfolioIntelligenceTab({
  companyId,
  companyName,
  companyDescription,
  companySectors,
  intelligence,
  onRefresh,
}: Props) {
  const [refreshing, setRefreshing] = useState<IntelType | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [addingFor, setAddingFor] = useState<IntelType | null>(null);
  const [addForm, setAddForm] = useState<AddForm>({ entity_name: "", description: "", fit_level: "medium", warmth: "cold" });
  const [saving, setSaving] = useState(false);
  const [lpConnections, setLpConnections] = useState<LpConnection[]>([]);

  // Local intelligence state — cleared immediately when company changes (prevents cross-contamination)
  const [localIntelligence, setLocalIntelligence] = useState<PortfolioIntelligence[]>([]);

  // GUARD: clear all local state immediately when companyId changes
  useEffect(() => {
    setLocalIntelligence([]);
    setRefreshing(null);
    setRefreshError(null);
    setAddingFor(null);
  }, [companyId]);

  // Sync from parent prop after each refresh
  useEffect(() => {
    setLocalIntelligence(intelligence);
  }, [intelligence]);

  // Fetch LP connections with matching sectors
  useEffect(() => {
    if (companySectors.length === 0) return;
    const supabase = createClient();
    supabase
      .from("companies")
      .select("id, name, lp_stage, sectors, aum")
      .in("type", ["lp", "limited partner"])
      .not("lp_stage", "is", null)
      .then(({ data }) => {
        if (!data) return;
        const lowerSectors = companySectors.map(s => s.toLowerCase());
        const matched = (data as LpConnection[]).filter(lp =>
          (lp.sectors ?? []).some(s => lowerSectors.includes(s.toLowerCase()))
        );
        setLpConnections(matched.slice(0, 10));
      });
  }, [companySectors]);

  const acquirers   = localIntelligence.filter(i => i.type === "ma_acquirer");
  const pilots      = localIntelligence.filter(i => i.type === "pilot_partner");
  const competitors = localIntelligence.filter(i => i.type === "competitor");

  // useCallback with companyId dependency — always sends current company
  const handleRefreshType = useCallback(async (type: IntelType) => {
    if (!companyDescription || companyDescription.length < 30) {
      setRefreshError("Company description is too short. Please add a detailed description in the Overview tab first.");
      return;
    }
    setRefreshError(null);
    setRefreshing(type);
    try {
      const res = await fetch("/api/portfolio/intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, type }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        setRefreshError(err.error ?? "Intelligence generation failed.");
      } else {
        setRefreshError(null);
        onRefresh();
      }
    } catch {
      setRefreshError("Network error — please try again.");
    } finally {
      setRefreshing(null);
    }
  }, [companyId, companyDescription, onRefresh]);

  async function handleAdd() {
    if (!addingFor || !addForm.entity_name.trim()) return;
    setSaving(true);
    const supabase = createClient();
    await supabase.from("portfolio_intelligence").insert({
      company_id: companyId,
      type: addingFor,
      entity_name: addForm.entity_name.trim(),
      description: addForm.description.trim() || null,
      fit_level: addForm.fit_level,
      warmth: addForm.warmth,
      source: "manual",
    });
    setAddingFor(null);
    setAddForm({ entity_name: "", description: "", fit_level: "medium", warmth: "cold" });
    setSaving(false);
    onRefresh();
  }

  async function handleDelete(id: string) {
    const supabase = createClient();
    await supabase.from("portfolio_intelligence").delete().eq("id", id);
    onRefresh();
  }

  // ── M&A Acquirer card ────────────────────────────────────────────────────────
  function MaCard({ item }: { item: PortfolioIntelligence }) {
    return (
      <div className="py-3 border-b border-slate-100 last:border-0 group relative">
        <button
          onClick={() => handleDelete(item.id)}
          className="absolute top-3 right-0 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-opacity p-0.5"
        >
          <X size={12} />
        </button>

        {/* Header row */}
        <div className="flex items-center gap-1.5 flex-wrap mb-1 pr-5">
          <p className="text-[13px] font-semibold text-slate-800">{item.entity_name}</p>
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${FIT_BADGE[item.fit_level] ?? "bg-slate-100 text-slate-500"}`}>
            {item.fit_level} fit
          </span>
          {item.timing_view && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${TIMING_BADGE[item.timing_view] ?? "bg-slate-100 text-slate-500"}`}>
              {TIMING_LABEL[item.timing_view] ?? item.timing_view}
            </span>
          )}
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${WARMTH_BADGE[item.warmth] ?? "bg-slate-100 text-slate-500"}`}>
            {item.warmth.replace("_", " ")}
          </span>
        </div>

        {/* Description */}
        {item.description && (
          <p className="text-[11px] text-slate-600 leading-snug mb-2">{item.description}</p>
        )}

        {/* Structured tags */}
        {(item.business_unit || item.evidence_type || item.strategic_value) && (
          <div className="flex flex-wrap gap-1 mt-1">
            {item.business_unit && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium">
                {item.business_unit}
              </span>
            )}
            {item.evidence_type && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                {item.evidence_type.replace(/_/g, " ")}
              </span>
            )}
            {item.strategic_value && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                {item.strategic_value.replace(/_/g, " ")}
              </span>
            )}
          </div>
        )}

        {/* Geography */}
        {item.geography_relevance && (
          <p className="text-[10px] text-slate-400 mt-1">{item.geography_relevance}</p>
        )}
      </div>
    );
  }

  // ── Pilot Partner card ───────────────────────────────────────────────────────
  function PilotCard({ item }: { item: PortfolioIntelligence }) {
    const hasDetail = item.specific_problem || item.use_case || item.pilot_description || item.success_criteria;

    return (
      <div className="py-3 border-b border-slate-100 last:border-0 group relative">
        <button
          onClick={() => handleDelete(item.id)}
          className="absolute top-3 right-0 opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-opacity p-0.5"
        >
          <X size={12} />
        </button>

        {/* Header row */}
        <div className="flex items-center gap-1.5 flex-wrap mb-1 pr-5">
          <p className="text-[13px] font-semibold text-slate-800">{item.entity_name}</p>
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${FIT_BADGE[item.fit_level] ?? "bg-slate-100 text-slate-500"}`}>
            {item.fit_level} fit
          </span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${WARMTH_BADGE[item.warmth] ?? "bg-slate-100 text-slate-500"}`}>
            {item.warmth.replace("_", " ")}
          </span>
          {item.partner_type && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${PARTNER_TYPE_BADGE[item.partner_type] ?? "bg-slate-100 text-slate-500"}`}>
              {item.partner_type}
            </span>
          )}
        </div>

        {/* Description */}
        {item.description && (
          <p className="text-[11px] text-slate-600 leading-snug mb-2">{item.description}</p>
        )}

        {/* Expanded detail block */}
        {hasDetail && (
          <div className="bg-slate-50 rounded-lg px-3 py-2 mt-1.5 space-y-1">
            {item.specific_problem && (
              <p className="text-[10px] text-slate-700">
                <span className="font-semibold text-slate-400 uppercase tracking-wide mr-1">Problem</span>
                {item.specific_problem}
              </p>
            )}
            {item.use_case && (
              <p className="text-[10px] text-slate-700">
                <span className="font-semibold text-slate-400 uppercase tracking-wide mr-1">Use case</span>
                {item.use_case}
              </p>
            )}
            {item.pilot_description && (
              <p className="text-[10px] text-slate-700">
                <span className="font-semibold text-slate-400 uppercase tracking-wide mr-1">Pilot</span>
                {item.pilot_description}
              </p>
            )}
            {item.success_criteria && (
              <p className="text-[10px] text-slate-700">
                <span className="font-semibold text-slate-400 uppercase tracking-wide mr-1">Success</span>
                {item.success_criteria}
              </p>
            )}
          </div>
        )}

        {/* Partner value tag */}
        {item.partner_value && (
          <div className="mt-1.5">
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">
              {item.partner_value.replace(/_/g, " ")}
            </span>
          </div>
        )}
      </div>
    );
  }

  // ── Simple competitor card ───────────────────────────────────────────────────
  function CompetitorCard({ item }: { item: PortfolioIntelligence }) {
    return (
      <div className="flex items-start gap-2 p-2.5 bg-slate-50 rounded-lg group">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-[13px] font-semibold text-slate-800">{item.entity_name}</p>
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${FIT_BADGE[item.fit_level] ?? "bg-slate-100 text-slate-500"}`}>
              {item.fit_level} threat
            </span>
          </div>
          {item.description && (
            <p className="text-[11px] text-slate-500 mt-0.5">{item.description}</p>
          )}
        </div>
        <button
          onClick={() => handleDelete(item.id)}
          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity p-0.5 flex-shrink-0"
        >
          <X size={12} />
        </button>
      </div>
    );
  }

  // ── Section wrapper ──────────────────────────────────────────────────────────
  function Section({
    title,
    type,
    items,
    renderCard,
    cardLayout = "list",
  }: {
    title: string;
    type: IntelType;
    items: PortfolioIntelligence[];
    renderCard: (item: PortfolioIntelligence) => React.ReactNode;
    cardLayout?: "list" | "grid";
  }) {
    const isRefreshing = refreshing === type;

    return (
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setAddingFor(type); setAddForm({ entity_name: "", description: "", fit_level: "medium", warmth: "cold" }); }}
              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700"
            >
              <Plus size={11} /> Add
            </button>
            <button
              onClick={() => handleRefreshType(type)}
              disabled={refreshing !== null}
              className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-700 disabled:opacity-50"
            >
              {isRefreshing ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
              {isRefreshing ? `Researching ${TYPE_LABELS[type]} for ${companyName}…` : "Refresh"}
            </button>
          </div>
        </div>

        {/* Add form */}
        {addingFor === type && (
          <div className="mb-3 p-3 bg-slate-50 rounded-lg space-y-2">
            <input
              autoFocus
              placeholder="Entity name"
              value={addForm.entity_name}
              onChange={e => setAddForm(p => ({ ...p, entity_name: e.target.value }))}
              className="w-full text-xs border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
            />
            <input
              placeholder="Description (optional)"
              value={addForm.description}
              onChange={e => setAddForm(p => ({ ...p, description: e.target.value }))}
              className="w-full text-xs border border-slate-200 rounded px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500/30"
            />
            <div className="flex gap-2">
              <select
                value={addForm.fit_level}
                onChange={e => setAddForm(p => ({ ...p, fit_level: e.target.value }))}
                className="flex-1 text-xs border border-slate-200 rounded px-2.5 py-1.5"
              >
                <option value="high">High fit</option>
                <option value="medium">Medium fit</option>
                <option value="low">Low fit</option>
              </select>
              <select
                value={addForm.warmth}
                onChange={e => setAddForm(p => ({ ...p, warmth: e.target.value }))}
                className="flex-1 text-xs border border-slate-200 rounded px-2.5 py-1.5"
              >
                <option value="warm">Warm</option>
                <option value="lp_connection">LP connection</option>
                <option value="cold">Cold</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setAddingFor(null)} className="text-xs px-3 py-1 border border-slate-200 rounded text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleAdd} disabled={saving || !addForm.entity_name.trim()} className="text-xs px-3 py-1 bg-blue-600 text-white rounded disabled:opacity-50">Save</button>
            </div>
          </div>
        )}

        {/* Content */}
        {isRefreshing ? (
          <div className="flex items-center gap-2 py-5 text-xs text-slate-400">
            <Loader2 size={14} className="animate-spin text-blue-400 flex-shrink-0" />
            <span>
              Researching {TYPE_LABELS[type]} for{" "}
              <span className="font-medium text-slate-600">{companyName}</span>…
              <span className="text-slate-300 ml-1">(may take 15–20 seconds with web search)</span>
            </span>
          </div>
        ) : items.length === 0 ? (
          <p className="text-xs text-slate-400">No entries yet. Click &quot;Refresh&quot; to generate candidates.</p>
        ) : (
          <div className={cardLayout === "grid" ? "space-y-2" : ""}>
            {items.map(item => (
              <div key={item.id}>{renderCard(item)}</div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const hasDescription = companyDescription && companyDescription.length >= 30;

  return (
    <div className="p-5 space-y-4 overflow-y-auto h-full">
      {/* Description missing warning */}
      {!hasDescription && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            <span className="font-semibold">No company description.</span>{" "}
            Add a detailed description in the Overview tab before generating AI intelligence — Claude needs it to produce company-specific results.
          </p>
        </div>
      )}

      {/* API error banner */}
      {refreshError && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">{refreshError}</p>
        </div>
      )}

      <Section
        title="M&A acquirer candidates"
        type="ma_acquirer"
        items={acquirers}
        renderCard={item => <MaCard item={item} />}
      />
      <Section
        title="Potential pilot partners"
        type="pilot_partner"
        items={pilots}
        renderCard={item => <PilotCard item={item} />}
      />
      <Section
        title="Competitor landscape"
        type="competitor"
        items={competitors}
        renderCard={item => <CompetitorCard item={item} />}
        cardLayout="grid"
      />

      {/* LP connections */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Users size={14} className="text-violet-500" />
          <h3 className="text-sm font-semibold text-slate-700">LP connections</h3>
          <span className="text-[10px] text-slate-400 ml-1">LPs in your fund with matching sector focus</span>
        </div>
        {lpConnections.length === 0 ? (
          <p className="text-xs text-slate-400">
            {companySectors.length === 0
              ? "No sectors set for this company."
              : "No LP connections found with matching sectors."}
          </p>
        ) : (
          <div className="space-y-2">
            {lpConnections.map(lp => (
              <div key={lp.id} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-semibold text-slate-800">{lp.name}</p>
                    {lp.lp_stage && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${LP_STAGE_BADGE[lp.lp_stage] ?? "bg-slate-100 text-slate-500"}`}>
                        {LP_STAGE_LABEL[lp.lp_stage] ?? lp.lp_stage}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {lp.aum && <span className="text-[10px] text-slate-400">{fmtAum(lp.aum)}</span>}
                    {(lp.sectors ?? []).length > 0 && (
                      <span className="text-[10px] text-slate-400">
                        {(lp.sectors ?? []).slice(0, 3).join(", ")}
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-[10px] text-violet-600 font-medium flex-shrink-0">Sector match</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
