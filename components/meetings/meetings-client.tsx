"use client";
// ─── Meetings Client — table layout with resolution-status strips ──────────────

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Search, RefreshCw, ChevronDown, ChevronUp,
  Building2, Calendar, CheckSquare,
  AlertCircle, X, Clock, Archive, ArchiveRestore, Trash2, FileText,
  Users, ExternalLink,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import type { Interaction, Company } from "@/lib/types";
import Link from "next/link";
import { ResolutionModal } from "./resolution-modal";
import { MeetingPanel } from "./meeting-panel";

type MeetingRow = Interaction & {
  company: Pick<Company, "id" | "name"> | null;
  meeting_type?: string | null;
};
type CompanyStub = Pick<Company, "id" | "name" | "type">;

// ── Resolution strip config ───────────────────────────────────────────────────

const RESOLUTION_CONFIG: Record<string, { strip: string; dot: string; label: string; rowBg: string }> = {
  resolved:    { strip: "bg-brand-teal",  dot: "bg-brand-teal",  label: "Resolved",    rowBg: "" },
  partial:     { strip: "bg-amber-400",   dot: "bg-amber-400",   label: "Partial",     rowBg: "bg-amber-50/40" },
  unresolved:  { strip: "bg-red-400",     dot: "bg-red-400",     label: "Unresolved",  rowBg: "bg-red-50/30" },
  no_external: { strip: "bg-slate-300",   dot: "bg-slate-300",   label: "Internal",    rowBg: "" },
  deferred:    { strip: "bg-amber-300",   dot: "bg-amber-300",   label: "Deferred",    rowBg: "bg-amber-50/30" },
};

function getResConfig(status: string | null) {
  return RESOLUTION_CONFIG[status ?? ""] ?? { strip: "bg-slate-200", dot: "bg-slate-200", label: "Unknown", rowBg: "" };
}

// ── Meeting type labels / styles ──────────────────────────────────────────────

const MEETING_TYPE_STYLES: Record<string, string> = {
  intro_call:     "bg-sky-50 text-sky-700 border-sky-200",
  pitch:          "bg-violet-50 text-violet-700 border-violet-200",
  due_diligence:  "bg-amber-50 text-amber-700 border-amber-200",
  follow_up:      "bg-teal-50 text-teal-700 border-teal-200",
  board_meeting:  "bg-slate-100 text-slate-700 border-slate-300",
  ic_meeting:     "bg-slate-100 text-slate-700 border-slate-300",
  lp_meeting:     "bg-emerald-50 text-emerald-700 border-emerald-200",
  strategic_call: "bg-orange-50 text-orange-700 border-orange-200",
  startup_call:   "bg-blue-50 text-blue-700 border-blue-200",
  general:        "bg-slate-50 text-slate-500 border-slate-200",
};
const MEETING_TYPE_LABELS: Record<string, string> = {
  intro_call:     "Intro Call",
  pitch:          "Pitch",
  due_diligence:  "Due Diligence",
  follow_up:      "Follow-up",
  board_meeting:  "Board",
  ic_meeting:     "IC",
  lp_meeting:     "LP",
  strategic_call: "Strategic",
  startup_call:   "Startup",
  general:        "General",
};

function MeetingTypeBadge({ type }: { type: string | null | undefined }) {
  if (!type) return null;
  const style = MEETING_TYPE_STYLES[type] ?? MEETING_TYPE_STYLES.general;
  const label = MEETING_TYPE_LABELS[type] ?? type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border font-medium whitespace-nowrap", style)}>
      {label}
    </span>
  );
}

// ── Source badge ──────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string | null }) {
  if (!source || source === "manual") return null;
  const styles: Record<string, string> = {
    fireflies:         "bg-violet-50 text-violet-700 border-violet-200",
    transcript_upload: "bg-slate-50 text-slate-600 border-slate-200",
  };
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border font-medium whitespace-nowrap", styles[source] ?? styles.fireflies)}>
      {source === "fireflies" ? "Fireflies" : "Upload"}
    </span>
  );
}

// ── Attendee avatars ──────────────────────────────────────────────────────────

