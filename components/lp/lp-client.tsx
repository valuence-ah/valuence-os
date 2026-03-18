"use client";
// ─── LP Tracker Client ─────────────────────────────────────────────────────────

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { LpRelationship, LpStage } from "@/lib/types";
import { formatCurrency, formatDate, LP_STAGE_LABELS, LP_STAGE_COLORS, cn } from "@/lib/utils";
import { Plus, Search, DollarSign, Target } from "lucide-react";

const STAGE_ORDER: LpStage[] = ["target","intro_made","meeting_scheduled","meeting_done","materials_sent","soft_commit","committed","closed"];

type RelWithJoins = LpRelationship & {
  company?: { id: string; name: string; aum: number | null; lp_type: string | null; location_country: string | null } | null;
  contact?: { id: string; first_name: string; last_name: string; email: string | null } | null;
};

interface Props {
  initialRelationships: RelWithJoins[];
  lpCompanies: { id: string; name: string; aum: number | null; lp_type: string | null }[];
}

export function LpClient({ initialRelationships, lpCompanies }: Props) {
  const supabase = createClient();
  const [relationships, setRelationships] = useState(initialRelationships);
  const [search, setSearch]       = useState("");
  const [stageFilter, setStage]   = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [form, setForm]           = useState<Partial<LpRelationship>>({ stage: "target", fund_vehicle: "Fund I" });

  const filtered = useMemo(() => relationships.filter(r => {
    const matchStage = stageFilter === "all" || r.stage === stageFilter;
    const q = search.toLowerCase();
    const matchSearch = !q || (r.company?.name ?? "").toLowerCase().includes(q);
    return matchStage && matchSearch && r.stage !== "passed";
  }), [relationships, search, stageFilter]);

  // Fundraising totals
  const totalTarget    = relationships.reduce((s, r) => s + (r.target_allocation ?? 0), 0);
  const totalCommitted = relationships.filter(r => ["committed","closed"].includes(r.stage ?? "")).reduce((s, r) => s + (r.committed_amount ?? 0), 0);
  const totalSoftCommit = relationships.filter(r => r.stage === "soft_commit").reduce((s, r) => s + (r.target_allocation ?? 0), 0);
  const progressPct = totalTarget > 0 ? Math.min((totalCommitted / totalTarget) * 100, 100) : 0;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.company_id) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("lp_relationships")
      .insert({ ...form, created_by: user?.id })
      .select("*, company:companies(id, name, aum, lp_type, location_country), contact:contacts(id, first_name, last_name, email)")
      .single();
    setSaving(false);
    if (!error && data) { setRelationships(p => [data, ...p]); setShowModal(false); setForm({ stage: "target", fund_vehicle: "Fund I" }); }
    else alert(error?.message ?? "Failed to save");
  }

  async function updateStage(id: string, stage: LpStage) {
    await supabase.from("lp_relationships").update({ stage }).eq("id", id);
    setRelationships(prev => prev.map(r => r.id === id ? { ...r, stage } : r));
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-4">

      {/* Fundraising progress */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Fundraising Progress — Fund I</h2>
            <p className="text-xs text-slate-400 mt-0.5">{formatCurrency(totalCommitted, true)} committed of {formatCurrency(totalTarget, true)} target</p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold text-slate-900">{Math.round(progressPct)}%</span>
            <p className="text-xs text-slate-400">funded</p>
          </div>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2.5">
          <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div><p className="text-xs text-slate-400">Hard Commits</p><p className="text-sm font-bold text-green-600">{formatCurrency(totalCommitted, true)}</p></div>
          <div><p className="text-xs text-slate-400">Soft Commits</p><p className="text-sm font-bold text-yellow-600">{formatCurrency(totalSoftCommit, true)}</p></div>
          <div><p className="text-xs text-slate-400">Target</p><p className="text-sm font-bold text-slate-700">{formatCurrency(totalTarget, true)}</p></div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex gap-3 items-center justify-between">
        <div className="flex gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-8 w-48 h-9" placeholder="Search LPs…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="select h-9 w-44" value={stageFilter} onChange={e => setStage(e.target.value)}>
            <option value="all">All stages</option>
            {STAGE_ORDER.map(s => <option key={s} value={s}>{LP_STAGE_LABELS[s]}</option>)}
          </select>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg">
          <Plus size={16} /> Add LP
        </button>
      </div>

      {/* LP Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>LP</th>
                <th>Type</th>
                <th>Stage</th>
                <th>Target Allocation</th>
                <th>Committed</th>
                <th>Next Step</th>
                <th>Next Step Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">No LPs in pipeline. Add your first LP to start tracking.</td></tr>
              ) : (
                filtered.map(r => (
                  <tr key={r.id}>
                    <td>
                      <p className="font-medium text-slate-900">{r.company?.name ?? "Unknown"}</p>
                      {r.company?.location_country && <p className="text-xs text-slate-400">{r.company.location_country}</p>}
                      {r.contact && <p className="text-xs text-slate-500">{r.contact.first_name} {r.contact.last_name}</p>}
                    </td>
                    <td><span className="badge bg-purple-100 text-purple-700 capitalize">{r.company?.lp_type?.replace("_", " ") ?? "—"}</span></td>
                    <td>
                      <select
                        className={cn("text-xs px-2.5 py-1 rounded-full font-medium border-0 cursor-pointer", LP_STAGE_COLORS[r.stage ?? "target"] ?? "bg-slate-100 text-slate-600")}
                        value={r.stage ?? "target"}
                        onChange={e => updateStage(r.id, e.target.value as LpStage)}
                      >
                        {[...STAGE_ORDER, "passed" as LpStage].map(s => <option key={s} value={s}>{LP_STAGE_LABELS[s]}</option>)}
                      </select>
                    </td>
                    <td className="font-medium">{formatCurrency(r.target_allocation, true)}</td>
                    <td className="font-medium text-green-700">{formatCurrency(r.committed_amount, true)}</td>
                    <td className="text-slate-600 text-xs max-w-[160px] truncate">{r.next_step ?? "—"}</td>
                    <td className="text-slate-400 text-xs">{r.next_step_date ? formatDate(r.next_step_date) : "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add LP Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-base font-semibold">Add LP to Pipeline</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 text-xl">×</button>
            </div>
            <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">LP Company *</label>
                  <select required className="select" value={form.company_id ?? ""} onChange={e => setForm(p => ({ ...p, company_id: e.target.value }))}>
                    <option value="">Select LP…</option>
                    {lpCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">LP not listed? <a href="/crm/companies" className="text-blue-600">Add it in CRM first →</a></p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Stage</label>
                  <select className="select" value={form.stage ?? "target"} onChange={e => setForm(p => ({ ...p, stage: e.target.value as LpStage }))}>
                    {STAGE_ORDER.map(s => <option key={s} value={s}>{LP_STAGE_LABELS[s]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Fund Vehicle</label>
                  <input className="input" placeholder="e.g. Fund I" value={form.fund_vehicle ?? ""} onChange={e => setForm(p => ({ ...p, fund_vehicle: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Target Allocation ($)</label>
                  <input className="input" type="number" placeholder="500000" value={form.target_allocation ?? ""} onChange={e => setForm(p => ({ ...p, target_allocation: parseFloat(e.target.value) || null }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Committed Amount ($)</label>
                  <input className="input" type="number" placeholder="0" value={form.committed_amount ?? ""} onChange={e => setForm(p => ({ ...p, committed_amount: parseFloat(e.target.value) || null }))} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Next Step</label>
                  <input className="input" placeholder="e.g. Send deck, Follow up call" value={form.next_step ?? ""} onChange={e => setForm(p => ({ ...p, next_step: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Next Step Date</label>
                  <input className="input" type="date" value={form.next_step_date ?? ""} onChange={e => setForm(p => ({ ...p, next_step_date: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Notes</label>
                <textarea className="textarea" rows={2} value={form.notes ?? ""} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-slate-300 text-slate-700 text-sm rounded-lg">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50">{saving ? "Saving…" : "Add LP"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
