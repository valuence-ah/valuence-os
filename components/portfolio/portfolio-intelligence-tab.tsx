"use client";
import { useState } from "react";
import { RefreshCw, Plus, X } from "lucide-react";
import type { PortfolioIntelligence } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

interface Props {
  companyId: string;
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

export function PortfolioIntelligenceTab({ companyId, intelligence, onRefresh }: Props) {
  const supabase = createClient();
  const [refreshing, setRefreshing] = useState<IntelType | null>(null);
  const [addingFor, setAddingFor] = useState<IntelType | null>(null);
  const [addForm, setAddForm] = useState<AddForm>({ entity_name: "", description: "", fit_level: "medium", warmth: "cold" });
  const [saving, setSaving] = useState(false);

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
    </div>
  );
}
