"use client";
// ─── CRM Pipeline — Split-Pane View ──────────────────────────────────────────
// Left panel: scrollable company list with logo, status badge, sector badge.
// Right panel: full company detail — overview, contacts, documents, IC memo.

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Company, Contact, Interaction, IcMemo, DealStatus, CompanyType } from "@/lib/types";
import { cn, formatDate, formatCurrency, getInitials, truncate } from "@/lib/utils";
import {
  Search, Plus, ExternalLink, ChevronRight, Pencil, Check, X,
  User, FileText, Link2, MapPin, Calendar, Mail, Phone,
  Building2, Sparkles, Paperclip, Tag, Upload, Loader2, ImageIcon,
} from "lucide-react";
import { PdfCover } from "@/components/ui/pdf-cover";

// ── Status display helpers ────────────────────────────────────────────────────

// Values match Excel "Status" column exactly (stored as snake_case in DB)
const STATUS_LABELS: Record<string, string> = {
  identified_introduced:  "Identified/Introduced",
  first_meeting:          "First Meeting",
  discussion_in_process:  "Discussion in Process",
  due_diligence:          "Due Diligence",
  passed:                 "Passed",
  portfolio:              "Portfolio",
  tracking_hold:          "Tracking / Hold",
  exited:                 "Exited",
};

const STATUS_COLORS: Record<string, string> = {
  identified_introduced:  "bg-slate-100 text-slate-500",
  first_meeting:          "bg-sky-100 text-sky-700",
  discussion_in_process:  "bg-blue-100 text-blue-700",
  due_diligence:          "bg-violet-100 text-violet-700",
  passed:                 "bg-red-100 text-red-600",
  portfolio:              "bg-emerald-100 text-emerald-700",
  tracking_hold:          "bg-amber-100 text-amber-700",
  exited:                 "bg-gray-100 text-gray-500",
};

// Values match Excel "Investment Round" column
// Values match Excel "Investment Round" column
const STAGE_OPTIONS = ["Pre-Seed", "Pre-A", "Seed", "Seed Extension", "Series A", "Series B", "Series C", "Growth"];

// Values match Excel "Sector" column
const SECTOR_OPTIONS = ["Biotech", "Cleantech", "Other"];

const SECTOR_COLORS: Record<string, string> = {
  cleantech: "bg-emerald-100 text-emerald-700",
  biotech:   "bg-violet-100 text-violet-700",
  other:     "bg-slate-100 text-slate-600",
};

// Values match Excel "Sub-sector" column
const SUB_SECTOR_OPTIONS = [
  "Additive / Advanced Manufacturing", "Advanced Diagnostics / Biomarkers",
  "Advanced Materials", "Air", "Biomanufacturing", "Computing / AI",
  "Digital Health", "Drug Discovery", "Earth", "Energy Source / Storage",
  "Food / Ag", "Organomics", "Regenerative / Longevity", "SynBio", "Water / Waste",
];

// Values match Excel "Type" column
const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "startup",          label: "Startup" },
  { value: "limited partner",  label: "Limited Partner" },
  { value: "investor",         label: "Investor" },
  { value: "strategic partner",label: "Strategic Partner" },
  { value: "other",            label: "Other" },
];

// ── Logo / Avatar ─────────────────────────────────────────────────────────────

