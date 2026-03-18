"use client";
// ─── Sourcing Intelligence Client ─────────────────────────────────────────────

import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SourcingSignal } from "@/lib/types";
import { formatDate, timeAgo, cn } from "@/lib/utils";
import { ExternalLink, Filter, Search, Plus, RefreshCw } from "lucide-react";

const SOURCE_COLORS: Record<string, string> = {
  arxiv:      "bg-red-100 text-red-700",
  sbir:       "bg-blue-100 text-blue-700",
  nsf:        "bg-indigo-100 text-indigo-700",
  uspto:      "bg-yellow-100 text-yellow-700",
  crunchbase: "bg-orange-100 text-orange-700",
  news:       "bg-green-100 text-green-700",
  linkedin:   "bg-sky-100 text-sky-700",
  exa:        "bg-violet-100 text-violet-700",
  manual:     "bg-slate-100 text-slate-700",
  other:      "bg-slate-100 text-slate-500",
};

const STATUS_COLORS: Record<string, string> = {
  new:       "bg-blue-100 text-blue-700",
  reviewed:  "bg-slate-100 text-slate-600",
  contacted: "bg-green-100 text-green-700",
  archived:  "bg-slate-50 text-slate-400",
};

interface Props { initialSignals: SourcingSignal[]; }

export function SourcingClient({ initialSignals }: Props) {
  const supabase = createClient();
  const [signals, setSignals]     = useState(initialSignals);
  const [search, setSearch]       = useState("");
  const [sourceFilter, setSource] = useState("all");
  const [statusFilter, setStatus] = useState("new");
  const [showAdd, setShowAdd]     = useState(false);
  const [form, setForm]           = useState<Partial<SourcingSignal>>({ source: "manual", signal_type: "other", status: "new" });
  const [saving, setSaving]       = useState(false);

  const sources = useMemo(() => {
    const all = new Set(signals.map(s => s.source));
    return ["all", ...Array.from(all)];
  }, [signals]);

  const filtered = useMemo(() => signals.filter(s => {
    const matchSource = sourceFilter === "all" || s.source === sourceFilter;
    const matchStatus = statusFilter === "all" || s.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch = !q || (s.title ?? "").toLowerCase().includes(q) || (s.summary ?? "").toLowerCase().includes(q);
    return matchSource && matchStatus && matchSearch;
  }), [signals, sourceFilter, statusFilter, search]);

  async function updateStatus(id: string, status: SourcingSignal["status"]) {
    await supabase.from("sourcing_signals").update({ status }).eq("id", id);
    setSignals(prev => prev.map(s => s.id === id ? { ...s, status } : s));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { data, error } = await supabase.from("sourcing_signals").insert(form).select().single();
    setSaving(false);
    if (!error && data) { setSignals(p => [data, ...p]); setShowAdd(false); setForm({ source: "manual", signal_type: "other", status: "new" }); }
    else alert(error?.message ?? "Failed to save");
  }

  const newCount = signals.filter(s => s.status === "new").length;

  return (
    <div className="flex-1 overflow-auto p-6 space-y-4">

      {/* Stats banner */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total signals", value: signals.length, color: "text-slate-900" },
          { label: "New / unreviewed", value: signals.filter(s => s.status === "new").length, color: "text-blue-600" },
          { label: "Contacted", value: signals.filter(s => s.status === "contacted").length, color: "text-green-600" },
          { label: "High relevance (>0.7)", value: signals.filter(s => (s.relevance_score ?? 0) > 0.7).length, color: "text-violet-600" },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-8 w-56 h-9" placeholder="Search signals…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="select h-9 w-36" value={sourceFilter} onChange={e => setSource(e.target.value)}>
            {sources.map(s => <option key={s} value={s}>{s === "all" ? "All sources" : s.toUpperCase()}</option>)}
          </select>
          <select className="select h-9 w-36" value={statusFilter} onChange={e => setStatus(e.target.value)}>
            <option value="all">All status</option>
            <option value="new">New</option>
            <option value="reviewed">Reviewed</option>
            <option value="contacted">Contacted</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg">
            <Plus size={16} /> Add Signal
          </button>
        </div>
      </div>

      {/* Signals list */}
      <div className="card divide-y divide-slate-100">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-slate-400 text-sm">No signals found.</p>
            <p className="text-slate-300 text-xs mt-1">Sourcing agents will populate this automatically once configured.</p>
          </div>
        ) : (
          filtered.map(signal => (
            <div key={signal.id} className={cn("px-5 py-4 hover:bg-slate-50/60 transition-colors", signal.status === "archived" && "opacity-50")}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={cn("badge uppercase text-xs font-semibold", SOURCE_COLORS[signal.source] ?? "bg-slate-100 text-slate-600")}>
                      {signal.source}
                    </span>
                    {signal.signal_type && (
                      <span className="badge bg-slate-100 text-slate-500 capitalize">{signal.signal_type.replace("_", " ")}</span>
                    )}
                    {signal.relevance_score != null && (
                      <span className={cn("badge text-xs", signal.relevance_score > 0.7 ? "bg-green-100 text-green-700" : signal.relevance_score > 0.4 ? "bg-yellow-100 text-yellow-700" : "bg-slate-100 text-slate-500")}>
                        {Math.round(signal.relevance_score * 100)}% relevant
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-slate-800 leading-snug">{signal.title ?? "Untitled signal"}</p>
                  {signal.summary && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{signal.summary}</p>}
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                    {signal.authors && signal.authors.length > 0 && (
                      <span>{signal.authors.slice(0,3).join(", ")}{signal.authors.length > 3 ? ` +${signal.authors.length - 3}` : ""}</span>
                    )}
                    {signal.published_date && <span>{formatDate(signal.published_date)}</span>}
                    <span>{timeAgo(signal.created_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <select
                    className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white cursor-pointer"
                    value={signal.status}
                    onChange={e => updateStatus(signal.id, e.target.value as SourcingSignal["status"])}
                  >
                    <option value="new">New</option>
                    <option value="reviewed">Reviewed</option>
                    <option value="contacted">Contacted</option>
                    <option value="archived">Archived</option>
                  </select>
                  {signal.url && (
                    <a href={signal.url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-blue-600 p-1">
                      <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Signal Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-base font-semibold">Add Signal Manually</h2>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 text-xl">×</button>
            </div>
            <form onSubmit={handleSave} className="px-6 py-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Source</label>
                  <select className="select" value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value as SourcingSignal["source"] }))}>
                    {["arxiv","sbir","nsf","uspto","crunchbase","news","linkedin","exa","manual","other"].map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Type</label>
                  <select className="select" value={form.signal_type ?? "other"} onChange={e => setForm(p => ({ ...p, signal_type: e.target.value as SourcingSignal["signal_type"] }))}>
                    {["paper","grant","patent","funding","news","job_posting","other"].map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                  </select>
                </div>
              </div>
              <input required className="input" placeholder="Title *" value={form.title ?? ""} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
              <input className="input" placeholder="URL" value={form.url ?? ""} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} />
              <textarea className="textarea" rows={3} placeholder="Summary / notes" value={form.summary ?? ""} onChange={e => setForm(p => ({ ...p, summary: e.target.value }))} />
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-2.5 border border-slate-300 text-slate-700 text-sm rounded-lg">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50">{saving ? "Saving…" : "Add Signal"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
