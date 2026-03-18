"use client";
// ─── CRM Pipeline — Split-Pane View ──────────────────────────────────────────
// Left panel: scrollable company list with logo, status badge, sector badge.
// Right panel: full company detail — overview, contacts, documents, IC memo.

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Company, Contact, Interaction, IcMemo, DealStatus } from "@/lib/types";
import { cn, formatDate, formatCurrency, getInitials, truncate } from "@/lib/utils";
import {
  Search, Plus, ExternalLink, ChevronRight, Pencil, Check, X,
  User, FileText, Link2, MapPin, Calendar, Mail, Phone,
  Building2, Sparkles, Paperclip, Tag, Upload, Loader2,
} from "lucide-react";

// ── Status display helpers ────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  sourced:     "Sourced",
  monitoring:  "Monitoring",
  active_deal: "Active Deal",
  portfolio:   "Portfolio",
  passed:      "Passed",
  exited:      "Exited",
};

const STATUS_COLORS: Record<string, string> = {
  sourced:     "bg-slate-100 text-slate-600",
  monitoring:  "bg-amber-100 text-amber-700",
  active_deal: "bg-blue-100 text-blue-700",
  portfolio:   "bg-emerald-100 text-emerald-700",
  passed:      "bg-red-100 text-red-600",
  exited:      "bg-gray-100 text-gray-500",
};

const STAGE_OPTIONS = ["pre-seed", "seed", "series_a", "series_b", "series_c", "growth"];
const SECTOR_OPTIONS = [
  "Cleantech", "Techbio", "Advanced Materials", "Energy Storage", "Carbon Capture",
  "Climate Tech", "Synthetic Biology", "Industrial Biotech", "Agtech",
  "Water Tech", "Circular Economy", "Deep Tech", "Hardware", "Other",
];

// ── Logo / Avatar ─────────────────────────────────────────────────────────────

function CompanyLogo({ company }: { company: Company }) {
  const [imgError, setImgError] = useState(false);
  const domain = company.website
    ? company.website.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
    : null;
  const clearbitUrl = domain ? `https://logo.clearbit.com/${domain}` : null;

  if (clearbitUrl && !imgError) {
    return (
      <img
        src={clearbitUrl}
        alt={company.name}
        onError={() => setImgError(true)}
        className="w-10 h-10 rounded-lg object-contain bg-white border border-slate-200 p-0.5"
      />
    );
  }
  return (
    <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
      <span className="text-white text-xs font-bold">{getInitials(company.name)}</span>
    </div>
  );
}

// ── Field component (label + value, optionally editable) ─────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      {children}
    </div>
  );
}

// ── Keyword Editor — tag chips with add/remove ────────────────────────────────

function KeywordEditor({
  tags, onChange, readOnly,
}: { tags: string[]; onChange: (t: string[]) => void; readOnly: boolean }) {
  const [input, setInput] = useState("");

  function add() {
    const val = input.trim().toLowerCase();
    if (val && !tags.includes(val)) onChange([...tags, val]);
    setInput("");
  }

  function remove(tag: string) {
    onChange(tags.filter(t => t !== tag));
  }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {tags.map(t => (
        <span key={t} className="flex items-center gap-1 text-xs px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full border border-blue-200">
          {t}
          {!readOnly && (
            <button type="button" onClick={() => remove(t)} className="text-blue-400 hover:text-blue-700 ml-0.5">×</button>
          )}
        </span>
      ))}
      {!readOnly && (
        <input
          className="text-xs px-2.5 py-1 border border-dashed border-slate-300 rounded-full bg-transparent focus:outline-none focus:border-blue-400 w-32 placeholder:text-slate-300"
          placeholder="+ add keyword"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } }}
          onBlur={add}
        />
      )}
      {readOnly && tags.length === 0 && (
        <span className="text-sm text-slate-300 italic">No keywords yet — click Edit to add</span>
      )}
    </div>
  );
}

// ── Upload Box — file upload card for decks / transcripts ────────────────────

interface UploadBoxProps {
  label: string;
  accept: string;
  companyId: string;
  docType: string;
  bucket: string;
  existingUrl?: string | null;
  existingDate?: string | null;
  onUploaded: (url: string) => void;
}