function AttendeeAvatars({ attendees }: { attendees: unknown[] | null }) {
  if (!attendees || attendees.length === 0) return <span className="text-slate-300 text-xs">—</span>;
  const atts = (attendees as Array<{ name?: string; email?: string }>).slice(0, 3);
  const overflow = Math.max(0, (attendees as unknown[]).length - 3);
  return (
    <div className="flex items-center gap-0.5">
      {atts.map((a, i) => (
        <div key={i} title={a.name ?? a.email ?? ""}
          className="w-5 h-5 rounded-full bg-violet-100 border-2 border-white flex items-center justify-center -ml-1 first:ml-0 shadow-sm">
          <span className="text-violet-600 text-[8px] font-bold">
            {(a.name?.[0] ?? a.email?.[0] ?? "?").toUpperCase()}
          </span>
        </div>
      ))}
      {overflow > 0 && (
        <div className="w-5 h-5 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center -ml-1 shadow-sm">
          <span className="text-slate-400 text-[8px] font-bold">+{overflow}</span>
        </div>
      )}
    </div>
  );
}

// ── Resolution status pill ────────────────────────────────────────────────────

function ResolutionPill({ status }: { status: string | null }) {
  const cfg = getResConfig(status);
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap",
      status === "resolved"    && "bg-teal-50 text-brand-teal border-teal-200",
      status === "partial"     && "bg-amber-50 text-amber-700 border-amber-200",
      status === "unresolved"  && "bg-red-50 text-red-700 border-red-200",
      status === "no_external" && "bg-slate-100 text-slate-500 border-slate-200",
      status === "deferred"    && "bg-amber-50 text-amber-600 border-amber-200",
      !status                  && "bg-slate-100 text-slate-400 border-slate-200",
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", cfg.dot)} />
      {cfg.label}
    </span>
  );
}

// ── Table row ─────────────────────────────────────────────────────────────────

type SortKey = "date" | "subject" | "company" | "status" | "type";
type SortDir = "asc" | "desc";

interface MeetingTableRowProps {
  meeting: MeetingRow;
  selected: boolean;
  onToggle: (id: string, checked: boolean) => void;
  onResolve: (m: MeetingRow) => void;
  onOpenPanel: (m: MeetingRow) => void;
  onArchive: (id: string) => void;
  onReassign: (id: string) => void;
}

function MeetingTableRow({
  meeting, selected, onToggle, onResolve, onOpenPanel, onArchive, onReassign,
}: MeetingTableRowProps) {
  const cfg = getResConfig(meeting.resolution_status);
  const needsAction = meeting.resolution_status === "unresolved" || meeting.resolution_status === "partial";
  const hasTranscript = !!(meeting.transcript_text || meeting.transcript_url);
  const actionCount = meeting.action_items?.length ?? 0;

  return (
    <div className={cn(
      "group relative flex items-center border-b border-slate-100 transition-colors min-h-[44px]",
      selected ? "bg-teal-50/50" : cn("hover:bg-slate-50/70", cfg.rowBg),
    )}>
      {/* Status strip */}
      <div className={cn("absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full flex-shrink-0", cfg.strip)} />

      {/* Checkbox */}
      <div className="pl-5 pr-3 flex-shrink-0">
        <input
          type="checkbox"
          checked={selected}
          onChange={e => onToggle(meeting.id, e.target.checked)}
          onClick={e => e.stopPropagation()}
          className="w-3.5 h-3.5 rounded border-slate-300 text-brand-teal cursor-pointer accent-[#0D3D38]"
        />
      </div>

      {/* Title + summary snippet */}
      <div className="flex-1 min-w-0 py-2.5 pr-4">
        <button
          onClick={() => onOpenPanel(meeting)}
          className="text-left w-full group/title"
        >
          <p className="text-xs font-semibold text-slate-800 truncate group-hover/title:text-brand-teal transition-colors">
            {meeting.subject ?? "Untitled Meeting"}
          </p>
          {(meeting.ai_summary ?? meeting.summary) && (
            <p className="text-[10px] text-slate-400 truncate mt-0.5 leading-relaxed">
              {(meeting.ai_summary ?? meeting.summary ?? "").slice(0, 100)}
            </p>
          )}
        </button>
      </div>

      {/* Company */}
      <div className="w-36 flex-shrink-0 pr-4">
        {meeting.company ? (
          <div className="flex items-center gap-1">
            <Link
              href={`/crm/companies/${meeting.company.id}`}
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 text-[11px] font-medium text-brand-teal hover:underline truncate max-w-[100px]"
            >
              <Building2 size={10} className="flex-shrink-0" />
              <span className="truncate">{meeting.company.name}</span>
            </Link>
            <button
              onClick={e => { e.stopPropagation(); onReassign(meeting.id); }}
              title="Change company"
              className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-300 hover:text-brand-teal flex-shrink-0"
            >
              <ExternalLink size={9} />
            </button>
          </div>
        ) : (
          <button
            onClick={e => { e.stopPropagation(); onReassign(meeting.id); }}
            className="flex items-center gap-1 text-[10px] text-amber-600 hover:text-amber-800 font-medium"
          >
            <Building2 size={9} />
            <span>Link company</span>
          </button>
        )}
      </div>

      {/* Attendees */}
      <div className="w-20 flex-shrink-0 pr-4">
        <AttendeeAvatars attendees={meeting.attendees} />
      </div>

      {/* Meeting type */}
      <div className="w-24 flex-shrink-0 pr-4">
        <MeetingTypeBadge type={meeting.meeting_type} />
      </div>

      {/* Date + duration */}
      <div className="w-28 flex-shrink-0 pr-4">
        <span className="flex items-center gap-1 text-[11px] text-slate-500 whitespace-nowrap">
          <Calendar size={10} className="flex-shrink-0 text-slate-400" />
          {formatDate(meeting.date)}
        </span>
        {meeting.duration_minutes ? (
          <span className="flex items-center gap-0.5 text-[10px] text-slate-400 mt-0.5">
            <Clock size={9} />{meeting.duration_minutes}m
          </span>
        ) : null}
      </div>

      {/* Resolution status */}
      <div className="w-28 flex-shrink-0 pr-4">
        <ResolutionPill status={meeting.resolution_status} />
      </div>

      {/* Indicators: source, transcript, actions */}
      <div className="w-24 flex-shrink-0 pr-4 flex items-center gap-1 flex-wrap">
        <SourceBadge source={meeting.source} />
        {hasTranscript && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-slate-50 text-slate-500 border border-slate-200">
            <FileText size={8} className="mr-0.5" />T
          </span>
        )}
        {actionCount > 0 && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-amber-50 text-amber-700 border border-amber-200">
            <CheckSquare size={8} />{actionCount}
          </span>
        )}
      </div>

      {/* Action buttons */}
      <div className="w-24 flex-shrink-0 pr-4 flex items-center justify-end gap-1.5">
        {needsAction && (
          <button
            onClick={e => { e.stopPropagation(); onResolve(meeting); }}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors whitespace-nowrap shadow-sm"
          >
            <AlertCircle size={9} />
            Resolve
          </button>
        )}
        <button
          title="Archive meeting"
          onClick={e => {
            e.stopPropagation();
            if (!confirm("Archive this meeting? It will be hidden and won't reappear when synced.")) return;
            onArchive(meeting.id);
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-slate-300 hover:text-amber-500"
        >
          <Archive size={13} />
        </button>
      </div>
    </div>
  );
}

