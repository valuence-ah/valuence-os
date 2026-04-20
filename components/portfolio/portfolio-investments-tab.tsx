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

// ── Investment tile — collapsed row, expands on click ────────────────────────
function InvestmentTile({
  inv,
  onUpdated,
  onDeleted,
}: {
  inv: PortfolioInvestment;
  onUpdated: (updated: PortfolioInvestment) => void;
  onDeleted: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
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
  const [memoName, setMemoName] = useState<string | null>(inv.memo_file_name ?? null);
  const [subDocName, setSubDocName] = useState<string | null>(inv.subscription_doc_file_name ?? null);

  const isSafe = inv.investment_type === "safe";
  const lbl = isSafe ? "text-violet-500" : "text-blue-500";
  const val = isSafe ? "text-violet-900" : "text-blue-900";
  const bgRow = isSafe ? "bg-violet-50 divide-violet-200 border-violet-200" : "bg-blue-50 divide-blue-200 border-blue-200";

  const dataFields = [
    { label: "Our Investment", value: fmtMoney(inv.investment_amount) },
    { label: "Round Size",     value: fmtMoney(inv.round_size) },
    { label: "Close Date",     value: fmtDate(inv.close_date) },
    ...(isSafe
      ? [{ label: "Val. Cap", value: fmtMoney(inv.valuation_cap) }, { label: "Discount", value: fmtPct(inv.discount) }]
      : [{ label: "Pre-Money", value: fmtMoney(inv.pre_money_valuation) }, { label: "Ownership", value: fmtPct(inv.ownership_pct) }]
    ),
  ];

  function startEdit(e: React.MouseEvent) {
    e.stopPropagation();
    setExpanded(true);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setExpanded(false);
  }

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
    setExpanded(false);
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

  const isOpen = expanded || editing;

  return (
    <div className={cn("bg-white border rounded-xl shadow-sm overflow-hidden transition-shadow", isSafe ? "border-violet-200" : "border-blue-200", isOpen && "shadow-md")}>

      {/* ── Single summary row — click anywhere to expand/collapse ── */}
      <div
        className={cn("flex items-stretch divide-x cursor-pointer select-none transition-colors", bgRow, !editing && "hover:brightness-[0.97]")}
        onClick={() => !editing && setExpanded(p => !p)}
      >
        {/* Cell 0: Round label + type */}
        <div className="px-3 py-2.5 flex flex-col justify-center flex-shrink-0 min-w-[80px]">
          <span className="text-[11px] font-bold text-slate-800 leading-tight truncate">
            {inv.funding_round ?? <span className="italic font-normal text-slate-400 text-[10px]">TBD</span>}
          </span>
          <span className={cn("text-[9px] font-semibold mt-0.5", lbl)}>
            {isSafe ? "SAFE" : "Priced"}
          </span>
        </div>

        {/* Data cells */}
        {dataFields.map(({ label, value }) => (
          <div key={label} className="flex-1 px-3 py-2.5 min-w-0">
            <p className={cn("text-[9px] font-semibold uppercase tracking-wide mb-0.5", lbl)}>{label}</p>
            <p className={cn("text-xs font-bold truncate", val)}>{value}</p>
          </div>
        ))}

        {/* Actions + doc indicators + chevron */}
        <div
          className="px-3 py-2.5 flex items-center gap-2 flex-shrink-0 bg-white/70"
          onClick={e => e.stopPropagation()}
        >
          {/* Tiny doc indicators */}
          {(memoName || subDocName) && (
            <div className="flex items-center gap-1 mr-1">
              {memoName && <span title={`Memo: ${memoName}`}><FileText size={11} className="text-blue-400" /></span>}
              {subDocName && <span title={`Sub doc: ${subDocName}`}><FileText size={11} className="text-violet-400" /></span>}
            </div>
          )}

          {confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500">Delete?</span>
              <button onClick={handleDelete} className="text-[10px] text-red-600 font-medium hover:text-red-800">Yes</button>
              <button onClick={() => setConfirmDelete(false)} className="text-[10px] text-slate-400 hover:text-slate-600">No</button>
            </div>
          ) : (
            <>
              <button onClick={startEdit} className="text-[10px] text-slate-400 hover:text-blue-600 transition-colors">Edit</button>
              <button
                onClick={e => { e.stopPropagation(); setConfirmDelete(true); }}
                className="p-0.5 text-slate-300 hover:text-red-500 transition-colors"
              >
                <Trash2 size={12} />
              </button>
            </>
          )}
          <ChevronDown
            size={13}
            className={cn("text-slate-400 transition-transform duration-200 ml-1", isOpen && "rotate-180")}
          />
        </div>
      </div>

      {/* ── Expanded panel ── */}
      {isOpen && (
        <div className="border-t border-slate-100 px-4 py-3">
          {editing ? (
            /* Edit form */
            <div className="space-y-4">
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Close Date</label>
                  <input type="date" value={form.close_date} onChange={e => setForm(p => ({ ...p, close_date: e.target.value }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
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
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  rows={2} placeholder="Any additional details…"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={cancelEdit}
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
            /* Documents + notes */
            <div className="space-y-3">
              {inv.notes && <p className="text-xs text-slate-500 leading-relaxed italic">{inv.notes}</p>}
              <div className="flex gap-3">
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
          )}
        </div>
      )}
    </div>
  );
}

// ── Pending file picker (stores file in state, uploads later) ─────────────────
function PendingFilePicker({
  label,
  file,
  onChange,
}: {
  label: string;
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</p>
      {file ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
          <FileText size={13} className="text-green-600 flex-shrink-0" />
          <span className="text-xs text-green-700 font-medium truncate flex-1">{file.name}</span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-green-400 hover:text-red-500 flex-shrink-0 transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onChange(f);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "border-2 border-dashed rounded-lg p-3 flex items-center justify-center gap-2 cursor-pointer transition-colors",
            dragOver ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-blue-300 hover:bg-slate-50"
          )}
        >
          <Upload size={13} className="text-slate-400" />
          <span className="text-xs text-slate-500">
            {dragOver ? "Drop to attach" : "Drag & drop or click"}
          </span>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.doc,.docx,.ppt,.pptx"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onChange(f); }}
      />
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
  const [memoFile, setMemoFile] = useState<File | null>(null);
  const [subDocFile, setSubDocFile] = useState<File | null>(null);

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

    // 1 — Insert record to get the ID
    const { data, error } = await supabase
      .from("portfolio_investments")
      .insert(payload)
      .select()
      .single();

    if (error || !data) { setSaving(false); return; }
    const id = (data as PortfolioInvestment).id;
    let finalRow = data as PortfolioInvestment;

    // 2 — Upload memo if selected
    if (memoFile) {
      const ext = memoFile.name.split(".").pop() ?? "pdf";
      const path = `${id}/memo_storage_path/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("investment-memos")
        .upload(path, memoFile, { upsert: true });
      if (!upErr) {
        await supabase
          .from("portfolio_investments")
          .update({ memo_storage_path: path, memo_file_name: memoFile.name, updated_at: new Date().toISOString() })
          .eq("id", id);
        finalRow = { ...finalRow, memo_storage_path: path, memo_file_name: memoFile.name };
      }
    }

    // 3 — Upload subscription doc if selected
    if (subDocFile) {
      const ext = subDocFile.name.split(".").pop() ?? "pdf";
      const path = `${id}/subscription_doc_storage_path/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("investment-memos")
        .upload(path, subDocFile, { upsert: true });
      if (!upErr) {
        await supabase
          .from("portfolio_investments")
          .update({ subscription_doc_storage_path: path, subscription_doc_file_name: subDocFile.name, updated_at: new Date().toISOString() })
          .eq("id", id);
        finalRow = { ...finalRow, subscription_doc_storage_path: path, subscription_doc_file_name: subDocFile.name };
      }
    }

    setSaving(false);
    onAdded(finalRow);
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

      {/* Document uploads */}
      <div className="pt-1 border-t border-slate-100">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Documents (optional)</p>
        <div className="flex gap-3">
          <PendingFilePicker label="Investment Memo" file={memoFile} onChange={setMemoFile} />
          <PendingFilePicker label="Subscription Document" file={subDocFile} onChange={setSubDocFile} />
        </div>
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
