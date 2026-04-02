"use client";
// ─── Meetings Client (Fellow Integration) ─────────────────────────────────────

import { useState, useMemo, useCallback } from "react";
import {
  Search, RefreshCw, ChevronDown, ChevronRight,
  Building2, Calendar, CheckSquare, Users,
  AlertCircle, X, Clock
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import type { Interaction, Company } from "@/lib/types";
import Link from "next/link";
import { ResolutionModal } from "./resolution-modal";
import { MeetingPanel } from "./meeting-panel";

type MeetingRow = Interaction & { company: Pick<Company, "id" | "name"> | null };

// ── Resolution dot ────────────────────────────────────────────────────────────

function ResolutionDot({ status }: { status: string | null }) {
  const config: Record<string, { color: string; label: string }> = {
    resolved:    { color: "bg-emerald-400", label: "Resolved" },
    partial:     { color: "bg-amber-400",   label: "Needs review" },
    unresolved:  { color: "bg-red-400",     label: "Unresolved" },
    no_external: { color: "bg-slate-300",   label: "Internal" },
    deferred:    { color: "bg-amber-300",   label: "Deferred" },
  };
  const c = config[status ?? ""] ?? { color: "bg-slate-300", label: "Unknown" };
  return (
    <span
      title={c.label}
      className={cn("inline-block w-2 h-2 rounded-full flex-shrink-0 ring-2 ring-white", c.color)}
    />
  );
}

// ── Source badge ──────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string | null }) {
  if (!source || source === "manual") return null;
  const styles: Record<string, string> = {
    fellow:             "bg-blue-50 text-blue-700 border-blue-200",
    fireflies:          "bg-violet-50 text-violet-700 border-violet-200",
    transcript_upload:  "bg-slate-50 text-slate-600 border-slate-200",
  };
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border font-medium", styles[source] ?? styles.fireflies)}>
      {source === "fellow" ? "Fellow" : source === "fireflies" ? "Fireflies" : "Upload"}
    </span>
  );
}

// ── Attendee chips ────────────────────────────────────────────────────────────

function AttendeeChips({ attendees }: { attendees: unknown[] | null }) {
  if (!attendees || attendees.length === 0) return null;
  const atts = (attendees as Array<{ name?: string; email?: string }>).slice(0, 3);
  const overflow = Math.max(0, (attendees as unknown[]).length - 3);
  return (
    <div className="flex items-center gap-0.5">
      {atts.map((a, i) => (
        <div key={i} title={a.name ?? a.email ?? ""}
          className="w-5 h-5 rounded-full bg-violet-100 border border-white flex items-center justify-center -ml-0.5 first:ml-0">
          <span className="text-violet-600 text-[8px] font-bold">
            {(a.name?.[0] ?? a.email?.[0] ?? "?").toUpperCase()}
          </span>
        </div>
      ))}
      {overflow > 0 && (
        <div className="w-5 h-5 rounded-full bg-slate-100 border border-white flex items-center justify-center -ml-0.5">
          <span className="text-slate-400 text-[8px] font-bold">+{overflow}</span>
        </div>
      )}
    </div>
  );
}

// ── Meeting card ──────────────────────────────────────────────────────────────

interface MeetingCardProps {
  meeting: MeetingRow;
  onResolve: (m: MeetingRow) => void;
  onOpenPanel: (m: MeetingRow) => void;
}