// ── Column header button ──────────────────────────────────────────────────────

function ColHeader({
  label, sortKey, currentSort, currentDir, onSort, className,
}: {
  label: string;
  sortKey: SortKey;
  currentSort: SortKey;
  currentDir: SortDir;
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = currentSort === sortKey;
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={cn(
        "flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide transition-colors select-none",
        active ? "text-brand-teal" : "text-slate-400 hover:text-slate-600",
        className,
      )}
    >
      {label}
      {active ? (
        currentDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />
      ) : (
        <ChevronDown size={10} className="opacity-0 group-hover:opacity-50" />
      )}
    </button>
  );
}

// ── Simple toast ──────────────────────────────────────────────────────────────

function MessageToast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2500);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className="fixed bottom-6 right-6 z-50 bg-slate-800 text-white text-xs rounded-lg shadow-xl px-4 py-2.5 flex items-center gap-2">
      <span>{message}</span>
      <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={12} /></button>
    </div>
  );
}

// ── Sync toast ────────────────────────────────────────────────────────────────

interface ToastData { imported: number; resolved: number; needsReview: number; internal: number; }

function SyncToast({ data, onClose, onReview }: { data: ToastData; onClose: () => void; onReview: () => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-4 w-80">
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm font-semibold text-slate-800">Sync complete</p>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-0.5"><X size={14} /></button>
      </div>
      <p className="text-xs text-slate-600">
        {data.imported ?? 0} meetings synced — {data.resolved ?? 0} auto-tagged, {data.needsReview ?? 0} need review
      </p>
      {data.needsReview > 0 && (
        <button onClick={onReview}
          className="mt-2 text-xs text-brand-teal hover:underline font-medium flex items-center gap-1">
          Review {data.needsReview} meetings →
        </button>
      )}
    </div>
  );
}

// ── Filter pill ───────────────────────────────────────────────────────────────

const SEL_CLS = "h-8 text-xs border border-slate-200 rounded-md px-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal text-slate-700 transition-colors";

// ── Main component ────────────────────────────────────────────────────────────

interface MeetingsClientProps {
  meetings: MeetingRow[];
  archivedMeetings?: MeetingRow[];
  lastSynced?: string | null;
  companies?: CompanyStub[];
}

