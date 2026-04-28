"use client";
// ─── CRM Pipeline — Split-Pane View ──────────────────────────────────────────
// Left panel: scrollable company list with logo, status badge, sector badge.
// Right panel: full company detail — overview, contacts, documents, IC memo.

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { createClient } from "@/lib/supabase/client";
import type { Company, Contact, Interaction, IcMemo, DealStatus, CompanyType, ContactType } from "@/lib/types";
import { cn, formatDate, formatCurrency, getInitials, truncate } from "@/lib/utils";
import {
  Search, Plus, ExternalLink, ChevronRight, Pencil, Check, X,
  User, FileText, Link2, MapPin, Calendar, Mail, Phone,
  Building2, Sparkles, Paperclip, Tag, Upload, Loader2, ImageIcon, Bot,
  List, LayoutGrid, Eye, Download, CheckSquare, Clock, RefreshCw,
} from "lucide-react";
import { PdfCover } from "@/components/ui/pdf-cover";
import { formatMeetingSummary } from "@/lib/format-meeting-summary";

// ── Contact title options ─────────────────────────────────────────────────────
const CONTACT_TITLE_OPTIONS = [
  // Founders / C-suite (most common in DB)
  "CEO / Co-founder", "CTO / Co-founder", "Co-Founder", "CEO", "CTO", "COO", "CFO", "President", "Chairman",
  // Directors & management
  "Managing Director", "Senior Director", "Director", "General Manager", "Manager", "VP",
  // Investment professionals
  "General Partner", "Managing Partner", "Partner", "Venture Partner",
  "Principal", "Investment Associate", "Associate", "Analyst",
  "Head of Investments", "Investor Relations",
  // Other roles
  "Business Development", "Corporate Development", "Board Member",
  "Advisor", "Professor", "Admin", "Executive Assistant",
  "Lawyer", "Other",
];

// ── Strategic partnerships (portco ↔ strategic) ───────────────────────────────
const PARTNER_STATUS_COLORS: Record<string, string> = {
  "Active pilot":  "bg-emerald-100 text-emerald-700",
  "Intro pending": "bg-amber-100 text-amber-700",
  "Exploring":     "bg-blue-100 text-blue-700",
  "Not started":   "bg-slate-100 text-slate-500",
  "Introduction":  "bg-amber-100 text-amber-700",
  "Pilot":         "bg-emerald-100 text-emerald-700",
  "Diligence":     "bg-violet-100 text-violet-700",
  "Customer":      "bg-blue-100 text-blue-700",
  "Value-add":     "bg-slate-100 text-slate-600",
};

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
const STAGE_OPTIONS = ["Pre-Seed", "Pre-A", "Seed", "Seed Extension", "Series A", "Series B", "Series C", "Growth"];

// Values match Excel "Sector" column
const SECTOR_OPTIONS = ["Cleantech", "Techbio", "Other"];

const SECTOR_COLORS: Record<string, string> = {
  cleantech: "bg-emerald-100 text-emerald-700",
  techbio:   "bg-teal-100 text-teal-700",
  biotech:   "bg-violet-100 text-violet-700",
  other:     "bg-slate-100 text-slate-600",
};

const STAGE_BORDER: Record<string, string> = {
  identified_introduced: "border-l-slate-300",
  first_meeting:         "border-l-blue-400",
  discussion_in_process: "border-l-indigo-500",
  due_diligence:         "border-l-violet-500",
  passed:                "border-l-red-300",
  portfolio:             "border-l-green-500",
  tracking_hold:         "border-l-amber-500",
  exited:                "border-l-gray-300",
};

const PRIORITY_COLORS: Record<string, string> = {
  High:   "bg-emerald-100 text-emerald-700",
  Medium: "bg-orange-100 text-orange-700",
  Low:    "bg-slate-100 text-slate-500",
};

const BOARD_STAGES = [
  "identified_introduced", "first_meeting", "discussion_in_process",
  "due_diligence", "portfolio", "tracking_hold", "passed", "exited",
];

const STAGE_DOT: Record<string, string> = {
  identified_introduced:  "bg-slate-400",
  first_meeting:          "bg-sky-500",
  discussion_in_process:  "bg-blue-500",
  due_diligence:          "bg-violet-500",
  passed:                 "bg-red-400",
  portfolio:              "bg-emerald-500",
  tracking_hold:          "bg-amber-500",
  exited:                 "bg-gray-400",
};

// ── Meeting type badge (mirrors meeting-panel constants) ─────────────────────

const PIPELINE_MEETING_TYPE_LABELS: Record<string, string> = {
  due_diligence:           "Due Diligence",
  ecosystem:               "Ecosystem",
  fundraising:             "Fundraising",
  portfolio_management:    "Portfolio Mgmt",
  relationship_management: "Relationship",
  sourcing:                "Sourcing",
  other:                   "Other",
};
const PIPELINE_MEETING_TYPE_STYLES: Record<string, string> = {
  due_diligence:           "bg-amber-50 text-amber-700 border-amber-200",
  ecosystem:               "bg-teal-50 text-teal-700 border-teal-200",
  fundraising:             "bg-emerald-50 text-emerald-700 border-emerald-200",
  portfolio_management:    "bg-violet-50 text-violet-700 border-violet-200",
  relationship_management: "bg-sky-50 text-sky-700 border-sky-200",
  sourcing:                "bg-blue-50 text-blue-700 border-blue-200",
  other:                   "bg-slate-50 text-slate-500 border-slate-200",
};

function PipelineMeetingTypeBadge({ type }: { type: string | null | undefined }) {
  if (!type) return null;
  const label = PIPELINE_MEETING_TYPE_LABELS[type] ?? type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  const style = PIPELINE_MEETING_TYPE_STYLES[type] ?? "bg-slate-50 text-slate-500 border-slate-200";
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border font-medium whitespace-nowrap", style)}>
      {label}
    </span>
  );
}