function CompanyLogo({ company, size = "md" }: { company: Company; size?: "sm" | "md" }) {
  const [imgError, setImgError] = useState(false);
  const sz = size === "sm" ? "w-10 h-10" : "w-12 h-12";

  const logoSrc = company.logo_url ?? null;

  // Reset error when logo source changes (e.g. after manual save or auto-find)
  useEffect(() => { setImgError(false); }, [logoSrc]);

  if (logoSrc && !imgError) {
    return (
      <img
        src={logoSrc}
        alt={company.name}
        onError={() => setImgError(true)}
        className={`${sz} rounded-lg object-contain bg-white border border-slate-200 p-0.5 flex-shrink-0`}
      />
    );
  }
  return (
    <div className={`${sz} rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0`}>
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
  const supabase  = createClient();
  const inputRef  = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress]  = useState<string | null>(null);
  const [error, setError]        = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setProgress("Uploading…");
    setError(null);

    try {
      // ── 1. Upload directly to Supabase Storage (bypasses Vercel 4.5 MB limit) ──
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${companyId}/${Date.now()}-${safeName}`;

      const { error: storageError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, { contentType: file.type || "application/octet-stream", upsert: true });

      if (storageError) throw new Error(storageError.message);

      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath);

      // ── 2. Insert document record ─────────────────────────────────────────────
      const documentType = docType === "deck" ? "deck" : "transcript";
      const { data: { user } } = await supabase.auth.getUser();

      await supabase.from("documents").insert({
        company_id:   companyId,
        name:         file.name,
        type:         documentType,
        storage_path: filePath,
        mime_type:    file.type || "application/octet-stream",
        file_size:    file.size,
        uploaded_by:  user?.id ?? null,
      });

      // ── 3. Side-effects ───────────────────────────────────────────────────────
      if (docType === "deck") {
        await supabase.from("companies").update({ pitch_deck_url: publicUrl }).eq("id", companyId);
      }
      if (docType === "transcript") {
        await supabase.from("interactions").insert({
          company_id:     companyId,
          type:           "meeting",
          subject:        `Transcript: ${file.name}`,
          transcript_url: publicUrl,
          date:           new Date().toISOString(),
          sentiment:      "neutral",
          created_by:     user?.id ?? null,
        });
      }

      setProgress(null);
      onUploaded(publicUrl);
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
      className="h-full border-2 border-dashed border-slate-200 rounded-xl p-4 flex flex-col gap-2 hover:border-blue-300 transition-colors cursor-pointer group"
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
      ) : existingUrl && docType === "deck" ? (
        /* ── Deck: show cover-page thumbnail ── */
        <div className="space-y-2" onClick={e => e.stopPropagation()}>
          <a href={existingUrl} target="_blank" rel="noopener noreferrer">
            <PdfCover url={existingUrl} className="w-full rounded-lg shadow-sm border border-slate-100 hover:opacity-90 transition-opacity" />
          </a>
          <div className="flex items-center justify-between">
            <a
              href={existingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
            >
              <ExternalLink size={11} /> Open deck
            </a>
            <p className="text-[10px] text-slate-400 group-hover:text-blue-500 transition-colors flex items-center gap-0.5">
              <Upload size={9} /> Replace
            </p>
          </div>
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
  const [sortBy, setSortBy]               = useState<"name" | "status" | "last_contact" | "date_added">("name");
  const [includePassed, setIncludePassed] = useState(false);
  const [contacts, setContacts]           = useState<Contact[]>([]);
  const [interactions, setInteractions]   = useState<Interaction[]>([]);
  const [documents, setDocuments]         = useState<Array<{id:string;name:string;type:string;storage_path:string|null;created_at:string}>>([]);
  const [memo, setMemo]                   = useState<IcMemo | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [emailEvents, setEmailEvents]     = useState<Array<{id:string;kind:"email";title:string;body:string;date:string;url:string}>>([]);

  // Inline note adding
  const [addingNote, setAddingNote]   = useState(false);
  const [noteText, setNoteText]       = useState("");
  const [savingNote, setSavingNote]   = useState(false);

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
  const [generatingDesc, setGeneratingDesc] = useState(false);

  // Logo picker
  const [showLogoPicker, setShowLogoPicker] = useState(false);
  const [logoUrlInput, setLogoUrlInput]     = useState("");
  const [logoFinding, setLogoFinding]       = useState(false);
  const [logoMsg, setLogoMsg]               = useState<string | null>(null);

  // Badge pickers
  const [showTypePicker,   setShowTypePicker]   = useState(false);
  const [showStagePicker,  setShowStagePicker]  = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);

  // Close any picker when clicking outside
  useEffect(() => {
    function handleClickOutside() {
      setShowTypePicker(false);
      setShowStagePicker(false);
      setShowStatusPicker(false);
    }
    if (showTypePicker || showStagePicker || showStatusPicker) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showTypePicker, showStagePicker, showStatusPicker]);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const selected = companies.find(c => c.id === selectedId) ?? null;

  const STATUS_SORT_ORDER: Record<string, number> = {
    due_diligence:          0,
    discussion_in_process:  1,
    first_meeting:          2,
    identified_introduced:  3,
    portfolio:              4,
    tracking_hold:          5,
    exited:                 6,
    passed:                 7,
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = companies.filter(c => {
      if (!includePassed && c.deal_status === "passed") return false;
      return (
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.description ?? "").toLowerCase().includes(q) ||
        (c.sectors ?? []).some(s => s.toLowerCase().includes(q))
      );
    });

    return [...list].sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "status": {
          const ao = STATUS_SORT_ORDER[a.deal_status ?? ""] ?? 99;
          const bo = STATUS_SORT_ORDER[b.deal_status ?? ""] ?? 99;
          return ao !== bo ? ao - bo : a.name.localeCompare(b.name);
        }
        case "last_contact":
          return (b.last_contact_date ?? "").localeCompare(a.last_contact_date ?? "");
        case "date_added":
          return (b.created_at ?? "").localeCompare(a.created_at ?? "");
        default:
          return 0;
      }
    });
  }, [companies, search, sortBy, includePassed]);

  // ── Load detail data when selected company changes ────────────────────────
  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    const [{ data: ctcts }, { data: ints }, { data: memos }, { data: company }, { data: docs }] = await Promise.all([
      supabase.from("contacts").select("*").eq("company_id", id).order("is_primary_contact", { ascending: false }),
      supabase.from("interactions").select("*").eq("company_id", id).order("date", { ascending: false }).limit(20),
      supabase.from("ic_memos").select("*").eq("company_id", id).order("created_at", { ascending: false }).limit(1),
      supabase.from("companies").select("name, website").eq("id", id).single(),
      supabase.from("documents").select("id,name,type,storage_path,created_at").eq("company_id", id).order("created_at", { ascending: false }),
    ]);

    let contacts = ctcts ?? [];

    // Fallback: if no contacts linked by company_id, match by email domain or company name
    if (contacts.length === 0 && company) {
      const domainFromWebsite = company.website
        ? company.website.replace(/^https?:\/\/(www\.)?/, "").split("/")[0].split(".").slice(-2).join(".")
        : null;
      const nameSlug = company.name.toLowerCase().replace(/[^a-z0-9]/g, "");

      if (domainFromWebsite || nameSlug) {
        // Try matching contacts whose email domain matches the company website domain
        const { data: fallback } = await supabase.rpc("match_contacts_by_company", {
          p_company_id: id,
          p_domain: domainFromWebsite ?? "",
          p_name_slug: nameSlug,
        });
        contacts = fallback ?? contacts;
      }
    }

    setContacts(contacts);
    setInteractions(ints ?? []);
    setDocuments(docs ?? []);
    setMemo(memos?.[0] ?? null);
    setLoadingDetail(false);
  }, [supabase]);

  const loadEmails = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/companies/emails?company_id=${id}`);
      if (!res.ok) return;
      const json = await res.json();
      if (json.graphError) return; // Graph not configured
      setEmailEvents(
        (json.emails ?? []).map((e: {
          id: string; subject: string; summary: string;
          from: { name: string; address: string }; date: string; webLink: string;
        }) => ({
          id: `email-${e.id}`,
          kind: "email" as const,
          title: e.summary,
          body: `${e.from.name || e.from.address} · ${e.subject}`,
          date: e.date,
          url: e.webLink,
        }))
      );
    } catch { /* Graph not configured — silently skip */ }
  }, []);

  useEffect(() => {
    if (selectedId) {
      setEmailEvents([]);
      loadDetail(selectedId);
      loadEmails(selectedId);
    }
  }, [selectedId, loadDetail, loadEmails]);

  // ── Edit handlers ─────────────────────────────────────────────────────────
  function startEdit() {
    if (!selected) return;
    const types = selected.types?.length ? selected.types : (selected.type ? [selected.type] : []);
    setEditForm({ ...selected, types });
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

  function toggleType(t: string) {
    const curr = (editForm.types as string[] ?? []);
    const next = curr.includes(t) ? curr.filter(x => x !== t) : [...curr, t];
    setEF("types", next);
    if (next.length > 0) setEF("type", next[0] as CompanyType);
  }

  // ── Add note inline ───────────────────────────────────────────────────────
  async function handleAddNote() {
    if (!selected || !noteText.trim()) return;
    setSavingNote(true);
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("interactions").insert({
      company_id: selected.id,
      type: "note",
      subject: "Note",
      body: noteText.trim(),
      date: new Date().toISOString(),
      sentiment: "neutral",
      created_by: user?.id,
    });
    setNoteText("");
    setAddingNote(false);
    setSavingNote(false);
    await loadDetail(selected.id);
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

  // ── Delete a deck document ────────────────────────────────────────────────
  async function handleDeleteDeck(docId: string, storagePath: string | null) {
    if (!confirm("Remove this deck?")) return;
    await supabase.from("documents").delete().eq("id", docId);
    if (storagePath) await supabase.storage.from("decks").remove([storagePath]);
    await loadDetail(selected!.id);
  }

  // ── Delete a transcript document ──────────────────────────────────────────
  async function handleDeleteTranscript(docId: string, storagePath: string | null) {
    if (!confirm("Remove this transcript?")) return;
    await supabase.from("documents").delete().eq("id", docId);
    if (storagePath) {
      await supabase.storage.from("transcripts").remove([storagePath]);
      // Also remove the matching interaction row (linked by transcript_url)
      const { data: { publicUrl } } = supabase.storage.from("transcripts").getPublicUrl(storagePath);
      await supabase.from("interactions").delete().eq("company_id", selected!.id).eq("transcript_url", publicUrl);
    }
    await loadDetail(selected!.id);
  }

  // ── Generate company description ──────────────────────────────────────────
  async function handleGenerateDesc() {
    if (!selected || generatingDesc) return;
    setGeneratingDesc(true);
    try {
      const res = await fetch("/api/companies/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: selected.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to generate description");
      // Update the company in local state immediately
      setCompanies(prev => prev.map(c =>
        c.id === selected.id ? { ...c, description: json.description } : c
      ));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Description generation failed");
    } finally {
      setGeneratingDesc(false);
    }
  }

  // ── Logo handlers ─────────────────────────────────────────────────────────
  function applyLogo(companyId: string, url: string) {
    setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, logo_url: url } : c));
  }

  async function handleManualLogo() {
    if (!selected || !logoUrlInput.trim()) return;
    const url = logoUrlInput.trim();
    await supabase.from("companies").update({ logo_url: url }).eq("id", selected.id);
    applyLogo(selected.id, url);
    setShowLogoPicker(false);
    setLogoUrlInput("");
    setLogoMsg(null);
  }

  async function handleAutoFindLogo() {
    if (!selected) return;
    setLogoFinding(true);
    setLogoMsg(null);
    try {
      const res  = await fetch("/api/logo-finder/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: selected.id }),
      });
      const data = await res.json();
      if (data.success && data.logo_url) {
        applyLogo(selected.id, data.logo_url);
        setShowLogoPicker(false);
        setLogoMsg(null);
      } else {
        setLogoMsg("Logo not found — try entering a URL manually.");
      }
    } catch {
      setLogoMsg("Error finding logo.");
    }
    setLogoFinding(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ═══════════════════════════════════════════════════════════════════════
          LEFT PANEL — Company List
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="w-[300px] flex-shrink-0 border-r border-slate-200 bg-white flex flex-col">

        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-100 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-800">
              Pipeline
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

          {/* Sort + Include Passed */}
          <div className="flex items-center gap-2">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof sortBy)}
              className="flex-1 text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white text-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
            >
              <option value="name">Name A→Z</option>
              <option value="status">Status</option>
              <option value="last_contact">Last Contact</option>
              <option value="date_added">Date Added</option>
            </select>
            <button
              onClick={() => setIncludePassed(v => !v)}
              className={cn(
                "flex-shrink-0 text-[10px] font-medium px-2 py-1.5 rounded-md border transition-colors whitespace-nowrap",
                includePassed
                  ? "bg-red-50 border-red-200 text-red-600"
                  : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"
              )}
            >
              {includePassed ? "✕ Passed" : "+ Passed"}
            </button>
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
                    {/* Line 1 — Company name */}
                    <p className={cn("text-sm font-semibold truncate", isActive ? "text-blue-700" : "text-slate-800")}>
                      {c.name}
                    </p>
                    {/* Line 2 — Status */}
                    <p className="mt-0.5 text-xs truncate">
                      {c.deal_status ? (
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", STATUS_COLORS[c.deal_status])}>
                          {STATUS_LABELS[c.deal_status] ?? c.deal_status}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-300">No status</span>
                      )}
                    </p>
                    {/* Line 3 — Sector bubble */}
                    <p className="mt-0.5">
                      {c.sectors?.[0] ? (
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium capitalize", SECTOR_COLORS[c.sectors[0].toLowerCase()] ?? SECTOR_COLORS.other)}>
                          {c.sectors[0]}
                        </span>
                      ) : null}
                    </p>
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
                <div className="flex items-center gap-1.5 mt-0.5">

                  {/* ── Type badge ── */}
                  <div className="relative inline-flex items-center" onMouseDown={e => e.stopPropagation()}>
                    <button
                      onClick={() => { setShowTypePicker(p => !p); setShowStagePicker(false); setShowStatusPicker(false); }}
                      className="inline-flex items-center h-5 px-2.5 rounded-full text-[11px] font-medium leading-none bg-slate-700 text-white hover:bg-slate-600 transition-colors capitalize"
                    >
                      {selected.type?.replace(/_/g, " ") || "No Type"}
                    </button>
                    {showTypePicker && (
                      <div className="absolute left-0 top-6 z-30 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[170px]">
                        {["startup","limited partner","investor","strategic partner","ecosystem_partner","other"].map(t => (
                          <button
                            key={t}
                            onClick={async () => {
                              await supabase.from("companies").update({ type: t, types: [t] }).eq("id", selected.id);
                              setCompanies(prev => prev.map(c => c.id === selected.id ? { ...c, type: t as Company["type"], types: [t] } : c));
                              setShowTypePicker(false);
                            }}
                            className={cn(
                              "w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 capitalize transition-colors",
                              selected.type === t ? "text-blue-600 font-medium" : "text-slate-700"
                            )}
                          >
                            {t.replace(/_/g, " ")}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Stage badge ── */}
                  <div className="relative inline-flex items-center" onMouseDown={e => e.stopPropagation()}>
                    <button
                      onClick={() => { setShowStagePicker(p => !p); setShowTypePicker(false); setShowStatusPicker(false); }}
                      className="inline-flex items-center h-5 px-2.5 rounded-full text-[11px] font-medium leading-none bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors capitalize"
                    >
                      {selected.stage ? selected.stage.replace(/_/g, " ") : "No Stage"}
                    </button>
                    {showStagePicker && (
                      <div className="absolute left-0 top-6 z-30 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[150px]">
                        {STAGE_OPTIONS.map(s => (
                          <button
                            key={s}
                            onClick={async () => {
                              await supabase.from("companies").update({ stage: s }).eq("id", selected.id);
                              setCompanies(prev => prev.map(c => c.id === selected.id ? { ...c, stage: s } : c));
                              setShowStagePicker(false);
                            }}
                            className={cn(
                              "w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 capitalize transition-colors",
                              selected.stage === s ? "text-blue-600 font-medium" : "text-slate-700"
                            )}
                          >
                            {s.replace(/_/g, " ")}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Status badge ── */}
                  <div className="relative inline-flex items-center" onMouseDown={e => e.stopPropagation()}>
                    <button
                      onClick={() => { setShowStatusPicker(p => !p); setShowTypePicker(false); setShowStagePicker(false); }}
                      className={cn("inline-flex items-center h-5 px-2.5 rounded-full text-[11px] font-medium leading-none transition-colors hover:opacity-80",
                        selected.deal_status ? STATUS_COLORS[selected.deal_status] : "bg-slate-100 text-slate-500"
                      )}
                    >
                      {selected.deal_status ? STATUS_LABELS[selected.deal_status] : "No Status"}
                    </button>
                    {showStatusPicker && (
                      <div className="absolute left-0 top-6 z-30 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[150px]">
                        {Object.entries(STATUS_LABELS).map(([val, label]) => (
                          <button
                            key={val}
                            onClick={async () => {
                              await supabase.from("companies").update({ deal_status: val }).eq("id", selected.id);
                              setCompanies(prev => prev.map(c => c.id === selected.id ? { ...c, deal_status: val as DealStatus } : c));
                              setShowStatusPicker(false);
                            }}
                            className={cn(
                              "w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors",
                              selected.deal_status === val ? "text-blue-600 font-medium" : "text-slate-700"
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

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

              {/* ── Logo button ── */}
              <div className="relative">
                <button
                  onClick={() => { setShowLogoPicker(p => !p); setLogoMsg(null); setLogoUrlInput(""); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                  title="Set company logo"
                >
                  <ImageIcon size={12} /> Logo
                </button>
                {showLogoPicker && (
                  <div className="absolute right-0 top-9 z-30 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-4 space-y-3">
                    <p className="text-xs font-semibold text-slate-700">Update Logo</p>
                    <div className="flex gap-2">
                      <input
                        className="flex-1 text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                        placeholder="Paste logo URL…"
                        value={logoUrlInput}
                        onChange={e => setLogoUrlInput(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleManualLogo()}
                      />
                      <button
                        onClick={handleManualLogo}
                        disabled={!logoUrlInput.trim()}
                        className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-40"
                      >
                        Save
                      </button>
                    </div>
                    <button
                      onClick={handleAutoFindLogo}
                      disabled={logoFinding}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-100 disabled:opacity-50 transition-colors"
                    >
                      {logoFinding ? <><Loader2 size={12} className="animate-spin" /> Finding…</> : <><Sparkles size={12} /> Auto-find logo</>}
                    </button>
                    {logoMsg && <p className="text-[11px] text-slate-500">{logoMsg}</p>}
                    <button onClick={() => setShowLogoPicker(false)} className="text-[11px] text-slate-400 hover:text-slate-600 w-full text-center">Cancel</button>
                  </div>
                )}
              </div>


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
              <div className="grid grid-cols-4 gap-x-6 gap-y-5">

                {/* Row 1: Domain/Website, Type, Sector, Sub-sector */}
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

                <Field label="Type">
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    {TYPE_OPTIONS.map(o => {
                      const active = (editing ? (editForm.types as string[] ?? []) : (selected.types ?? [])).includes(o.value);
                      return editing ? (
                        <button key={o.value} type="button" onClick={() => toggleType(o.value)}
                          className={cn("px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                            active ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600"
                          )}>
                          {o.label}
                        </button>
                      ) : active ? (
                        <span key={o.value} className="px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">{o.label}</span>
                      ) : null;
                    })}
                    {!editing && !(selected.types ?? []).length && <span className="text-sm text-slate-300">—</span>}
                  </div>
                </Field>

                <Field label="Sector">
                  <div className="flex flex-wrap gap-1.5 mt-0.5">
                    {SECTOR_OPTIONS.map(s => {
                      const lower = s.toLowerCase();
                      const active = (editing ? (editForm.sectors as string[] ?? []) : (selected.sectors ?? [])).includes(lower);
                      return editing ? (
                        <button key={s} type="button" onClick={() => toggleSector(s)}
                          className={cn("px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                            active ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600"
                          )}>
                          {s}
                        </button>
                      ) : active ? (
                        <span key={s} className="px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">{s}</span>
                      ) : null;
                    })}
                    {!editing && !(selected.sectors ?? []).length && <span className="text-sm text-slate-300">—</span>}
                  </div>
                </Field>

                <Field label="Sub-sector">
                  {editing ? (
                    <select className="select text-sm" value={editForm.sub_type ?? ""} onChange={e => setEF("sub_type", e.target.value || null)}>
                      <option value="">Select sub-sector</option>
                      {SUB_SECTOR_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <span className="text-sm text-slate-700">{selected.sub_type ?? "—"}</span>
                  )}
                </Field>

                {/* Row 2: Status, Investment Round, Location, Last Contact */}
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

                <Field label="Location">
                  {editing ? (
                    <div className="flex gap-2">
                      <input className="input text-sm flex-1" value={editForm.location_city ?? ""} onChange={e => setEF("location_city", e.target.value || null)} placeholder="City" />
                      <input className="input text-sm flex-1" value={editForm.location_country ?? ""} onChange={e => setEF("location_country", e.target.value || null)} placeholder="Country" />
                    </div>
                  ) : (
                    <span className="text-sm text-slate-700 flex items-center gap-1">
                      <MapPin size={12} className="text-slate-400" />
                      {[selected.location_city, selected.location_country].filter(Boolean).join(", ") || "—"}
                    </span>
                  )}
                </Field>

                <Field label="Last Contact">
                  <span className="text-sm text-slate-700 flex items-center gap-1">
                    <Calendar size={12} className="text-slate-400" />
                    {formatDate(selected.last_contact_date)}
                  </span>
                </Field>

              </div>
            </section>

            {/* ── Description — Claude-generated, read-only ── */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Company Description</h2>
                <button
                  onClick={handleGenerateDesc}
                  disabled={generatingDesc}
                  className="text-[11px] px-2.5 py-1 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1"
                  title="Generate description with Claude"
                >
                  {generatingDesc ? <><Loader2 size={10} className="animate-spin" /> Generating…</> : <><Sparkles size={10} /> Generate with Claude</>}
                </button>
              </div>
              <p className="text-sm text-slate-700 leading-relaxed">
                {selected.description ?? <span className="text-slate-300 italic">No description yet — click Generate with Claude.</span>}
              </p>
            </section>

            {/* ── Keywords + Notes (left) | Interaction Timeline (right) ── */}
            <div className="grid grid-cols-[2fr_3fr] gap-6 items-start">

              {/* LEFT: Keywords + Internal Notes stacked */}
              <div className="space-y-5">
                {/* Key Words / Tags */}
                <section>
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
                    <span className="flex items-center gap-1.5"><Tag size={12} /> Key Words</span>
                  </h2>
                  {editing ? (
                    <div className="min-h-[80px] border border-slate-200 rounded-lg p-2.5 bg-white">
                      <KeywordEditor
                        tags={(editForm.tags as string[]) ?? []}
                        onChange={tags => setEF("tags", tags)}
                        readOnly={false}
                      />
                    </div>
                  ) : (
                    <KeywordEditor
                      tags={(selected.tags as string[]) ?? []}
                      onChange={tags => setEF("tags", tags)}
                      readOnly={true}
                    />
                  )}
                </section>

                {/* Internal Notes */}
                <section>
                  <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Internal Notes</h2>
                  {editing ? (
                    <textarea
                      className="textarea text-sm w-full min-h-[80px]"
                      rows={4}
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
              </div>

              {/* RIGHT: Interaction Timeline */}
              <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Calendar size={12} /> Interaction Timeline
                </h2>
                <button
                  onClick={() => setAddingNote(p => !p)}
                  className="text-xs px-2.5 py-1 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 flex items-center gap-1"
                >
                  <Plus size={11} /> Add Note
                </button>
              </div>

              {/* Add note form */}
              {addingNote && (
                <div className="mb-4 p-3 border border-blue-200 rounded-xl bg-blue-50 space-y-2">
                  <textarea
                    className="w-full text-sm border border-slate-200 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                    rows={3}
                    placeholder="Add a note about this company…"
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setAddingNote(false); setNoteText(""); }} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-100">Cancel</button>
                    <button onClick={handleAddNote} disabled={savingNote || !noteText.trim()} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 flex items-center gap-1">
                      {savingNote ? <><Loader2 size={10} className="animate-spin" /> Saving…</> : <><Check size={10} /> Save Note</>}
                    </button>
                  </div>
                </div>
              )}

              {loadingDetail ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <div key={i} className="h-14 bg-slate-50 rounded-xl animate-pulse" />)}
                </div>
              ) : (() => {
                // Merge interactions + document uploads into a single timeline
                type TEvent = { id: string; kind: string; title: string; body?: string | null; date: string; url?: string | null; meta?: string | null };
                const events: TEvent[] = [
                  ...interactions.map(i => ({
                    id: i.id,
                    kind: i.type,
                    title: i.subject ?? (i.type === "note" ? "Note" : i.type === "meeting" ? "Meeting" : i.type === "email" ? "Email" : "Interaction"),
                    body: i.body ?? i.summary ?? null,
                    date: i.date,
                    url: i.transcript_url ?? null,
                    meta: i.sentiment ?? null,
                  })),
                  ...documents.map(d => ({
                    id: d.id,
                    kind: d.type === "deck" ? "deck" : "document",
                    title: d.name,
                    body: null,
                    date: d.created_at,
                    url: d.storage_path ? supabase.storage.from(d.type === "deck" ? "decks" : "transcripts").getPublicUrl(d.storage_path).data.publicUrl : null,
                    meta: null,
                  })),
                  ...emailEvents.map(e => ({
                    id: e.id,
                    kind: e.kind,
                    title: e.title,
                    body: e.body,
                    date: e.date,
                    url: e.url,
                    meta: null,
                  })),
                ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                if (events.length === 0) return (
                  <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl">
                    <Calendar size={24} className="mx-auto mb-2 text-slate-300" />
                    <p className="text-sm text-slate-400 mb-1">No activity yet</p>
                    <p className="text-xs text-slate-300">Upload a deck, add a note, or connect Outlook & Fireflies</p>
                  </div>
                );

                const kindIcon: Record<string, React.ReactNode> = {
                  meeting:  <Calendar size={13} className="text-violet-500" />,
                  note:     <FileText size={13} className="text-slate-500" />,
                  email:    <Mail size={13} className="text-blue-500" />,
                  call:     <Phone size={13} className="text-green-500" />,
                  deck:     <FileText size={13} className="text-orange-500" />,
                  document: <Paperclip size={13} className="text-slate-400" />,
                  intro:    <User size={13} className="text-teal-500" />,
                  event:    <Calendar size={13} className="text-amber-500" />,
                };
                const kindColor: Record<string, string> = {
                  meeting:  "bg-violet-50 border-violet-100",
                  note:     "bg-slate-50 border-slate-200",
                  email:    "bg-blue-50 border-blue-100",
                  call:     "bg-green-50 border-green-100",
                  deck:     "bg-orange-50 border-orange-100",
                  document: "bg-slate-50 border-slate-100",
                  intro:    "bg-teal-50 border-teal-100",
                  event:    "bg-amber-50 border-amber-100",
                };
                const kindLabel: Record<string, string> = {
                  meeting: "Meeting", note: "Note", email: "Email", call: "Call",
                  deck: "Deck Upload", document: "Document", intro: "Intro", event: "Event",
                };

                return (
                  <div className="relative">
                    {/* Vertical line */}
                    <div className="absolute left-[15px] top-2 bottom-2 w-px bg-slate-200" />
                    <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                      {events.map(ev => (
                        <div key={ev.id} className="flex gap-3">
                          {/* Dot on timeline */}
                          <div className={cn("w-8 h-8 rounded-full border flex items-center justify-center flex-shrink-0 bg-white z-10", kindColor[ev.kind] ?? "bg-slate-50 border-slate-200")}>
                            {kindIcon[ev.kind] ?? <FileText size={13} className="text-slate-400" />}
                          </div>
                          {/* Card */}
                          <div className={cn("flex-1 border rounded-xl px-4 py-3 min-w-0", kindColor[ev.kind] ?? "bg-slate-50 border-slate-200")}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{kindLabel[ev.kind] ?? ev.kind}</span>
                                  <span className="text-xs font-medium text-slate-700 truncate">{ev.title}</span>
                                </div>
                                {ev.body && <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-3">{ev.body}</p>}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {ev.url && (
                                  <a href={ev.url} target="_blank" rel="noopener noreferrer"
                                    className="text-[11px] text-blue-600 hover:underline flex items-center gap-0.5">
                                    <ExternalLink size={10} /> View
                                  </a>
                                )}
                                <span className="text-[11px] text-slate-400 whitespace-nowrap">{formatDate(ev.date)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                  </div>
                );
              })()}
              </section>
            </div>{/* end 50/50 grid */}

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
                      {/* Avatar */}
                      <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                        <User size={14} className="text-violet-600" />
                      </div>

                      {/* Name + Title | Last Contact | Location — all left-aligned, grouped together */}
                      <div className="flex items-center gap-6 flex-1 min-w-0">

                        {/* Name + Title */}
                        <div className="w-40 flex-shrink-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium text-slate-800 truncate">{c.first_name} {c.last_name}</p>
                            {c.is_primary_contact && <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded flex-shrink-0">Primary</span>}
                          </div>
                          <p className="text-xs text-slate-500 truncate">{c.title ?? c.type ?? "—"}</p>
                        </div>

                        {/* Last Contact */}
                        <div className="w-24 flex-shrink-0">
                          <p className="text-[11px] font-medium text-slate-500">Last Contact</p>
                          <p className="text-[11px] text-slate-400">{c.last_contact_date ? formatDate(c.last_contact_date) : "—"}</p>
                        </div>

                        {/* Location */}
                        <div className="w-32 flex-shrink-0">
                          <p className="text-[11px] font-medium text-slate-500">Location</p>
                          <p className="text-[11px] text-slate-400 truncate">{[c.location_city, c.location_country].filter(Boolean).join(", ") || "—"}</p>
                        </div>

                      </div>

                      {/* Action icons — pushed to far right */}
                      <div className="flex gap-2 text-slate-400 flex-shrink-0">
                        {c.email && <a href={`mailto:${c.email}`} className="hover:text-blue-600"><Mail size={13} /></a>}
                        {c.phone && <a href={`tel:${c.phone}`} className="hover:text-blue-600"><Phone size={13} /></a>}
                        {c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600"><ExternalLink size={13} /></a>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── Documents — Decks & Transcripts ── */}
            <section>
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Documents</h2>

              <div className="grid grid-cols-2 gap-6">
              {/* ── Pitch Decks (multi) ── */}
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-3 flex items-center gap-1.5">
                  <FileText size={12} /> Pitch Decks
                  {documents.filter(d => d.type === "deck").length > 0 && (
                    <span className="ml-1 text-slate-400 font-normal">
                      ({documents.filter(d => d.type === "deck").length})
                    </span>
                  )}
                </p>
                {/* Fixed-height container — more decks → more columns (narrower), never taller */}
                {(() => {
                  const decks = documents.filter(d => d.type === "deck");
                  const total = decks.length + 1; // +1 for upload box
                  const cols = total <= 1 ? 1 : total === 2 ? 2 : total === 3 ? 3 : 4;
                  const colClass = cols === 1 ? "grid-cols-1" : cols === 2 ? "grid-cols-2" : cols === 3 ? "grid-cols-3" : "grid-cols-4";
                  return (
                    <div className={`grid ${colClass} gap-2 h-24`}>
                      {decks.map(doc => {
                        const url = doc.storage_path
                          ? supabase.storage.from("decks").getPublicUrl(doc.storage_path).data.publicUrl
                          : null;
                        return (
                          <div key={doc.id} className="relative group border border-slate-200 rounded-xl overflow-hidden bg-white h-full flex flex-col">
                            <div className="flex-1 min-h-0 overflow-hidden">
                              {url ? (
                                <a href={url} target="_blank" rel="noopener noreferrer" className="block h-full">
                                  <PdfCover url={url} className="w-full h-full object-cover" />
                                </a>
                              ) : (
                                <div className="h-full bg-slate-50 flex items-center justify-center">
                                  <FileText size={20} className="text-slate-300" />
                                </div>
                              )}
                            </div>
                            <div className="px-2 py-1.5 border-t border-slate-100 flex-shrink-0">
                              <p className="text-[9px] text-slate-600 truncate font-medium">{doc.name}</p>
                              <p className="text-[9px] text-slate-400">{formatDate(doc.created_at)}</p>
                            </div>
                            <button
                              onClick={e => { e.stopPropagation(); handleDeleteDeck(doc.id, doc.storage_path); }}
                              className="absolute top-1.5 right-1.5 w-5 h-5 bg-white/90 backdrop-blur rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 border border-slate-200"
                              title="Remove deck"
                            >
                              <X size={9} className="text-red-500" />
                            </button>
                          </div>
                        );
                      })}
                      {/* Upload box — same fixed height as deck cards */}
                      <div className="h-full">
                        <UploadBox
                          label="Upload Deck"
                          accept=".pdf,.pptx,.ppt,.key"
                          companyId={selected.id}
                          docType="deck"
                          bucket="decks"
                          existingUrl={null}
                          onUploaded={() => loadDetail(selected.id)}
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* ── Transcripts ── */}
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-3 flex items-center gap-1.5">
                  <Paperclip size={12} /> Meeting Transcripts
                  {documents.filter(d => d.type === "transcript").length > 0 && (
                    <span className="ml-1 text-slate-400 font-normal">
                      ({documents.filter(d => d.type === "transcript").length})
                    </span>
                  )}
                </p>
                {(() => {
                  const transcripts = documents.filter(d => d.type === "transcript");
                  const total = transcripts.length + 1;
                  const cols = total <= 1 ? 1 : total === 2 ? 2 : total === 3 ? 3 : 4;
                  const colClass = cols === 1 ? "grid-cols-1" : cols === 2 ? "grid-cols-2" : cols === 3 ? "grid-cols-3" : "grid-cols-4";
                  return (
                    <div className={`grid ${colClass} gap-2 h-24`}>
                      {transcripts.map(doc => {
                        const url = doc.storage_path
                          ? supabase.storage.from("transcripts").getPublicUrl(doc.storage_path).data.publicUrl
                          : null;
                        return (
                          <div key={doc.id} className="relative group flex flex-col justify-between border border-slate-200 rounded-xl bg-white p-3 h-full min-w-0">
                            <div className="flex items-start gap-2 min-w-0">
                              <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
                                <Paperclip size={11} className="text-violet-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-medium text-slate-700 truncate leading-tight">{doc.name}</p>
                                <p className="text-[9px] text-slate-400 mt-0.5">{formatDate(doc.created_at)}</p>
                              </div>
                            </div>
                            {url && (
                              <a href={url} target="_blank" rel="noopener noreferrer"
                                className="mt-2 text-[9px] text-blue-500 hover:underline flex items-center gap-0.5 truncate">
                                <ExternalLink size={9} /> Open
                              </a>
                            )}
                            <button
                              onClick={e => { e.stopPropagation(); handleDeleteTranscript(doc.id, doc.storage_path); }}
                              className="absolute top-1.5 right-1.5 w-5 h-5 bg-white/90 backdrop-blur rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 border border-slate-200"
                              title="Remove transcript"
                            >
                              <X size={9} className="text-red-500" />
                            </button>
                          </div>
                        );
                      })}
                      <div className="h-full">
                        <UploadBox
                          label="Upload Transcript"
                          accept=".txt,.pdf,.docx,.vtt"
                          companyId={selected.id}
                          docType="transcript"
                          bucket="transcripts"
                          existingUrl={null}
                          onUploaded={() => loadDetail(selected.id)}
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>
              </div>{/* end grid cols-2 */}
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