function MeetingCard({ meeting, onResolve, onOpenPanel }: MeetingCardProps) {
  const [expanded, setExpanded] = useState(false);
  const hasTranscript = !!(meeting.transcript_text || meeting.transcript_url);
  const actionCount   = meeting.action_items?.length ?? 0;
  const needsResolve  = meeting.resolution_status === "partial" || meeting.resolution_status === "unresolved";

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white hover:border-slate-300 transition-colors">
      {/* Summary row */}
      <div className="px-4 py-3 flex items-center gap-3">
        {/* Expand */}
        <button onClick={() => setExpanded(e => !e)} className="text-slate-400 flex-shrink-0 hover:text-slate-600">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {/* Resolution dot */}
        <ResolutionDot status={meeting.resolution_status} />

        {/* Title */}
        <button onClick={() => onOpenPanel(meeting)}
          className="flex-1 text-left text-sm font-medium text-slate-800 truncate hover:text-blue-600 transition-colors">
          {meeting.subject ?? "Untitled Meeting"}
        </button>

        {/* Attendee chips */}
        <AttendeeChips attendees={meeting.attendees} />

        {/* Company pill */}
        {meeting.company && (
          <Link
            href={`/crm/companies/${meeting.company.id}`}
            onClick={(e) => e.stopPropagation()}
            className="hidden sm:flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 flex-shrink-0"
          >
            <Building2 size={10} />
            {meeting.company.name}
          </Link>
        )}

        {/* Date + duration */}
        <span className="flex items-center gap-1 text-xs text-slate-400 flex-shrink-0">
          <Calendar size={11} />
          {formatDate(meeting.date)}
          {meeting.duration_minutes ? (
            <span className="flex items-center gap-0.5 ml-1">
              <Clock size={10} />{meeting.duration_minutes}m
            </span>
          ) : null}
        </span>

        {/* Source + action count */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <SourceBadge source={meeting.source} />
          {actionCount > 0 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-amber-50 text-amber-700 border border-amber-200">
              <CheckSquare size={9} />{actionCount}
            </span>
          )}
          {hasTranscript && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-slate-50 text-slate-500 border border-slate-200">
              Transcript
            </span>
          )}
        </div>

        {/* Resolve button */}
        {needsResolve && (
          <button
            onClick={(e) => { e.stopPropagation(); onResolve(meeting); }}
            className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors flex-shrink-0"
          >
            <AlertCircle size={10} /> Resolve
          </button>
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-4 bg-slate-50/50">
          {/* Summary */}
          {(meeting.ai_summary ?? meeting.summary) && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Summary</p>
              <p className="text-sm text-slate-700 leading-relaxed">{meeting.ai_summary ?? meeting.summary}</p>
            </div>
          )}

          {/* Attendees */}
          {meeting.attendees && meeting.attendees.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Attendees</p>
              <div className="flex flex-wrap gap-1.5">
                {(meeting.attendees as Array<{ name?: string; email?: string }>).map((a, i) => (
                  <span key={i} className="inline-flex items-center gap-1 text-xs bg-white border border-slate-200 rounded-full px-2 py-0.5">
                    <span className="w-4 h-4 rounded-full bg-violet-100 flex items-center justify-center text-[9px] font-bold text-violet-600">
                      {(a.name?.[0] ?? "?").toUpperCase()}
                    </span>
                    {a.name ?? a.email ?? "Unknown"}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Action items */}
          {actionCount > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Action Items</p>
              <ul className="space-y-1">
                {(meeting.action_items ?? []).slice(0, 5).map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <CheckSquare size={12} className="mt-0.5 text-amber-500 flex-shrink-0" />
                    {item}
                  </li>
                ))}
                {actionCount > 5 && (
                  <li className="text-xs text-slate-400 pl-5">+{actionCount - 5} more</li>
                )}
              </ul>
            </div>
          )}

          {/* View detail */}
          <button onClick={() => onOpenPanel(meeting)}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
            View full details <ChevronRight size={11} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

interface ToastData {
  imported: number;
  resolved: number;
  needsReview: number;
  internal: number;
}

function SyncToast({ data, onClose, onReview }: { data: ToastData; onClose: () => void; onReview: () => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-4 w-80">
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm font-semibold text-slate-800">Sync complete</p>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-0.5"><X size={14} /></button>
      </div>
      <p className="text-xs text-slate-600">
        {data.imported} meetings synced: {data.resolved} resolved, {data.needsReview} need review, {data.internal} internal
      </p>
      {data.needsReview > 0 && (
        <button onClick={onReview}
          className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
          Review {data.needsReview} meetings <ChevronRight size={10} />
        </button>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface MeetingsClientProps {
  meetings: MeetingRow[];
  lastSynced?: string | null;
}

export function MeetingsClient({ meetings: initialMeetings, lastSynced: initialLastSynced }: MeetingsClientProps) {
  const [meetings, setMeetings]       = useState<MeetingRow[]>(initialMeetings);
  const [search, setSearch]           = useState("");
  const [sourceFilter, setSourceFilter] = useState<"all" | "fellow" | "manual" | "fireflies">("all");
  const [resolutionFilter, setResolutionFilter] = useState<"all" | "resolved" | "review" | "unresolved" | "internal">("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [dateFrom, setDateFrom]       = useState("");
  const [dateTo, setDateTo]           = useState("");
  const [hasActionItems, setHasActionItems] = useState(false);
  const [hasTranscript, setHasTranscript]   = useState(false);
  const [syncing, setSyncing]         = useState(false);
  const [lastSynced, setLastSynced]   = useState<string | null>(initialLastSynced ?? null);
  const [toast, setToast]             = useState<ToastData | null>(null);
  const [resolveMeeting, setResolveMeeting] = useState<MeetingRow | null>(null);
  const [panelMeeting, setPanelMeeting]     = useState<MeetingRow | null>(null);

  // Stats
  const totalMeetings   = meetings.length;
  const transcriptCount = meetings.filter(m => m.transcript_text || m.transcript_url).length;
  const fellowCount     = meetings.filter(m => m.source === "fellow" || !!m.fellow_id).length;
  const actionItemTotal = meetings.reduce((s, m) => s + (m.action_items?.length ?? 0), 0);
  const needsReviewCount = meetings.filter(m => m.resolution_status === "partial" || m.resolution_status === "unresolved").length;

  const companyOptions = useMemo(() => {
    const seen = new Map<string, string>();
    meetings.forEach(m => { if (m.company) seen.set(m.company.id, m.company.name); });
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [meetings]);

  const filtered = useMemo(() => {
    let rows = meetings;

    if (sourceFilter !== "all") {
      rows = rows.filter(m =>
        sourceFilter === "fellow" ? (m.source === "fellow" || !!m.fellow_id) :
        sourceFilter === "fireflies" ? (m.source === "fireflies" || !!m.fireflies_id) :
        (!m.source || m.source === "manual")
      );
    }

    if (resolutionFilter === "review")   rows = rows.filter(m => m.resolution_status === "partial" || m.resolution_status === "unresolved");
    if (resolutionFilter === "resolved") rows = rows.filter(m => m.resolution_status === "resolved");
    if (resolutionFilter === "unresolved") rows = rows.filter(m => m.resolution_status === "unresolved");
    if (resolutionFilter === "internal") rows = rows.filter(m => m.resolution_status === "no_external");

    if (companyFilter !== "all") rows = rows.filter(m => m.company?.id === companyFilter);
    if (dateFrom) rows = rows.filter(m => m.date >= dateFrom);
    if (dateTo)   rows = rows.filter(m => m.date <= dateTo + "T23:59:59");
    if (hasActionItems) rows = rows.filter(m => (m.action_items?.length ?? 0) > 0);
    if (hasTranscript)  rows = rows.filter(m => !!(m.transcript_text || m.transcript_url));

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(m =>
        (m.subject ?? "").toLowerCase().includes(q) ||
        (m.summary ?? "").toLowerCase().includes(q) ||
        (m.ai_summary ?? "").toLowerCase().includes(q) ||
        (m.company?.name ?? "").toLowerCase().includes(q)
      );
    }

    return rows;
  }, [meetings, search, sourceFilter, resolutionFilter, companyFilter, dateFrom, dateTo, hasActionItems, hasTranscript]);

  // Time since last sync
  function timeSince(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/fellow/sync", { method: "POST" });
      const data = await res.json() as {
        imported?: number; resolved?: number; needsReview?: number; internal?: number; error?: string;
      };
      if (data.error) { alert(data.error); }
      else {
        const now = new Date().toISOString();
        setLastSynced(now);
        try { localStorage.setItem("fellow_last_sync", now); } catch {}
        setToast({
          imported: data.imported ?? 0,
          resolved: data.resolved ?? 0,
          needsReview: data.needsReview ?? 0,
          internal: data.internal ?? 0,
        });
        window.location.reload();
      }
    } catch {
      alert("Sync failed");
    }
    setSyncing(false);
  }, []);

  function handleResolved(meetingId: string) {
    setMeetings(prev =>
      prev.map(m => m.id === meetingId ? { ...m, resolution_status: "resolved" } : m)
    );
  }

  function handlePanelUpdate(patch: Partial<MeetingRow> & { id: string }) {
    setMeetings(prev =>
      prev.map(m => m.id === patch.id ? { ...m, ...patch } : m)
    );
    setPanelMeeting(prev =>
      prev && prev.id === patch.id ? { ...prev, ...patch } : prev
    );
  }

  const tiles = [
    { label: "Total Meetings",    value: totalMeetings, color: "text-slate-900" },
    { label: "With Transcripts",  value: transcriptCount, color: "text-slate-900" },
    { label: "From Fellow",       value: fellowCount, color: "text-blue-700" },
    { label: "Open Action Items", value: actionItemTotal, color: "text-amber-700" },
    {
      label: "Needs Review",
      value: needsReviewCount,
      color: needsReviewCount > 0 ? "text-amber-700" : "text-slate-900",
      badge: needsReviewCount > 0,
      onClick: needsReviewCount > 0 ? () => setResolutionFilter("review") : undefined,
    },
  ];

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Stats tiles */}
      <div className="grid grid-cols-5 gap-4 px-6 py-4 border-b border-slate-100 bg-white">
        {tiles.map(t => (
          <div key={t.label} onClick={t.onClick}
            className={cn("cursor-default", t.onClick && "cursor-pointer hover:bg-slate-50 rounded-lg p-1 -m-1 transition-colors")}>
            <div className={cn("text-xl font-bold flex items-center gap-1", t.color)}>
              {t.value}
              {t.badge && t.value > 0 && (
                <span className="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full border border-amber-200 font-medium">
                  Review
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500">{t.label}</div>
          </div>
        ))}
      </div>

      {/* Filter bar */}
      <div className="border-b border-slate-200 bg-white px-6 py-3 flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search meetings…"
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400" />
        </div>

        {/* Source filter */}
        <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value as typeof sourceFilter)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
          <option value="all">All sources</option>
          <option value="fellow">Fellow</option>
          <option value="fireflies">Fireflies</option>
          <option value="manual">Manual</option>
        </select>

        {/* Resolution filter */}
        <select value={resolutionFilter} onChange={e => setResolutionFilter(e.target.value as typeof resolutionFilter)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
          <option value="all">All statuses</option>
          <option value="resolved">Resolved</option>
          <option value="review">Needs Review</option>
          <option value="unresolved">Unresolved</option>
          <option value="internal">Internal</option>
        </select>

        {/* Company */}
        {companyOptions.length > 0 && (
          <select value={companyFilter} onChange={e => setCompanyFilter(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
            <option value="all">All companies</option>
            {companyOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}

        {/* Date range */}
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
        <span className="text-xs text-slate-400">–</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />

        {/* Toggles */}
        <label className="flex items-center gap-1 text-xs text-slate-600 cursor-pointer">
          <input type="checkbox" checked={hasActionItems} onChange={e => setHasActionItems(e.target.checked)} className="rounded border-slate-300" />
          Action items
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-600 cursor-pointer">
          <input type="checkbox" checked={hasTranscript} onChange={e => setHasTranscript(e.target.checked)} className="rounded border-slate-300" />
          Transcript
        </label>

        <div className="flex-1" />

        {/* Last synced */}
        {lastSynced && !syncing && (
          <span className="text-[10px] text-slate-400">Last synced: {timeSince(lastSynced)}</span>
        )}

        {/* Sync button */}
        <button onClick={handleSync} disabled={syncing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
          <RefreshCw size={12} className={cn(syncing && "animate-spin")} />
          {syncing ? "Syncing…" : "Sync"}
        </button>
      </div>

      {/* Meeting list */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Users size={32} className="mb-3 opacity-30" />
            <p className="text-sm font-medium">No meetings found</p>
            <p className="text-xs mt-1">
              {search ? "Try clearing your search" : "Click \"Sync\" to pull recent meetings"}
            </p>
          </div>
        ) : (
          filtered.map(m => (
            <MeetingCard
              key={m.id}
              meeting={m}
              onResolve={setResolveMeeting}
              onOpenPanel={setPanelMeeting}
            />
          ))
        )}
      </div>

      {/* Resolution modal */}
      {resolveMeeting && (
        <ResolutionModal
          meeting={resolveMeeting}
          onClose={() => setResolveMeeting(null)}
          onResolved={handleResolved}
        />
      )}

      {/* Detail panel */}
      {panelMeeting && (
        <MeetingPanel
          meeting={panelMeeting}
          onClose={() => setPanelMeeting(null)}
          onUpdate={handlePanelUpdate}
        />
      )}

      {/* Sync toast */}
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