// ── AI Notes parser (reused from meeting-panel) ──────────────────────────────
function parseAINotes(raw: string | null | undefined): { summary: string; nextSteps: string[] } {
  if (!raw?.trim()) return { summary: "", nextSteps: [] };
  const nextStepsRe = /(?:\*{2}|#{1,3}\s*)?(?:next\s+steps?|action\s+items?|follow[\-\s]?ups?|to[\-\s]?dos?)(?:\*{2})?\s*:?\s*\n/im;
  const summaryHeaderRe = /(?:\*{2}|#{1,3}\s*)?(?:summary|overview|meeting\s+summary)(?:\*{2})?\s*:?\s*\n?/im;
  const nextMatch = raw.match(nextStepsRe);
  let summaryText: string;
  let nextStepsText = "";
  if (nextMatch?.index !== undefined) {
    summaryText   = raw.slice(0, nextMatch.index);
    nextStepsText = raw.slice(nextMatch.index + nextMatch[0].length);
  } else {
    summaryText = raw;
  }
  summaryText = summaryText.replace(summaryHeaderRe, "").trim();
  const nextSteps = nextStepsText
    .split("\n")
    .map(l => l.replace(/^[\s\t]*[-*•\u2022\d]+[.)]\s*/, "").trim())
    .filter(l => l.length > 3 && !/^(?:\*{2}|#{1,3})/.test(l));
  return { summary: summaryText, nextSteps };
}

// Values match Excel "Sub-sector" column
const SUB_SECTOR_OPTIONS = [
  "Additive / Advanced Manufacturing", "Advanced Diagnostics / Biomarkers",
  "Advanced Materials", "Air", "Biomanufacturing", "Computing / AI",
  "Digital Health", "Drug Discovery", "Earth", "Energy Source / Storage",
  "Food / Ag", "Organomics", "Regenerative / Longevity", "SynBio", "Water / Waste",
];

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "startup",           label: "Startup" },
  { value: "fund",              label: "Fund / VC" },
  { value: "lp",                label: "LP" },
  { value: "corporate",         label: "Corporate" },
  { value: "ecosystem_partner", label: "Ecosystem" },
  { value: "government",        label: "Gov / Academic" },
  { value: "other",             label: "Other" },
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
        <span className="text-xs text-slate-300 italic">No keywords yet — double-click to add</span>
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
  currentUserId: string;
}

// Inline sector chip editor used for double-click quick-edit
function SectorQuickEdit({ current, onSave, onCancel }: {
  current: string[];
  onSave: (vals: string[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(current.map(s => s.toLowerCase()));
  function toggle(s: string) {
    const lower = s.toLowerCase();
    setSelected(prev => prev.includes(lower) ? [] : [lower]);
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 mt-0.5">
        {SECTOR_OPTIONS.map(s => {
          const active = selected.includes(s.toLowerCase());
          return (
            <button key={s} type="button" onClick={() => toggle(s)}
              className={cn("px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                active ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600"
              )}>
              {s}
            </button>
          );
        })}
      </div>
      <div className="flex gap-1.5">
        <button type="button" onClick={() => onSave(selected)} className="text-[11px] px-2.5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-500 font-medium">Save</button>
        <button type="button" onClick={onCancel} className="text-[11px] px-2.5 py-1 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50">Cancel</button>
      </div>
    </div>
  );
}

export function PipelineClient({ initialCompanies, currentUserId }: Props) {
  const supabase = createClient();

  // ── State ────────────────────────────────────────────────────────────────────
  const [companies, setCompanies]         = useState<Company[]>(initialCompanies);
  const [selectedId, setSelectedId]       = useState<string | null>(() => {
    // Restore last-viewed company on mount (client-only)
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(`pipeline_last_company_${currentUserId}`);
        if (saved && initialCompanies.some(c => c.id === saved)) return saved;
      } catch {}
    }
    return initialCompanies[0]?.id ?? null;
  });
  const [search, setSearch]               = useState("");
  const [pipelineView, setPipelineView]   = useState<"list" | "board">("list");
  const [boardDragItem, setBoardDragItem] = useState<string | null>(null);
  const [boardDragOver, setBoardDragOver] = useState<string | null>(null);
  const [sortBy, setSortBy]               = useState<"name" | "status" | "last_contact" | "date_added">("name");
  const [includePassed, setIncludePassed] = useState(false);
  const [filterType, setFilterType]     = useState<string | null>(null);
  const [filterSector, setFilterSector] = useState<string | null>(null);
  const [filterRound, setFilterRound]   = useState<string | null>(null);
  const [contacts, setContacts]           = useState<Contact[]>([]);
  const [interactions, setInteractions]   = useState<Interaction[]>([]);
  const [documents, setDocuments]         = useState<Array<{id:string;name:string;type:string;storage_path:string|null;google_drive_url:string|null;created_at:string}>>([]);
  const [memo, setMemo]                   = useState<IcMemo | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [emailEvents, setEmailEvents]     = useState<Array<{id:string;kind:"email";title:string;body:string;date:string;url:string}>>([]);
  // Pipeline intelligence (competitor + M&A)
  type PipelineIntelItem = { id: string; type: string; entity_name: string; description: string | null; fit_level: string };
  const [pipelineIntel, setPipelineIntel] = useState<PipelineIntelItem[]>([]);
  const [refreshingIntel, setRefreshingIntel] = useState<"competitor" | "ma_acquirer" | null>(null);
  const [intelError, setIntelError]       = useState<string | null>(null);
  const [intelModal, setIntelModal]       = useState<"competitor" | "ma_acquirer" | null>(null);

  // Inline event adding
  const [addingNote, setAddingNote]         = useState(false);
  const [eventDate, setEventDate]           = useState(() => new Date().toISOString().slice(0, 10));
  const [eventType, setEventType]           = useState<"call" | "meeting" | "email">("call");
  const [noteText, setNoteText]             = useState("");
  const [savingNote, setSavingNote]         = useState(false);
  const [noteContactIds, setNoteContactIds] = useState<string[]>([]);
  const [noteContactsOpen, setNoteContactsOpen] = useState(false);

  // Interaction edit/delete
  const [editingInteractionId, setEditingInteractionId] = useState<string | null>(null);
  const [editInteractionBody, setEditInteractionBody] = useState("");

  // Contact slide-out panel
  const [contactPanel, setContactPanel]         = useState<Contact | null>(null);
  const [contactPanelMode, setContactPanelMode] = useState<"detail" | "manage">("detail");
  const [contactEditing, setContactEditing]     = useState(false);
  const [contactForm, setContactForm]           = useState<Partial<Contact & { emailList: string[] }>>({});
  const [contactSaving, setContactSaving]       = useState(false);
  const [contactRemoving, setContactRemoving]   = useState(false);
  const [confirmRemove, setConfirmRemove]       = useState(false);
  const [contactInteractions, setContactInteractions] = useState<{type:string; date:string}[]>([]);

  // Edit mode + per-field quick edit
  const [editing, setEditing]   = useState(false);
  const [editField, setEditField] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Company>>({});
  const [saving, setSaving]     = useState(false);

  // Add company modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm]           = useState<Partial<Company>>({ type: "startup", sectors: [] });
  const [addSaving, setAddSaving]       = useState(false);
  const [addDeckFile, setAddDeckFile]     = useState<File | null>(null);
  const [addDeckDragOver, setAddDeckDragOver] = useState(false);
  const addDeckInputRef                   = useRef<HTMLInputElement>(null);

  // Memo generation
  const [generatingMemo, setGeneratingMemo] = useState(false);
  const [generatingDesc, setGeneratingDesc] = useState(false);

  // Logo picker
  const [showLogoPicker, setShowLogoPicker] = useState(false);
  const [logoUrlInput, setLogoUrlInput]     = useState("");
  const [logoFinding, setLogoFinding]       = useState(false);
  const [logoMsg, setLogoMsg]               = useState<string | null>(null);

  // Delete company
  const [confirmDelete, setConfirmDelete]   = useState(false);
  const [deleting, setDeleting]             = useState(false);

  // Badge pickers
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [showStagePicker,    setShowStagePicker]    = useState(false);
  const [showStatusPicker,   setShowStatusPicker]   = useState(false);

  // Strategic Partnerships (populated from portco_strategic_map localStorage)
  const [crmTasks, setCrmTasks] = useState<Array<{ id: number; title: string; cat: string; cos: string[]; due: string; start: string; prio: string }>>([]);
  const [portcoPartnerships, setPortcoPartnerships] = useState<{ strategicId: string; strategicName: string; portcoId: string; status: string; due: string }[]>([]);
  const [manualPartnerships, setManualPartnerships] = useState<{ id: string; name: string; note: string; date: string; status?: string }[]>([]);
  const [showAddPartnership, setShowAddPartnership] = useState(false);
  const [newPartnerName, setNewPartnerName]         = useState("");
  const [newPartnerType, setNewPartnerType]         = useState("Introduction");
  const [newPartnerNote, setNewPartnerNote]         = useState("");
  const [newPartnerDate, setNewPartnerDate]         = useState(() => new Date().toISOString().slice(0, 10));
  const [partnerCompanies, setPartnerCompanies]     = useState<{ id: string; name: string; types: string[] }[]>([]);
  const [partnerSearch, setPartnerSearch]           = useState("");
  const [selectedPartnerId, setSelectedPartnerId]   = useState<string | null>(null);
  const [showPartnerDropdown, setShowPartnerDropdown] = useState(false);
  const [confirmDeletePartner, setConfirmDeletePartner] = useState<{ type: "portco" | "manual"; id: string } | null>(null);

  // Virtualizer for the company list
  const listParentRef = useRef<HTMLDivElement>(null);

  // Auto-save
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const addEventFormRef = useRef<HTMLDivElement>(null);
  const linkSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linkSearchAbort = useRef<AbortController | null>(null);
  const [autoSaving, setAutoSaving]     = useState(false);

  // Add contact in manage panel
  const [showAddContactForm, setShowAddContactForm] = useState(false);
  const [newContactForm, setNewContactForm] = useState({ first_name: "", last_name: "", email: "", title: "" });
  const [addingContact, setAddingContact] = useState(false);
  // Auto-suggest for "New Contact" form in manage panel
  const [panelContactSugg, setPanelContactSugg] = useState<Contact[]>([]);
  const [showPanelContactSugg, setShowPanelContactSugg] = useState(false);
  const panelContactTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelContactAbort = useRef<AbortController | null>(null);

  // Add contact inline in add-company modal
  const [addModalContactOpen, setAddModalContactOpen] = useState(false);
  const [addModalContact, setAddModalContact]         = useState({ first_name: "", last_name: "", email: "", title: "" });
  const [contactSuggestions, setContactSuggestions]   = useState<Contact[]>([]);
  const [showContactSugg, setShowContactSugg]         = useState(false);
  const contactSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Data Room state
  const [driveInput, setDriveInput]           = useState("");
  const [driveChanging, setDriveChanging]     = useState(false);
  const [driveLinking, setDriveLinking]       = useState(false);
  const [driveSyncing, setDriveSyncing]       = useState(false);
  const [driveSyncStep, setDriveSyncStep]     = useState<"idle" | "syncing" | "extracting">("idle");
  type DriveSyncResult = { saved?: number; synced?: number; skipped: number; total: number; not_ingestible?: number; files_found?: number; files: { name: string; status: string; chars?: number }[]; error?: string; share_with?: string; setup_required?: boolean };
  const [driveSyncResult, setDriveSyncResult] = useState<DriveSyncResult | null>(null);
  const [driveReextracting, setDriveReextracting] = useState(false);
  const [driveReextractResult, setDriveReextractResult] = useState<{ success: number; failed: number; processed: number; has_more?: boolean; message?: string } | null>(null);

  // Inline tag editing (quick-edit outside full edit mode)
  const [editTagsValue, setEditTagsValue] = useState<string[]>([]);

  // Company Intelligence
  type IntelItem = { headline: string; source: string; date: string; summary?: string; url?: string };
  const [intelligence, setIntelligence] = useState<IntelItem[]>([]);
  const [loadingIntelligence, setLoadingIntelligence] = useState(false);
  const [intelligenceStatus, setIntelligenceStatus] = useState<string>("Refresh");
  const [intelligenceError, setIntelligenceError] = useState<string | null>(null);
  const [intelCachedAt, setIntelCachedAt] = useState<string | null>(null);
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [selectedTimelineMeeting, setSelectedTimelineMeeting] = useState<Interaction | null>(null);
  const [companyDocuments, setCompanyDocuments] = useState<Array<{ id: string; meeting_id: string | null; file_name: string; storage_path: string; uploaded_at: string; fireflies_url: string | null }>>([]);
  const [exportingPdf, setExportingPdf] = useState<string | null>(null); // meeting id being exported
  const [exportSuccess, setExportSuccess] = useState<string | null>(null); // meeting id just exported

  // Link existing contact in manage panel
  const [showLinkContactForm, setShowLinkContactForm] = useState(false);
  const [linkContactSearch, setLinkContactSearch] = useState("");
  const [linkContactSuggestions, setLinkContactSuggestions] = useState<Contact[]>([]);
  const [linkingContact, setLinkingContact] = useState(false);

  // Expanded partnership entry
  const [expandedPartner, setExpandedPartner] = useState<string | null>(null);

  // Contact drag-to-reorder in manage panel
  const contactDragIdx = useRef<number | null>(null);
  const [contactOrder, setContactOrder] = useState<string[]>([]);

  // Close any picker when clicking outside
  useEffect(() => {
    function handleClickOutside() {
      setShowPriorityPicker(false);
      setShowStagePicker(false);
      setShowStatusPicker(false);
    }
    if (showPriorityPicker || showStagePicker || showStatusPicker) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showPriorityPicker, showStagePicker, showStatusPicker]);

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
      // Hide passed companies by default — but never hide them when the user
      // is actively searching (so searching "Westwood" still surfaces it).
      if (!includePassed && !q && c.deal_status === "passed") return false;
      if (filterType && !(c.types ?? []).includes(filterType as CompanyType)) return false;
      if (filterSector && !(c.sectors ?? []).some(s => s.toLowerCase() === filterSector.toLowerCase())) return false;
      if (filterRound && c.stage?.toLowerCase() !== filterRound.toLowerCase()) return false;
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
  }, [companies, search, sortBy, includePassed, filterType, filterSector, filterRound]);

  // ── Virtualizer for the company list (left panel) ─────────────────────────
  const rowVirtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 72,
    overscan: 5,
  });

  // ── Load detail data when selected company changes ────────────────────────
  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    const [{ data: ctcts }, { data: ints }, { data: memos }, { data: company }, { data: docs }] = await Promise.all([
      supabase.from("contacts").select("*").eq("company_id", id).order("is_primary_contact", { ascending: false }),
      supabase.from("interactions").select("*").eq("company_id", id).order("date", { ascending: false }).limit(20),
      supabase.from("ic_memos").select("*").eq("company_id", id).order("created_at", { ascending: false }).limit(1),
      supabase.from("companies").select("name, website").eq("id", id).single(),
      supabase.from("documents").select("id,name,type,storage_path,google_drive_url,created_at").eq("company_id", id).order("created_at", { ascending: false }),
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
    // Cache timeline so it loads instantly on next company select
    try { localStorage.setItem(`pipeline_timeline_${id}`, JSON.stringify({ interactions: ints ?? [], cachedAt: new Date().toISOString() })); } catch {}
    setDocuments(docs ?? []);
    setMemo(memos?.[0] ?? null);
    setLoadingDetail(false);

    // Keep last_contact_date accurate: use the most recent interaction date if it's
    // newer than what's stored on the company (Fireflies-synced meetings don't always
    // update the company field).
    if (ints && ints.length > 0) {
      const latestDate = ints[0].date as string | null;
      if (latestDate) {
        setCompanies(prev => prev.map(c => {
          if (c.id !== id) return c;
          if (!c.last_contact_date || latestDate > c.last_contact_date) {
            return { ...c, last_contact_date: latestDate };
          }
          return c;
        }));
      }
    }

    // Load company_documents (meeting transcripts)
    supabase
      .from("company_documents" as "documents")
      .select("id, meeting_id, file_name, storage_path, uploaded_at, fireflies_url")
      .eq("company_id", id)
      .eq("document_type", "meeting_transcript")
      .order("uploaded_at", { ascending: false })
      .then(({ data }) => setCompanyDocuments((data ?? []) as unknown as typeof companyDocuments));

    // Load pipeline intelligence (competitor + M&A)
    supabase
      .from("portfolio_intelligence" as "companies")
      .select("id, type, entity_name, description, fit_level")
      .eq("company_id", id)
      .in("type", ["competitor", "ma_acquirer"])
      .order("fit_level")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }) => setPipelineIntel((data ?? []) as any));
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
      // ── Clear previous company's data immediately to prevent bleed-through ──
      setContacts([]);
      setDocuments([]);
      setMemo(null);
      setInteractions([]);
      setEmailEvents([]);
      setDriveInput("");
      setDriveChanging(false);
      setEditField(null);
      setNoteContactIds([]);
      setNoteContactsOpen(false);
      setIntelligenceError(null);

      // Load cached intelligence immediately (avoids blank panel on re-open)
      try {
        const s = localStorage.getItem(`pipeline_intel_${selectedId}`);
        if (s) { const { items, cachedAt } = JSON.parse(s); setIntelligence(items ?? []); setIntelCachedAt(cachedAt ?? null); }
        else { setIntelligence([]); setIntelCachedAt(null); }
      } catch { setIntelligence([]); setIntelCachedAt(null); }

      // Load cached timeline interactions immediately
      try {
        const s = localStorage.getItem(`pipeline_timeline_${selectedId}`);
        if (s) { const { interactions: cached } = JSON.parse(s); setInteractions(cached ?? []); }
        else { setInteractions([]); }
      } catch { setInteractions([]); }

      loadDetail(selectedId);
      loadEmails(selectedId);
    }
  }, [selectedId, loadDetail, loadEmails]);

  // Persist the last-viewed company so the page re-opens to it on next visit
  useEffect(() => {
    if (selectedId) {
      try { localStorage.setItem(`pipeline_last_company_${currentUserId}`, selectedId); } catch {}
    }
  }, [selectedId]);

  // Load partner companies (strategics / LPs / investors) for search
  useEffect(() => {
    supabase.from("companies").select("id, name, types")
      .or('types.cs.{"strategic partner"},types.cs.{"limited partner"},types.cs.{"investor"}')
      .order("name").then(({ data }) => { if (data) setPartnerCompanies(data as { id: string; name: string; types: string[] }[]); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load strategic partnerships from localStorage when selected company changes
  useEffect(() => {
    if (!selected) { setPortcoPartnerships([]); setManualPartnerships([]); return; }
    try {
      const raw = localStorage.getItem("portco_strategic_map");
      const map = raw ? JSON.parse(raw) : {};
      setPortcoPartnerships(map[selected.name] ?? []);
    } catch { setPortcoPartnerships([]); }
    try {
      const raw = localStorage.getItem("pipeline_manual_partnerships");
      const map = raw ? JSON.parse(raw) : {};
      setManualPartnerships(map[selected.id] ?? []);
    } catch { setManualPartnerships([]); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // Load crm_tasks from localStorage for Opportunities/Tasks section
  useEffect(() => {
    function loadCrmTasks() {
      try {
        const raw = localStorage.getItem("crm_tasks");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            // Only show tasks that are linked to the currently selected company
            setCrmTasks(parsed);
          }
        }
      } catch {}
    }
    loadCrmTasks();
    function handleStorage(e: StorageEvent) {
      if (e.key === "crm_tasks") loadCrmTasks();
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Scroll right panel to top when selected company changes
  useEffect(() => {
    if (rightPanelRef.current) rightPanelRef.current.scrollTop = 0;
  }, [selectedId]);

  // Close Add Event form on outside click
  useEffect(() => {
    if (!addingNote) return;
    function handleOutside(e: MouseEvent) {
      if (addEventFormRef.current && !addEventFormRef.current.contains(e.target as Node)) {
        setAddingNote(false);
        setNoteText("");
        setNoteContactIds([]);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [addingNote]);

  function addManualPartnership() {
    if (!selected || !newPartnerName.trim()) return;
    const newEntry = { id: Math.random().toString(36).slice(2, 10), name: newPartnerName.trim(), note: newPartnerNote.trim(), date: newPartnerDate, status: newPartnerType };
    const updated = [...manualPartnerships, newEntry];
    setManualPartnerships(updated);
    try {
      const raw = localStorage.getItem("pipeline_manual_partnerships");
      const map = raw ? JSON.parse(raw) : {};
      map[selected.id] = updated;
      localStorage.setItem("pipeline_manual_partnerships", JSON.stringify(map));
    } catch {}
    // If the partner is a known strategic company, also write an opportunity to their strategic_ext_map
    try {
      const matchId = selectedPartnerId ?? partnerCompanies.find(c => c.name.toLowerCase() === newPartnerName.trim().toLowerCase())?.id;
      const match = matchId ? partnerCompanies.find(c => c.id === matchId) : null;
      if (match && (match.types ?? []).includes("strategic partner")) {
        const LS_STRATEGIC = "strategic_ext_map";
        const raw = localStorage.getItem(LS_STRATEGIC);
        const map = raw ? JSON.parse(raw) : {};
        const ext = map[match.id] ?? {};
        const opps = ext.opportunities ?? [];
        opps.push({ id: Math.random().toString(36).slice(2, 10), company: selected.name, companyId: selected.id, type: newPartnerType, urgency: "medium", description: newPartnerNote.trim(), due: newPartnerDate });
        map[match.id] = { ...ext, opportunities: opps };
        localStorage.setItem(LS_STRATEGIC, JSON.stringify(map));
      }
    } catch {}
    setNewPartnerName(""); setPartnerSearch(""); setSelectedPartnerId(null); setNewPartnerType("Introduction"); setNewPartnerNote(""); setNewPartnerDate(new Date().toISOString().slice(0, 10));
    setShowAddPartnership(false); setShowPartnerDropdown(false);
  }

  function deletePortcoPartnership(strategicId: string) {
    const updated = portcoPartnerships.filter(p => p.strategicId !== strategicId);
    setPortcoPartnerships(updated);
    try {
      const raw = localStorage.getItem("portco_strategic_map");
      const map = raw ? JSON.parse(raw) : {};
      if (selected && map[selected.name]) {
        map[selected.name] = map[selected.name].filter((e: { strategicId: string }) => e.strategicId !== strategicId);
        localStorage.setItem("portco_strategic_map", JSON.stringify(map));
      }
    } catch {}
  }

  function deleteManualPartnership(id: string) {
    if (!selected) return;
    const updated = manualPartnerships.filter(p => p.id !== id);
    setManualPartnerships(updated);
    try {
      const raw = localStorage.getItem("pipeline_manual_partnerships");
      const map = raw ? JSON.parse(raw) : {};
      map[selected.id] = updated;
      localStorage.setItem("pipeline_manual_partnerships", JSON.stringify(map));
    } catch {}
  }

  // ── Edit handlers ─────────────────────────────────────────────────────────
  function startEdit() {
    if (!selected) return;
    const types = selected.types?.length ? selected.types : (selected.type ? [selected.type] : []);
    setEditForm({ ...selected, types });
    setEditing(true);
  }

  function cancelEdit() {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setEditing(false);
    setEditForm({});
    setAutoSaving(false);
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

  // Auto-save (debounced, stays in edit mode)
  useEffect(() => {
    if (!editing || !selected) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    const snapshot = editForm;
    const companyId = selected.id;
    autoSaveTimerRef.current = setTimeout(async () => {
      if (Object.keys(snapshot).length === 0) return;
      setAutoSaving(true);
      const { data, error } = await supabase
        .from("companies")
        .update(snapshot)
        .eq("id", companyId)
        .select()
        .single();
      setAutoSaving(false);
      if (!error && data) {
        setCompanies(prev => prev.map(c => c.id === data.id ? data : c));
      }
    }, 1500);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editForm]);

  function setEF(key: keyof Company, val: unknown) {
    setEditForm(prev => ({ ...prev, [key]: val }));
  }

  function toggleSector(s: string) {
    const lower = s.toLowerCase();
    const curr = (editForm.sectors as string[] ?? []);
    setEF("sectors", curr.map(x => x.toLowerCase()).includes(lower) ? [] : [lower]);
  }

  function toggleType(t: string) {
    const curr = (editForm.types as string[] ?? []);
    const next = curr.includes(t) ? curr.filter(x => x !== t) : [...curr, t];
    setEF("types", next);
    if (next.length > 0) setEF("type", next[0] as CompanyType);
  }

  // ── Quick-save a single field on double-click blur ────────────────────────
  async function quickSave(key: keyof Company, val: unknown) {
    if (!selected) return;
    setEditField(null);
    const { data } = await supabase
      .from("companies")
      .update({ [key]: val })
      .eq("id", selected.id)
      .select()
      .single();
    if (data) setCompanies(prev => prev.map(c => c.id === data.id ? data : c));
  }

  // ── Link existing contact to company ─────────────────────────────────────
  function searchLinkContacts(query: string) {
    if (linkSearchTimer.current) clearTimeout(linkSearchTimer.current);
    setLinkContactSearch(query);
    if (!query.trim() || query.length < 2) { setLinkContactSuggestions([]); return; }
    linkSearchTimer.current = setTimeout(async () => {
      linkSearchAbort.current?.abort();
      linkSearchAbort.current = new AbortController();
      try {
        const res = await fetch(
          `/api/search/contacts?q=${encodeURIComponent(query.trim())}`,
          { signal: linkSearchAbort.current.signal }
        );
        if (!res.ok) return;
        const data = await res.json();
        setLinkContactSuggestions(data ?? []);
      } catch (e) {
        if ((e as Error).name !== "AbortError") console.error(e);
      }
    }, 250);
  }

  // Auto-suggest for the "New Contact" form — searches by name or email as user types
  function searchPanelContacts(query: string) {
    if (panelContactTimer.current) clearTimeout(panelContactTimer.current);
    if (!query.trim() || query.length < 2) {
      setPanelContactSugg([]);
      setShowPanelContactSugg(false);
      return;
    }
    panelContactTimer.current = setTimeout(async () => {
      panelContactAbort.current?.abort();
      panelContactAbort.current = new AbortController();
      try {
        const res = await fetch(
          `/api/search/contacts?q=${encodeURIComponent(query.trim())}`,
          { signal: panelContactAbort.current.signal }
        );
        if (!res.ok) return;
        const data = await res.json();
        // Exclude contacts already linked to this company
        const suggestions = ((data as Contact[]) ?? []).filter(c => c.company_id !== selected?.id);
        setPanelContactSugg(suggestions);
        setShowPanelContactSugg(suggestions.length > 0);
      } catch (e) {
        if ((e as Error).name !== "AbortError") console.error(e);
      }
    }, 200);
  }

  async function linkContactToCompany(contactId: string) {
    if (!selected) return;
    setLinkingContact(true);
    const { data, error } = await supabase
      .from("contacts")
      .update({ company_id: selected.id })
      .eq("id", contactId)
      .select()
      .single();
    if (error) { alert(error.message); }
    else if (data) {
      setContacts(prev => [...prev, data as Contact]);
      setShowLinkContactForm(false);
      setLinkContactSearch("");
      setLinkContactSuggestions([]);
    }
    setLinkingContact(false);
  }

  // ── Add event inline ──────────────────────────────────────────────────────
  async function handleAddNote() {
    if (!selected) return;
    setSavingNote(true);
    const { data: { user } } = await supabase.auth.getUser();
    const typeLabel = eventType.charAt(0).toUpperCase() + eventType.slice(1);
    await supabase.from("interactions").insert({
      company_id:        selected.id,
      type:              eventType,
      subject:           typeLabel,
      body:              noteText.trim() || null,
      date:              new Date(eventDate).toISOString(),
      sentiment:         "neutral",
      created_by:        user?.id,
      contact_ids:       noteContactIds.length > 0 ? noteContactIds : null,
      // Meetings logged here are considered resolved — they appear in Meetings page under "Resolved"
      resolution_status: eventType === "meeting" ? "resolved" : null,
    });
    // Update last_contact_date on the company and any tagged contacts
    const contactDateISO = new Date(eventDate).toISOString();
    await supabase.from("companies").update({ last_contact_date: contactDateISO }).eq("id", selected.id);
    if (noteContactIds.length > 0) {
      await supabase.from("contacts").update({ last_contact_date: contactDateISO }).in("id", noteContactIds);
      setContacts(prev => prev.map(c => noteContactIds.includes(c.id) ? { ...c, last_contact_date: contactDateISO } : c));
    }
    setNoteText("");
    setEventDate(new Date().toISOString().slice(0, 10));
    setEventType("call");
    setNoteContactIds([]);
    setNoteContactsOpen(false);
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
    if (!error && data) {
      // Optionally create the inline contact
      if (addModalContactOpen && addModalContact.first_name.trim()) {
        await supabase.from("contacts").insert({
          first_name: addModalContact.first_name.trim(),
          last_name:  addModalContact.last_name.trim() || null,
          email:      addModalContact.email.trim() || null,
          title:      addModalContact.title.trim() || null,
          company_id: data.id,
          type:       "other",
          status:     "active",
          is_primary_contact: true,
          created_by: user?.id ?? null,
        });
      }
      // Optionally upload pitch deck
      if (addDeckFile) {
        try {
          const safeName = addDeckFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const filePath = `${data.id}/${Date.now()}-${safeName}`;
          const { error: storageErr } = await supabase.storage
            .from("decks")
            .upload(filePath, addDeckFile, { contentType: addDeckFile.type || "application/octet-stream", upsert: true });
          if (!storageErr) {
            const { data: { publicUrl } } = supabase.storage.from("decks").getPublicUrl(filePath);
            await Promise.all([
              supabase.from("documents").insert({
                company_id:   data.id,
                name:         addDeckFile.name,
                type:         "deck",
                storage_path: filePath,
                mime_type:    addDeckFile.type || "application/octet-stream",
                file_size:    addDeckFile.size,
                uploaded_by:  user?.id ?? null,
              }),
              supabase.from("companies").update({ pitch_deck_url: publicUrl }).eq("id", data.id),
            ]);
          }
        } catch (deckErr) {
          console.error("[addCompany] deck upload failed:", deckErr);
        }
      }
      setCompanies(prev => [data, ...prev]);
      setSelectedId(data.id);
      setShowAddModal(false);
      setAddForm({ type: "startup", sectors: [] });
      setAddModalContactOpen(false);
      setAddModalContact({ first_name: "", last_name: "", email: "", title: "" });
      setAddDeckFile(null);
    } else {
      alert(error?.message ?? "Failed to add company");
    }
    setAddSaving(false);
  }

  // ── Contact search for add modal ─────────────────────────────────────────
  function searchContactSuggestions(query: string) {
    if (contactSearchTimer.current) clearTimeout(contactSearchTimer.current);
    if (!query.trim() || query.length < 2) {
      setContactSuggestions([]);
      setShowContactSugg(false);
      return;
    }
    contactSearchTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, email, title, location_city, location_country, company_id")
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(6);
      setContactSuggestions((data as Contact[]) ?? []);
      setShowContactSugg(((data as Contact[]) ?? []).length > 0);
    }, 250);
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

  // ── Pipeline Intelligence (Competitor / M&A) refresh ─────────────────────
  async function handlePipelineIntelRefresh(type: "competitor" | "ma_acquirer") {
    if (!selected) return;
    setRefreshingIntel(type);
    setIntelError(null);
    try {
      const res = await fetch("/api/portfolio/intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: selected.id, type }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setIntelError(data.error ?? "Failed to generate");
      } else {
        const { data: fresh } = await supabase
          .from("portfolio_intelligence" as "companies")
          .select("id, type, entity_name, description, fit_level")
          .eq("company_id", selected.id)
          .in("type", ["competitor", "ma_acquirer"])
          .order("fit_level");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setPipelineIntel((fresh ?? []) as any);
      }
    } catch (e) {
      setIntelError(e instanceof Error ? e.message : "Failed");
    } finally {
      setRefreshingIntel(null);
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

  async function fetchIntelligence() {
    if (!selected || loadingIntelligence) return;
    setLoadingIntelligence(true);
    setIntelligenceError(null);
    setIntelligence([]);
    try {
      // Step 1: Run Exa to pull fresh web signals for this company
      // (saves results to sourcing_signals so the intelligence route can use them)
      if (process.env.NEXT_PUBLIC_EXA_ENABLED !== "false") {
        setIntelligenceStatus("Searching Exa…");
        try {
          await fetch("/api/agents/exa-research", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ company_id: selected.id }),
          });
        } catch {
          // Non-fatal — intelligence will still run with whatever signals exist in DB
        }
      }

      // Step 2: Generate intelligence items using Claude
      // (enriched with the Exa signals we just saved)
      setIntelligenceStatus("Generating…");
      const res = await fetch(`/api/companies/${selected.id}/intelligence`, { method: "POST" });
      const data = await res.json() as { items?: IntelItem[]; error?: string };
      if (res.ok) {
        const items = data.items ?? [];
        setIntelligence(items);
        const cachedAt = new Date().toISOString();
        setIntelCachedAt(cachedAt);
        try { localStorage.setItem(`pipeline_intel_${selected.id}`, JSON.stringify({ items, cachedAt })); } catch {}
      } else {
        setIntelligenceError(data.error ?? `HTTP ${res.status}`);
      }
    } catch (err) {
      setIntelligenceError(err instanceof Error ? err.message : "Network error");
    } finally {
      setLoadingIntelligence(false);
      setIntelligenceStatus("Refresh");
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

  // ── Delete company ────────────────────────────────────────────────────────
  async function handleDeleteCompany() {
    if (!selected) return;
    setDeleting(true);
    await supabase.from("companies").delete().eq("id", selected.id);
    setCompanies(prev => prev.filter(c => c.id !== selected.id));
    setSelectedId(null);
    setConfirmDelete(false);
    setDeleting(false);
  }

  // ── Board drag-and-drop ───────────────────────────────────────────────────
  async function handleBoardDrop(targetStage: string) {
    if (!boardDragItem || !targetStage) return;
    const company = companies.find(c => c.id === boardDragItem);
    if (!company || company.deal_status === targetStage) { setBoardDragItem(null); return; }

    // Optimistic update
    setCompanies(prev => prev.map(c => c.id === boardDragItem ? { ...c, deal_status: targetStage as DealStatus } : c));

    const { error } = await supabase.from("companies").update({ deal_status: targetStage }).eq("id", boardDragItem);
    if (error) {
      // Revert on error
      setCompanies(prev => prev.map(c => c.id === boardDragItem ? { ...c, deal_status: company.deal_status } : c));
    }
    setBoardDragItem(null);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 overflow-hidden">

      {/* ═══════════════════════════════════════════════════════════════════════
          BOARD VIEW — Full-width Kanban
      ═══════════════════════════════════════════════════════════════════════ */}
      {pipelineView === "board" && (
        <>
          {/* Board toolbar (search + controls, same as list header) */}
          <div className="flex md:w-[300px] w-full flex-shrink-0 md:border-r border-b md:border-b-0 border-slate-200 bg-white flex-col">
            <div className="px-4 pt-4 pb-3 border-b border-slate-100 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-800">
                  Pipeline
                  <span className="ml-2 text-xs font-normal text-slate-400">{filtered.length}</span>
                </span>
                <div className="flex items-center gap-1.5">
                  <div className="hidden sm:flex rounded-md border border-slate-200 overflow-hidden">
                    <button
                      onClick={() => setPipelineView("list")}
                      className="px-2.5 py-1.5 text-xs font-medium transition-colors bg-white text-slate-500 hover:bg-slate-50"
                      title="List view"
                    >
                      <List size={13} />
                    </button>
                    <button
                      onClick={() => setPipelineView("board")}
                      className="px-2.5 py-1.5 border-l border-slate-200 text-xs font-medium transition-colors bg-slate-800 text-white"
                      title="Board view"
                    >
                      <LayoutGrid size={13} />
                    </button>
                  </div>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="w-7 h-7 flex items-center justify-center rounded-md bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                    title="Add company"
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="w-full pl-8 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Search…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
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
              {/* Filter pills: Type / Sector / Round */}
              {(() => {
                const allTypes = [...new Set(companies.flatMap(c => c.types ?? []))].filter(Boolean).sort();
                const allSectors = [...new Set(companies.flatMap(c => c.sectors ?? []))].filter(Boolean).sort();
                const allRounds = [...new Set(companies.map(c => c.stage).filter(Boolean) as string[])].sort();
                const hasAnyFilter = filterType || filterSector || filterRound;

                return (
                  <div className="space-y-1.5">
                    {allTypes.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {allTypes.slice(0, 5).map(t => (
                          <button key={t} onClick={() => setFilterType(filterType === t ? null : t)}
                            className={`text-[10px] px-2 py-0.5 rounded-full border font-medium transition-colors capitalize ${filterType === t ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-500 hover:border-blue-300"}`}>
                            {t}
                          </button>
                        ))}
                      </div>
                    )}
                    {allSectors.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {allSectors.slice(0, 6).map(s => (
                          <button key={s} onClick={() => setFilterSector(filterSector === s ? null : s)}
                            className={`text-[10px] px-2 py-0.5 rounded-full border font-medium transition-colors capitalize ${filterSector === s ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-slate-200 text-slate-500 hover:border-emerald-300"}`}>
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                    {allRounds.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {allRounds.slice(0, 6).map(r => (
                          <button key={r} onClick={() => setFilterRound(filterRound === r ? null : r)}
                            className={`text-[10px] px-2 py-0.5 rounded-full border font-medium transition-colors ${filterRound === r ? "bg-amber-500 border-amber-500 text-white" : "bg-white border-slate-200 text-slate-500 hover:border-amber-300"}`}>
                            {r}
                          </button>
                        ))}
                      </div>
                    )}
                    {hasAnyFilter && (
                      <button onClick={() => { setFilterType(null); setFilterSector(null); setFilterRound(null); }}
                        className="text-[10px] text-slate-400 hover:text-red-500 underline">
                        Clear filters
                      </button>
                    )}
                  </div>
                );
              })()}
            </div>
            {/* Hidden in board view — just takes up the sidebar space for layout consistency */}
            <div className="flex-1" />
          </div>

          {/* Board columns */}
          <div className="flex-1 overflow-x-auto flex gap-3 p-4 h-full bg-slate-50">
            {BOARD_STAGES.map(stageKey => {
              const stageCompanies = filtered.filter(c => (c.deal_status ?? "identified_introduced") === stageKey);
              const isDragTarget = boardDragOver === stageKey;
              return (
                <div
                  key={stageKey}
                  className={`flex-shrink-0 w-64 flex flex-col rounded-xl border transition-colors ${isDragTarget ? "bg-blue-50 border-blue-300" : "bg-white border-slate-200"}`}
                  onDragOver={e => { e.preventDefault(); setBoardDragOver(stageKey); }}
                  onDragLeave={() => setBoardDragOver(null)}
                  onDrop={e => { e.preventDefault(); handleBoardDrop(stageKey); setBoardDragOver(null); }}
                >
                  {/* Column header */}
                  <div className="px-3 py-2.5 border-b border-slate-200 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${STAGE_DOT[stageKey] ?? "bg-slate-400"}`} />
                      <span className="text-xs font-semibold text-slate-700">{STATUS_LABELS[stageKey]}</span>
                    </div>
                    <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-1.5 py-0.5 font-medium">
                      {stageCompanies.length}
                    </span>
                  </div>
                  {/* Cards */}
                  <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
                    {stageCompanies.map(company => (
                      <div
                        key={company.id}
                        draggable
                        onDragStart={() => setBoardDragItem(company.id)}
                        onDragEnd={() => setBoardDragItem(null)}
                        onClick={() => setSelectedId(company.id)}
                        className={`bg-white rounded-lg border p-2.5 cursor-pointer hover:shadow-sm transition-all select-none
                          ${selectedId === company.id ? "border-blue-400 shadow-sm ring-1 ring-blue-100" : "border-slate-200 hover:border-slate-300"}
                          ${boardDragItem === company.id ? "opacity-50" : ""}`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <CompanyLogo company={company} size="sm" />
                          <span className="text-xs font-semibold text-slate-800 leading-tight line-clamp-2">{company.name}</span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {company.stage && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-medium">{company.stage}</span>
                          )}
                          {(company.sectors ?? []).slice(0, 1).map(s => (
                            <span key={s} className={`text-[10px] px-1.5 py-0.5 rounded font-medium capitalize ${SECTOR_COLORS[s.toLowerCase()] ?? "bg-slate-100 text-slate-600"}`}>{s}</span>
                          ))}
                        </div>
                      </div>
                    ))}
                    {stageCompanies.length === 0 && (
                      <div className={`flex-1 flex items-center justify-center py-6 ${isDragTarget ? "opacity-100" : "opacity-0"}`}>
                        <p className="text-xs text-blue-400 font-medium">Drop here</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          LEFT PANEL — Company List
      ═══════════════════════════════════════════════════════════════════════ */}
      {pipelineView === "list" && <div className={`flex flex-col bg-white border-slate-200 ${selectedId ? "hidden md:flex w-[300px] flex-shrink-0 border-r" : "flex-1 md:flex md:w-[300px] md:flex-shrink-0 md:border-r"}`}>

        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-slate-100 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-800">
              Pipeline
              <span className="ml-2 text-xs font-normal text-slate-400">{filtered.length}</span>
            </span>
            <div className="flex items-center gap-1.5">
              {/* View toggle */}
              <div className="hidden sm:flex rounded-md border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setPipelineView("list")}
                  className="px-2.5 py-1.5 text-xs font-medium transition-colors bg-slate-800 text-white"
                  title="List view"
                >
                  <List size={13} />
                </button>
                <button
                  onClick={() => setPipelineView("board")}
                  className="px-2.5 py-1.5 border-l border-slate-200 text-xs font-medium transition-colors bg-white text-slate-500 hover:bg-slate-50"
                  title="Board view"
                >
                  <LayoutGrid size={13} />
                </button>
              </div>
              <button
                onClick={() => setShowAddModal(true)}
                className="w-7 h-7 flex items-center justify-center rounded-md bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                title="Add company"
              >
                <Plus size={14} />
              </button>
            </div>
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
          {/* Filter pills: Type / Sector / Round */}
          {(() => {
            const allTypes = [...new Set(companies.flatMap(c => c.types ?? []))].filter(Boolean).sort();
            const allSectors = [...new Set(companies.flatMap(c => c.sectors ?? []))].filter(Boolean).sort();
            const allRounds = [...new Set(companies.map(c => c.stage).filter(Boolean) as string[])].sort();
            const hasAnyFilter = filterType || filterSector || filterRound;

            return (
              <div className="space-y-1.5">
                {allTypes.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {allTypes.slice(0, 5).map(t => (
                      <button key={t} onClick={() => setFilterType(filterType === t ? null : t)}
                        className={`text-[10px] px-2 py-0.5 rounded-full border font-medium transition-colors capitalize ${filterType === t ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-200 text-slate-500 hover:border-blue-300"}`}>
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                {allSectors.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {allSectors.slice(0, 6).map(s => (
                      <button key={s} onClick={() => setFilterSector(filterSector === s ? null : s)}
                        className={`text-[10px] px-2 py-0.5 rounded-full border font-medium transition-colors capitalize ${filterSector === s ? "bg-emerald-600 border-emerald-600 text-white" : "bg-white border-slate-200 text-slate-500 hover:border-emerald-300"}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                {allRounds.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {allRounds.slice(0, 6).map(r => (
                      <button key={r} onClick={() => setFilterRound(filterRound === r ? null : r)}
                        className={`text-[10px] px-2 py-0.5 rounded-full border font-medium transition-colors ${filterRound === r ? "bg-amber-500 border-amber-500 text-white" : "bg-white border-slate-200 text-slate-500 hover:border-amber-300"}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                )}
                {hasAnyFilter && (
                  <button onClick={() => { setFilterType(null); setFilterSector(null); setFilterRound(null); }}
                    className="text-[10px] text-slate-400 hover:text-red-500 underline">
                    Clear filters
                  </button>
                )}
              </div>
            );
          })()}
        </div>

        {/* Company list — virtualized for performance with 200+ companies */}
        <div ref={listParentRef} className="flex-1 overflow-y-auto" style={{ height: "100%" }}>
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-slate-400 text-sm">
              {search ? `No results for "${search}"` : "No startups yet"}
            </div>
          ) : (
            <div style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}>
              {rowVirtualizer.getVirtualItems().map(virtualItem => {
                const c = filtered[virtualItem.index];
                if (!c) return null;
                const isActive = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    data-index={virtualItem.index}
                    ref={rowVirtualizer.measureElement}
                    onClick={() => { setSelectedId(c.id); setEditing(false); setConfirmDelete(false); }}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${virtualItem.start}px)` }}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 text-left border-b border-slate-100 hover:bg-slate-50 transition-colors relative border-l-2",
                      STAGE_BORDER[c.deal_status ?? ""] ?? "border-l-slate-200",
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
                      <p className={cn("text-xs font-semibold truncate", isActive ? "text-blue-700" : "text-slate-800")}>
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
              })}
            </div>
          )}
        </div>
      </div>}

      {/* ═══════════════════════════════════════════════════════════════════════
          RIGHT PANEL — Company Detail  (list view: flex-1 / board view: fixed 520px)
      ═══════════════════════════════════════════════════════════════════════ */}
      {pipelineView === "list" && !selected ? (
        <div className="hidden md:flex flex-1 items-center justify-center bg-slate-50">
          <div className="text-center text-slate-400">
            <Building2 size={40} className="mx-auto mb-3 opacity-30" />
            <p className="text-xs">Select a company to view details</p>
          </div>
        </div>
      ) : selected ? (
        <div ref={rightPanelRef} className={pipelineView === "board" ? "w-full md:w-[680px] flex-shrink-0 border-l border-slate-200 overflow-y-auto bg-white" : "fixed md:relative inset-0 md:inset-auto md:flex-1 overflow-y-auto bg-white z-30"}>

          {/* ── Company Header ── */}
          <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 md:px-8 py-3 md:py-4 flex flex-col gap-1.5">
            {/* Row 1: logo + name */}
            <div className="flex items-center gap-4">
              <button
                className="md:hidden flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 mr-3 flex-shrink-0"
                onClick={() => setSelectedId(null)}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 12L6 8l4-4" />
                </svg>
                Back
              </button>
              <CompanyLogo company={selected} />
              <h1 className="text-base font-bold text-slate-900">{selected.name}</h1>
            </div>
            {/* Row 2: badges left + action buttons right */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5">

                {/* ── Priority badge ── */}
                <div className="relative inline-flex items-center" onMouseDown={e => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}>
                  <button
                    onClick={() => { setShowPriorityPicker(p => !p); setShowStagePicker(false); setShowStatusPicker(false); }}
                    className={cn(
                      "inline-flex items-center h-5 px-2.5 rounded-full text-xs font-medium leading-none transition-colors",
                      selected.priority ? PRIORITY_COLORS[selected.priority] : "bg-slate-100 text-slate-400"
                    )}
                  >
                    {selected.priority ? `${selected.priority} Priority` : "Set Priority"}
                  </button>
                  {showPriorityPicker && (
                    <div className="absolute left-0 top-6 z-30 bg-white border border-slate-200 rounded-xl shadow-lg py-1 min-w-[140px]">
                      {(["High", "Medium", "Low"] as const).map(p => (
                        <button
                          key={p}
                          onClick={async () => {
                            await supabase.from("companies").update({ priority: p }).eq("id", selected.id);
                            setCompanies(prev => prev.map(c => c.id === selected.id ? { ...c, priority: p } : c));
                            setShowPriorityPicker(false);
                          }}
                          className={cn(
                            "w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors flex items-center gap-2",
                            selected.priority === p ? "font-medium" : "text-slate-700"
                          )}
                        >
                          <span className={cn("w-2 h-2 rounded-full", p === "High" ? "bg-emerald-400" : p === "Medium" ? "bg-orange-400" : "bg-slate-300")} />
                          {p}
                        </button>
                      ))}
                      {selected.priority && (
                        <button
                          onClick={async () => {
                            await supabase.from("companies").update({ priority: null }).eq("id", selected.id);
                            setCompanies(prev => prev.map(c => c.id === selected.id ? { ...c, priority: null } : c));
                            setShowPriorityPicker(false);
                          }}
                          className="w-full text-left px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-50 border-t border-slate-100 mt-1 transition-colors"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Stage badge ── */}
                <div className="relative inline-flex items-center" onMouseDown={e => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}>
                  <button
                    onClick={() => { setShowStagePicker(p => !p); setShowPriorityPicker(false); setShowStatusPicker(false); }}
                    className="inline-flex items-center h-5 px-2.5 rounded-full text-xs font-medium leading-none bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors capitalize"
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
                <div className="relative inline-flex items-center" onMouseDown={e => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}>
                  <button
                    onClick={() => { setShowStatusPicker(p => !p); setShowPriorityPicker(false); setShowStagePicker(false); }}
                    className={cn("inline-flex items-center h-5 px-2.5 rounded-full text-xs font-medium leading-none transition-colors hover:opacity-80",
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
              <div className="flex items-center gap-2 flex-shrink-0">
                {selected.website && (
                  <a
                    href={selected.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hidden md:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    Go to Website <ExternalLink size={12} />
                  </a>
                )}

                {/* ── Logo button — desktop only ── */}
                <div className="hidden md:block relative">
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
                      {logoMsg && <p className="text-xs text-slate-500">{logoMsg}</p>}
                      <button onClick={() => setShowLogoPicker(false)} className="text-xs text-slate-400 hover:text-slate-600 w-full text-center">Cancel</button>
                    </div>
                  )}
                </div>

                {/* ── Delete button ── */}
                {!editing && (
                  confirmDelete ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-red-500">Delete this company?</span>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50"
                      >No</button>
                      <button
                        onClick={handleDeleteCompany}
                        disabled={deleting}
                        className="px-2.5 py-1.5 text-xs bg-red-500 hover:bg-red-600 text-white rounded-lg disabled:opacity-50 flex items-center gap-1"
                      >
                        {deleting ? <><Loader2 size={11} className="animate-spin" /> Deleting…</> : "Yes, delete"}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-red-200 rounded-lg text-red-400 hover:bg-red-50 hover:border-red-300 transition-colors"
                    >
                      <X size={12} /> Delete
                    </button>
                  )
                )}

                {editing ? (
                  <div className="flex items-center gap-2">
                    {autoSaving && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <Loader2 size={10} className="animate-spin" /> Saving…
                      </span>
                    )}
                    <button onClick={cancelEdit} className="flex items-center gap-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50">
                      <X size={12} /> Done
                    </button>
                  </div>
                ) : (
                  <button onClick={startEdit} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
                    <Pencil size={12} /> Edit
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="px-4 md:px-8 py-4 md:py-6 space-y-8">

            {/* ── Overview Fields ── */}
            <section>
              <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-4">Overview</h2>
              <div className="grid grid-cols-3 md:grid-cols-5 gap-x-6 gap-y-5">

                {/* Mobile row 1: Website · Type · Status  |  Desktop row 1: Website · Type · Sector · Sub-sector · Last Contact */}
                <div className="order-1">
                <Field label="Website">
                  {editing ? (
                    <input className="input text-xs" value={editForm.website ?? ""} onChange={e => setEF("website", e.target.value)} placeholder="https://…" />
                  ) : editField === "website" ? (
                    <input
                      autoFocus
                      className="w-full text-xs border border-blue-300 rounded px-1.5 py-1 outline-none focus:ring-1 focus:ring-blue-400"
                      defaultValue={selected.website ?? ""}
                      onBlur={e => quickSave("website", e.target.value.trim() || null)}
                      onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditField(null); }}
                    />
                  ) : (
                    <div onDoubleClick={() => setEditField("website")} title="Double-click to edit" className="cursor-text">
                      {selected.website
                        ? <a href={selected.website} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1 truncate">
                            <Link2 size={12} className="flex-shrink-0" />{selected.website.replace(/^https?:\/\//, "")}
                          </a>
                        : <span className="text-xs text-slate-300 italic">double-click to add</span>}
                    </div>
                  )}
                </Field>
                </div>

                <div className="order-2">
                <Field label="Type">
                  {editing ? (
                    <>
                      {/* Mobile: single select dropdown */}
                      <select
                        className="md:hidden select text-xs w-full mt-0.5"
                        value={(editForm.types as string[] ?? [])[0] ?? ""}
                        onChange={e => setEF("types", e.target.value ? [e.target.value] : [])}
                      >
                        <option value="">— select type —</option>
                        {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      {/* Desktop: toggle pills */}
                      <div className="hidden md:flex flex-wrap gap-1.5 mt-0.5">
                        {TYPE_OPTIONS.map(o => {
                          const active = (editForm.types as string[] ?? []).includes(o.value);
                          return (
                            <button key={o.value} type="button" onClick={() => toggleType(o.value)}
                              className={cn("px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                                active ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600"
                              )}>
                              {o.label}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 mt-0.5">
                      {TYPE_OPTIONS.map(o => {
                        const viewTypes = (selected.types ?? []).length > 0
                          ? (selected.types ?? [])
                          : (selected.type ? [selected.type] : []);
                        const active = viewTypes.includes(o.value);
                        return active ? (
                          <span key={o.value} className="px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">{o.label}</span>
                        ) : null;
                      })}
                      {!(selected.types ?? []).length && !selected.type && <span className="text-xs text-slate-300">—</span>}
                    </div>
                  )}
                </Field>
                </div>

                {/* order-3 on mobile (Status), order-7 on desktop */}
                <div className="order-3 md:order-7">
                <Field label="Status">
                  {editing ? (
                    <select className="select text-xs" value={editForm.deal_status ?? ""} onChange={e => setEF("deal_status", e.target.value as DealStatus || null)}>
                      <option value="">Not set</option>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  ) : editField === "deal_status" ? (
                    <select
                      autoFocus
                      className="w-full text-xs border border-blue-300 rounded px-1.5 py-1 outline-none focus:ring-1 focus:ring-blue-400"
                      defaultValue={selected.deal_status ?? ""}
                      onBlur={e => quickSave("deal_status", (e.target.value as DealStatus) || null)}
                      onChange={e => quickSave("deal_status", (e.target.value as DealStatus) || null)}
                    >
                      <option value="">Not set</option>
                      {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  ) : (
                    <div onDoubleClick={() => setEditField("deal_status")} title="Double-click to edit" className="cursor-pointer">
                      {selected.deal_status
                        ? <span className={cn("inline-block text-xs px-2 py-1 rounded-md font-medium", STATUS_COLORS[selected.deal_status])}>{STATUS_LABELS[selected.deal_status]}</span>
                        : <span className="text-xs text-slate-300 italic">double-click to set</span>}
                    </div>
                  )}
                </Field>
                </div>

                {/* Mobile row 2: Sector · Sub-sector · Inv Round  |  Desktop row 1 cont. */}
                <div className="order-4 md:order-3">
                <Field label="Sector">
                  {editField === "sectors" ? (
                    <SectorQuickEdit
                      current={selected.sectors ?? []}
                      onSave={async (vals) => { await quickSave("sectors", vals); }}
                      onCancel={() => setEditField(null)}
                    />
                  ) : editing ? (
                    <>
                      {/* Mobile: single select dropdown */}
                      <select
                        className="md:hidden select text-xs w-full mt-0.5"
                        value={(editForm.sectors as string[] ?? [])[0] ?? ""}
                        onChange={e => setEF("sectors", e.target.value ? [e.target.value] : [])}
                      >
                        <option value="">— select sector —</option>
                        {SECTOR_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                      {/* Desktop: toggle pills */}
                      <div className="hidden md:flex flex-wrap gap-1.5 mt-0.5 cursor-text min-h-[28px] items-center">
                        {SECTOR_OPTIONS.map(s => {
                          const lower = s.toLowerCase();
                          const active = (editForm.sectors as string[] ?? []).map(s => s.toLowerCase()).includes(lower);
                          return (
                            <button key={s} type="button" onClick={() => toggleSector(s)}
                              className={cn("px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                                active ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600"
                              )}>
                              {s}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <div
                      className="flex flex-wrap gap-1.5 mt-0.5 cursor-text min-h-[28px] items-center"
                      onDoubleClick={() => setEditField("sectors")}
                      title="Double-click to edit"
                    >
                      {SECTOR_OPTIONS.map(s => {
                        const lower = s.toLowerCase();
                        const active = (selected.sectors ?? []).map(s => s.toLowerCase()).includes(lower);
                        return active ? (
                          <span key={s} className="px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">{s}</span>
                        ) : null;
                      })}
                      {!(selected.sectors ?? []).length && (
                        <span className="text-xs text-slate-400 border border-dashed border-slate-300 rounded-full px-2.5 py-1 hover:border-indigo-400 hover:text-indigo-500 transition-colors">
                          + double-click to set
                        </span>
                      )}
                    </div>
                  )}
                </Field>
                </div>

                <div className="order-5 md:order-4">
                <Field label="Sub-sector">
                  {editing ? (
                    <select className="select text-xs" value={editForm.sub_type ?? ""} onChange={e => setEF("sub_type", e.target.value || null)}>
                      <option value="">Select sub-sector</option>
                      {SUB_SECTOR_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : editField === "sub_type" ? (
                    <select
                      autoFocus
                      className="w-full text-xs border border-blue-300 rounded px-1.5 py-1 outline-none focus:ring-1 focus:ring-blue-400"
                      defaultValue={selected.sub_type ?? ""}
                      onBlur={e => quickSave("sub_type", e.target.value || null)}
                      onChange={e => quickSave("sub_type", e.target.value || null)}
                    >
                      <option value="">— None —</option>
                      {SUB_SECTOR_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 mt-0.5 min-h-[28px] items-center cursor-text" onDoubleClick={() => setEditField("sub_type")} title="Double-click to edit">
                      {selected.sub_type
                        ? <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">{selected.sub_type}</span>
                        : <span className="text-xs text-slate-400 border border-dashed border-slate-300 rounded-full px-2.5 py-1 hover:border-purple-400 hover:text-purple-500 transition-colors">+ double-click to set</span>
                      }
                    </div>
                  )}
                </Field>
                </div>

                {/* order-6 on mobile, order-6 on desktop */}
                <div className="order-6">
                <Field label="Investment Round">
                  {editing ? (
                    <select className="select text-xs" value={editForm.stage ?? ""} onChange={e => setEF("stage", e.target.value || null)}>
                      <option value="">Not set</option>
                      {STAGE_OPTIONS.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                    </select>
                  ) : editField === "stage" ? (
                    <select
                      autoFocus
                      className="w-full text-xs border border-blue-300 rounded px-1.5 py-1 outline-none focus:ring-1 focus:ring-blue-400"
                      defaultValue={selected.stage ?? ""}
                      onBlur={e => quickSave("stage", e.target.value || null)}
                      onChange={e => quickSave("stage", e.target.value || null)}
                    >
                      <option value="">Not set</option>
                      {STAGE_OPTIONS.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                    </select>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 mt-0.5 min-h-[28px] items-center cursor-text" onDoubleClick={() => setEditField("stage")} title="Double-click to edit">
                      {selected.stage
                        ? <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200">{selected.stage.replace("_", " ")}</span>
                        : <span className="text-xs text-slate-400 border border-dashed border-slate-300 rounded-full px-2.5 py-1 hover:border-sky-400 hover:text-sky-500 transition-colors">+ double-click to set</span>
                      }
                    </div>
                  )}
                </Field>
                </div>

                {/* Mobile row 3: Last Contact · Location  |  Desktop row 1 position 5 */}
                <div className="order-7 md:order-5">
                <Field label="Last Contact">
                  <span className="text-xs text-slate-700 flex items-center gap-1">
                    <Calendar size={12} className="text-slate-400" />
                    {formatDate(selected.last_contact_date)}
                  </span>
                </Field>
                </div>

                <div className="order-8 md:order-8">
                <Field label="Location">
                  {editing ? (
                    <div className="flex gap-2">
                      <input className="input text-xs flex-1" value={editForm.location_city ?? ""} onChange={e => setEF("location_city", e.target.value || null)} placeholder="City" />
                      <input className="input text-xs flex-1" value={editForm.location_country ?? ""} onChange={e => setEF("location_country", e.target.value || null)} placeholder="Country" />
                    </div>
                  ) : editField === "location" ? (
                    <div
                      className="flex gap-1"
                      onBlur={e => {
                        // Only save when focus moves completely outside this container
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          const inputs = e.currentTarget.querySelectorAll("input");
                          const city = (inputs[0] as HTMLInputElement)?.value.trim() || null;
                          const country = (inputs[1] as HTMLInputElement)?.value.trim() || null;
                          quickSave("location_city", city);
                          quickSave("location_country", country);
                        }
                      }}
                    >
                      <input
                        autoFocus
                        className="w-1/2 text-xs border border-blue-300 rounded px-1.5 py-1 outline-none focus:ring-1 focus:ring-blue-400"
                        defaultValue={selected?.location_city ?? ""}
                        placeholder="City"
                        onKeyDown={e => { if (e.key === "Escape") setEditField(null); }}
                      />
                      <input
                        className="w-1/2 text-xs border border-blue-300 rounded px-1.5 py-1 outline-none focus:ring-1 focus:ring-blue-400"
                        defaultValue={selected?.location_country ?? ""}
                        placeholder="Country"
                        onKeyDown={e => { if (e.key === "Escape") setEditField(null); }}
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-slate-700 flex items-center gap-1 cursor-text" onDoubleClick={() => setEditField("location")} title="Double-click to edit">
                      <MapPin size={12} className="text-slate-400 flex-shrink-0" />
                      {[selected.location_city, selected.location_country].filter(Boolean).join(", ") || <span className="text-slate-300 italic">double-click to set</span>}
                    </span>
                  )}
                </Field>
                </div>

                {/* Keywords — desktop only (2-col span) */}
                <div className="hidden md:block md:col-span-2 order-9">
                  <Field label="Keywords">
                    {editing ? (
                      <div className="min-h-[28px]">
                        <KeywordEditor
                          tags={(editForm.tags as string[]) ?? []}
                          onChange={tags => setEF("tags", tags)}
                          readOnly={false}
                        />
                      </div>
                    ) : editField === "tags" ? (
                      <div className="min-h-[28px]">
                        <KeywordEditor
                          tags={editTagsValue}
                          onChange={async (tags) => {
                            setEditTagsValue(tags);
                            await quickSave("tags", tags);
                          }}
                          readOnly={false}
                        />
                        <button
                          type="button"
                          onClick={() => { quickSave("tags", editTagsValue); setEditField(null); }}
                          className="mt-1.5 text-[10px] px-2.5 py-0.5 bg-blue-600 text-white rounded-full hover:bg-blue-700"
                        >Done</button>
                      </div>
                    ) : (
                      <div
                        className="min-h-[28px] cursor-text"
                        onDoubleClick={() => { setEditTagsValue((selected.tags as string[]) ?? []); setEditField("tags"); }}
                        title="Double-click to edit"
                      >
                        <KeywordEditor
                          tags={(selected.tags as string[]) ?? []}
                          onChange={() => {}}
                          readOnly={true}
                        />
                      </div>
                    )}
                  </Field>
                </div>

              </div>
            </section>

            {/* ── Description — Claude-generated, read-only ── */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Company Description</h2>
                <button
                  onClick={handleGenerateDesc}
                  disabled={generatingDesc}
                  className="text-xs px-2.5 py-1 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1"
                  title="Generate description with Claude"
                >
                  {generatingDesc ? <><Loader2 size={10} className="animate-spin" /> Generating…</> : <><Sparkles size={10} /> Generate with Claude</>}
                </button>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                {selected.description ?? <span className="text-slate-300 italic">No description yet — click Generate with Claude.</span>}
              </p>
            </section>

            {/* ── Row A: Contacts | Interaction Timeline ── */}
            <div className={pipelineView === "board" ? "flex flex-col gap-y-8" : "grid grid-cols-1 md:grid-cols-2 gap-6"}>

              {/* Section: Contacts */}
              <section>
              {/* Header: Contacts */}
              <div className="h-9 flex items-center justify-between mb-3">
                <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Contacts</h2>
                <button
                  onClick={() => { setContactPanelMode("manage"); if (contacts.length > 0) { setContactPanel(contacts[0]); } else { setContactPanel({ id: "__manage__", first_name: "", last_name: "", email: null, phone: null, linkedin_url: null, title: null, company_id: selected?.id ?? null, type: "other", relationship_strength: null, is_primary_contact: false, last_contact_date: null, location_city: null, location_country: null, notes: null, tags: null, emails: null, status: "active", created_by: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } as Contact); } setContactEditing(false); setConfirmRemove(false); setShowAddContactForm(false); }}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  Manage <ChevronRight size={12} />
                </button>
              </div>

              {/* Content: Contacts list — sorted by last contact date desc */}
              <div className="h-[150px] overflow-y-auto space-y-2 pr-1 bg-slate-50 rounded-xl p-3">
                {loadingDetail ? (
                  <div className="h-12 bg-slate-50 rounded-lg animate-pulse" />
                ) : contacts.length === 0 ? (
                  <div className="text-xs text-slate-300 italic pt-2">No contacts linked yet</div>
                ) : [...contacts]
                    .sort((a, b) => {
                      // Primary sort: last_contact_date desc (null → bottom)
                      if (!a.last_contact_date && !b.last_contact_date) return 0;
                      if (!a.last_contact_date) return 1;
                      if (!b.last_contact_date) return -1;
                      return new Date(b.last_contact_date).getTime() - new Date(a.last_contact_date).getTime();
                    })
                    .map((c, idx, arr) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={() => { contactDragIdx.current = idx; }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => {
                      if (contactDragIdx.current === null || contactDragIdx.current === idx) return;
                      const order = arr.map(x => x.id);
                      const [moved] = order.splice(contactDragIdx.current, 1);
                      order.splice(idx, 0, moved);
                      setContactOrder(order);
                      contactDragIdx.current = null;
                    }}
                    className="cursor-grab active:cursor-grabbing"
                  >
                  <button
                    onClick={async () => {
                      setContactPanel(c); setContactPanelMode("detail"); setContactEditing(false); setConfirmRemove(false);
                      const { data } = await supabase.from("interactions").select("type, date").contains("contact_ids", [c.id]).order("date", { ascending: false });
                      setContactInteractions(data ?? []);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg hover:bg-blue-50 transition-colors text-left h-[60px] overflow-hidden"
                  >
                    <div className="w-7 h-7 rounded-full bg-violet-100 hidden md:flex items-center justify-center flex-shrink-0">
                      <User size={12} className="text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Row 1: Name */}
                      <div className="flex items-center gap-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">{c.first_name} {c.last_name}</p>
                        {c.is_primary_contact && <span className="text-[10px] text-blue-600 bg-blue-50 px-1 rounded flex-shrink-0">★</span>}
                      </div>
                      {/* Row 2: Title · Location · Last contact */}
                      <p className="text-[11px] text-slate-400 truncate mt-0.5">
                        {[
                          c.title ?? c.type ?? null,
                          [c.location_city, c.location_country].filter(Boolean).join(", ") || null,
                          c.last_contact_date ? formatDate(c.last_contact_date) : null,
                        ].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <div className="flex gap-1.5 text-slate-400 flex-shrink-0" onClick={e => e.stopPropagation()}>
                      {c.email && <a href={`mailto:${c.email}`} className="hover:text-blue-600"><Mail size={12} /></a>}
                      {c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600"><ExternalLink size={12} /></a>}
                    </div>
                  </button>
                  </div>
                ))}
              </div>
              </section>

              {/* Section: Interaction Timeline */}
              <section>
              {/* Header: Interaction Timeline */}
              <div className="h-9 flex items-center justify-between mb-3">
                <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Interaction Timeline</h2>
                <button
                  onClick={() => setAddingNote(p => !p)}
                  className="text-xs px-2.5 py-1 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 flex items-center gap-1"
                >
                  <Plus size={11} /> Add Event
                </button>
              </div>

              {/* Add event form — sits above the fixed-height scroll box */}
              {addingNote && (
                <div ref={addEventFormRef} className="mb-3 p-3 border border-blue-200 rounded-xl bg-blue-50 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Date</label>
                      <input
                        type="date"
                        className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                        value={eventDate}
                        onChange={e => setEventDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Type</label>
                      <select
                        className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                        value={eventType}
                        onChange={e => setEventType(e.target.value as "call" | "meeting" | "email")}
                      >
                        <option value="call">Call</option>
                        <option value="meeting">Meeting</option>
                        <option value="email">Email</option>
                      </select>
                    </div>
                  </div>
                  <textarea
                    className="w-full text-sm border border-slate-200 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                    rows={2}
                    placeholder="Notes (optional)…"
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                  />
                  {/* Tag contacts — always visible */}
                  <div>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Tag Contacts</p>
                    {contacts.length === 0 ? (
                      <p className="text-[11px] text-slate-300 italic">No contacts linked to this company yet</p>
                    ) : (
                      <div className="max-h-[120px] overflow-y-auto border border-slate-200 rounded-lg bg-white p-2 space-y-1">
                        {contacts.map(c => (
                          <label key={c.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 px-1 py-0.5 rounded">
                            <input
                              type="checkbox"
                              checked={noteContactIds.includes(c.id)}
                              onChange={e => setNoteContactIds(prev =>
                                e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id)
                              )}
                              className="w-3 h-3 accent-blue-600"
                            />
                            <span className="text-xs text-slate-700">{c.first_name} {c.last_name}</span>
                            {c.title && <span className="text-[10px] text-slate-400 truncate">· {c.title}</span>}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => { setAddingNote(false); setNoteText(""); setNoteContactIds([]); setNoteContactsOpen(false); }} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-100">Cancel</button>
                    <button onClick={handleAddNote} disabled={savingNote} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 flex items-center gap-1">
                      {savingNote ? <><Loader2 size={10} className="animate-spin" /> Saving…</> : <><Check size={10} /> Save</>}
                    </button>
                  </div>
                </div>
              )}

              {/* Fixed-height scrollable box — identical to Contacts */}
              <div className="h-[150px] overflow-y-auto bg-slate-50 rounded-xl p-3 relative">
              {loadingDetail ? (
                <div className="space-y-3">
                  {[1,2,3].map(i => <div key={i} className="h-14 bg-white rounded-xl animate-pulse" />)}
                </div>
              ) : (() => {
                // Merge interactions + document uploads into a single timeline
                type TEvent = { id: string; kind: string; title: string; body?: string | null; date: string; url?: string | null; meta?: string | null; contact_ids?: string[] | null; meeting_type?: string | null };
                const events: TEvent[] = [
                  ...interactions.filter(i => i.type === "meeting").map(i => ({
                    id: i.id,
                    kind: i.type,
                    title: i.subject ?? "Meeting",
                    body: i.body ?? i.summary ?? null,
                    date: i.date,
                    url: i.transcript_url ?? null,
                    meta: i.sentiment ?? null,
                    contact_ids: (i as { contact_ids?: string[] }).contact_ids ?? null,
                    meeting_type: i.meeting_type ?? null,
                  })),
                ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                if (events.length === 0) return (
                  <div className="text-center py-8 border-2 border-dashed border-slate-200 rounded-xl">
                    <Calendar size={24} className="mx-auto mb-2 text-slate-300" />
                    <p className="text-sm text-slate-400 mb-1">No activity yet</p>
                    <p className="text-xs text-slate-300">Connect Fireflies to auto-populate meeting transcripts here</p>
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
                  <>
                    {/* Vertical line — hidden on mobile, visible on desktop */}
                    <div className="absolute left-[27px] top-2 bottom-2 w-px bg-slate-200 hidden md:block" />
                    <div className="space-y-3">
                      {events.map(ev => (
                        <div key={ev.id} className="flex gap-3">
                          {/* Dot on timeline — hidden on mobile */}
                          <div className={cn("w-8 h-8 rounded-full border hidden md:flex items-center justify-center flex-shrink-0 bg-white z-10", kindColor[ev.kind] ?? "bg-slate-50 border-slate-200")}>
                            {kindIcon[ev.kind] ?? <FileText size={13} className="text-slate-400" />}
                          </div>
                          {/* Card — fixed height to match Contact tiles */}
                          <div
                            className={cn(
                              "flex-1 border rounded-xl px-3 py-2 min-w-0 cursor-pointer transition-colors hover:ring-1 hover:ring-slate-300 h-[60px] overflow-hidden",
                              kindColor[ev.kind] ?? "bg-slate-50 border-slate-200",
                              ev.kind === "meeting" && "hover:bg-indigo-50 hover:border-indigo-200"
                            )}
                            onClick={() => {
                              if (ev.kind === "meeting") {
                                const full = interactions.find(i => i.id === ev.id) ?? null;
                                setSelectedTimelineMeeting(full);
                              } else {
                                setExpandedEventId(prev => prev === ev.id ? null : ev.id);
                              }
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{kindLabel[ev.kind] ?? ev.kind}</span>
                                  {ev.kind === "meeting" && ev.meeting_type && (
                                    <PipelineMeetingTypeBadge type={ev.meeting_type} />
                                  )}
                                  <span className="text-xs font-medium text-slate-700 truncate">{ev.title}</span>
                                </div>
                                {ev.body && <p className={cn("text-xs text-slate-500 mt-1 leading-relaxed whitespace-pre-wrap", expandedEventId !== ev.id && "line-clamp-3")}>{ev.body}</p>}
                                {ev.contact_ids && ev.contact_ids.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1.5">
                                    {ev.contact_ids.map((cid: string) => {
                                      const tc = contacts.find(c => c.id === cid);
                                      if (!tc) return null;
                                      return (
                                        <span key={cid} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">
                                          <User size={8} />{tc.first_name} {tc.last_name}
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {ev.kind === "meeting" && (
                                  <span className="text-[10px] text-indigo-500 flex items-center gap-0.5 opacity-70">
                                    <Eye size={10} /> Summary
                                  </span>
                                )}
                                {ev.url && ev.kind !== "meeting" && (
                                  <a href={ev.url} target="_blank" rel="noopener noreferrer"
                                    className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                                    <ExternalLink size={10} /> View
                                  </a>
                                )}
                                <span className="text-xs text-slate-400 whitespace-nowrap">{formatDate(ev.date)}</span>
                                {/* Only allow delete for interactions (not documents/emails) */}
                                {(ev.kind === "meeting" || ev.kind === "call" || ev.kind === "email" || ev.kind === "note") && (
                                  <button
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      if (!confirm("Delete this interaction?")) return;
                                      await supabase.from("interactions").delete().eq("id", ev.id);
                                      setInteractions(prev => prev.filter(i => i.id !== ev.id));
                                    }}
                                    className="text-slate-300 hover:text-red-500 transition-colors"
                                    title="Delete interaction"
                                  >
                                    <X size={11} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()}
              </div>{/* end fixed-height timeline box */}
              </section>

            </div>{/* end contacts/timeline sections */}

            {/* ── Meeting Summary Modal ── */}
            {selectedTimelineMeeting && (() => {
              const m = selectedTimelineMeeting;
              const fmt = formatMeetingSummary(m.ai_summary ?? m.summary ?? m.body);
              const displayNextSteps = fmt.nextSteps.length > 0 ? fmt.nextSteps : (m.action_items ?? []);
              const attendees = m.attendees as Array<{ name?: string; email?: string }> | null;
              const isExporting = exportingPdf === m.id;
              const justExported = exportSuccess === m.id;
              const totallyEmpty =
                !fmt.overview && !fmt.rawFallback &&
                fmt.keyDiscussionTopics.length === 0 &&
                fmt.decisionsMade.length === 0 &&
                displayNextSteps.length === 0;
              return (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
                  onClick={() => { setSelectedTimelineMeeting(null); setExportSuccess(null); }}>
                  <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col"
                    style={{ maxHeight: "85vh" }}
                    onClick={e => e.stopPropagation()}>
                    {/* Modal header */}
                    <div className="px-6 py-4 border-b border-slate-100 flex items-start gap-3 flex-shrink-0">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-slate-900 leading-snug break-words">
                          {m.subject ?? "Meeting"}
                        </h3>
                        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1">
                          <span className="text-[11px] text-slate-400 flex items-center gap-1">
                            <Calendar size={10} /> {formatDate(m.date)}
                          </span>
                          {m.duration_minutes && (
                            <span className="text-[11px] text-slate-400 flex items-center gap-1">
                              <Clock size={10} /> {m.duration_minutes}m
                            </span>
                          )}
                          {selected && (
                            <span className="text-[11px] px-1.5 py-0.5 bg-violet-50 text-violet-700 border border-violet-200 rounded font-medium">
                              {selected.name}
                            </span>
                          )}
                          {m.meeting_type && (
                            <PipelineMeetingTypeBadge type={m.meeting_type} />
                          )}
                        </div>
                      </div>
                      <button onClick={() => { setSelectedTimelineMeeting(null); setExportSuccess(null); }}
                        className="text-slate-400 hover:text-slate-600 p-1 flex-shrink-0">
                        <X size={18} />
                      </button>
                    </div>

                    {/* Modal body — scrollable */}
                    <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                      {totallyEmpty ? (
                        <p className="text-sm text-slate-400 italic">Fireflies did not return a summary for this meeting.</p>
                      ) : (
                        <>
                          {/* Overview */}
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Meeting Overview</p>
                            {fmt.overview ? (
                              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{fmt.overview}</p>
                            ) : (
                              <p className="text-sm text-slate-400 italic">No overview available.</p>
                            )}
                          </div>

                          {/* Key Discussion Topics */}
                          {fmt.keyDiscussionTopics.length > 0 && (
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Key Discussion Topics</p>
                              <div className="space-y-1.5">
                                {fmt.keyDiscussionTopics.map((topic, i) => (
                                  <div key={i} className="bg-white rounded-lg border border-gray-100 shadow-sm p-3">
                                    <p className="text-sm text-gray-700">{topic}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Decisions Made */}
                          {fmt.decisionsMade.length > 0 && (
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Decisions Made</p>
                              <div className="space-y-1">
                                {fmt.decisionsMade.map((d, i) => (
                                  <div key={i} className="flex items-start gap-2">
                                    <span className="text-emerald-500 font-bold text-sm flex-shrink-0">✓</span>
                                    <p className="text-sm text-gray-700 leading-snug">{d}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Next Steps */}
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Next Steps</p>
                            {displayNextSteps.length > 0 ? (
                              <div className="space-y-1.5">
                                {displayNextSteps.map((step, i) => (
                                  <div key={i} className="flex items-start gap-2.5 p-2.5 bg-amber-50 rounded-lg border border-amber-100">
                                    <CheckSquare size={13} className="mt-0.5 text-amber-500 flex-shrink-0" />
                                    <p className="text-sm text-slate-700 leading-snug">{step}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-slate-400 italic">No next steps recorded.</p>
                            )}
                          </div>

                          {/* Raw fallback */}
                          {!fmt.hasStructure && fmt.rawFallback && (
                            <details className="group">
                              <summary className="cursor-pointer text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1 list-none">
                                <ChevronRight size={11} className="group-open:rotate-90 transition-transform" />
                                Summary (unformatted)
                              </summary>
                              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap mt-2">{fmt.rawFallback}</p>
                            </details>
                          )}
                        </>
                      )}

                      {/* Attendees */}
                      {attendees && attendees.length > 0 && (
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Attendees</p>
                          <div className="flex flex-wrap gap-1.5">
                            {attendees.map((a, i) => (
                              <span key={i} className="inline-flex items-center gap-1 text-xs bg-white border border-slate-200 rounded-full px-2 py-0.5">
                                <span className="w-4 h-4 rounded-full bg-violet-100 flex items-center justify-center text-[9px] font-bold text-violet-600">
                                  {((a.name ?? a.email ?? "?")[0]).toUpperCase()}
                                </span>
                                {a.name ?? a.email ?? "Unknown"}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Modal footer */}
                    <div className="px-6 py-4 border-t border-slate-100 flex items-center gap-3 flex-shrink-0">
                      <a
                        href={`/meetings?meeting=${m.id}`}
                        className="flex-1 py-2 text-xs font-medium text-center border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        Open Full Meeting
                      </a>
                      <button
                        disabled={isExporting || justExported}
                        onClick={async () => {
                          if (!selected) return;
                          setExportingPdf(m.id);
                          setExportSuccess(null);
                          try {
                            const { generateMeetingPDF } = await import("@/lib/generate-meeting-pdf");
                            const blob = await generateMeetingPDF({ ...m, company: selected as unknown as Company | undefined });

                            // ── Base64-encode and POST to server for storage ─
                            const base64 = await new Promise<string>((resolve, reject) => {
                              const reader = new FileReader();
                              reader.onload = () => resolve((reader.result as string).split(",")[1]);
                              reader.onerror = reject;
                              reader.readAsDataURL(blob);
                            });
                            const res = await fetch(`/api/meetings/${m.id}/export-pdf`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ company_id: selected.id, pdf_base64: base64 }),
                            });
                            if (res.ok) {
                              const json = await res.json() as { document?: { id: string; name: string; type: string; storage_path: string; google_drive_url: string | null; created_at: string } };
                              setExportSuccess(m.id);
                              // Append the new document directly to state so it appears immediately
                              if (json.document) {
                                setDocuments(prev => [json.document!, ...prev]);
                              }
                            } else {
                              const errData = await res.json().catch(() => ({})) as { error?: string };
                              console.error("PDF save error:", errData.error ?? res.status);
                              alert(`Failed to save transcript: ${errData.error ?? "Unknown error"}`);
                            }
                          } catch (err) {
                            console.error("PDF save failed:", err);
                          } finally {
                            setExportingPdf(null);
                          }
                        }}
                        className={cn(
                          "flex-1 py-2 text-xs font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5",
                          justExported
                            ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
                            : "bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
                        )}
                      >
                        {isExporting ? (
                          <><Loader2 size={11} className="animate-spin" /> Saving…</>
                        ) : justExported ? (
                          <><Check size={11} /> Saved in Transcripts</>
                        ) : (
                          "Save in Meeting Transcripts"
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* ── Row B: Strategic Partnerships | Portfolio Intelligence ── */}
            <div className={pipelineView === "board" ? "flex flex-col gap-y-8" : "grid grid-cols-1 md:grid-cols-2 gap-6"}>

              {/* Section: Opportunities / Tasks */}
              <section>
              {/* Header: Opportunities / Tasks */}
              <div className="h-9 flex items-center justify-between mb-3">
                <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Opportunities / Tasks</h2>
                <button onClick={() => setShowAddPartnership(v => !v)}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  <Plus size={11} /> Add
                </button>
              </div>

              {/* Content: Opportunities / Tasks */}
              <div className="h-[220px] overflow-y-auto pr-1 bg-slate-50 rounded-xl p-3">
                {showAddPartnership && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 mb-3 space-y-2">
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <input value={partnerSearch}
                          onChange={e => { setPartnerSearch(e.target.value); setNewPartnerName(e.target.value); setSelectedPartnerId(null); setShowPartnerDropdown(true); }}
                          onFocus={() => setShowPartnerDropdown(true)}
                          onBlur={() => setTimeout(() => setShowPartnerDropdown(false), 150)}
                          placeholder="Partner / Company / Fund name"
                          className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400" />
                        {showPartnerDropdown && (
                          <div className="absolute z-20 top-full left-0 right-0 bg-white border border-slate-200 rounded shadow-lg max-h-40 overflow-y-auto mt-0.5">
                            {partnerCompanies.filter(c => !partnerSearch || c.name.toLowerCase().includes(partnerSearch.toLowerCase())).slice(0, 10).map(c => (
                              <button key={c.id} onMouseDown={() => { setNewPartnerName(c.name); setPartnerSearch(c.name); setSelectedPartnerId(c.id); setShowPartnerDropdown(false); }}
                                className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 flex items-center justify-between gap-2">
                                <span className="font-medium text-slate-700">{c.name}</span>
                                <span className="text-[10px] text-slate-400">{(c.types ?? []).includes("corporate") ? "Corporate" : (c.types ?? []).includes("lp") || (c.types ?? []).includes("limited partner") ? "LP" : "Fund / VC"}</span>
                              </button>
                            ))}
                            {partnerSearch && partnerCompanies.filter(c => c.name.toLowerCase().includes(partnerSearch.toLowerCase())).length === 0 && (
                              <p className="px-3 py-2 text-xs text-slate-400 italic">No match — will be added as-is</p>
                            )}
                          </div>
                        )}
                      </div>
                      <select value={newPartnerType} onChange={e => setNewPartnerType(e.target.value)}
                        className="w-28 flex-shrink-0 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400 bg-white">
                        {["Co-invest", "Introduction", "Pilot", "Diligence", "Customer", "Value-add"].map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <input value={newPartnerNote} onChange={e => setNewPartnerNote(e.target.value)}
                      placeholder="Note (optional)"
                      className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400" />
                    <input type="date" value={newPartnerDate} onChange={e => setNewPartnerDate(e.target.value)}
                      className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400" />
                    <div className="flex gap-2">
                      <button onClick={addManualPartnership} className="flex-1 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">Add</button>
                      <button onClick={() => { setShowAddPartnership(false); setPartnerSearch(""); setNewPartnerName(""); setSelectedPartnerId(null); setNewPartnerType("Introduction"); }}
                        className="flex-1 py-1 bg-white border border-slate-200 text-slate-600 text-xs rounded hover:bg-slate-50">Cancel</button>
                    </div>
                  </div>
                )}
                {/* Combined tiles: crm tasks linked to this company + portco partnerships + manual partnerships */}
                {(() => {
                  const companyName = selected?.name ?? "";
                  // crm tasks linked to this company
                  const linkedTasks = crmTasks.filter(t => (t.cos ?? []).some(co => co.toLowerCase() === companyName.toLowerCase()));
                  const totalItems = linkedTasks.length + portcoPartnerships.length + manualPartnerships.length;

                  if (totalItems === 0 && !showAddPartnership) {
                    return <p className="text-xs text-slate-300 italic pt-2">No opportunities or tasks yet</p>;
                  }

                  return (
                    <div className="space-y-2">
                      {/* CRM Tasks linked to this company */}
                      {linkedTasks.map(t => (
                        <div key={`task-${t.id}`} className="bg-white border border-slate-200 rounded-lg p-2.5 hover:border-blue-300 transition-colors">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-800 leading-tight truncate">{t.title}</p>
                              {(t.cos ?? []).length > 0 && (
                                <p className="text-[10px] text-slate-500 mt-0.5 truncate">{(t.cos ?? []).join(", ")}</p>
                              )}
                              {t.cat && (
                                <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">{t.cat}</span>
                              )}
                            </div>
                            <div className="flex-shrink-0 text-right">
                              {t.start && <p className="text-[10px] text-slate-400">{t.start}</p>}
                              {t.due && <p className="text-[10px] text-slate-500 font-medium">{t.due}</p>}
                            </div>
                          </div>
                        </div>
                      ))}
                      {/* Portco partnerships from strategic map */}
                      {portcoPartnerships.map(p => (
                        <div key={`portco-${p.strategicId}`} className="bg-white border border-slate-200 rounded-lg p-2.5 hover:border-blue-300 transition-colors">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-800 leading-tight truncate">{p.strategicName}</p>
                              <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded font-medium ${PARTNER_STATUS_COLORS[p.status] ?? "bg-slate-100 text-slate-500"}`}>{p.status}</span>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              {p.due && <p className="text-[10px] text-slate-500 font-medium">{formatDate(p.due)}</p>}
                            </div>
                          </div>
                          <span onClick={e => { e.stopPropagation(); setConfirmDeletePartner({ type: "portco", id: p.strategicId }); }} className="mt-1 text-[10px] text-slate-300 hover:text-red-400 cursor-pointer">Remove</span>
                          {confirmDeletePartner?.type === "portco" && confirmDeletePartner.id === p.strategicId && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] text-slate-500 flex-1 italic">Delete?</span>
                              <button onMouseDown={() => { deletePortcoPartnership(p.strategicId); setConfirmDeletePartner(null); }} className="text-[10px] text-red-600 hover:underline font-medium">Yes</button>
                              <button onMouseDown={() => setConfirmDeletePartner(null)} className="text-[10px] text-slate-400 hover:underline">No</button>
                            </div>
                          )}
                        </div>
                      ))}
                      {/* Manual partnerships */}
                      {manualPartnerships.map(p => (
                        <div key={`manual-${p.id}`} className="bg-white border border-slate-200 rounded-lg p-2.5 hover:border-blue-300 transition-colors">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-800 leading-tight truncate">{p.name}</p>
                              {p.note && <p className="text-[10px] text-slate-500 mt-0.5 truncate">{p.note}</p>}
                              {p.status && (
                                <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded font-medium ${PARTNER_STATUS_COLORS[p.status] ?? "bg-slate-100 text-slate-500"}`}>{p.status}</span>
                              )}
                            </div>
                            <div className="flex-shrink-0 text-right">
                              {p.date && <p className="text-[10px] text-slate-500 font-medium">{formatDate(p.date)}</p>}
                            </div>
                          </div>
                          <span onClick={e => { e.stopPropagation(); setConfirmDeletePartner({ type: "manual", id: p.id }); }} className="mt-1 text-[10px] text-slate-300 hover:text-red-400 cursor-pointer">Remove</span>
                          {confirmDeletePartner?.type === "manual" && confirmDeletePartner.id === p.id && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] text-slate-500 flex-1 italic">Delete?</span>
                              <button onMouseDown={() => { deleteManualPartnership(p.id); setConfirmDeletePartner(null); }} className="text-[10px] text-red-600 hover:underline font-medium">Yes</button>
                              <button onMouseDown={() => setConfirmDeletePartner(null)} className="text-[10px] text-slate-400 hover:underline">No</button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>{/* end opportunities/tasks content */}
              </section>

              {/* Section: Company Intelligence */}
              <section>
              {/* Header: Company Intelligence */}
              <div className="h-9 flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Company Intelligence</h2>
                  {intelCachedAt && !loadingIntelligence && (
                    <span className="text-[10px] text-slate-400">· {(() => { const d = Date.now() - new Date(intelCachedAt).getTime(); const m = Math.floor(d/60000); if (m < 60) return `${m}m ago`; const h = Math.floor(m/60); if (h < 24) return `${h}h ago`; return `${Math.floor(h/24)}d ago`; })()}</span>
                  )}
                </div>
                <button
                  onClick={fetchIntelligence}
                  disabled={loadingIntelligence}
                  className="text-xs px-2.5 py-1 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1"
                >
                  {loadingIntelligence
                    ? <><Loader2 size={10} className="animate-spin" /> {intelligenceStatus}</>
                    : <><Sparkles size={10} /> Refresh</>}
                </button>
              </div>

              {/* Content: Portfolio Intelligence */}
              <div className="h-[150px] overflow-y-auto pr-1 bg-slate-50 rounded-xl p-3">
                {loadingIntelligence ? (
                  <div className="space-y-2">
                    {[1,2,3].map(i => <div key={i} className="h-10 bg-slate-50 rounded-lg animate-pulse" />)}
                  </div>
                ) : intelligenceError ? (
                  <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2.5 mt-1">
                    <p className="text-xs font-medium text-red-600 mb-0.5">Failed to load intelligence</p>
                    <p className="text-[11px] text-red-400 break-words">{intelligenceError}</p>
                  </div>
                ) : intelligence.length === 0 ? (
                  <div className="text-center py-6 border-2 border-dashed border-slate-200 rounded-xl">
                    <Sparkles size={20} className="mx-auto mb-2 text-slate-300" />
                    <p className="text-xs text-slate-400 mb-1">No intelligence loaded</p>
                    <p className="text-[11px] text-slate-300">Click Refresh to fetch latest signals</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {intelligence.map((item, i) => (
                      <div key={i} className="border border-slate-200 rounded-lg p-2.5 bg-white hover:bg-slate-50 transition-colors">
                        {item.url ? (
                          <a href={item.url} target="_blank" rel="noopener noreferrer"
                            className="text-xs font-medium text-blue-700 hover:underline leading-snug mb-1 block">
                            {item.headline}
                          </a>
                        ) : (
                          <p className="text-xs font-medium text-slate-800 leading-snug mb-1">{item.headline}</p>
                        )}
                        {item.summary && <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">{item.summary}</p>}
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[10px] text-slate-400">{item.source} · {item.date}</span>
                          {item.url && (
                            <a href={item.url} target="_blank" rel="noopener noreferrer"
                              className="text-[10px] text-blue-400 hover:text-blue-600 flex items-center gap-0.5 flex-shrink-0">
                              <ExternalLink size={9} />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>{/* end portfolio intelligence content */}
              </section>

            </div>{/* end strategic/intelligence sections */}

            {/* ── Documents — Pitch Decks & Transcripts (50/50) ── */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Documents</h2>
              </div>

              <div className="flex flex-col md:flex-row gap-4 items-start">
              {/* ── Pitch Decks (full-width mobile / 50% desktop) ── */}
              <div className="w-full md:w-auto" style={{flex: '0 0 50%', minWidth: 0}}>
                <p className="text-xs font-semibold text-slate-500 mb-3 flex items-center gap-1.5">
                  <FileText size={12} /> Pitch Decks
                  {documents.filter(d => d.type === "deck" && !d.google_drive_url).length > 0 && (
                    <span className="ml-1 text-slate-400 font-normal">
                      ({documents.filter(d => d.type === "deck" && !d.google_drive_url).length})
                    </span>
                  )}
                </p>
                {/* Fixed-height container — more decks → more columns (narrower), never taller */}
                {(() => {
                  const decks = documents.filter(d => d.type === "deck" && !d.google_drive_url);
                  const total = decks.length + 1; // +1 for upload box
                  const cols = total <= 1 ? 1 : total === 2 ? 2 : total === 3 ? 3 : 4;
                  const desktopCols = cols === 1 ? "md:grid-cols-1" : cols === 2 ? "md:grid-cols-2" : cols === 3 ? "md:grid-cols-3" : "md:grid-cols-4";
                  return (
                    <div className={`grid grid-cols-2 ${desktopCols} gap-2 h-28 overflow-hidden`}>
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

              {/* ── Transcripts (full-width mobile / 50% desktop) ── */}
              <div className="w-full md:w-auto" style={{flex: '0 0 50%', minWidth: 0}}>
                <p className="text-xs font-semibold text-slate-500 mb-3 flex items-center gap-1.5">
                  <Paperclip size={12} /> Meeting Transcripts
                  {documents.filter(d => d.type === "transcript" && !d.google_drive_url).length > 0 && (
                    <span className="ml-1 text-slate-400 font-normal">
                      ({documents.filter(d => d.type === "transcript" && !d.google_drive_url).length})
                    </span>
                  )}
                </p>
                {(() => {
                  const transcripts = documents.filter(d => d.type === "transcript" && !d.google_drive_url);
                  const total = transcripts.length + 1;
                  const cols = total <= 1 ? 1 : total === 2 ? 2 : total === 3 ? 3 : 4;
                  const desktopColsT = cols === 1 ? "md:grid-cols-1" : cols === 2 ? "md:grid-cols-2" : cols === 3 ? "md:grid-cols-3" : "md:grid-cols-4";
                  return (
                    <div className={`grid grid-cols-2 ${desktopColsT} gap-2 h-24`}>
                      {transcripts.map(doc => {
                        const url = doc.storage_path
                          ? supabase.storage.from("transcripts").getPublicUrl(doc.storage_path).data.publicUrl
                          : null;
                        return (
                          <div key={doc.id} className="relative group border border-slate-200 rounded-xl overflow-hidden bg-white h-full flex flex-col">
                            {/* Main area — icon (same pattern as pitch deck tiles) */}
                            <a href={url ?? "#"} target={url ? "_blank" : undefined} rel="noopener noreferrer"
                              className="flex-1 min-h-0 bg-violet-50 flex items-center justify-center">
                              <Paperclip size={18} className="text-violet-400" />
                            </a>
                            {/* Footer */}
                            <div className="px-2 py-1.5 border-t border-slate-100 flex-shrink-0">
                              <p className="text-[9px] text-slate-600 truncate font-medium">{doc.name}</p>
                              <p className="text-[9px] text-slate-400">{formatDate(doc.created_at)}</p>
                            </div>
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

              </div>{/* end documents flex */}
            </section>

            {/* ── Drive Sync Tools ── */}
            <section className="hidden md:block">
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] flex items-center gap-1.5 mr-1 flex-shrink-0">
                    <Link2 size={12} /> Drive Sync
                  </h2>

                  {/* ── Inline URL input (shown when linking or changing) ── */}
                  {driveChanging ? (
                    <>
                      <input
                        autoFocus
                        type="url"
                        value={driveInput}
                        onChange={e => setDriveInput(e.target.value)}
                        placeholder="Paste Google Drive folder URL…"
                        className="text-xs border border-blue-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white w-56 flex-shrink-0"
                        onKeyDown={e => { if (e.key === "Escape") { setDriveChanging(false); setDriveInput(""); } }}
                      />
                      <button
                        disabled={!driveInput || driveLinking}
                        onClick={async () => {
                          if (!driveInput) return;
                          setDriveLinking(true);
                          try {
                            const res = await fetch(`/api/companies/${selected.id}/drive`, {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ folderUrl: driveInput }),
                            });
                            if (res.ok) {
                              setCompanies(prev => prev.map(c => c.id === selected.id ? { ...c, drive_folder_url: driveInput } : c));
                              setDriveInput("");
                              setDriveChanging(false);
                            }
                          } finally { setDriveLinking(false); }
                        }}
                        className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 flex items-center gap-1.5 flex-shrink-0"
                      >
                        {driveLinking ? <Loader2 size={11} className="animate-spin" /> : <Link2 size={11} />}
                        {selected.drive_folder_url ? "Update" : "Link"}
                      </button>
                      <button
                        onClick={() => { setDriveChanging(false); setDriveInput(""); }}
                        className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 flex-shrink-0"
                      >Cancel</button>
                    </>
                  ) : (
                    <>
                      {/* Data Room button — gray when not linked, green when linked */}
                      {selected.drive_folder_url ? (
                        <a href={selected.drive_folder_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-1.5 flex-shrink-0 font-medium">
                          <Link2 size={11} className="flex-shrink-0" /> Data Room Linked
                        </a>
                      ) : (
                        <button
                          onClick={() => { setDriveChanging(true); setDriveInput(""); }}
                          className="text-xs px-3 py-1.5 bg-slate-200 text-slate-500 rounded-lg hover:bg-slate-300 transition-colors flex items-center gap-1.5 flex-shrink-0 font-medium"
                        >
                          <Link2 size={11} /> Link Data Room
                        </button>
                      )}

                      {/* Sync & Extract — only when linked */}
                      {selected.drive_folder_url && (
                        <button
                          disabled={driveSyncStep !== "idle"}
                          onClick={async () => {
                            setDriveSyncResult(null);
                            setDriveReextractResult(null);
                            setDriveSyncStep("syncing");
                            try {
                              const syncRes = await fetch("/api/drive/sync", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ company_id: selected.id, folder_url: selected.drive_folder_url }),
                              });
                              const syncJson = await syncRes.json() as DriveSyncResult;
                              setDriveSyncResult(syncJson);
                              if (syncJson.error) return;
                              const { data: freshDocs } = await supabase.from("documents")
                                .select("id,name,type,storage_path,google_drive_url,created_at")
                                .eq("company_id", selected.id)
                                .order("created_at", { ascending: false });
                              if (freshDocs) setDocuments(freshDocs);
                              setDriveSyncStep("extracting");
                              const extRes = await fetch("/api/drive/reextract", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ company_id: selected.id }),
                              });
                              const extJson = await extRes.json() as { success: number; failed: number; processed: number; has_more?: boolean; message?: string };
                              setDriveReextractResult(extJson);
                            } finally { setDriveSyncStep("idle"); }
                          }}
                          className="text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 flex items-center gap-1.5 flex-shrink-0"
                        >
                          {driveSyncStep === "syncing" ? <><Loader2 size={11} className="animate-spin" /> Syncing…</> :
                           driveSyncStep === "extracting" ? <><Loader2 size={11} className="animate-spin" /> Extracting…</> :
                           <><Bot size={11} /> Sync &amp; Extract</>}
                        </button>
                      )}

                      {/* Extracted count */}
                      {selected.drive_folder_url && (() => {
                        const n = documents.filter(d => !!d.google_drive_url).length;
                        return n > 0 ? (
                          <span className="flex items-center gap-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 flex-shrink-0">
                            <Check size={8} /> {n} extracted
                          </span>
                        ) : null;
                      })()}

                      {/* Change URL */}
                      {selected.drive_folder_url && (
                        <button
                          onClick={() => { setDriveChanging(true); setDriveInput(""); }}
                          className="text-[10px] text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded border border-slate-200 hover:bg-slate-50 flex-shrink-0"
                        >
                          Change URL
                        </button>
                      )}
                    </>
                  )}
                </div>
                {driveSyncResult && (
                  <div className={`mt-2 rounded-lg px-2.5 py-2 text-[10px] leading-relaxed ${driveSyncResult.error ? "bg-red-50 border border-red-200 text-red-700" : "bg-emerald-50 border border-emerald-200 text-emerald-800"}`}>
                    {driveSyncResult.setup_required ? (
                      <span>⚠️ Google Drive not configured. Add <code className="bg-red-100 px-1 rounded">GOOGLE_SERVICE_ACCOUNT_EMAIL</code> and <code className="bg-red-100 px-1 rounded">GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY</code> to environment variables.</span>
                    ) : driveSyncResult.error?.includes("shared") || driveSyncResult.error?.includes("Cannot access") ? (
                      <span>⚠️ Share this Drive folder with: <br /><code className="font-mono bg-emerald-100 px-1 rounded break-all">{driveSyncResult.share_with}</code></span>
                    ) : driveSyncResult.error ? (
                      <span>Error: {driveSyncResult.error}</span>
                    ) : (
                      <span>{(() => { const n = driveSyncResult.saved ?? driveSyncResult.synced ?? 0; const skipped = driveSyncResult.skipped ?? 0; return <>✓ {n > 0 ? `${n} new file${n!==1?"s":""} indexed` : "All files already saved"}{ skipped > 0 ? `, ${skipped} already saved` : ""}</>; })()}</span>
                    )}
                  </div>
                )}
                {driveReextractResult && driveSyncStep === "idle" && (
                  <div className="mt-1 rounded-lg px-2.5 py-2 text-[10px] bg-slate-50 border border-slate-200 text-slate-700">
                    {driveReextractResult.message
                      ? <span>✓ {driveReextractResult.message}</span>
                      : <span>✓ {driveReextractResult.success} doc{driveReextractResult.success !== 1 ? "s" : ""} extracted &amp; ready for AI{driveReextractResult.failed > 0 ? ` · ${driveReextractResult.failed} failed (unsupported format)` : ""}{driveReextractResult.has_more ? " · more remaining, click again" : ""}</span>
                    }
                  </div>
                )}
              </section>

            {/* ── Competitor Landscape & M&A Acquirers ── */}
            {(() => {
              const competitors = pipelineIntel.filter(i => i.type === "competitor");
              const acquirers   = pipelineIntel.filter(i => i.type === "ma_acquirer");
              const THREAT: Record<string, string> = { high: "bg-red-100 text-red-700", medium: "bg-amber-100 text-amber-700", low: "bg-slate-100 text-slate-500" };
              const THREAT_LABEL: Record<string, string> = { high: "Direct", medium: "Adjacent", low: "Indirect" };
              const FIT: Record<string, string> = { high: "bg-emerald-100 text-emerald-700", medium: "bg-amber-100 text-amber-700", low: "bg-slate-100 text-slate-500" };

              const IntelCard = ({ item, badgeClass, badgeLabel }: { item: PipelineIntelItem; badgeClass: string; badgeLabel: string }) => (
                <div className="flex items-start gap-1.5 py-1">
                  <span className={`text-[8px] px-1 py-px rounded font-semibold flex-shrink-0 mt-0.5 ${badgeClass}`}>{badgeLabel}</span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold text-slate-800 leading-tight">{item.entity_name}</p>
                    {item.description && <p className="text-[10px] text-slate-500 leading-snug line-clamp-2 mt-0.5">{item.description}</p>}
                  </div>
                </div>
              );

              return (
                <section>
                  <div className="flex flex-col md:flex-row gap-4">
                    {/* Competitor Landscape */}
                    <div className="w-full md:w-auto" style={{ flex: "0 0 50%", minWidth: 0 }}>
                      <div className="flex items-center justify-between mb-2">
                        <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Competitor Landscape</h2>
                        <div className="flex items-center gap-2">
                          {competitors.length > 0 && (
                            <button onClick={() => setIntelModal("competitor")}
                              className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-0.5" title="Expand">
                              <Eye size={9} /> Expand
                            </button>
                          )}
                          <button onClick={() => handlePipelineIntelRefresh("competitor")} disabled={refreshingIntel !== null}
                            className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-1 disabled:opacity-40">
                            <RefreshCw size={9} className={refreshingIntel === "competitor" ? "animate-spin" : ""} /> Refresh
                          </button>
                        </div>
                      </div>
                      <div className="h-[150px] overflow-y-auto bg-slate-50 rounded-xl p-3 space-y-0.5">
                        {competitors.length === 0 ? (
                          <p className="text-[11px] text-slate-400 pt-1">{refreshingIntel === "competitor" ? "Generating…" : "Click Refresh to generate"}</p>
                        ) : competitors.slice(0, 4).map(c => (
                          <IntelCard key={c.id} item={c}
                            badgeClass={THREAT[c.fit_level] ?? "bg-slate-100 text-slate-500"}
                            badgeLabel={THREAT_LABEL[c.fit_level] ?? c.fit_level} />
                        ))}
                      </div>
                    </div>

                    {/* M&A Acquirers */}
                    <div className="w-full md:w-auto" style={{ flex: "0 0 50%", minWidth: 0 }}>
                      <div className="flex items-center justify-between mb-2">
                        <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Potential M&A Acquirers</h2>
                        <div className="flex items-center gap-2">
                          {acquirers.length > 0 && (
                            <button onClick={() => setIntelModal("ma_acquirer")}
                              className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-0.5" title="Expand">
                              <Eye size={9} /> Expand
                            </button>
                          )}
                          <button onClick={() => handlePipelineIntelRefresh("ma_acquirer")} disabled={refreshingIntel !== null}
                            className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-1 disabled:opacity-40">
                            <RefreshCw size={9} className={refreshingIntel === "ma_acquirer" ? "animate-spin" : ""} /> Refresh
                          </button>
                        </div>
                      </div>
                      <div className="h-[150px] overflow-y-auto bg-slate-50 rounded-xl p-3 space-y-0.5">
                        {acquirers.length === 0 ? (
                          <p className="text-[11px] text-slate-400 pt-1">{refreshingIntel === "ma_acquirer" ? "Generating…" : "Click Refresh to generate"}</p>
                        ) : acquirers.slice(0, 4).map(a => (
                          <IntelCard key={a.id} item={a}
                            badgeClass={FIT[a.fit_level] ?? "bg-slate-100 text-slate-500"}
                            badgeLabel={a.fit_level} />
                        ))}
                      </div>
                    </div>
                  </div>
                  {intelError && <p className="text-[10px] text-red-500 mt-1">{intelError}</p>}

                  {/* ── Pop-out modal ── */}
                  {intelModal && (() => {
                    const isComp = intelModal === "competitor";
                    const items  = isComp ? competitors : acquirers;
                    const title  = isComp ? "Competitor Landscape" : "Potential M&A Acquirers";
                    return (
                      <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4"
                        onClick={e => { if (e.target === e.currentTarget) setIntelModal(null); }}>
                        <div className="bg-white rounded-2xl w-[640px] max-h-[80vh] flex flex-col shadow-2xl">
                          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
                            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
                            <div className="flex items-center gap-3">
                              <button onClick={() => handlePipelineIntelRefresh(intelModal)} disabled={refreshingIntel !== null}
                                className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1 disabled:opacity-40">
                                <RefreshCw size={11} className={refreshingIntel === intelModal ? "animate-spin" : ""} /> Refresh
                              </button>
                              <button onClick={() => setIntelModal(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
                            </div>
                          </div>
                          <div className="overflow-y-auto p-6 space-y-3">
                            {items.map(item => (
                              <div key={item.id} className="bg-slate-50 rounded-xl p-3.5">
                                <div className="flex items-center gap-2 mb-1.5">
                                  <p className="text-sm font-semibold text-slate-900">{item.entity_name}</p>
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${isComp ? (THREAT[item.fit_level] ?? "bg-slate-100 text-slate-500") : (FIT[item.fit_level] ?? "bg-slate-100 text-slate-500")}`}>
                                    {isComp ? (THREAT_LABEL[item.fit_level] ?? item.fit_level) : item.fit_level}
                                  </span>
                                </div>
                                {item.description && <p className="text-xs text-slate-600 leading-relaxed">{item.description}</p>}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </section>
              );
            })()}

            {/* ── IC Memo ── */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] flex items-center gap-1.5">
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
                    <button
                      onClick={() => window.open(`/memos/${memo.id}`, "_blank")}
                      className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 flex items-center gap-1">
                      View Full <ChevronRight size={12} />
                    </button>
                  </div>
                  {memo.executive_summary && (
                    <p className="text-xs md:text-sm text-slate-600 leading-relaxed line-clamp-4">{memo.executive_summary}</p>
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
      ) : null}

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
              {/* Company Name */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Company Name *</label>
                <input className="input" placeholder="e.g. CarbonMind Inc." required
                  value={addForm.name ?? ""} onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))} />
              </div>

              {/* Domain */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Domain</label>
                <input className="input" type="url" placeholder="https://…"
                  value={addForm.website ?? ""} onChange={e => setAddForm(p => ({ ...p, website: e.target.value || null }))} />
              </div>

              {/* Contact */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-medium text-slate-600">Contact</label>
                  <button type="button" onClick={() => { setAddModalContactOpen(p => !p); setShowContactSugg(false); setContactSuggestions([]); }}
                    className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                    <Plus size={11} /> {addModalContactOpen ? "Remove" : "Add Contact"}
                  </button>
                </div>
                {addModalContactOpen && (
                  <div className="border border-slate-200 rounded-xl p-3 space-y-2 bg-slate-50">
                    {/* Name row — search triggers on first name */}
                    <div className="relative">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          className="input text-sm"
                          placeholder="First name"
                          autoComplete="off"
                          value={addModalContact.first_name}
                          onChange={e => {
                            setAddModalContact(p => ({ ...p, first_name: e.target.value }));
                            searchContactSuggestions(e.target.value + " " + addModalContact.last_name);
                          }}
                          onFocus={() => { if (addModalContact.first_name.length >= 2) setShowContactSugg(contactSuggestions.length > 0); }}
                          onBlur={() => setTimeout(() => setShowContactSugg(false), 150)}
                        />
                        <input
                          className="input text-sm"
                          placeholder="Last name"
                          autoComplete="off"
                          value={addModalContact.last_name}
                          onChange={e => {
                            setAddModalContact(p => ({ ...p, last_name: e.target.value }));
                            searchContactSuggestions(addModalContact.first_name + " " + e.target.value);
                          }}
                        />
                      </div>

                      {/* Suggestions dropdown */}
                      {showContactSugg && contactSuggestions.length > 0 && (
                        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                          <p className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide bg-slate-50 border-b border-slate-100">
                            Existing contacts — select to link
                          </p>
                          {contactSuggestions.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onMouseDown={() => {
                                setAddModalContact({
                                  first_name: c.first_name,
                                  last_name:  c.last_name ?? "",
                                  email:      c.email ?? "",
                                  title:      c.title ?? "",
                                });
                                setShowContactSugg(false);
                              }}
                              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 transition-colors text-left"
                            >
                              <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                                <User size={12} className="text-violet-600" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-800">{c.first_name} {c.last_name}</p>
                                {c.email && <p className="text-xs text-blue-600 truncate">{c.email}</p>}
                                <p className="text-xs text-slate-400 truncate">
                                  {[c.title, [c.location_city, c.location_country].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <select className="input text-sm text-slate-700"
                      value={addModalContact.title}
                      onChange={e => setAddModalContact(p => ({ ...p, title: e.target.value }))}>
                      <option value="">Title / Role</option>
                      {CONTACT_TITLE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input
                      className="input text-sm"
                      type="email"
                      placeholder="Email"
                      autoComplete="off"
                      value={addModalContact.email}
                      onChange={e => {
                        setAddModalContact(p => ({ ...p, email: e.target.value }));
                        searchContactSuggestions(e.target.value);
                      }}
                      onFocus={() => { if (addModalContact.email.length >= 2) setShowContactSugg(contactSuggestions.length > 0); }}
                      onBlur={() => setTimeout(() => setShowContactSugg(false), 150)}
                    />
                  </div>
                )}
              </div>

              {/* Status + Priority */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Status</label>
                  <select className="select" value={addForm.deal_status ?? ""}
                    onChange={e => setAddForm(p => ({ ...p, deal_status: e.target.value as DealStatus || null }))}>
                    <option value="">Not set</option>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Priority</label>
                  <select className="select" value={addForm.priority ?? ""}
                    onChange={e => setAddForm(p => ({ ...p, priority: (e.target.value || null) as "High" | "Medium" | "Low" | null }))}>
                    <option value="">Not set</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              {/* Location */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">City</label>
                  <input className="input" placeholder="e.g. London"
                    value={addForm.location_city ?? ""}
                    onChange={e => setAddForm(p => ({ ...p, location_city: e.target.value || null }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Country</label>
                  <input className="input" placeholder="e.g. United Kingdom"
                    value={addForm.location_country ?? ""}
                    onChange={e => setAddForm(p => ({ ...p, location_country: e.target.value || null }))} />
                </div>
              </div>

              {/* Pitch Deck */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Pitch Deck <span className="text-slate-400 font-normal">(optional)</span></label>
                <input
                  ref={addDeckInputRef}
                  type="file"
                  accept=".pdf,.ppt,.pptx,.key"
                  className="hidden"
                  onChange={e => setAddDeckFile(e.target.files?.[0] ?? null)}
                />
                {addDeckFile ? (
                  <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500 flex-shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <span className="text-xs text-slate-700 flex-1 truncate">{addDeckFile.name}</span>
                    <button type="button" onClick={() => { setAddDeckFile(null); if (addDeckInputRef.current) addDeckInputRef.current.value = ""; }}
                      className="text-slate-400 hover:text-red-500 transition-colors flex-shrink-0">
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => addDeckInputRef.current?.click()}
                    onKeyDown={e => e.key === "Enter" && addDeckInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setAddDeckDragOver(true); }}
                    onDragLeave={e => { e.preventDefault(); setAddDeckDragOver(false); }}
                    onDrop={e => {
                      e.preventDefault();
                      setAddDeckDragOver(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) setAddDeckFile(file);
                    }}
                    className={`w-full flex flex-col items-center justify-center gap-1.5 px-3 py-5 border-2 border-dashed rounded-lg cursor-pointer transition-colors select-none ${
                      addDeckDragOver
                        ? "border-blue-400 bg-blue-50 text-blue-500"
                        : "border-slate-200 text-slate-400 hover:border-blue-300 hover:text-blue-500 hover:bg-blue-50"
                    }`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    <span className="text-xs font-medium">
                      {addDeckDragOver ? "Drop to attach" : "Drag & drop or click to upload"}
                    </span>
                    <span className="text-[10px] text-slate-300">PDF, PPT, PPTX, Keynote</span>
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowAddModal(false); setAddModalContactOpen(false); setAddModalContact({ first_name: "", last_name: "", email: "", title: "" }); setAddDeckFile(null); if (addDeckInputRef.current) addDeckInputRef.current.value = ""; }}
                  className="flex-1 py-2.5 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50">
                  Cancel
                </button>
                <button type="submit" disabled={addSaving}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
                  {addSaving ? "Adding…" : "Add to Pipeline"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          CONTACT SLIDE-OUT PANEL
      ══════════════════════════════════════════════════════════════════════ */}
      {contactPanel && (
        <div
          className="fixed inset-0 z-40 bg-black/20"
          onClick={() => { setContactPanel(null); setContactEditing(false); setConfirmRemove(false); }}
        />
      )}
      <div className={cn(
        "fixed top-0 right-0 h-full w-[420px] bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300",
        contactPanel ? "translate-x-0" : "translate-x-full"
      )}>
        {contactPanel && (() => {
          const cp = contactPanel;
          const allEmails = contactEditing
            ? (contactForm.emailList ?? [cp.email].filter(Boolean) as string[])
            : [...(cp.emails ?? []), ...(cp.email && !(cp.emails ?? []).includes(cp.email) ? [cp.email] : [])].filter(Boolean) as string[];

          function openEdit() {
            const emailList = [...(cp.emails ?? []), ...(cp.email && !(cp.emails ?? []).includes(cp.email) ? [cp.email] : [])].filter(Boolean) as string[];
            setContactForm({ ...cp, emailList: emailList.length ? emailList : cp.email ? [cp.email] : [""] });
            setContactEditing(true);
            setConfirmRemove(false);
          }

          async function saveContact() {
            setContactSaving(true);
            const emailList = (contactForm.emailList ?? []).filter(e => e.trim());
            const primaryEmail = emailList[0] ?? null;
            const updates = {
              first_name:       contactForm.first_name      ?? cp.first_name,
              last_name:        contactForm.last_name       ?? cp.last_name,
              title:            contactForm.title           ?? cp.title,
              phone:            contactForm.phone           ?? cp.phone,
              linkedin_url:     contactForm.linkedin_url    ?? cp.linkedin_url,
              location_city:    contactForm.location_city   ?? cp.location_city,
              location_country: contactForm.location_country ?? cp.location_country,
              notes:            contactForm.notes           ?? cp.notes,
              email:            primaryEmail,
              emails:           emailList,
            };
            await supabase.from("contacts").update(updates).eq("id", cp.id);
            const updated = { ...cp, ...updates } as Contact;
            setContacts(prev => prev.map(c => c.id === cp.id ? updated : c));
            setContactPanel(updated);
            setContactEditing(false);
            setContactSaving(false);
          }

          async function removeContact() {
            setContactRemoving(true);
            await supabase.from("contacts").delete().eq("id", cp.id);
            setContacts(prev => prev.filter(c => c.id !== cp.id));
            setContactPanel(null);
            setContactRemoving(false);
            setConfirmRemove(false);
          }

          function setCF<K extends keyof typeof contactForm>(k: K, v: typeof contactForm[K]) {
            setContactForm(p => ({ ...p, [k]: v }));
          }

          // Derived interaction dates
          const lastEmail   = contactInteractions.find(i => i.type === "email")?.date ?? null;
          const lastMeeting = contactInteractions.find(i => i.type === "meeting")?.date ?? null;

          return (
            <>
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                    {contactPanelMode === "manage" ? <Building2 size={18} className="text-violet-600" /> : <User size={18} className="text-violet-600" />}
                  </div>
                  <div>
                    {contactPanelMode === "manage"
                      ? <><p className="text-sm font-semibold text-slate-800">Contacts</p><p className="text-xs text-slate-500">{contacts.length} contact{contacts.length !== 1 ? "s" : ""}</p></>
                      : <><p className="text-sm font-semibold text-slate-800">{cp.first_name} {cp.last_name}</p><p className="text-xs text-slate-500">{cp.title ?? cp.type ?? "—"}</p></>
                  }
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {contactPanelMode === "detail" && !contactEditing && (
                    <button onClick={openEdit} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 flex items-center gap-1">
                      <Pencil size={11} /> Edit
                    </button>
                  )}
                  {contactPanelMode === "detail" && (
                    <button onClick={() => setContactPanelMode("manage")} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
                      ← All
                    </button>
                  )}
                  <button
                    onClick={() => { setContactPanel(null); setContactEditing(false); setConfirmRemove(false); }}
                    className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400"
                  ><X size={15} /></button>
                </div>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

                {/* ── MANAGE MODE: list of all contacts ── */}
                {contactPanelMode === "manage" && (
                  <div className="space-y-3">
                    {contacts.length === 0 && !showAddContactForm && (
                      <p className="text-sm text-slate-400 italic">No contacts linked yet.</p>
                    )}
                    {(() => {
                      const orderedContacts = contactOrder.length > 0
                        ? [...contacts].sort((a, b) => contactOrder.indexOf(a.id) - contactOrder.indexOf(b.id))
                        : contacts;
                      return orderedContacts.map((c, idx) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-3 p-3 border border-slate-100 rounded-xl hover:border-blue-200 hover:bg-blue-50 transition-colors"
                        draggable
                        onDragStart={() => { contactDragIdx.current = idx; }}
                        onDragOver={(e) => { e.preventDefault(); }}
                        onDrop={() => {
                          if (contactDragIdx.current === null || contactDragIdx.current === idx) return;
                          const order = orderedContacts.map(c => c.id);
                          const [moved] = order.splice(contactDragIdx.current, 1);
                          order.splice(idx, 0, moved);
                          setContactOrder(order);
                          contactDragIdx.current = null;
                        }}
                        style={{ cursor: "grab" }}
                      >
                        <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                          <User size={13} className="text-violet-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{c.first_name} {c.last_name}</p>
                          <p className="text-xs text-slate-500 truncate">{c.title ?? c.type ?? "—"}</p>
                          {c.email && <p className="text-xs text-blue-600 truncate">{c.email}</p>}
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0">
                          <button
                            onClick={async () => {
                              setContactPanel(c); setContactPanelMode("detail"); setContactEditing(false); setConfirmRemove(false);
                              const { data } = await supabase.from("interactions").select("type, date").contains("contact_ids", [c.id]).order("date", { ascending: false });
                              setContactInteractions(data ?? []);
                            }}
                            className="text-xs px-2.5 py-1 border border-slate-200 rounded-lg text-slate-600 hover:bg-white"
                          >Edit</button>
                          <button
                            onClick={async () => {
                              if (!confirm(`Remove ${c.first_name} ${c.last_name}?`)) return;
                              await supabase.from("contacts").delete().eq("id", c.id);
                              setContacts(prev => prev.filter(x => x.id !== c.id));
                            }}
                            className="w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:border-red-200 hover:text-red-400"
                          ><X size={12} /></button>
                        </div>
                      </div>
                    ));
                    })()}

                    {/* ── Add Contact Form ── */}
                    {showAddContactForm ? (
                      <div className="border border-blue-200 rounded-xl bg-blue-50 p-4 space-y-3">
                        <p className="text-xs font-semibold text-slate-700">New Contact</p>
                        {/* Name row with auto-suggest */}
                        <div className="relative">
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                              placeholder="First name"
                              autoComplete="off"
                              value={newContactForm.first_name}
                              onChange={e => {
                                setNewContactForm(p => ({ ...p, first_name: e.target.value }));
                                searchPanelContacts(e.target.value + " " + newContactForm.last_name);
                              }}
                              onBlur={() => setTimeout(() => setShowPanelContactSugg(false), 150)}
                            />
                            <input
                              className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                              placeholder="Last name"
                              autoComplete="off"
                              value={newContactForm.last_name}
                              onChange={e => {
                                setNewContactForm(p => ({ ...p, last_name: e.target.value }));
                                searchPanelContacts(newContactForm.first_name + " " + e.target.value);
                              }}
                              onBlur={() => setTimeout(() => setShowPanelContactSugg(false), 150)}
                            />
                          </div>
                          {/* Suggestions dropdown */}
                          {showPanelContactSugg && panelContactSugg.length > 0 && (
                            <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                              <p className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wide bg-slate-50 border-b border-slate-100">
                                Existing contacts — click to link
                              </p>
                              {panelContactSugg.map(c => (
                                <button key={c.id} type="button"
                                  onMouseDown={async () => {
                                    setShowPanelContactSugg(false);
                                    setShowAddContactForm(false);
                                    setNewContactForm({ first_name: "", last_name: "", email: "", title: "" });
                                    await linkContactToCompany(c.id);
                                  }}
                                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-50 transition-colors text-left">
                                  <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                                    <User size={12} className="text-violet-600" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-800">{c.first_name} {c.last_name}</p>
                                    {c.email && <p className="text-xs text-blue-600 truncate">{c.email}</p>}
                                    {c.title && <p className="text-xs text-slate-400 truncate">{c.title}</p>}
                                  </div>
                                  <span className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded flex-shrink-0">Link</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <select
                          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-700"
                          value={newContactForm.title}
                          onChange={e => setNewContactForm(p => ({ ...p, title: e.target.value }))}
                        >
                          <option value="">Title / Role</option>
                          {CONTACT_TITLE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <input
                          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                          type="email"
                          autoComplete="off"
                          placeholder="Email"
                          value={newContactForm.email}
                          onChange={e => {
                            setNewContactForm(p => ({ ...p, email: e.target.value }));
                            searchPanelContacts(e.target.value);
                          }}
                          onBlur={() => setTimeout(() => setShowPanelContactSugg(false), 150)}
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setShowAddContactForm(false); setNewContactForm({ first_name: "", last_name: "", email: "", title: "" }); setShowPanelContactSugg(false); setPanelContactSugg([]); }}
                            className="flex-1 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-white"
                          >Cancel</button>
                          <button
                            disabled={addingContact || !newContactForm.first_name.trim()}
                            onClick={async () => {
                              if (!selected || !newContactForm.first_name.trim()) return;
                              setAddingContact(true);
                              const { data: { user } } = await supabase.auth.getUser();
                              const { data: newC, error: newCErr } = await supabase.from("contacts").insert({
                                first_name: newContactForm.first_name.trim(),
                                last_name:  newContactForm.last_name.trim() || null,
                                email:      newContactForm.email.trim() || null,
                                title:      newContactForm.title.trim() || null,
                                company_id: selected.id,
                                type:       "Other" as ContactType,
                                status:     "active",
                                is_primary_contact: contacts.length === 0,
                                created_by: user?.id ?? null,
                              }).select().single();
                              setAddingContact(false);
                              if (newCErr) { alert(`Failed to add contact: ${newCErr.message}`); return; }
                              if (newC) {
                                setContacts(prev => [...prev, newC as Contact]);
                                setShowAddContactForm(false);
                                setNewContactForm({ first_name: "", last_name: "", email: "", title: "" });
                              }
                            }}
                            className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-1.5"
                          >
                            {addingContact ? <><Loader2 size={13} className="animate-spin" /> Adding…</> : <><Check size={13} /> Add Contact</>}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <button
                          onClick={() => setShowAddContactForm(true)}
                          className="w-full flex items-center justify-center gap-1.5 py-2.5 border-2 border-dashed border-slate-200 rounded-xl text-xs text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors"
                        >
                          <Plus size={13} /> Add New Contact
                        </button>
                        {/* ── Link existing contact ── */}
                        {showLinkContactForm ? (
                          <div className="border border-indigo-200 rounded-xl bg-indigo-50 p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold text-slate-700">Link Existing Contact</p>
                              <button onClick={() => { setShowLinkContactForm(false); setLinkContactSearch(""); setLinkContactSuggestions([]); }}>
                                <X size={12} className="text-slate-400 hover:text-slate-600" />
                              </button>
                            </div>
                            <input
                              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                              placeholder="Search by name or email…"
                              value={linkContactSearch}
                              onChange={e => searchLinkContacts(e.target.value)}
                              autoFocus
                            />
                            {linkContactSuggestions.length > 0 && (
                              <div className="max-h-[160px] overflow-y-auto border border-slate-200 rounded-lg bg-white divide-y divide-slate-100">
                                {linkContactSuggestions.map(c => (
                                  <button
                                    key={c.id}
                                    disabled={linkingContact}
                                    onClick={() => linkContactToCompany(c.id)}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-indigo-50 transition-colors disabled:opacity-50"
                                  >
                                    <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                                      <User size={11} className="text-indigo-600" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium text-slate-800 truncate">{c.first_name} {c.last_name}</p>
                                      {c.email && <p className="text-[10px] text-slate-400 truncate">{c.email}</p>}
                                      {c.title && <p className="text-[10px] text-slate-400 truncate">{c.title}</p>}
                                    </div>
                                    {c.company_id && c.company_id !== selected?.id && (
                                      <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded flex-shrink-0">Linked</span>
                                    )}
                                    {linkingContact && <Loader2 size={11} className="animate-spin text-indigo-600 flex-shrink-0" />}
                                  </button>
                                ))}
                              </div>
                            )}
                            {linkContactSearch.length >= 2 && linkContactSuggestions.length === 0 && (
                              <p className="text-xs text-slate-400 italic text-center">No contacts found</p>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowLinkContactForm(true)}
                            className="w-full flex items-center justify-center gap-1.5 py-2.5 border-2 border-dashed border-indigo-200 rounded-xl text-xs text-indigo-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
                          >
                            <Link2 size={13} /> Link Existing Contact
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ── DETAIL MODE: individual contact fields ── */}
                {contactPanelMode === "detail" && <>

                {/* Last Contact + Last Meeting */}
                <div className="grid grid-cols-2 gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1"><Mail size={10} /> Last Contact</label>
                    <p className="text-sm text-slate-800 mt-1">{lastEmail ? formatDate(lastEmail) : "—"}</p>
                    <p className="text-[10px] text-slate-400">via email</p>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide flex items-center gap-1"><Calendar size={10} /> Last Meeting</label>
                    <p className="text-sm text-slate-800 mt-1">{lastMeeting ? formatDate(lastMeeting) : "—"}</p>
                    <p className="text-[10px] text-slate-400">via Fireflies / Outlook</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">First Name</label>
                    {contactEditing
                      ? <input className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" value={contactForm.first_name ?? ""} onChange={e => setCF("first_name", e.target.value)} />
                      : <p className="text-sm text-slate-800 mt-1">{cp.first_name || "—"}</p>}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Last Name</label>
                    {contactEditing
                      ? <input className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" value={contactForm.last_name ?? ""} onChange={e => setCF("last_name", e.target.value)} />
                      : <p className="text-sm text-slate-800 mt-1">{cp.last_name || "—"}</p>}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Title</label>
                  {contactEditing
                    ? <input className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" value={contactForm.title ?? ""} onChange={e => setCF("title", e.target.value || null)} />
                    : <p className="text-sm text-slate-800 mt-1">{cp.title || "—"}</p>}
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Email{allEmails.length !== 1 ? "s" : ""}</label>
                  {contactEditing ? (
                    <div className="mt-1 space-y-2">
                      {(contactForm.emailList ?? [""]).map((em, idx) => (
                        <div key={idx} className="flex gap-2">
                          <input
                            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                            value={em} placeholder="email@example.com"
                            onChange={e => { const list = [...(contactForm.emailList ?? [])]; list[idx] = e.target.value; setCF("emailList", list); }}
                          />
                          {(contactForm.emailList ?? []).length > 1 && (
                            <button onClick={() => setCF("emailList", (contactForm.emailList ?? []).filter((_, i) => i !== idx))}
                              className="w-8 h-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:border-red-200 hover:text-red-400">
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                      <button onClick={() => setCF("emailList", [...(contactForm.emailList ?? []), ""])}
                        className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1">
                        <Plus size={11} /> Add another email
                      </button>
                    </div>
                  ) : (
                    <div className="mt-1 space-y-1">
                      {allEmails.length ? allEmails.map(em => (
                        <a key={em} href={`mailto:${em}`} className="block text-sm text-blue-600 hover:underline">{em}</a>
                      )) : <p className="text-sm text-slate-400">—</p>}
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Phone</label>
                  {contactEditing
                    ? <input className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" value={contactForm.phone ?? ""} onChange={e => setCF("phone", e.target.value || null)} />
                    : <p className="text-sm text-slate-800 mt-1">{cp.phone || "—"}</p>}
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">LinkedIn</label>
                  {contactEditing
                    ? <input className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" value={contactForm.linkedin_url ?? ""} onChange={e => setCF("linkedin_url", e.target.value || null)} />
                    : cp.linkedin_url
                      ? <a href={cp.linkedin_url} target="_blank" rel="noopener noreferrer" className="block text-sm text-blue-600 hover:underline mt-1 truncate">{cp.linkedin_url}</a>
                      : <p className="text-sm text-slate-400 mt-1">—</p>}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">City</label>
                    {contactEditing
                      ? <input className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" value={contactForm.location_city ?? ""} onChange={e => setCF("location_city", e.target.value || null)} />
                      : <p className="text-sm text-slate-800 mt-1">{cp.location_city || "—"}</p>}
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Country</label>
                    {contactEditing
                      ? <input className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" value={contactForm.location_country ?? ""} onChange={e => setCF("location_country", e.target.value || null)} />
                      : <p className="text-sm text-slate-800 mt-1">{cp.location_country || "—"}</p>}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Notes</label>
                  {contactEditing
                    ? <textarea className="mt-1 w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" rows={4} value={contactForm.notes ?? ""} onChange={e => setCF("notes", e.target.value || null)} />
                    : <p className="text-sm text-slate-700 mt-1 whitespace-pre-wrap leading-relaxed">{cp.notes || <span className="text-slate-300 italic">No notes</span>}</p>}
                </div>

                </>}{/* end detail mode */}
              </div>

              {/* Footer */}
              <div className="px-5 py-4 border-t border-slate-100 space-y-2">
                {contactPanelMode === "manage" && !showAddContactForm && (
                  <p className="text-xs text-center text-slate-400">Click Edit to modify a contact</p>
                )}
                {contactPanelMode === "detail" && contactEditing && (
                  <div className="flex gap-2">
                    <button onClick={() => { setContactEditing(false); setContactForm({}); }}
                      className="flex-1 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
                    <button onClick={saveContact} disabled={contactSaving}
                      className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-1.5">
                      {contactSaving ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : <><Check size={13} /> Save</>}
                    </button>
                  </div>
                )}
                {contactPanelMode === "detail" && !contactEditing && (
                  confirmRemove ? (
                    <div className="space-y-2">
                      <p className="text-xs text-center text-slate-500">Remove this contact permanently?</p>
                      <div className="flex gap-2">
                        <button onClick={() => setConfirmRemove(false)} className="flex-1 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
                        <button onClick={removeContact} disabled={contactRemoving}
                          className="flex-1 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-1.5">
                          {contactRemoving ? <><Loader2 size={13} className="animate-spin" /> Removing…</> : "Confirm Remove"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmRemove(true)}
                      className="w-full py-2 border border-red-200 rounded-lg text-sm text-red-500 hover:bg-red-50 transition-colors">
                      Remove Contact
                    </button>
                  )
                )}
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
