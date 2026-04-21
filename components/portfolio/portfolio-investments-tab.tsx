"use client";
// ─── Valuence Investment Tab — per-company investment rounds ─────────────────

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { PortfolioInvestment } from "@/lib/types";
import { Plus, Loader2, X, Check, Upload, FileText, Trash2, ChevronDown, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  companyId: string;
  investments: PortfolioInvestment[];
  onRefresh: () => void;
}

const FUNDING_ROUNDS = [
  "Pre-Seed", "Seed", "Bridge", "Pre-A", "Series A", "Series B", "Series C", "Growth",
];

const BOARD_REP_OPTIONS = [
  { value: "board_seat",     label: "Board Seat" },
  { value: "board_observer", label: "Board Observer" },
  { value: "no",             label: "No" },
];

// ── Fixed grid column definition ─────────────────────────────────────────────
// Type | Round | Close Date | Amount | Round Size | F1 | F2 | F3 | Actions
const GRID_COLS = "1.1fr 1fr 1.1fr 1.2fr 1.1fr 1.1fr 1fr 1.1fr 100px";

function fmtMoney(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v}`;
}
function fmtPct(v: number | null | undefined): string {
  return (v === null || v === undefined) ? "—" : `${v}%`;
}
function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function fmtPricePerShare(v: number | null | undefined): string {
  return (v === null || v === undefined) ? "—" : `$${v.toFixed(4)}`;
}

// ── Empty form factory ────────────────────────────────────────────────────────
function emptyForm() {
  return {
    investment_type:      "safe" as "safe" | "priced_round",
    funding_round:        "",
    close_date:           "",
    investment_amount:    "",
    round_size:           "",
    board_representation: "no" as "board_seat" | "board_observer" | "no",
    // SAFE / CN
    valuation_cap:        "",
    discount:             "",
    interest_rate:        "",
    // Priced
    pre_money_valuation:  "",
    ownership_pct:        "",
    price_per_share:      "",
    notes:                "",
  };
}

// ── Signed URL → open in new tab ──────────────────────────────────────────────
async function openDoc(storagePath: string) {
  const supabase = createClient();
  const { data } = await supabase.storage.from("investment-memos").createSignedUrl(storagePath, 3600);
  if (data?.signedUrl) window.open(data.signedUrl, "_blank");
}

// ── Generic document upload zone ──────────────────────────────────────────────
function DocUpload({
  investmentId, label, pathField, nameField, existingName, existingPath, onUploaded,
}: {
  investmentId: string; label: string; pathField: string; nameField: string;
  existingName: string | null; existingPath: string | null;
  onUploaded: (path: string, name: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setError(null); setUploading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop() ?? "pdf";
    const path = `${investmentId}/${pathField}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("investment-memos").upload(path, file, { upsert: true });
    if (upErr) { setError(upErr.message); setUploading(false); return; }
    await supabase.from("portfolio_investments")
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
          <span className="text-xs text-blue-700 font-medium truncate flex-1 min-w-0">{existingName}</span>
          <button onClick={async () => { if (!existingPath) return; setOpening(true); await openDoc(existingPath); setOpening(false); }}
            disabled={opening || !existingPath}
            className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 flex-shrink-0 disabled:opacity-50">
            {opening ? <Loader2 size={10} className="animate-spin" /> : <ExternalLink size={10} />} Open
          </button>
          <button onClick={() => inputRef.current?.click()} className="text-[10px] text-slate-400 hover:text-blue-700 flex-shrink-0">Replace</button>
        </div>
      ) : (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) upload(f); }}
          onClick={() => inputRef.current?.click()}
          className={cn("border-2 border-dashed rounded-lg p-3 flex items-center justify-center gap-2 cursor-pointer transition-colors",
            dragOver ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-blue-300 hover:bg-slate-50")}
        >
          {uploading ? <Loader2 size={13} className="animate-spin text-blue-500" /> : <Upload size={13} className="text-slate-400" />}
          <span className="text-xs text-slate-500">{uploading ? "Uploading…" : dragOver ? "Drop to upload" : "Drag & drop or click"}</span>
        </div>
      )}
      <input ref={inputRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      {error && <p className="text-[10px] text-red-500 mt-1">{error}</p>}
    </div>
  );
}

