"use client";
// ─── Memo Detail Client ───────────────────────────────────────────────────────
// Displays a full IC memo with all sections.
// Allows editing any section inline and updating recommendation/status.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { IcMemo } from "@/lib/types";
import { formatDate, cn } from "@/lib/utils";
import { Edit3, Save, X, CheckCircle, XCircle, AlertCircle, Clock, RefreshCw } from "lucide-react";

const REC_CONFIG = {
  invest:         { label: "Invest",          color: "bg-green-100 text-green-700 border-green-200",  icon: CheckCircle },
  pass:           { label: "Pass",            color: "bg-red-100 text-red-700 border-red-200",         icon: XCircle },
  more_diligence: { label: "More Diligence",  color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: AlertCircle },
  pending:        { label: "Pending",         color: "bg-slate-100 text-slate-600 border-slate-200",   icon: Clock },
};

const SECTIONS = [
  { key: "executive_summary",  label: "Executive Summary" },
  { key: "problem_solution",   label: "Problem & Solution" },
  { key: "market_opportunity", label: "Market Opportunity" },
  { key: "business_model",     label: "Business Model" },
  { key: "traction",           label: "Traction" },
  { key: "team",               label: "Team" },
  { key: "competition",        label: "Competitive Landscape" },
  { key: "risks",              label: "Key Risks" },
  { key: "financials",         label: "Financials" },
  { key: "investment_thesis",  label: "Investment Thesis" },
] as const;

type MemoWithCompany = IcMemo & { company?: { id: string; name: string; type: string; sectors: string[] | null; description: string | null; website: string | null } | null };

export function MemoDetailClient({ memo: initMemo }: { memo: MemoWithCompany }) {
  const supabase = createClient();
  const router   = useRouter();
  const [memo, setMemo]           = useState(initMemo);
  const [editingKey, setEditing]  = useState<string | null>(null);
  const [editText, setEditText]   = useState("");
  const [saving, setSaving]       = useState(false);
  const [regenerating, setRegen]  = useState(false);

  async function handleRegenerate() {
    if (!memo.company_id) return;
    setRegen(true);
    try {
      const res = await fetch("/api/memos/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: memo.company_id }),
      });
      const json = await res.json();
      if (json.data?.id) router.push(`/memos/${json.data.id}`);
    } finally {
      setRegen(false);
    }
  }

  function startEdit(key: string, currentValue: string | null) {
    setEditing(key);
    setEditText(currentValue ?? "");
  }

  async function saveEdit() {
    if (!editingKey) return;
    setSaving(true);
    const { data } = await supabase
      .from("ic_memos")
      .update({ [editingKey]: editText })
      .eq("id", memo.id)
      .select()
      .single();
    setSaving(false);
    if (data) setMemo(prev => ({ ...prev, [editingKey]: editText }));
    setEditing(null);
  }

  async function updateStatus(field: "recommendation" | "status", value: string) {
    await supabase.from("ic_memos").update({ [field]: value }).eq("id", memo.id);
    setMemo(prev => ({ ...prev, [field]: value } as MemoWithCompany));
  }

  const recConfig = REC_CONFIG[memo.recommendation as keyof typeof REC_CONFIG] ?? REC_CONFIG.pending;
  const RecIcon = recConfig.icon;

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header card */}
        <div className="card p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-xl font-bold text-slate-900">{memo.title}</h1>
              {memo.company && (
                <div className="flex items-center gap-2 mt-1">
                  <a href={`/crm/companies/${memo.company.id}`} className="text-sm text-blue-600 hover:underline">{memo.company.name}</a>
                  {memo.company.sectors && <span className="text-slate-400 text-sm">· {memo.company.sectors.slice(0,2).join(", ")}</span>}
                </div>
              )}
              <p className="text-xs text-slate-400 mt-1">Created {formatDate(memo.created_at)}</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {/* Recommendation selector */}
              <select
                className={cn("text-sm font-medium px-3 py-1.5 rounded-xl border cursor-pointer", recConfig.color)}
                value={memo.recommendation ?? "pending"}
                onChange={e => updateStatus("recommendation", e.target.value)}
              >
                {Object.entries(REC_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
              {/* Status selector */}
              <select
                className="text-sm border border-slate-300 rounded-xl px-3 py-1.5 bg-white cursor-pointer"
                value={memo.status}
                onChange={e => updateStatus("status", e.target.value)}
              >
                <option value="draft">Draft</option>
                <option value="in_review">In Review</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
              {/* Regenerate */}
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                title="Regenerate memo with latest company data"
              >
                <RefreshCw size={12} className={regenerating ? "animate-spin" : ""} />
                {regenerating ? "Regenerating…" : "Regenerate"}
              </button>
            </div>
          </div>
        </div>

        {/* Memo sections */}
        <div className="space-y-4">
          {SECTIONS.map(({ key, label }) => {
            const value = memo[key as keyof IcMemo] as string | null;
            const isEditing = editingKey === key;

            return (
              <div key={key} className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-slate-700">{label}</h3>
                  {!isEditing ? (
                    <button
                      onClick={() => startEdit(key, value)}
                      className="text-slate-400 hover:text-blue-600 p-1 rounded transition-colors"
                    >
                      <Edit3 size={14} />
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <button onClick={() => setEditing(null)} className="text-slate-400 hover:text-slate-600 p-1"><X size={14} /></button>
                      <button onClick={saveEdit} disabled={saving} className="text-blue-600 hover:text-blue-700 p-1 font-medium text-xs">{saving ? "Saving…" : "Save"}</button>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <textarea
                    className="textarea w-full"
                    rows={6}
                    value={editText}
                    onChange={e => setEditText(e.target.value)}
                    autoFocus
                  />
                ) : (
                  <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap min-h-[3rem]">
                    {value || <span className="text-slate-400 italic">Not yet written. Click the edit icon to add content, or regenerate the memo from the Memos list.</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Review notes */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-3">Review Notes</h3>
          {editingKey === "review_notes" ? (
            <div className="space-y-2">
              <textarea className="textarea" rows={3} value={editText} onChange={e => setEditText(e.target.value)} autoFocus />
              <div className="flex gap-2">
                <button onClick={() => setEditing(null)} className="text-slate-400 text-xs">Cancel</button>
                <button onClick={saveEdit} className="text-blue-600 text-xs font-medium">Save</button>
              </div>
            </div>
          ) : (
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-slate-600 whitespace-pre-wrap flex-1">{memo.review_notes || <span className="text-slate-400 italic">No review notes yet.</span>}</p>
              <button onClick={() => startEdit("review_notes", memo.review_notes)} className="text-slate-400 hover:text-blue-600 p-1 flex-shrink-0"><Edit3 size={14} /></button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
