"use client";
// ─── IC Memos Client ──────────────────────────────────────────────────────────

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { IcMemo } from "@/lib/types";
import { formatDate, cn } from "@/lib/utils";
import { FileText, Plus, Search, Sparkles } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  draft:       "bg-slate-100 text-slate-600",
  in_review:   "bg-yellow-100 text-yellow-700",
  approved:    "bg-green-100 text-green-700",
  rejected:    "bg-red-100 text-red-600",
};

const REC_COLORS: Record<string, string> = {
  invest:         "bg-green-100 text-green-700",
  pass:           "bg-red-100 text-red-600",
  more_diligence: "bg-yellow-100 text-yellow-700",
  pending:        "bg-slate-100 text-slate-600",
};

type MemoWithCompany = IcMemo & { company?: { id: string; name: string; type: string; sectors: string[] | null } | null };

interface Props { initialMemos: MemoWithCompany[]; }

export function MemosClient({ initialMemos }: Props) {
  const router  = useRouter();
  const supabase = createClient();
  const [memos, setMemos]       = useState(initialMemos);
  const [search, setSearch]     = useState("");
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving]     = useState(false);
  const [generating, setGenerating] = useState(false);
  const [companies, setCompanies]   = useState<{ id: string; name: string }[]>([]);
  const [form, setForm]         = useState({ company_id: "", title: "", generate: false });

  const filtered = useMemo(() => memos.filter(m => {
    const q = search.toLowerCase();
    return !q || m.title.toLowerCase().includes(q) || (m.company?.name ?? "").toLowerCase().includes(q);
  }), [memos, search]);

  async function loadCompanies() {
    if (companies.length > 0) return;
    const { data } = await supabase.from("companies").select("id, name").order("name");
    setCompanies(data ?? []);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.company_id) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();

    if (form.generate) {
      // Call the AI generation endpoint
      setGenerating(true);
      const res = await fetch("/api/memos/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: form.company_id }),
      });
      const { data } = await res.json();
      setGenerating(false);
      if (data) {
        setMemos(p => [data, ...p]);
        setShowModal(false);
        router.push(`/memos/${data.id}`);
      }
    } else {
      const { data } = await supabase
        .from("ic_memos")
        .insert({ company_id: form.company_id, title: form.title || "Untitled Memo", status: "draft", recommendation: "pending", created_by: user?.id })
        .select("*, company:companies(id, name, type, sectors)")
        .single();
      if (data) { setMemos(p => [data, ...p]); setShowModal(false); router.push(`/memos/${data.id}`); }
    }
    setSaving(false);
  }

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4">

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Total memos",    value: memos.length },
          { label: "In review",      value: memos.filter(m => m.status === "in_review").length },
          { label: "Approved",       value: memos.filter(m => m.status === "approved").length },
          { label: "Invest decisions", value: memos.filter(m => m.recommendation === "invest").length },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <div className="text-2xl font-bold text-slate-900">{s.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex gap-3 items-center justify-between">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-8 w-64 h-9" placeholder="Search memos…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={() => { setShowModal(true); loadCompanies(); }} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg">
          <Plus size={16} /> New Memo
        </button>
      </div>

      {/* Memos list */}
      <div className="card divide-y divide-slate-100">
        {filtered.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <FileText className="mx-auto text-slate-300 mb-3" size={36} />
            <p className="text-slate-400 text-sm">No memos yet. Use "New Memo" to create one, or let Claude generate it from a pitch deck.</p>
          </div>
        ) : (
          filtered.map(memo => (
            <div
              key={memo.id}
              className="px-5 py-4 hover:bg-slate-50/60 cursor-pointer"
              onClick={() => router.push(`/memos/${memo.id}`)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold text-slate-800 truncate">{memo.title}</p>
                  </div>
                  {memo.company && (
                    <p className="text-xs text-slate-500">{memo.company.name} · {memo.company.sectors?.slice(0,2).join(", ")}</p>
                  )}
                  {memo.executive_summary && (
                    <p className="text-xs text-slate-400 mt-1 line-clamp-1">{memo.executive_summary}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {memo.recommendation && (
                    <span className={cn("badge capitalize", REC_COLORS[memo.recommendation] ?? "bg-slate-100 text-slate-600")}>
                      {memo.recommendation.replace("_", " ")}
                    </span>
                  )}
                  <span className={cn("badge capitalize", STATUS_COLORS[memo.status] ?? "bg-slate-100 text-slate-600")}>
                    {memo.status.replace("_", " ")}
                  </span>
                  <span className="text-xs text-slate-400">{formatDate(memo.created_at)}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* New Memo Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-base font-semibold">New IC Memo</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 text-xl">×</button>
            </div>
            <form onSubmit={handleCreate} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Company *</label>
                <select required className="select" value={form.company_id} onChange={e => setForm(p => ({ ...p, company_id: e.target.value }))}>
                  <option value="">Select company…</option>
                  {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              {!form.generate && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Memo Title</label>
                  <input className="input" placeholder="e.g. CarbonMind — IC Memo Q2 2025" value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
                </div>
              )}
              {/* AI generation toggle */}
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.generate} onChange={e => setForm(p => ({ ...p, generate: e.target.checked }))} className="w-4 h-4 rounded" />
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-medium text-blue-800">
                      <Sparkles size={14} /> Generate with Claude AI
                    </div>
                    <p className="text-xs text-blue-600 mt-0.5">Claude will analyze company data and interactions to draft all memo sections automatically.</p>
                  </div>
                </label>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-slate-300 text-slate-700 text-sm rounded-lg">Cancel</button>
                <button type="submit" disabled={saving || generating} className="flex-1 py-2.5 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50">
                  {generating ? "Generating…" : saving ? "Creating…" : form.generate ? "Generate Memo" : "Create Blank Memo"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