function UploadBox({ label, accept, companyId, docType, bucket, existingUrl, existingDate, onUploaded }: UploadBoxProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]  = useState<string | null>(null);
  const [error, setError]        = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setProgress("Uploading…");
    setError(null);

    const form = new FormData();
    form.append("file",       file);
    form.append("bucket",     bucket);
    form.append("company_id", companyId);
    form.append("doc_type",   docType);

    try {
      const res  = await fetch("/api/storage/upload", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      setProgress(null);
      onUploaded(json.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
      setProgress(null);
    } finally {
      setUploading(false);
    }
  }

  const icon = docType === "deck" ? <FileText size={18} className="text-slate-400" /> : <Paperclip size={18} className="text-slate-400" />;

  return (
    <div
      className="border-2 border-dashed border-slate-200 rounded-xl p-4 flex flex-col gap-2 hover:border-blue-300 transition-colors cursor-pointer group"
      onClick={() => !uploading && inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); }}
      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />

      <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
        {icon} {label}
      </p>

      {uploading ? (
        <div className="flex items-center gap-2 text-xs text-blue-600">
          <Loader2 size={13} className="animate-spin" /> {progress ?? "Uploading…"}
        </div>
      ) : existingUrl ? (
        <div className="space-y-1">
          <a
            href={existingUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-xs text-blue-600 hover:underline flex items-center gap-1 truncate"
          >
            <ExternalLink size={11} /> View {docType}
          </a>
          {existingDate && (
            <p className="text-[10px] text-slate-400">{formatDate(existingDate)}</p>
          )}
          <p className="text-[10px] text-slate-400 group-hover:text-blue-500 transition-colors flex items-center gap-0.5">
            <Upload size={9} /> Drop new file to replace
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-2 gap-1">
          <Upload size={16} className="text-slate-300 group-hover:text-blue-400 transition-colors" />
          <p className="text-xs text-slate-400 text-center">Click or drag to upload</p>
        </div>
      )}

      {error && <p className="text-[10px] text-red-500">{error}</p>}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  initialCompanies: Company[];
}

