"use client";
// ─── Valuence Investment Tab — per-company investment rounds ─────────────────

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PortfolioInvestment } from "@/lib/types";
import { Plus, Loader2, X, Check, Upload, FileText, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  companyId: string;
  investments: PortfolioInvestment[];
  onRefresh: () => void;
}

const FUNDING_ROUNDS = [
  "Pre-Seed", "Seed", "Bridge", "Pre-A", "Series A", "Series B", "Series C", "Growth",
];

function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v}`;
}

function fmtPct(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `${v}%`;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ── Empty form factory ────────────────────────────────────────────────────────
function emptyForm() {
  return {
    funding_round: "",
    investment_amount: "",
    round_size: "",
    close_date: "",
    investment_type: "safe" as "safe" | "priced_round",
    valuation_cap: "",
    discount: "",
    pre_money_valuation: "",
    ownership_pct: "",
    notes: "",
  };
}

// ── Generic document upload zone ─────────────────────────────────────────────
function DocUpload({
  investmentId,
  label,
  pathField,
  nameField,
  existingName,
  onUploaded,
}: {
  investmentId: string;
  label: string;
  pathField: string;        // DB column for storage path, e.g. "memo_storage_path"
  nameField: string;        // DB column for file name, e.g. "memo_file_name"
  existingName: string | null;
  onUploaded: (path: string, name: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setError(null);
    setUploading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop() ?? "pdf";
    const path = `${investmentId}/${pathField}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("investment-memos")
      .upload(path, file, { upsert: true });
    if (upErr) { setError(upErr.message); setUploading(false); return; }
    await supabase
      .from("portfolio_investments")
      .update({ [pathField]: path, [nameField]: file.name, updated_at: new Date().toISOString() })
      .eq("id", investmentId);
    onUploaded(path, file.name);
    setUploading(false);
  }

  return (
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</p>
      {existingName ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
          <FileText size={13} className="text-blue-600 flex-shrink-0" />
          <span className="text-xs text-blue-700 font-medium truncate flex-1">{existingName}</span>
          <button onClick={() => inputRef.current?.click()} className="text-[10px] text-blue-500 hover:text-blue-700 flex-shrink-0">Replace</button>
        </div>
      ) : (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const file = e.dataTransfer.files?.[0]; if (file) upload(file); }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-lg p-3 flex items-center justify-center gap-2 cursor-pointer transition-colors",
            dragOver ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-blue-300 hover:bg-slate-50"
          )}
        >
          {uploading ? <Loader2 size={13} className="animate-spin text-blue-500" /> : <Upload size={13} className="text-slate-400" />}
          <span className="text-xs text-slate-500">
            {uploading ? "Uploading…" : dragOver ? "Drop to upload" : "Drag & drop or click"}
          </span>
        </div>
      )}
      <input ref={inputRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      {error && <p className="text-[10px] text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// ── Investment tile (view + edit) ─────────────────────────────────────────────
function InvestmentTile({
  inv,
  onUpdated,
  onDeleted,
}: {
  inv: PortfolioInvestment;
  onUpdated: (updated: PortfolioInvestment) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    funding_round: inv.funding_round ?? "",
    investment_amount: inv.investment_amount?.toString() ?? "",
    round_size: inv.round_size?.toString() ?? "",
    close_date: inv.close_date ?? "",
    investment_type: (inv.investment_type ?? "safe") as "safe" | "priced_round",
    valuation_cap: inv.valuation_cap?.toString() ?? "",
    discount: inv.discount?.toString() ?? "",
    pre_money_valuation: inv.pre_money_valuation?.toString() ?? "",
    ownership_pct: inv.ownership_pct?.toString() ?? "",
    notes: inv.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [memoName, setMemoName] = useState<string | null>(inv.memo_file_name);
  const [subDocName, setSubDocName] = useState<string | null>(inv.subscription_doc_file_name ?? null);

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    const updates: Partial<PortfolioInvestment> = {
      funding_round: form.funding_round || null,
      investment_amount: form.investment_amount ? Number(form.investment_amount) : null,
      round_size: form.round_size ? Number(form.round_size) : null,
      close_date: form.close_date || null,
      investment_type: form.investment_type,
      valuation_cap: form.investment_type === "safe" && form.valuation_cap ? Number(form.valuation_cap) : null,
      discount: form.investment_type === "safe" && form.discount ? Number(form.discount) : null,
      pre_money_valuation: form.investment_type === "priced_round" && form.pre_money_valuation ? Number(form.pre_money_valuation) : null,
      ownership_pct: form.investment_type === "priced_round" && form.ownership_pct ? Number(form.ownership_pct) : null,
      notes: form.notes || null,
      updated_at: new Date().toISOString(),
    };
    await supabase.from("portfolio_investments").update(updates).eq("id", inv.id);
    setSaving(false);
    setEditing(false);
    onUpdated({ ...inv, ...updates });
  }

  async function handleDelete() {
    const supabase = createClient();
    if (inv.memo_storage_path) {
      await supabase.storage.from("investment-memos").remove([inv.memo_storage_path]);
    }
    await supabase.from("portfolio_investments").delete().eq("id", inv.id);
    onDeleted(inv.id);
  }

  // Round type badge
  const typeBadge = inv.investment_type === "safe"
    ? "bg-violet-100 text-violet-700"
    : inv.investment_type === "priced_round"
    ? "bg-blue-100 text-blue-700"
    : "bg-slate-100 text-slate-500";
  const typeLabel = inv.investment_type === "safe" ? "SAFE" : inv.investment_type === "priced_round" ? "Priced Round" : "—";

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Tile header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span className="text-sm font-bold text-slate-800">
              {inv.funding_round ?? <span className="text-slate-400 font-normal italic">Round TBD</span>}
            </span>
            {inv.close_date && (
              <span className="text-[10px] text-slate-400 mt-0.5">{fmtDate(inv.close_date)}</span>
            )}
          </div>
          <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full", typeBadge)}>
            {typeLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-slate-400 hover:text-blue-600 px-2.5 py-1 border border-slate-200 rounded-lg hover:border-blue-300 transition-colors"
            >
              Edit
            </button>
          )}
          {confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500">Delete?</span>
              <button onClick={handleDelete} className="text-[10px] text-red-600 font-medium hover:text-red-800">Yes</button>
              <button onClick={() => setConfirmDelete(false)} className="text-[10px] text-slate-400 hover:text-slate-600">No</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Tile body */}
      <div className="px-5 py-4 space-y-4">
        {editing ? (
          <div className="space-y-4">
            {/* Row 1: Round + Type */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Funding Round</label>
                <select value={form.funding_round} onChange={e => setForm(p => ({ ...p, funding_round: e.target.value }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">— Select —</option>
                  {FUNDING_ROUNDS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Investment Type</label>
                <div className="flex gap-2">
                  {(["safe", "priced_round"] as const).map(t => (
                    <button key={t} type="button"
                      onClick={() => setForm(p => ({ ...p, investment_type: t }))}
                      className={cn("flex-1 py-2 text-xs font-medium rounded-lg border transition-colors",
                        form.investment_type === t
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-slate-600 border-slate-200 hover:border-blue-300")}>
                      {t === "safe" ? "SAFE" : "Priced Round"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 2: Amounts */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Investment Amount (USD)</label>
                <input type="number" value={form.investment_amount} onChange={e => setForm(p => ({ ...p, investment_amount: e.target.value }))}
                  placeholder="e.g. 500000"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Round Size (USD)</label>
                <input type="number" value={form.round_size} onChange={e => setForm(p => ({ ...p, round_size: e.target.value }))}
                  placeholder="e.g. 3000000"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {/* Row 3: Close date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Close Date</label>
                <input type="date" value={form.close_date} onChange={e => setForm(p => ({ ...p, close_date: e.target.value }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {/* Conditional fields */}
            {form.investment_type === "safe" ? (
              <div className="grid grid-cols-2 gap-3 p-3 bg-violet-50 rounded-xl border border-violet-100">
                <div>
                  <label className="text-[10px] font-semibold text-violet-600 uppercase tracking-wide block mb-1">Valuation Cap (USD)</label>
                  <input type="number" value={form.valuation_cap} onChange={e => setForm(p => ({ ...p, valuation_cap: e.target.value }))}
                    placeholder="e.g. 8000000"
                    className="w-full text-sm border border-violet-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-violet-600 uppercase tracking-wide block mb-1">Discount (%)</label>
                  <input type="number" value={form.discount} onChange={e => setForm(p => ({ ...p, discount: e.target.value }))}
                    placeholder="e.g. 20"
                    className="w-full text-sm border border-violet-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400" />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                <div>
                  <label className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide block mb-1">Pre-Money Valuation (USD)</label>
                  <input type="number" value={form.pre_money_valuation} onChange={e => setForm(p => ({ ...p, pre_money_valuation: e.target.value }))}
                    placeholder="e.g. 10000000"
                    className="w-full text-sm border border-blue-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide block mb-1">Ownership (%)</label>
                  <input type="number" value={form.ownership_pct} onChange={e => setForm(p => ({ ...p, ownership_pct: e.target.value }))}
                    placeholder="e.g. 10.5"
                    className="w-full text-sm border border-blue-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Notes</label>
              <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                rows={2} placeholder="Any additional details…"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>

            {/* Action row */}
            <div className="flex gap-2 pt-1">
              <button onClick={() => setEditing(false)}
                className="flex-1 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <><Loader2 size={13} className="animate-spin" />Saving…</> : <><Check size={13} />Save</>}
              </button>
            </div>
          </div>
        ) : (
          /* ── View mode ── */
          <div className="space-y-4">
            {/* Key metrics row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] text-slate-400 mb-0.5">Our Investment</p>
                <p className="text-sm font-bold text-slate-800">{fmtMoney(inv.investment_amount)}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] text-slate-400 mb-0.5">Round Size</p>
                <p className="text-sm font-bold text-slate-800">{fmtMoney(inv.round_size)}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-[10px] text-slate-400 mb-0.5">Close Date</p>
                <p className="text-sm font-bold text-slate-800">{fmtDate(inv.close_date)}</p>
              </div>
            </div>

            {/* Conditional details */}
            {inv.investment_type === "safe" && (
              <div className="grid grid-cols-2 gap-3 p-3 bg-violet-50 rounded-xl border border-violet-100">
                <div>
                  <p className="text-[10px] font-semibold text-violet-500 mb-0.5">Valuation Cap</p>
                  <p className="text-sm font-bold text-violet-800">{fmtMoney(inv.valuation_cap)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-violet-500 mb-0.5">Discount</p>
                  <p className="text-sm font-bold text-violet-800">{fmtPct(inv.discount)}</p>
                </div>
              </div>
            )}
            {inv.investment_type === "priced_round" && (
              <div className="grid grid-cols-2 gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                <div>
                  <p className="text-[10px] font-semibold text-blue-500 mb-0.5">Pre-Money Valuation</p>
                  <p className="text-sm font-bold text-blue-800">{fmtMoney(inv.pre_money_valuation)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-blue-500 mb-0.5">Ownership</p>
                  <p className="text-sm font-bold text-blue-800">{fmtPct(inv.ownership_pct)}</p>
                </div>
              </div>
            )}

            {inv.notes && (
              <p className="text-xs text-slate-500 leading-relaxed">{inv.notes}</p>
            )}
          </div>
        )}

        {/* ── Documents — always visible, outside the edit/view conditional ── */}
        <div className="pt-2 border-t border-slate-100 flex gap-3">
          <DocUpload
            investmentId={inv.id}
            label="Investment Memo"
            pathField="memo_storage_path"
            nameField="memo_file_name"
            existingName={memoName}
            onUploaded={(_, name) => setMemoName(name)}
          />
          <DocUpload
            investmentId={inv.id}
            label="Subscription Document"
            pathField="subscription_doc_storage_path"
            nameField="subscription_doc_file_name"
            existingName={subDocName}
            onUploaded={(_, name) => setSubDocName(name)}
          />
        </div>
      </div>
    </div>
  );
}

// ── Add investment form ────────────────────────────────────────────────────────
function AddInvestmentForm({
  companyId,
  onAdded,
  onCancel,
}: {
  companyId: string;
  onAdded: (inv: PortfolioInvestment) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    const payload = {
      company_id: companyId,
      funding_round: form.funding_round || null,
      investment_amount: form.investment_amount ? Number(form.investment_amount) : null,
      round_size: form.round_size ? Number(form.round_size) : null,
      close_date: form.close_date || null,
      investment_type: form.investment_type,
      valuation_cap: form.investment_type === "safe" && form.valuation_cap ? Number(form.valuation_cap) : null,
      discount: form.investment_type === "safe" && form.discount ? Number(form.discount) : null,
      pre_money_valuation: form.investment_type === "priced_round" && form.pre_money_valuation ? Number(form.pre_money_valuation) : null,
      ownership_pct: form.investment_type === "priced_round" && form.ownership_pct ? Number(form.ownership_pct) : null,
      notes: form.notes || null,
    };
    const { data, error } = await supabase
      .from("portfolio_investments")
      .insert(payload)
      .select()
      .single();
    setSaving(false);
    if (!error && data) onAdded(data as PortfolioInvestment);
  }

  return (
    <div className="bg-white border-2 border-blue-200 rounded-2xl shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-800">New Investment Round</p>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
      </div>

      {/* Row 1: Round + Type */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Funding Round</label>
          <select value={form.funding_round} onChange={e => setForm(p => ({ ...p, funding_round: e.target.value }))}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">— Select —</option>
            {FUNDING_ROUNDS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Investment Type</label>
          <div className="flex gap-2">
            {(["safe", "priced_round"] as const).map(t => (
              <button key={t} type="button"
                onClick={() => setForm(p => ({ ...p, investment_type: t }))}
                className={cn("flex-1 py-2 text-xs font-medium rounded-lg border transition-colors",
                  form.investment_type === t
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-600 border-slate-200 hover:border-blue-300")}>
                {t === "safe" ? "SAFE" : "Priced Round"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Row 2: Amounts */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Investment Amount (USD)</label>
          <input type="number" value={form.investment_amount} onChange={e => setForm(p => ({ ...p, investment_amount: e.target.value }))}
            placeholder="e.g. 500000"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Round Size (USD)</label>
          <input type="number" value={form.round_size} onChange={e => setForm(p => ({ ...p, round_size: e.target.value }))}
            placeholder="e.g. 3000000"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {/* Close date */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Close Date</label>
          <input type="date" value={form.close_date} onChange={e => setForm(p => ({ ...p, close_date: e.target.value }))}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {/* Conditional fields */}
      {form.investment_type === "safe" ? (
        <div className="grid grid-cols-2 gap-3 p-3 bg-violet-50 rounded-xl border border-violet-100">
          <div>
            <label className="text-[10px] font-semibold text-violet-600 uppercase tracking-wide block mb-1">Valuation Cap (USD)</label>
            <input type="number" value={form.valuation_cap} onChange={e => setForm(p => ({ ...p, valuation_cap: e.target.value }))}
              placeholder="e.g. 8000000"
              className="w-full text-sm border border-violet-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-violet-600 uppercase tracking-wide block mb-1">Discount (%)</label>
            <input type="number" value={form.discount} onChange={e => setForm(p => ({ ...p, discount: e.target.value }))}
              placeholder="e.g. 20"
              className="w-full text-sm border border-violet-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
          <div>
            <label className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide block mb-1">Pre-Money Valuation (USD)</label>
            <input type="number" value={form.pre_money_valuation} onChange={e => setForm(p => ({ ...p, pre_money_valuation: e.target.value }))}
              placeholder="e.g. 10000000"
              className="w-full text-sm border border-blue-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide block mb-1">Ownership (%)</label>
            <input type="number" value={form.ownership_pct} onChange={e => setForm(p => ({ ...p, ownership_pct: e.target.value }))}
              placeholder="e.g. 10.5"
              className="w-full text-sm border border-blue-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
        </div>
      )}

      {/* Notes */}
      <div>
        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Notes</label>
        <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          rows={2} placeholder="Any additional details…"
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={onCancel}
          className="flex-1 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
          {saving ? <><Loader2 size={13} className="animate-spin" />Saving…</> : <><Check size={13} />Add Investment</>}
        </button>
      </div>
    </div>
  );
}

// ── Main tab export ────────────────────────────────────────────────────────────
export function PortfolioInvestmentsTab({ companyId, investments: initial, onRefresh }: Props) {
  const [investments, setInvestments] = useState<PortfolioInvestment[]>(initial);
  const [adding, setAdding] = useState(false);

  // Sync when parent refreshes
  useEffect(() => { setInvestments(initial); }, [initial]);

  const totalInvested = investments.reduce((s, i) => s + (i.investment_amount ?? 0), 0);

  return (
    <div className="p-5 space-y-4 overflow-y-auto h-full">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-800">Valuence Investments</h3>
          {investments.length > 0 && (
            <p className="text-xs text-slate-400 mt-0.5">
              {investments.length} round{investments.length !== 1 ? "s" : ""} · Total invested: {totalInvested > 0 ? `$${(totalInvested / 1_000_000).toFixed(2)}M` : "—"}
            </p>
          )}
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={13} /> Add Round
          </button>
        )}
      </div>

      {/* Add form */}
      {adding && (
        <AddInvestmentForm
          companyId={companyId}
          onAdded={inv => { setInvestments(prev => [inv, ...prev]); setAdding(false); }}
          onCancel={() => setAdding(false)}
        />
      )}

      {/* Investment tiles */}
      {investments.length === 0 && !adding ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
            <FileText size={20} className="text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-600">No investments recorded yet</p>
          <p className="text-xs text-slate-400 mt-1">Click "Add Round" to record Valuence's investment</p>
        </div>
      ) : (
        <div className="space-y-4">
          {investments.map(inv => (
            <InvestmentTile
              key={inv.id}
              inv={inv}
              onUpdated={updated => setInvestments(prev => prev.map(i => i.id === updated.id ? updated : i))}
              onDeleted={id => setInvestments(prev => prev.filter(i => i.id !== id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}