// ── Pending file picker ───────────────────────────────────────────────────────
function PendingFilePicker({ label, file, onChange }: { label: string; file: File | null; onChange: (f: File | null) => void }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex-1 min-w-0">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</p>
      {file ? (
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
          <FileText size={13} className="text-green-600 flex-shrink-0" />
          <span className="text-xs text-green-700 font-medium truncate flex-1">{file.name}</span>
          <button type="button" onClick={() => onChange(null)} className="text-green-400 hover:text-red-500 flex-shrink-0"><X size={12} /></button>
        </div>
      ) : (
        <div onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) onChange(f); }}
          onClick={() => inputRef.current?.click()}
          className={cn("border-2 border-dashed rounded-lg p-3 flex items-center justify-center gap-2 cursor-pointer transition-colors",
            dragOver ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:border-blue-300 hover:bg-slate-50")}>
          <Upload size={13} className="text-slate-400" />
          <span className="text-xs text-slate-500">{dragOver ? "Drop to attach" : "Drag & drop or click"}</span>
        </div>
      )}
      <input ref={inputRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onChange(f); }} />
    </div>
  );
}

// ── Shared form fields ────────────────────────────────────────────────────────
function InvestmentFormFields({
  form, setForm,
}: { form: ReturnType<typeof emptyForm>; setForm: React.Dispatch<React.SetStateAction<ReturnType<typeof emptyForm>>> }) {
  const isSafe = form.investment_type === "safe";
  const inp = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-3">
      {/* Row 1: Investment Type | Funding Round | Close Date */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Investment Type</label>
          <div className="flex gap-1.5">
            {(["safe", "priced_round"] as const).map(t => (
              <button key={t} type="button" onClick={() => setForm(p => ({ ...p, investment_type: t }))}
                className={cn("flex-1 py-1.5 text-[11px] font-medium rounded-lg border transition-colors",
                  form.investment_type === t ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300")}>
                {t === "safe" ? "SAFE / CN" : "Priced"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Funding Round</label>
          <select value={form.funding_round} onChange={e => setForm(p => ({ ...p, funding_round: e.target.value }))}
            className={cn(inp, "bg-white")}>
            <option value="">— Select —</option>
            {FUNDING_ROUNDS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Close Date</label>
          <input type="date" value={form.close_date} onChange={e => setForm(p => ({ ...p, close_date: e.target.value }))} className={inp} />
        </div>
      </div>

      {/* Row 2: Investment Amount | Round Size | Board Representation */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Investment Amount (USD)</label>
          <input type="number" value={form.investment_amount} onChange={e => setForm(p => ({ ...p, investment_amount: e.target.value }))}
            placeholder="e.g. 500000" className={inp} />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Round Size (USD)</label>
          <input type="number" value={form.round_size} onChange={e => setForm(p => ({ ...p, round_size: e.target.value }))}
            placeholder="e.g. 3000000" className={inp} />
        </div>
        <div>
          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Board Representation</label>
          <select value={form.board_representation} onChange={e => setForm(p => ({ ...p, board_representation: e.target.value as typeof form.board_representation }))}
            className={cn(inp, "bg-white")}>
            {BOARD_REP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Row 3: Conditional fields */}
      {isSafe ? (
        <div className="grid grid-cols-3 gap-3 p-3 bg-violet-50 rounded-xl border border-violet-100">
          <div>
            <label className="text-[10px] font-semibold text-violet-600 uppercase tracking-wide block mb-1">Valuation Cap (USD)</label>
            <input type="number" value={form.valuation_cap} onChange={e => setForm(p => ({ ...p, valuation_cap: e.target.value }))}
              placeholder="e.g. 8000000" className="w-full text-sm border border-violet-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-violet-600 uppercase tracking-wide block mb-1">Discount (%)</label>
            <input type="number" value={form.discount} onChange={e => setForm(p => ({ ...p, discount: e.target.value }))}
              placeholder="e.g. 20" className="w-full text-sm border border-violet-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-violet-600 uppercase tracking-wide block mb-1">Interest Rate (%)</label>
            <input type="number" value={form.interest_rate} onChange={e => setForm(p => ({ ...p, interest_rate: e.target.value }))}
              placeholder="e.g. 5 (optional)" className="w-full text-sm border border-violet-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-violet-400" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
          <div>
            <label className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide block mb-1">Pre-Money Valuation (USD)</label>
            <input type="number" value={form.pre_money_valuation} onChange={e => setForm(p => ({ ...p, pre_money_valuation: e.target.value }))}
              placeholder="e.g. 10000000" className="w-full text-sm border border-blue-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide block mb-1">Ownership (%)</label>
            <input type="number" value={form.ownership_pct} onChange={e => setForm(p => ({ ...p, ownership_pct: e.target.value }))}
              placeholder="e.g. 10.5" className="w-full text-sm border border-blue-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide block mb-1">Price Per Share ($)</label>
            <input type="number" value={form.price_per_share} onChange={e => setForm(p => ({ ...p, price_per_share: e.target.value }))}
              placeholder="e.g. 1.2500" step="0.0001" className="w-full text-sm border border-blue-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
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
    </div>
  );
}

// ── Grid header cell ──────────────────────────────────────────────────────────
function GCell({
  label, value, labelClass = "", valueClass = "",
  className = "", children,
}: {
  label?: string; value?: string; labelClass?: string; valueClass?: string;
  className?: string; children?: React.ReactNode;
}) {
  return (
    <div className={cn("px-3 py-2.5 flex flex-col justify-center min-w-0", className)}>
      {children ?? (
        <>
          <p className={cn("text-[9px] font-semibold uppercase tracking-wide mb-0.5 truncate", labelClass)}>{label}</p>
          <p className={cn("text-xs font-bold truncate", valueClass)}>{value}</p>
        </>
      )}
    </div>
  );
}

// ── Investment tile ───────────────────────────────────────────────────────────
function InvestmentTile({
  inv, onUpdated, onDeleted,
}: {
  inv: PortfolioInvestment;
  onUpdated: (updated: PortfolioInvestment) => void;
  onDeleted: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ReturnType<typeof emptyForm>>({
    investment_type:      (inv.investment_type ?? "safe") as "safe" | "priced_round",
    funding_round:        inv.funding_round ?? "",
    close_date:           inv.close_date ?? "",
    investment_amount:    inv.investment_amount?.toString() ?? "",
    round_size:           inv.round_size?.toString() ?? "",
    board_representation: (inv.board_representation ?? "no") as "board_seat" | "board_observer" | "no",
    valuation_cap:        inv.valuation_cap?.toString() ?? "",
    discount:             inv.discount?.toString() ?? "",
    interest_rate:        inv.interest_rate?.toString() ?? "",
    pre_money_valuation:  inv.pre_money_valuation?.toString() ?? "",
    ownership_pct:        inv.ownership_pct?.toString() ?? "",
    price_per_share:      inv.price_per_share?.toString() ?? "",
    notes:                inv.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [memoName, setMemoName]     = useState<string | null>(inv.memo_file_name ?? null);
  const [memoPath, setMemoPath]     = useState<string | null>(inv.memo_storage_path ?? null);
  const [subDocName, setSubDocName] = useState<string | null>(inv.subscription_doc_file_name ?? null);
  const [subDocPath, setSubDocPath] = useState<string | null>(inv.subscription_doc_storage_path ?? null);

  const isSafe = inv.investment_type === "safe";
  const lbl   = isSafe ? "text-violet-500" : "text-blue-500";
  const val   = isSafe ? "text-violet-900" : "text-blue-900";
  const rowBg = isSafe ? "bg-violet-50 border-violet-200" : "bg-blue-50 border-blue-200";

  // Fixed 3 type-specific fields (always shown, different labels per type)
  const [f1Label, f1Val] = isSafe
    ? ["Val. Cap",  fmtMoney(inv.valuation_cap)]
    : ["Pre-Money", fmtMoney(inv.pre_money_valuation)];
  const [f2Label, f2Val] = isSafe
    ? ["Discount",  fmtPct(inv.discount)]
    : ["Ownership", fmtPct(inv.ownership_pct)];
  const [f3Label, f3Val] = isSafe
    ? ["Interest",        fmtPct(inv.interest_rate)]
    : ["Price / Share",   fmtPricePerShare(inv.price_per_share)];

  function startEdit(e: React.MouseEvent) { e.stopPropagation(); setExpanded(true); setEditing(true); }
  function cancelEdit() { setEditing(false); setExpanded(false); }

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    const sf = form.investment_type === "safe";
    const updates: Partial<PortfolioInvestment> = {
      investment_type:      form.investment_type,
      funding_round:        form.funding_round || null,
      close_date:           form.close_date || null,
      investment_amount:    form.investment_amount ? Number(form.investment_amount) : null,
      round_size:           form.round_size ? Number(form.round_size) : null,
      board_representation: form.board_representation,
      valuation_cap:        sf && form.valuation_cap ? Number(form.valuation_cap) : null,
      discount:             sf && form.discount ? Number(form.discount) : null,
      interest_rate:        sf && form.interest_rate ? Number(form.interest_rate) : null,
      pre_money_valuation:  !sf && form.pre_money_valuation ? Number(form.pre_money_valuation) : null,
      ownership_pct:        !sf && form.ownership_pct ? Number(form.ownership_pct) : null,
      price_per_share:      !sf && form.price_per_share ? Number(form.price_per_share) : null,
      notes:                form.notes || null,
      updated_at:           new Date().toISOString(),
    };
    await supabase.from("portfolio_investments").update(updates).eq("id", inv.id);
    setSaving(false); setEditing(false); setExpanded(false);
    onUpdated({ ...inv, ...updates });
  }

  async function handleDelete() {
    const supabase = createClient();
    if (inv.memo_storage_path) await supabase.storage.from("investment-memos").remove([inv.memo_storage_path]);
    if (inv.subscription_doc_storage_path) await supabase.storage.from("investment-memos").remove([inv.subscription_doc_storage_path]);
    await supabase.from("portfolio_investments").delete().eq("id", inv.id);
    onDeleted(inv.id);
  }

  const isOpen = expanded || editing;

  return (
    <div className={cn("bg-white border rounded-xl shadow-sm overflow-hidden", isSafe ? "border-violet-200" : "border-blue-200")}>

      {/* ── Fixed-width summary row ── */}
      <div
        className={cn("flex items-stretch border cursor-pointer select-none transition-colors overflow-x-auto rounded-xl", rowBg, !editing && "hover:brightness-[0.97]")}
        style={{ display: "grid", gridTemplateColumns: GRID_COLS }}
        onClick={() => !editing && setExpanded(p => !p)}
      >
        {/* Type */}
        <GCell labelClass={lbl} valueClass={val} label="Type" value={isSafe ? "SAFE / CN" : "Priced Round"} />
        {/* Round */}
        <GCell labelClass={lbl} valueClass={val} label="Round" value={inv.funding_round ?? "—"} />
        {/* Close Date */}
        <GCell labelClass={lbl} valueClass={val} label="Close Date" value={fmtDate(inv.close_date)} />
        {/* Amount */}
        <GCell labelClass={lbl} valueClass={val} label="Our Investment" value={fmtMoney(inv.investment_amount)} />
        {/* Round Size */}
        <GCell labelClass={lbl} valueClass={val} label="Round Size" value={fmtMoney(inv.round_size)} />
        {/* F1 */}
        <GCell labelClass={lbl} valueClass={val} label={f1Label} value={f1Val} />
        {/* F2 */}
        <GCell labelClass={lbl} valueClass={val} label={f2Label} value={f2Val} />
        {/* F3 */}
        <GCell labelClass={lbl} valueClass={val} label={f3Label} value={f3Val} />

        {/* Actions */}
        <div
          className="px-3 py-2.5 flex items-center gap-2 bg-white/70 justify-end"
          onClick={e => e.stopPropagation()}
        >
          {(memoName || subDocName) && (
            <div className="flex items-center gap-1">
              {memoName  && <span title={`Memo: ${memoName}`}><FileText size={11} className="text-blue-400" /></span>}
              {subDocName && <span title={`Sub doc: ${subDocName}`}><FileText size={11} className="text-violet-400" /></span>}
            </div>
          )}
          {confirmDelete ? (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500">Delete?</span>
              <button onClick={handleDelete} className="text-[10px] text-red-600 font-medium">Yes</button>
              <button onClick={() => setConfirmDelete(false)} className="text-[10px] text-slate-400">No</button>
            </div>
          ) : (
            <>
              <button onClick={startEdit} className="text-[10px] text-slate-400 hover:text-blue-600 transition-colors">Edit</button>
              <button onClick={e => { e.stopPropagation(); setConfirmDelete(true); }} className="p-0.5 text-slate-300 hover:text-red-500">
                <Trash2 size={12} />
              </button>
            </>
          )}
          <ChevronDown size={13} className={cn("text-slate-400 transition-transform duration-200", isOpen && "rotate-180")} />
        </div>
      </div>

      {/* ── Expanded panel ── */}
      {isOpen && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-4">
          {editing ? (
            <>
              <InvestmentFormFields form={form} setForm={setForm} />

              {/* Doc uploads always shown in edit mode */}
              <div className="border-t border-slate-100 pt-3">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Documents</p>
                <div className="flex gap-3">
                  <DocUpload investmentId={inv.id} label="Investment Memo"
                    pathField="memo_storage_path" nameField="memo_file_name"
                    existingName={memoName} existingPath={memoPath}
                    onUploaded={(p, n) => { setMemoPath(p); setMemoName(n); }} />
                  <DocUpload investmentId={inv.id} label="Subscription Document"
                    pathField="subscription_doc_storage_path" nameField="subscription_doc_file_name"
                    existingName={subDocName} existingPath={subDocPath}
                    onUploaded={(p, n) => { setSubDocPath(p); setSubDocName(n); }} />
                </div>
              </div>

              <div className="flex gap-2">
                <button onClick={cancelEdit} className="flex-1 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <><Loader2 size={13} className="animate-spin" />Saving…</> : <><Check size={13} />Save</>}
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              {(inv.board_representation && inv.board_representation !== "no" || inv.notes) && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
                  {inv.board_representation && inv.board_representation !== "no" && (
                    <span><span className="text-slate-400">Board: </span>
                      {BOARD_REP_OPTIONS.find(o => o.value === inv.board_representation)?.label}
                    </span>
                  )}
                  {inv.notes && <span className="italic text-slate-500">{inv.notes}</span>}
                </div>
              )}
              <div className="flex gap-3">
                <DocUpload investmentId={inv.id} label="Investment Memo"
                  pathField="memo_storage_path" nameField="memo_file_name"
                  existingName={memoName} existingPath={memoPath}
                  onUploaded={(p, n) => { setMemoPath(p); setMemoName(n); }} />
                <DocUpload investmentId={inv.id} label="Subscription Document"
                  pathField="subscription_doc_storage_path" nameField="subscription_doc_file_name"
                  existingName={subDocName} existingPath={subDocPath}
                  onUploaded={(p, n) => { setSubDocPath(p); setSubDocName(n); }} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Add investment form ────────────────────────────────────────────────────────
function AddInvestmentForm({ companyId, onAdded, onCancel }: {
  companyId: string; onAdded: (inv: PortfolioInvestment) => void; onCancel: () => void;
}) {
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [memoFile, setMemoFile] = useState<File | null>(null);
  const [subDocFile, setSubDocFile] = useState<File | null>(null);

  async function handleSave() {
    setSaving(true);
    const supabase = createClient();
    const sf = form.investment_type === "safe";
    const payload = {
      company_id:           companyId,
      investment_type:      form.investment_type,
      funding_round:        form.funding_round || null,
      close_date:           form.close_date || null,
      investment_amount:    form.investment_amount ? Number(form.investment_amount) : null,
      round_size:           form.round_size ? Number(form.round_size) : null,
      board_representation: form.board_representation,
      valuation_cap:        sf && form.valuation_cap ? Number(form.valuation_cap) : null,
      discount:             sf && form.discount ? Number(form.discount) : null,
      interest_rate:        sf && form.interest_rate ? Number(form.interest_rate) : null,
      pre_money_valuation:  !sf && form.pre_money_valuation ? Number(form.pre_money_valuation) : null,
      ownership_pct:        !sf && form.ownership_pct ? Number(form.ownership_pct) : null,
      price_per_share:      !sf && form.price_per_share ? Number(form.price_per_share) : null,
      notes:                form.notes || null,
    };
    const { data, error } = await supabase.from("portfolio_investments").insert(payload).select().single();
    if (error || !data) { setSaving(false); return; }
    const id = (data as PortfolioInvestment).id;
    let finalRow = data as PortfolioInvestment;

    async function uploadDoc(file: File, pathKey: string, nameKey: string) {
      const ext = file.name.split(".").pop() ?? "pdf";
      const path = `${id}/${pathKey}/${Date.now()}.${ext}`;
      const { error: e } = await supabase.storage.from("investment-memos").upload(path, file, { upsert: true });
      if (!e) {
        await supabase.from("portfolio_investments").update({ [pathKey]: path, [nameKey]: file.name, updated_at: new Date().toISOString() }).eq("id", id);
        finalRow = { ...finalRow, [pathKey]: path, [nameKey]: file.name };
      }
    }
    if (memoFile) await uploadDoc(memoFile, "memo_storage_path", "memo_file_name");
    if (subDocFile) await uploadDoc(subDocFile, "subscription_doc_storage_path", "subscription_doc_file_name");

    setSaving(false);
    onAdded(finalRow);
  }

  return (
    <div className="bg-white border-2 border-blue-200 rounded-2xl shadow-sm p-5 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-slate-800">New Investment Round</p>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
      </div>
      <InvestmentFormFields form={form} setForm={setForm} />
      <div className="border-t border-slate-100 pt-1">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Documents (optional)</p>
        <div className="flex gap-3">
          <PendingFilePicker label="Investment Memo" file={memoFile} onChange={setMemoFile} />
          <PendingFilePicker label="Subscription Document" file={subDocFile} onChange={setSubDocFile} />
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
        <button onClick={handleSave} disabled={saving}
          className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
          {saving ? <><Loader2 size={13} className="animate-spin" />Saving…</> : <><Check size={13} />Add Investment</>}
        </button>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────
export function PortfolioInvestmentsTab({ companyId, investments: initial, onRefresh }: Props) {
  const [investments, setInvestments] = useState<PortfolioInvestment[]>(initial);
  const [adding, setAdding] = useState(false);
  useEffect(() => { setInvestments(initial); }, [initial]);

  const totalInvested = investments.reduce((s, i) => s + (i.investment_amount ?? 0), 0);

  return (
    <div className="p-5 space-y-4 overflow-y-auto h-full">
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
          <button onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors">
            <Plus size={13} /> Add Round
          </button>
        )}
      </div>

      {adding && (
        <AddInvestmentForm companyId={companyId}
          onAdded={inv => { setInvestments(prev => [inv, ...prev]); setAdding(false); }}
          onCancel={() => setAdding(false)} />
      )}

      {investments.length === 0 && !adding ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
            <FileText size={20} className="text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-600">No investments recorded yet</p>
          <p className="text-xs text-slate-400 mt-1">Click "Add Round" to record Valuence's investment</p>
        </div>
      ) : (
        <div className="space-y-3">
          {investments.map(inv => (
            <InvestmentTile key={inv.id} inv={inv}
              onUpdated={updated => setInvestments(prev => prev.map(i => i.id === updated.id ? updated : i))}
              onDeleted={id => setInvestments(prev => prev.filter(i => i.id !== id))} />
          ))}
        </div>
      )}
    </div>
  );
}