export function PipelineClient({ initialCompanies }: Props) {
  const supabase = createClient();

  // ── State ────────────────────────────────────────────────────────────────────
  const [companies, setCompanies]         = useState<Company[]>(initialCompanies);
  const [selectedId, setSelectedId]       = useState<string | null>(
    initialCompanies[0]?.id ?? null
  );
  const [search, setSearch]               = useState("");
  const [contacts, setContacts]           = useState<Contact[]>([]);
  const [interactions, setInteractions]   = useState<Interaction[]>([]);
  const [memo, setMemo]                   = useState<IcMemo | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Edit mode
  const [editing, setEditing]   = useState(false);
  const [editForm, setEditForm] = useState<Partial<Company>>({});
  const [saving, setSaving]     = useState(false);

  // Add company modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm]           = useState<Partial<Company>>({ type: "startup", sectors: [] });
  const [addSaving, setAddSaving]       = useState(false);

  // Memo generation
  const [generatingMemo, setGeneratingMemo] = useState(false);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const selected = companies.find(c => c.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return companies.filter(c =>
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.description ?? "").toLowerCase().includes(q) ||
      (c.sectors ?? []).some(s => s.toLowerCase().includes(q))
    );
  }, [companies, search]);

  // ── Load detail data when selected company changes ────────────────────────
  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    const [{ data: ctcts }, { data: ints }, { data: memos }] = await Promise.all([
      supabase.from("contacts").select("*").eq("company_id", id).order("is_primary_contact", { ascending: false }),
      supabase.from("interactions").select("*").eq("company_id", id).order("date", { ascending: false }).limit(5),
      supabase.from("ic_memos").select("*").eq("company_id", id).order("created_at", { ascending: false }).limit(1),
    ]);
    setContacts(ctcts ?? []);
    setInteractions(ints ?? []);
    setMemo(memos?.[0] ?? null);
    setLoadingDetail(false);
  }, [supabase]);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  // ── Edit handlers ─────────────────────────────────────────────────────────
  function startEdit() {
    if (!selected) return;
    setEditForm({ ...selected });
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEditForm({});
  }

  async function saveEdit() {
    if (!selected) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("companies")
      .update(editForm)
      .eq("id", selected.id)
      .select()
      .single();
    setSaving(false);
    if (!error && data) {
      setCompanies(prev => prev.map(c => c.id === data.id ? data : c));
      setEditing(false);
      setEditForm({});
    } else {
      alert(error?.message ?? "Failed to save");
    }
  }

  function setEF(key: keyof Company, val: unknown) {
    setEditForm(prev => ({ ...prev, [key]: val }));
  }

  function toggleSector(s: string) {
    const lower = s.toLowerCase();
    const curr = (editForm.sectors as string[] ?? []);
    setEF("sectors", curr.includes(lower) ? curr.filter(x => x !== lower) : [...curr, lower]);
  }

  // ── Add company ───────────────────────────────────────────────────────────
  async function handleAddCompany(e: React.FormEvent) {
    e.preventDefault();
    setAddSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("companies")
      .insert({ ...addForm, type: "startup", created_by: user?.id })
      .select().single();
    setAddSaving(false);
    if (!error && data) {
      setCompanies(prev => [data, ...prev]);
      setSelectedId(data.id);
      setShowAddModal(false);
      setAddForm({ type: "startup", sectors: [] });
    } else {
      alert(error?.message ?? "Failed to add company");
    }
  }

  // ── Generate IC Memo ──────────────────────────────────────────────────────
  async function handleGenerateMemo() {
    if (!selected || generatingMemo) return;
    setGeneratingMemo(true);
    try {
      const res  = await fetch("/api/memos/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: selected.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to generate memo");
      // Reload memo from DB
      await loadDetail(selected.id);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Memo generation failed");
    } finally {
      setGeneratingMemo(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ═══════════════════════════════════════════════════════════════════════
          LEFT PANEL — Company List
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="w-[280px] flex-shrink-0 border-r border-slate-200 bg-white flex flex-col">

        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-slate-800">
              Active Pipeline
              <span className="ml-2 text-xs font-normal text-slate-400">{filtered.length}</span>
            </span>
            <button
              onClick={() => setShowAddModal(true)}
              className="w-7 h-7 flex items-center justify-center rounded-md bg-blue-600 hover:bg-blue-500 text-white transition-colors"
              title="Add company"
            >
              <Plus size={14} />
            </button>
          </div>
          {/* Search */}
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full pl-8 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Search…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Company list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-sm">
              {search ? `No results for "${search}"` : "No startups yet"}
            </div>
          ) : (
            filtered.map(c => {
              const isActive = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  onClick={() => { setSelectedId(c.id); setEditing(false); }}
                  className={cn(
                    "w-full flex items-start gap-3 px-4 py-3 text-left border-b border-slate-100 hover:bg-slate-50 transition-colors relative",
                    isActive && "bg-blue-50 hover:bg-blue-50"
                  )}
                >
                  {/* Active indicator */}
                  {isActive && (
                    <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-blue-600 rounded-r" />
                  )}
                  <CompanyLogo company={c} />
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-medium truncate", isActive ? "text-blue-700" : "text-slate-800")}>
                      {c.name}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {c.deal_status && (
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", STATUS_COLORS[c.deal_status])}>
                          {STATUS_LABELS[c.deal_status] ?? c.deal_status}
                        </span>
                      )}
                      {c.sectors?.[0] && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-slate-100 text-slate-600 capitalize">
                          {c.sectors[0]}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          RIGHT PANEL — Company Detail
      ═══════════════════════════════════════════════════════════════════════ */}
      {!selected ? (
        <div className="flex-1 flex items-center justify-center bg-slate-50">
          <div className="text-center text-slate-400">
            <Building2 size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Select a company to view details</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto bg-white">

          {/* ── Company Header ── */}
          <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <CompanyLogo company={selected} />
              <div>
                <h1 className="text-lg font-bold text-slate-900">{selected.name}</h1>
                <div className="flex items-center gap-2 mt-0.5">
                  {selected.deal_status && (
                    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", STATUS_COLORS[selected.deal_status])}>
                      {STATUS_LABELS[selected.deal_status]}
                    </span>
                  )}
                  {selected.stage && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 capitalize">
                      {selected.stage.replace("_", " ")}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selected.website && (
                <a
                  href={selected.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Go to Website <ExternalLink size={12} />
                </a>
              )}
              {editing ? (
                <div className="flex gap-1.5">
                  <button onClick={cancelEdit} className="flex items-center gap-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">
                    <X size={12} /> Cancel
                  </button>
                  <button onClick={saveEdit} disabled={saving} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50">
                    <Check size={12} /> {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              ) : (
                <button onClick={startEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
                  <Pencil size={12} /> Edit
                </button>
              )}
            </div>
          </div>

          <div className="px-8 py-6 space-y-8">

            {/* ── Overview Fields ── */}
            <section>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Overview</h2>
              <div className="grid grid-cols-3 gap-x-6 gap-y-5">

                <Field label="Domain / Website">
                  {editing ? (
                    <input className="input text-sm" value={editForm.website ?? ""} onChange={e => setEF("website", e.target.value)} placeholder="https://…" />
                  ) : (
                    selected.website
                      ? <a href={selected.website} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline flex items-center gap-1 truncate">
                          <Link2 size={12} className="flex-shrink-0" />{selected.website.replace(/^https?:\/\//, "")}
                        </a>
                      : <span className="text-sm text-slate-300">—</span>
                  )}
                </Field>

                <Field label="Status">
                  {editing ? (
                    <select className="select text-sm" value={editForm.deal_status ?? ""} onChange={e => setEF("deal_status", e.target.value as DealStatus || null)}>
                      <option value="">Not set</option>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  ) : (
                    selected.deal_status
                      ? <span className={cn("inline-block text-xs px-2 py-1 rounded-md font-medium", STATUS_COLORS[selected.deal_status])}>{STATUS_LABELS[selected.deal_status]}</span>
                      : <span className="text-sm text-slate-300">—</span>
                  )}
                </Field>

                <Field label="Investment Round">
                  {editing ? (
                    <select className="select text-sm" value={editForm.stage ?? ""} onChange={e => setEF("stage", e.target.value || null)}>
                      <option value="">Not set</option>
                      {STAGE_OPTIONS.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                    </select>
                  ) : (
                    <span className="text-sm text-slate-700 capitalize">{selected.stage?.replace("_", " ") ?? "—"}</span>
                  )}
                </Field>

                <Field label="Sector">
                  {editing ? (
                    <select className="select text-sm" value={editForm.sectors?.[0] ?? ""} onChange={e => setEF("sectors", e.target.value ? [e.target.value, ...(editForm.sectors?.slice(1) ?? [])] : (editForm.sectors?.slice(1) ?? []))}>
                      <option value="">Select sector</option>
                      {SECTOR_OPTIONS.map(s => <option key={s} value={s.toLowerCase()}>{s}</option>)}
                    </select>
                  ) : (
                    <span className="text-sm text-slate-700 capitalize">{selected.sectors?.[0] ?? "—"}</span>
                  )}
                </Field>

                <Field label="Sub-sector">
                  {editing ? (
                    <input className="input text-sm" value={editForm.sub_type ?? ""} onChange={e => setEF("sub_type", e.target.value || null)} placeholder="e.g. Advanced Diagnostics" />
                  ) : (
                    <span className="text-sm text-slate-700">{selected.sub_type ?? "—"}</span>
                  )}
                </Field>

                <Field label="Location">
                  {editing ? (
                    <div className="flex gap-2">
                      <input className="input text-sm flex-1" value={editForm.location_city ?? ""} onChange={e => setEF("location_city", e.target.value || null)} placeholder="City" />
                      <input className="input text-sm w-20" value={editForm.location_country ?? ""} onChange={e => setEF("location_country", e.target.value || null)} placeholder="Country" />
                    </div>
                  ) : (
                    <span className="text-sm text-slate-700 flex items-center gap-1">
                      <MapPin size={12} className="text-slate-400" />
                      {[selected.location_city, selected.location_country].filter(Boolean).join(", ") || "—"}
                    </span>
                  )}
                </Field>

                <Field label="Founded">
                  {editing ? (
                    <input className="input text-sm" type="number" value={editForm.founded_year ?? ""} onChange={e => setEF("founded_year", parseInt(e.target.value) || null)} placeholder="2020" />
                  ) : (
                    <span className="text-sm text-slate-700">{selected.founded_year ?? "—"}</span>
                  )}
                </Field>

                <Field label="Total Raised">
                  <span className="text-sm text-slate-700">{formatCurrency(selected.funding_raised, true)}</span>
                </Field>

                <Field label="Last Contact">
                  <span className="text-sm text-slate-700 flex items-center gap-1">
                    <Calendar size={12} className="text-slate-400" />
                    {formatDate(selected.last_contact_date)}
                  </span>
                </Field>

              </div>
            </section>

            {/* ── Description ── */}
            <section>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Company Description</h2>
              {editing ? (
                <textarea
                  className="textarea text-sm w-full"
                  rows={4}
                  value={editForm.description ?? ""}
                  onChange={e => setEF("description", e.target.value || null)}
                  placeholder="Describe the company's technology, mission, and market…"
                />
              ) : (
                <p className="text-sm text-slate-700 leading-relaxed">
                  {selected.description ?? <span className="text-slate-300 italic">No description yet. Click Edit to add one.</span>}
                </p>
              )}
            </section>

            {/* ── Key Words / Tags ── */}
            <section>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                <span className="flex items-center gap-1.5"><Tag size={12} /> Key Words</span>
              </h2>
              <KeywordEditor
                tags={(editing ? (editForm.tags as string[]) : (selected.tags as string[])) ?? []}
                onChange={tags => setEF("tags", tags)}
                readOnly={!editing}
              />
            </section>

            {/* ── Sectors (multi-select chips in edit mode) ── */}
            {editing && (
              <section>
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Sectors</h2>
                <div className="flex flex-wrap gap-2">
                  {SECTOR_OPTIONS.map(s => {
                    const lower = s.toLowerCase();
                    const active = (editForm.sectors as string[] ?? []).includes(lower);
                    return (
                      <button key={s} type="button" onClick={() => toggleSector(s)}
                        className={cn("px-3 py-1 rounded-full text-xs font-medium border transition-all",
                          active ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-300 hover:border-blue-400"
                        )}>
                        {s}
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── Internal Notes ── */}
            <section>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Internal Notes</h2>
              {editing ? (
                <textarea
                  className="textarea text-sm w-full"
                  rows={3}
                  value={editForm.notes ?? ""}
                  onChange={e => setEF("notes", e.target.value || null)}
                  placeholder="Private notes visible only to your team…"
                />
              ) : (
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                  {selected.notes ?? <span className="text-slate-300 italic">No notes</span>}
                </p>
              )}
            </section>

            {/* ── Contacts ── */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Contacts</h2>
                <a href={`/crm/companies/${selected.id}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  Manage <ChevronRight size={12} />
                </a>
              </div>
              {loadingDetail ? (
                <div className="h-12 bg-slate-50 rounded-lg animate-pulse" />
              ) : contacts.length === 0 ? (
                <div className="text-sm text-slate-300 italic">No contacts linked yet</div>
              ) : (
                <div className="space-y-2">
                  {contacts.map(c => (
                    <div key={c.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                      <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                        <User size={14} className="text-violet-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {c.first_name} {c.last_name}
                          {c.is_primary_contact && <span className="ml-1.5 text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Primary</span>}
                        </p>
                        <p className="text-xs text-slate-500 truncate">{c.title ?? c.type}</p>
                      </div>
                      <div className="flex gap-2 text-slate-400">
                        {c.email && <a href={`mailto:${c.email}`} className="hover:text-blue-600"><Mail size={13} /></a>}
                        {c.phone && <a href={`tel:${c.phone}`} className="hover:text-blue-600"><Phone size={13} /></a>}
                        {c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600"><ExternalLink size={13} /></a>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── Documents — Deck & Transcripts ── */}
            <section>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Documents</h2>
              <div className="grid grid-cols-3 gap-4">

                {/* Pitch Deck */}
                <UploadBox
                  label="Deck"
                  accept=".pdf,.pptx,.ppt,.key"
                  companyId={selected.id}
                  docType="deck"
                  bucket="decks"
                  existingUrl={selected.pitch_deck_url}
                  onUploaded={url => setCompanies(prev => prev.map(c => c.id === selected.id ? { ...c, pitch_deck_url: url } : c))}
                />

                {/* Latest Meeting Transcript */}
                <UploadBox
                  label="Last Meeting Transcript"
                  accept=".txt,.pdf,.docx,.vtt"
                  companyId={selected.id}
                  docType="transcript"
                  bucket="transcripts"
                  existingUrl={interactions.find(i => i.type === "meeting" && i.transcript_url)?.transcript_url ?? null}
                  existingDate={interactions.find(i => i.type === "meeting")?.date}
                  onUploaded={() => loadDetail(selected.id)}
                />

                {/* Previous Transcripts */}
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-semibold text-slate-600 mb-2 flex items-center gap-1.5">
                    <Paperclip size={12} /> Previous Transcripts
                  </p>
                  {interactions.filter(i => i.type === "meeting").length > 1 ? (
                    <div className="space-y-1.5">
                      {interactions.filter(i => i.type === "meeting").slice(1).map(i => (
                        <div key={i.id} className="text-xs text-slate-500">
                          {formatDate(i.date)} — {truncate(i.subject, 22)}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-300 italic">No previous meetings</p>
                  )}
                </div>

              </div>
            </section>

            {/* ── IC Memo ── */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Sparkles size={12} /> IC Memo
                </h2>
                <div className="flex items-center gap-2">
                  {memo && (
                    <button
                      onClick={handleGenerateMemo}
                      disabled={generatingMemo}
                      className="text-xs px-2.5 py-1 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1"
                      title="Regenerate memo with latest data"
                    >
                      {generatingMemo
                        ? <Loader2 size={11} className="animate-spin" />
                        : <Sparkles size={11} />
                      }
                      {generatingMemo ? "Generating…" : "Regenerate"}
                    </button>
                  )}
                  <a href="/memos" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    View all <ChevronRight size={12} />
                  </a>
                </div>
              </div>
              {loadingDetail ? (
                <div className="h-24 bg-slate-50 rounded-xl animate-pulse" />
              ) : memo ? (
                <div className="border border-slate-200 rounded-xl p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{memo.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                          memo.recommendation === "invest"       ? "bg-green-100 text-green-700" :
                          memo.recommendation === "pass"         ? "bg-red-100 text-red-600" :
                          memo.recommendation === "more_diligence" ? "bg-amber-100 text-amber-700" :
                          "bg-slate-100 text-slate-600"
                        )}>
                          {memo.recommendation === "invest" ? "✓ Invest" :
                           memo.recommendation === "pass" ? "✗ Pass" :
                           memo.recommendation === "more_diligence" ? "⟳ More Diligence" : "Pending"}
                        </span>
                        <span className="text-xs text-slate-400">{formatDate(memo.created_at)}</span>
                      </div>
                    </div>
                    <a href={`/memos/${memo.id}`}
                      className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 flex items-center gap-1">
                      View Full <ChevronRight size={12} />
                    </a>
                  </div>
                  {memo.executive_summary && (
                    <p className="text-sm text-slate-600 leading-relaxed line-clamp-4">{memo.executive_summary}</p>
                  )}
                </div>
              ) : (
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center">
                  <Sparkles size={20} className="mx-auto mb-2 text-slate-300" />
                  <p className="text-sm text-slate-400 mb-3">No IC memo yet</p>
                  <button
                    onClick={handleGenerateMemo}
                    disabled={generatingMemo}
                    className="text-xs px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-60 inline-flex items-center gap-1.5"
                  >
                    {generatingMemo
                      ? <><Loader2 size={12} className="animate-spin" /> Generating…</>
                      : <><Sparkles size={12} /> Generate Memo with Claude</>
                    }
                  </button>
                </div>
              )}
            </section>

            {/* Bottom padding */}
            <div className="h-8" />
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          ADD COMPANY MODAL
      ═══════════════════════════════════════════════════════════════════════ */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold">Add to Pipeline</h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
            </div>
            <form onSubmit={handleAddCompany} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Company Name *</label>
                <input className="input" placeholder="e.g. CarbonMind Inc." required
                  value={addForm.name ?? ""} onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Stage</label>
                  <select className="select" value={addForm.stage ?? ""}
                    onChange={e => setAddForm(p => ({ ...p, stage: e.target.value || null }))}>
                    <option value="">Select stage</option>
                    {STAGE_OPTIONS.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Status</label>
                  <select className="select" value={addForm.deal_status ?? ""}
                    onChange={e => setAddForm(p => ({ ...p, deal_status: e.target.value as DealStatus || null }))}>
                    <option value="">Not set</option>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Website</label>
                  <input className="input" type="url" placeholder="https://…"
                    value={addForm.website ?? ""} onChange={e => setAddForm(p => ({ ...p, website: e.target.value || null }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Location</label>
                  <input className="input" placeholder="City, Country"
                    value={[addForm.location_city, addForm.location_country].filter(Boolean).join(", ")}
                    onChange={e => {
                      const parts = e.target.value.split(",").map(s => s.trim());
                      setAddForm(p => ({ ...p, location_city: parts[0] || null, location_country: parts[1] || null }));
                    }} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Description</label>
                <textarea className="textarea" rows={3} placeholder="What does the company do?"
                  value={addForm.description ?? ""} onChange={e => setAddForm(p => ({ ...p, description: e.target.value || null }))} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={addSaving}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
                  {addSaving ? "Adding…" : "Add Company"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
