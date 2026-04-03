"use client";
// ─── Pipeline Kanban Board ────────────────────────────────────────────────────
// Columns for each deal stage. Click a card to see details.
// "Add Deal" modal creates a new deal linked to a company.

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Deal, DealStage } from "@/lib/types";
import { formatCurrency, DEAL_STAGE_LABELS, cn } from "@/lib/utils";
import { Plus, ChevronDown } from "lucide-react";

const PIPELINE_STAGES: DealStage[] = [
  "sourced", "first_meeting", "deep_dive", "ic_memo", "term_sheet", "due_diligence",
];

const STAGE_HEADER_COLORS: Record<string, string> = {
  sourced:        "border-t-slate-400",
  first_meeting:  "border-t-blue-400",
  deep_dive:      "border-t-violet-400",
  ic_memo:        "border-t-orange-400",
  term_sheet:     "border-t-yellow-400",
  due_diligence:  "border-t-amber-400",
};

interface Props { initialDeals: (Deal & { company?: { id: string; name: string; sectors: string[] | null; stage: string | null; location_city: string | null } | null })[]; }

export function PipelineClient({ initialDeals }: Props) {
  const supabase = createClient();
  const [deals, setDeals]     = useState(initialDeals);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm]       = useState<Partial<Deal>>({ stage: "sourced", instrument: "safe" });

  const byStage = useMemo(() => {
    const map: Record<string, typeof deals> = {};
    PIPELINE_STAGES.forEach(s => { map[s] = []; });
    deals.filter(d => !["closed","passed"].includes(d.stage)).forEach(d => {
      if (map[d.stage]) map[d.stage].push(d);
    });
    return map;
  }, [deals]);

  const closed = deals.filter(d => d.stage === "closed");
  const passed = deals.filter(d => d.stage === "passed");

  async function loadCompanies() {
    if (companies.length > 0) return;
    const { data } = await supabase.from("companies").select("id, name").eq("type", "startup").order("name");
    setCompanies(data ?? []);
  }

  function setField(k: keyof Deal, v: unknown) { setForm(p => ({ ...p, [k]: v })); }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.company_id || !form.stage) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("deals")
      .insert({ ...form, created_by: user?.id })
      .select("*, company:companies(id, name, sectors, stage, deal_status, location_city)")
      .single();
    // Also update company deal_status
    await supabase.from("companies").update({ deal_status: "active_deal" }).eq("id", form.company_id);
    setSaving(false);
    if (!error && data) { setDeals(p => [data, ...p]); setShowModal(false); setForm({ stage: "sourced", instrument: "safe" }); }
    else alert(error?.message ?? "Failed to save");
  }

  async function moveStage(dealId: string, newStage: DealStage) {
    await supabase.from("deals").update({ stage: newStage }).eq("id", dealId);
    setDeals(prev => prev.map(d => d.id === dealId ? { ...d, stage: newStage } : d));
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-4">

      <div className="flex justify-between items-center">
        <p className="text-sm text-slate-500">{deals.filter(d => !["closed","passed"].includes(d.stage)).length} active deals</p>
        <button onClick={() => { setShowModal(true); loadCompanies(); }} className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors">
          <Plus size={16} /> Add Deal
        </button>
      </div>

      {/* Kanban columns */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map(stage => (
          <div key={stage} className={`flex-shrink-0 w-64 card border-t-4 ${STAGE_HEADER_COLORS[stage]}`}>
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700">{DEAL_STAGE_LABELS[stage]}</span>
              <span className="badge bg-slate-100 text-slate-500">{byStage[stage]?.length ?? 0}</span>
            </div>
            <div className="p-3 space-y-2 min-h-[200px]">
              {byStage[stage]?.map(deal => (
                <div key={deal.id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow group">
                  <p className="text-sm font-semibold text-slate-800 leading-tight">{deal.company?.name ?? "Unknown"}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{deal.company?.sectors?.slice(0,2).join(", ") ?? "—"}</p>
                  {deal.investment_amount && (
                    <p className="text-xs font-semibold text-slate-700 mt-2">{formatCurrency(deal.investment_amount, true)}</p>
                  )}
                  {deal.valuation_cap && (
                    <p className="text-xs text-slate-500">Cap: {formatCurrency(deal.valuation_cap, true)}</p>
                  )}
                  {/* Move stage dropdown */}
                  <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <select
                      className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-600"
                      value={deal.stage}
                      onChange={e => moveStage(deal.id, e.target.value as DealStage)}
                    >
                      {[...PIPELINE_STAGES, "closed" as DealStage, "passed" as DealStage].map(s => (
                        <option key={s} value={s}>{DEAL_STAGE_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Closed column */}
        <div className="flex-shrink-0 w-64 card border-t-4 border-t-green-400">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700">Closed</span>
            <span className="badge bg-green-100 text-green-600">{closed.length}</span>
          </div>
          <div className="p-3 space-y-2 min-h-[100px]">
            {closed.map(deal => (
              <div key={deal.id} className="bg-green-50 border border-green-100 rounded-xl p-3">
                <p className="text-sm font-semibold text-slate-800">{deal.company?.name}</p>
                {deal.investment_amount && <p className="text-xs font-semibold text-green-700 mt-1">{formatCurrency(deal.investment_amount, true)}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add Deal Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-base font-semibold">Add Deal</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
            </div>
            <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Company *</label>
                  <select required className="select" value={form.company_id ?? ""} onChange={e => setField("company_id", e.target.value)}>
                    <option value="">Select company…</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Stage *</label>
                  <select required className="select" value={form.stage} onChange={e => setField("stage", e.target.value)}>
                    {[...PIPELINE_STAGES, "closed", "passed"].map(s => <option key={s} value={s}>{DEAL_STAGE_LABELS[s]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Instrument</label>
                  <select className="select" value={form.instrument ?? "safe"} onChange={e => setField("instrument", e.target.value)}>
                    <option value="safe">SAFE</option>
                    <option value="convertible_note">Convertible Note</option>
                    <option value="equity">Equity</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Investment Amount ($)</label>
                  <input className="input" type="number" placeholder="250000" value={form.investment_amount ?? ""} onChange={e => setField("investment_amount", parseFloat(e.target.value) || null)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Valuation Cap ($)</label>
                  <input className="input" type="number" placeholder="10000000" value={form.valuation_cap ?? ""} onChange={e => setField("valuation_cap", parseFloat(e.target.value) || null)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Discount (%)</label>
                  <input className="input" type="number" placeholder="20" value={form.discount_pct ?? ""} onChange={e => setField("discount_pct", parseFloat(e.target.value) || null)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">IC Date</label>
                  <input className="input" type="date" value={form.ic_date ?? ""} onChange={e => setField("ic_date", e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Notes</label>
                <textarea className="textarea" rows={2} value={form.notes ?? ""} onChange={e => setField("notes", e.target.value)} />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-slate-300 text-slate-700 text-sm rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">{saving ? "Saving…" : "Add Deal"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
