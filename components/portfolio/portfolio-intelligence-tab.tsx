"use client";
import { useState, useEffect } from "react";
import { RefreshCw, Plus, X, Users } from "lucide-react";
import type { PortfolioIntelligence, Company } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

interface Props {
  companyId: string;
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

export function PortfolioIntelligenceTab({ companyId, companySectors, intelligence, onRefresh }: Props) {
  const [refreshing, setRefreshing] = useState<IntelType | null>(null);
  const [addingFor, setAddingFor] = useState<IntelType | null>(null);
  const [addForm, setAddForm] = useState<AddForm>({ entity_name: "", description: "", fit_level: "medium", warmth: "cold" });
  const [saving, setSaving] = useState(false);
  const [lpConnections, setLpConnections] = useState<LpConnection[]>([]);

  // Fetch LP connections that share sectors with this portfolio company
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

  const acquirers = intelligence.filter(i => i.type === "ma_acquirer");
  const pilots = intelligence.filter(i => i.type === "pilot_partner");
  const competitors = intelligence.filter(i => i.type === "competitor");

  async function handleRefreshType(type: IntelType) {
    setRefreshing(type);
    try {
      await fetch("/api/portfolio/intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, type }),
      });
      onRefresh();
    } finally {
      setRefreshing(null);
    }
  }

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

  function Section({ title, type, items }: { title: string; type: IntelType; items: PortfolioIntelligence[] }) {
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
              <RefreshCw size={11} className={refreshing === type ? "animate-spin" : ""} />
              Refresh with AI
            </button>
          </div>
        </div>

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

        {items.length === 0 ? (
          <p className="text-xs text-slate-400">No entries yet. Click &quot;Refresh with AI&quot; to generate candidates.</p>
        ) : (
          <div className="space-y-2">
            {items.map(item => (
              <div key={item.id} className="flex items-start gap-2 p-2.5 bg-slate-50 rounded-lg group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-[13px] font-semibold text-slate-800">{item.entity_name}</p>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${FIT_BADGE[item.fit_level] ?? "bg-slate-100 text-slate-500"}`}>
                      {item.fit_level} fit
                    </span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${WARMTH_BADGE[item.warmth] ?? "bg-slate-100 text-slate-500"}`}>
                      {item.warmth.replace("_", " ")}
                    </span>
                  </div>
                  {item.description && (
                    <p className="text-[11px] text-slate-500 mt-0.5">{item.description}</p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(item.id)}
                  className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity p-0.5"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4 overflow-y-auto h-full">
      <Section title="M&A acquirer candidates" type="ma_acquirer" items={acquirers} />
      <Section title="Potential pilot partners" type="pilot_partner" items={pilots} />
      <Section title="Competitor landscape" type="competitor" items={competitors} />

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