export function MeetingsClient({
  meetings: initialMeetings,
  archivedMeetings: initialArchived = [],
  lastSynced: initialLastSynced,
  companies: allCompanies = [],
}: MeetingsClientProps) {
  const [meetings, setMeetings]                     = useState<MeetingRow[]>(initialMeetings);
  const [archivedMeetings, setArchivedMeetings]     = useState<MeetingRow[]>(initialArchived);
  const [showArchived, setShowArchived]             = useState(false);
  const [search, setSearch]                         = useState("");
  const [sourceFilter, setSourceFilter]             = useState<"all" | "fireflies" | "manual">("all");
  const [resolutionFilter, setResolutionFilter]     = useState<"all" | "resolved" | "review" | "unresolved" | "internal">("all");
  const [companyFilter, setCompanyFilter]           = useState("all");
  const [dateFrom, setDateFrom]                     = useState("");
  const [dateTo, setDateTo]                         = useState("");
  const [hasActionItems, setHasActionItems]         = useState(false);
  const [hasTranscript, setHasTranscript]           = useState(false);
  const [syncing, setSyncing]                       = useState(false);
  const [backfilling, setBackfilling]               = useState(false);
  const [lastSynced, setLastSynced]                 = useState<string | null>(initialLastSynced ?? null);
  const [toast, setToast]                           = useState<ToastData | null>(null);
  const [resolveMeeting, setResolveMeeting]         = useState<MeetingRow | null>(null);
  const [panelMeeting, setPanelMeeting]             = useState<MeetingRow | null>(null);
  const [statusToast, setStatusToast]               = useState<string | null>(null);
  const [reassignId, setReassignId]                 = useState<string | null>(null);
  const [reassignSearch, setReassignSearch]         = useState("");
  const [sortKey, setSortKey]                       = useState<SortKey>("date");
  const [sortDir, setSortDir]                       = useState<SortDir>("desc");
  const [selectedIds, setSelectedIds]               = useState<Set<string>>(new Set());
  const selectAllRef                                = useRef<HTMLInputElement>(null);

  // ── Stats ─────────────────────────────────────────────────────────────────

  const totalMeetings    = meetings.length;
  const transcriptCount  = meetings.filter(m => m.transcript_text || m.transcript_url).length;
  const fellowCount      = meetings.filter(m => m.source === "fireflies" || !!m.fireflies_id).length;
  const actionItemTotal  = meetings.reduce((s, m) => s + (m.action_items?.length ?? 0), 0);
  const needsReviewCount = meetings.filter(m => m.resolution_status === "partial" || m.resolution_status === "unresolved").length;

  const companyOptions = useMemo(() => {
    const seen = new Map<string, string>();
    meetings.forEach(m => { if (m.company) seen.set(m.company.id, m.company.name); });
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [meetings]);

  // ── Filter + sort ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let rows = meetings;

    if (sourceFilter !== "all") {
      rows = rows.filter(m =>
        sourceFilter === "fireflies"
          ? (m.source === "fireflies" || !!m.fireflies_id)
          : (!m.source || m.source === "manual")
      );
    }
    if (resolutionFilter === "review")     rows = rows.filter(m => m.resolution_status === "partial" || m.resolution_status === "unresolved");
    if (resolutionFilter === "resolved")   rows = rows.filter(m => m.resolution_status === "resolved");
    if (resolutionFilter === "unresolved") rows = rows.filter(m => m.resolution_status === "unresolved");
    if (resolutionFilter === "internal")   rows = rows.filter(m => m.resolution_status === "no_external");
    if (companyFilter !== "all")           rows = rows.filter(m => m.company?.id === companyFilter);
    if (dateFrom)                          rows = rows.filter(m => m.date >= dateFrom);
    if (dateTo)                            rows = rows.filter(m => m.date <= dateTo + "T23:59:59");
    if (hasActionItems)                    rows = rows.filter(m => (m.action_items?.length ?? 0) > 0);
    if (hasTranscript)                     rows = rows.filter(m => !!(m.transcript_text || m.transcript_url));

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(m =>
        (m.subject ?? "").toLowerCase().includes(q) ||
        (m.summary ?? "").toLowerCase().includes(q) ||
        (m.ai_summary ?? "").toLowerCase().includes(q) ||
        (m.company?.name ?? "").toLowerCase().includes(q)
      );
    }

    // Sort
    rows = [...rows].sort((a, b) => {
      let av = "", bv = "";
      if (sortKey === "date")    { av = a.date ?? ""; bv = b.date ?? ""; }
      if (sortKey === "subject") { av = a.subject ?? ""; bv = b.subject ?? ""; }
      if (sortKey === "company") { av = a.company?.name ?? ""; bv = b.company?.name ?? ""; }
      if (sortKey === "status")  { av = a.resolution_status ?? ""; bv = b.resolution_status ?? ""; }
      if (sortKey === "type")    { av = a.meeting_type ?? ""; bv = b.meeting_type ?? ""; }
      const cmp = av.localeCompare(bv);
      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [meetings, search, sourceFilter, resolutionFilter, companyFilter, dateFrom, dateTo, hasActionItems, hasTranscript, sortKey, sortDir]);

  // ── Select-all indeterminate ───────────────────────────────────────────────

  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    const visibleIds = filtered.map(m => m.id);
    const selectedVisible = visibleIds.filter(id => selectedIds.has(id));
    el.indeterminate = selectedVisible.length > 0 && selectedVisible.length < visibleIds.length;
  }, [selectedIds, filtered]);

  function timeSince(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/fireflies/sync", { method: "POST" });
      const data = await res.json() as {
        imported?: number; resolved?: number; needsReview?: number; internal?: number; error?: string;
      };
      if (data.error) { alert(data.error); }
      else {
        const now = new Date().toISOString();
        setLastSynced(now);
        try { localStorage.setItem("fireflies_last_sync", now); } catch {}
        setToast({ imported: data.imported ?? 0, resolved: data.resolved ?? 0, needsReview: data.needsReview ?? 0, internal: data.internal ?? 0 });
        window.location.reload();
      }
    } catch { alert("Sync failed"); }
    setSyncing(false);
  }, []);

  const handleBackfill = useCallback(async () => {
    setBackfilling(true);
    try {
      const res = await fetch("/api/meetings/backfill-transcripts", { method: "POST" });
      const data = await res.json() as { saved?: number; skipped?: number; errors?: number; message?: string; error?: string };
      if (data.error) { alert(data.error); }
      else { alert(data.message ?? `Backfill complete: ${data.saved ?? 0} PDFs saved`); }
    } catch { alert("Backfill failed"); }
    setBackfilling(false);
  }, []);

  function handleResolved(meetingId: string) {
    setMeetings(prev => prev.map(m => m.id === meetingId ? { ...m, resolution_status: "resolved" } : m));
  }

  const handleArchive = useCallback(async (id: string) => {
    const res = await fetch(`/api/meetings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: true }),
    });
    if (!res.ok) { setStatusToast("Failed to archive meeting"); return; }
    const meeting = meetings.find(m => m.id === id);
    setMeetings(prev => prev.filter(m => m.id !== id));
    if (meeting) setArchivedMeetings(prev => [{ ...meeting, archived: true }, ...prev]);
    if (panelMeeting?.id === id) setPanelMeeting(null);
    setSelectedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    setStatusToast("Meeting archived");
  }, [panelMeeting, meetings]);

  const handleUnarchive = useCallback(async (id: string) => {
    const res = await fetch(`/api/meetings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived: false }),
    });
    if (!res.ok) { setStatusToast("Failed to unarchive meeting"); return; }
    const meeting = archivedMeetings.find(m => m.id === id);
    setArchivedMeetings(prev => prev.filter(m => m.id !== id));
    if (meeting) setMeetings(prev => [{ ...meeting, archived: false }, ...prev]);
    setStatusToast("Meeting restored");
  }, [archivedMeetings]);

  const handleDeleteArchived = useCallback(async (id: string) => {
    if (!confirm("Permanently delete this meeting? This cannot be undone.")) return;
    const res = await fetch(`/api/meetings/${id}`, { method: "DELETE" });
    if (!res.ok) { setStatusToast("Failed to delete meeting"); return; }
    setArchivedMeetings(prev => prev.filter(m => m.id !== id));
    setStatusToast("Meeting deleted");
  }, []);

  const handleToggleSelect = useCallback((id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((checked: boolean) => {
    setSelectedIds(checked ? new Set(filtered.map(m => m.id)) : new Set());
  }, [filtered]);

  const handleBulkArchive = useCallback(async () => {
    const count = selectedIds.size;
    if (!confirm(`Archive ${count} meeting${count > 1 ? "s" : ""}? They will be hidden and won't reappear when synced.`)) return;
    await Promise.all([...selectedIds].map(id =>
      fetch(`/api/meetings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      })
    ));
    setMeetings(prev => prev.filter(m => !selectedIds.has(m.id)));
    if (panelMeeting && selectedIds.has(panelMeeting.id)) setPanelMeeting(null);
    setSelectedIds(new Set());
    setStatusToast(`${count} meeting${count > 1 ? "s" : ""} archived`);
  }, [selectedIds, panelMeeting]);

  function handlePanelUpdate(patch: Partial<MeetingRow> & { id: string }) {
    setMeetings(prev => prev.map(m => m.id === patch.id ? { ...m, ...patch } : m));
    setPanelMeeting(prev => prev && prev.id === patch.id ? { ...prev, ...patch } : prev);
  }

  const handleReassign = useCallback(async (meetingId: string, company: CompanyStub) => {
    const res = await fetch(`/api/meetings/${meetingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_id: company.id }),
    });
    if (!res.ok) { setStatusToast("Failed to link company"); return; }
    setMeetings(prev =>
      prev.map(m => m.id === meetingId ? { ...m, company: { id: company.id, name: company.name } as MeetingRow["company"] } : m)
    );
    setReassignId(null);
    setReassignSearch("");
    setStatusToast(`Linked to ${company.name}`);
  }, []);

  const allVisibleSelected = filtered.length > 0 && filtered.every(m => selectedIds.has(m.id));

  // ── Status pills for top bar ───────────────────────────────────────────────

  const unresolved = meetings.filter(m => m.resolution_status === "unresolved").length;
  const partial    = meetings.filter(m => m.resolution_status === "partial").length;
  const resolved   = meetings.filter(m => m.resolution_status === "resolved").length;
  const internal   = meetings.filter(m => m.resolution_status === "no_external").length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 overflow-hidden flex flex-col min-h-0">

      {/* ── Stats bar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-6 px-6 py-3 border-b border-slate-100 bg-white flex-shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className="text-lg font-bold text-slate-900">{totalMeetings}</span>
          <span>meetings</span>
        </div>
        <div className="w-px h-5 bg-slate-200" />

        {/* Status breakdown pills */}
        <div className="flex items-center gap-2">
          {unresolved > 0 && (
            <button
              onClick={() => setResolutionFilter("unresolved")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors",
                resolutionFilter === "unresolved"
                  ? "bg-red-600 text-white border-red-600"
                  : "bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
              {unresolved} unresolved
            </button>
          )}
          {partial > 0 && (
            <button
              onClick={() => setResolutionFilter("review")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors",
                resolutionFilter === "review"
                  ? "bg-amber-500 text-white border-amber-500"
                  : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />
              {partial} partial
            </button>
          )}
          {resolved > 0 && (
            <button
              onClick={() => setResolutionFilter("resolved")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors",
                resolutionFilter === "resolved"
                  ? "bg-brand-teal text-white border-brand-teal"
                  : "bg-teal-50 text-brand-teal border-teal-200 hover:bg-teal-100"
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-brand-teal inline-block" />
              {resolved} resolved
            </button>
          )}
          {internal > 0 && (
            <button
              onClick={() => setResolutionFilter("internal")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors",
                resolutionFilter === "internal"
                  ? "bg-slate-700 text-white border-slate-700"
                  : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 inline-block" />
              {internal} internal
            </button>
          )}
          {resolutionFilter !== "all" && (
            <button
              onClick={() => setResolutionFilter("all")}
              className="text-[10px] text-slate-400 hover:text-slate-600 px-1"
            >
              ✕ clear
            </button>
          )}
        </div>

        <div className="flex-1" />

        {/* Secondary stats */}
        {transcriptCount > 0 && (
          <span className="text-[11px] text-slate-400">{transcriptCount} w/ transcript</span>
        )}
        {actionItemTotal > 0 && (
          <span className="flex items-center gap-1 text-[11px] text-amber-600 font-medium">
            <CheckSquare size={11} />{actionItemTotal} action items
          </span>
        )}
        {fellowCount > 0 && (
          <span className="text-[11px] text-violet-600">{fellowCount} from Fireflies</span>
        )}
      </div>

      {/* ── Filter bar ─────────────────────────────────────────────────────── */}
      <div className="border-b border-slate-200 bg-white px-6 py-2.5 flex items-center gap-2 flex-wrap flex-shrink-0">
        {/* Search */}
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search meetings…"
            className="w-full pl-7 pr-3 h-8 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal text-slate-700 transition-colors"
          />
        </div>

        {/* Source filter */}
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value as typeof sourceFilter)} className={SEL_CLS}>
          <option value="all">All sources</option>
          <option value="fireflies">Fireflies</option>
          <option value="manual">Manual</option>
        </select>

        {/* Company filter */}
        {companyOptions.length > 0 && (
          <select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)} className={SEL_CLS}>
            <option value="all">All companies</option>
            {companyOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}

        {/* Date range */}
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={SEL_CLS} />
        <span className="text-xs text-slate-400">–</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={SEL_CLS} />

        {/* Toggles */}
        <label className="flex items-center gap-1 text-xs text-slate-500 cursor-pointer select-none">
          <input type="checkbox" checked={hasActionItems} onChange={e => setHasActionItems(e.target.checked)} className="rounded border-slate-300 accent-[#0D3D38]" />
          Actions
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-500 cursor-pointer select-none">
          <input type="checkbox" checked={hasTranscript} onChange={e => setHasTranscript(e.target.checked)} className="rounded border-slate-300 accent-[#0D3D38]" />
          Transcript
        </label>

        <div className="flex-1" />

        {lastSynced && !syncing && (
          <span className="text-[10px] text-slate-400">Synced {timeSince(lastSynced)}</span>
        )}

        {/* Archived toggle */}
        <button
          onClick={() => setShowArchived(v => !v)}
          className={cn(
            "flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-md border transition-colors",
            showArchived
              ? "bg-amber-50 text-amber-700 border-amber-300"
              : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
          )}
        >
          <Archive size={11} />
          Archived {archivedMeetings.length > 0 && `(${archivedMeetings.length})`}
        </button>

        {/* Backfill */}
        <button
          onClick={handleBackfill}
          disabled={backfilling || syncing}
          title="Generate PDFs for resolved meetings without transcripts"
          className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium bg-white text-slate-500 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          <FileText size={11} className={cn(backfilling && "animate-pulse")} />
          {backfilling ? "Backfilling…" : "Backfill PDFs"}
        </button>

        {/* Sync */}
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 h-8 px-4 bg-brand-teal text-white text-xs font-semibold rounded-md hover:bg-brand-tealDark transition-colors disabled:opacity-50"
        >
          <RefreshCw size={11} className={cn(syncing && "animate-spin")} />
          {syncing ? "Syncing…" : "Sync Fireflies"}
        </button>
      </div>

      {/* ── Bulk action bar ─────────────────────────────────────────────────── */}
      {selectedIds.size > 0 && (
        <div className="bg-teal-50 border-b border-teal-200 px-6 py-2 flex items-center gap-3 flex-shrink-0">
          <span className="text-teal-800 font-semibold text-xs">
            {selectedIds.size} meeting{selectedIds.size > 1 ? "s" : ""} selected
          </span>
          <button
            onClick={handleBulkArchive}
            className="flex items-center gap-1.5 h-7 px-3 text-xs font-semibold bg-brand-teal text-white rounded-md hover:bg-brand-tealDark transition-colors"
          >
            <Archive size={11} />
            Archive Selected
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-teal-600 hover:text-teal-800 font-medium"
          >
            Clear
          </button>
        </div>
      )}

      {/* ── Table header ────────────────────────────────────────────────────── */}
      <div className="bg-slate-50 border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center min-h-[34px]">
          {/* Left strip placeholder */}
          <div className="w-[3px] ml-0 mr-5 flex-shrink-0" />

          {/* Select all */}
          <div className="pr-3 flex-shrink-0">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allVisibleSelected}
              onChange={e => handleSelectAll(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-300 cursor-pointer accent-[#0D3D38]"
            />
          </div>

          {/* Column headers */}
          <div className="flex-1 pr-4">
            <ColHeader label="Title" sortKey="subject" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          </div>
          <div className="w-36 flex-shrink-0 pr-4">
            <ColHeader label="Company" sortKey="company" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          </div>
          <div className="w-20 flex-shrink-0 pr-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">People</span>
          </div>
          <div className="w-24 flex-shrink-0 pr-4">
            <ColHeader label="Type" sortKey="type" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          </div>
          <div className="w-28 flex-shrink-0 pr-4">
            <ColHeader label="Date" sortKey="date" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          </div>
          <div className="w-28 flex-shrink-0 pr-4">
            <ColHeader label="Status" sortKey="status" currentSort={sortKey} currentDir={sortDir} onSort={handleSort} />
          </div>
          <div className="w-24 flex-shrink-0 pr-4">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Signals</span>
          </div>
          <div className="w-24 flex-shrink-0 pr-4" />
        </div>
      </div>

      {/* ── Table body ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto min-h-0 bg-white">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Users size={32} className="mb-3 opacity-30" />
            <p className="text-sm font-medium text-slate-500">No meetings found</p>
            <p className="text-xs mt-1 text-slate-400">
              {search ? "Try clearing your search or filters" : "Click \"Sync Fireflies\" to pull recent meetings"}
            </p>
          </div>
        ) : (
          filtered.map(m => (
            <MeetingTableRow
              key={m.id}
              meeting={m}
              selected={selectedIds.has(m.id)}
              onToggle={handleToggleSelect}
              onResolve={setResolveMeeting}
              onOpenPanel={setPanelMeeting}
              onArchive={handleArchive}
              onReassign={setReassignId}
            />
          ))
        )}
      </div>

      {/* ── Archived section ────────────────────────────────────────────────── */}
      {showArchived && (
        <div className="border-t border-amber-200 bg-amber-50/40 px-6 py-4 flex-shrink-0 max-h-72 overflow-y-auto">
          <p className="text-[10px] font-semibold text-amber-700 uppercase tracking-widest mb-3 flex items-center gap-2">
            <Archive size={11} />
            Archived Meetings ({archivedMeetings.length})
          </p>
          {archivedMeetings.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No archived meetings.</p>
          ) : (
            <div className="divide-y divide-amber-100">
              {archivedMeetings.map(m => (
                <div key={m.id} className="flex items-center gap-3 py-2.5 opacity-70 hover:opacity-100 transition-opacity">
                  <div className={cn("w-[3px] h-4 rounded-full flex-shrink-0", getResConfig(m.resolution_status).strip)} />
                  <span className="flex-1 text-xs text-slate-600 truncate font-medium">{m.subject ?? "Untitled Meeting"}</span>
                  {m.company && (
                    <span className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400 flex-shrink-0">
                      <Building2 size={9} />{m.company.name}
                    </span>
                  )}
                  <span className="text-[11px] text-slate-400 flex-shrink-0 flex items-center gap-1">
                    <Calendar size={10} />{formatDate(m.date)}
                  </span>
                  <button
                    title="Restore meeting"
                    onClick={() => handleUnarchive(m.id)}
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-teal-50 text-brand-teal border border-teal-200 rounded-md hover:bg-teal-100 transition-colors flex-shrink-0"
                  >
                    <ArchiveRestore size={10} /> Restore
                  </button>
                  <button
                    title="Delete permanently"
                    onClick={() => handleDeleteArchived(m.id)}
                    className="p-1 text-slate-300 hover:text-red-500 transition-colors flex-shrink-0"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Resolution modal ────────────────────────────────────────────────── */}
      {resolveMeeting && (
        <ResolutionModal
          meeting={resolveMeeting}
          onClose={() => setResolveMeeting(null)}
          onResolved={handleResolved}
        />
      )}

      {/* ── Detail panel ────────────────────────────────────────────────────── */}
      {panelMeeting && (
        <MeetingPanel
          meeting={panelMeeting}
          onClose={() => setPanelMeeting(null)}
          onUpdate={handlePanelUpdate}
        />
      )}

      {/* ── Company reassign modal ──────────────────────────────────────────── */}
      {reassignId && (() => {
        const filteredCos = allCompanies.filter(c =>
          !reassignSearch || c.name.toLowerCase().includes(reassignSearch.toLowerCase())
        );
        return (
          <div
            className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4"
            onClick={() => { setReassignId(null); setReassignSearch(""); }}
          >
            <div
              className="bg-white rounded-xl w-[420px] shadow-xl overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">Link meeting to company</p>
                <button onClick={() => { setReassignId(null); setReassignSearch(""); }} className="text-slate-400 hover:text-slate-600">
                  <X size={16} />
                </button>
              </div>
              <div className="px-4 py-3 border-b border-slate-100">
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Search companies…"
                    value={reassignSearch}
                    onChange={e => setReassignSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal"
                  />
                </div>
              </div>
              <div className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                {filteredCos.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-slate-400 text-center">No companies found</p>
                ) : filteredCos.slice(0, 50).map(c => (
                  <button
                    key={c.id}
                    onClick={() => handleReassign(reassignId, c)}
                    className="w-full text-left px-4 py-2.5 text-sm hover:bg-teal-50 flex items-center justify-between gap-2 transition-colors"
                  >
                    <span className="font-medium text-slate-800 truncate">{c.name}</span>
                    <span className="text-[10px] text-slate-400 capitalize flex-shrink-0">{c.type}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Toasts ──────────────────────────────────────────────────────────── */}
      {statusToast && <MessageToast message={statusToast} onClose={() => setStatusToast(null)} />}
      {toast && (
        <SyncToast
          data={toast}
          onClose={() => setToast(null)}
          onReview={() => { setResolutionFilter("review"); setToast(null); }}
        />
      )}
    </div>
  );
}
