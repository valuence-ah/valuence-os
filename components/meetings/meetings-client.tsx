"use client";
// ─── Meetings Client ──────────────────────────────────────────────────────────
// Searchable, expandable list of meeting interactions.
// Each row: date · company · title · action-item count · transcript badge
// Expanded: summary, action items list, full scrollable transcript.

import { useState, useMemo, useCallback } from "react";
import {
  Search, RefreshCw, ChevronDown, ChevronRight,
  Mic, FileText, Calendar, Building2, CheckSquare, ExternalLink,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import type { Interaction, Company } from "@/lib/types";
import Link from "next/link";

type MeetingRow = Interaction & { company: Pick<Company, "id" | "name"> | null };

// ─────────────────────────────────────────────────────────────────────────────

function SentimentDot({ sentiment }: { sentiment: string | null }) {
  const colors: Record<string, string> = {
    positive: "bg-emerald-400",
    neutral:  "bg-slate-400",
    negative: "bg-red-400",
    mixed:    "bg-amber-400",
  };
  return (
    <span
      className={cn("inline-block w-2 h-2 rounded-full flex-shrink-0", colors[sentiment ?? "neutral"] ?? "bg-slate-400")}
      title={sentiment ?? "neutral"}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface MeetingRowProps {
  meeting: MeetingRow;
}

function MeetingCard({ meeting }: MeetingRowProps) {
  const [expanded, setExpanded] = useState(false);

  const hasTranscript = !!(meeting.transcript_text || meeting.transcript_url);
  const actionCount   = meeting.action_items?.length ?? 0;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      {/* ── Summary row ── */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50 transition-colors"
      >
        {/* Expand icon */}
        <span className="text-slate-400 flex-shrink-0">
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </span>

        {/* Sentiment dot */}
        <SentimentDot sentiment={meeting.sentiment} />

        {/* Title */}
        <span className="flex-1 text-sm font-medium text-slate-800 truncate">
          {meeting.subject ?? "Untitled Meeting"}
        </span>

        {/* Company */}
        {meeting.company && (
          <Link
            href={`/crm/companies/${meeting.company.id}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 flex-shrink-0"
          >
            <Building2 size={11} />
            {meeting.company.name}
          </Link>
        )}

        {/* Date */}
        <span className="flex items-center gap-1 text-xs text-slate-400 flex-shrink-0">
          <Calendar size={11} />
          {formatDate(meeting.date)}
        </span>

        {/* Badges */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {hasTranscript && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-violet-50 text-violet-700 border border-violet-200">
              <Mic size={10} />
              Transcript
            </span>
          )}
          {actionCount > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-amber-50 text-amber-700 border border-amber-200">
              <CheckSquare size={10} />
              {actionCount}
            </span>
          )}
          {meeting.fireflies_id && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-blue-50 text-blue-700 border border-blue-200">
              <FileText size={10} />
              Fireflies
            </span>
          )}
        </div>
      </button>

      {/* ── Expanded detail ── */}
      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 space-y-4 bg-slate-50/50">

          {/* Summary */}
          {meeting.summary && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Summary</p>
              <p className="text-sm text-slate-700 leading-relaxed">{meeting.summary}</p>
            </div>
          )}

          {/* Action items */}
          {actionCount > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Action Items
              </p>
              <ul className="space-y-1">
                {meeting.action_items!.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                    <CheckSquare size={13} className="mt-0.5 text-amber-500 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* External transcript link */}
          {meeting.transcript_url && (
            <a
              href={meeting.transcript_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700"
            >
              <ExternalLink size={12} />
              Open transcript file
            </a>
          )}

          {/* Full transcript */}
          {meeting.transcript_text && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Full Transcript
              </p>
              <pre className="max-h-80 overflow-y-auto text-xs text-slate-600 leading-relaxed whitespace-pre-wrap bg-white border border-slate-200 rounded-lg p-3 font-mono">
                {meeting.transcript_text}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

interface MeetingsClientProps {
  meetings: MeetingRow[];
}

export function MeetingsClient({ meetings: initialMeetings }: MeetingsClientProps) {
  const [meetings, setMeetings]     = useState<MeetingRow[]>(initialMeetings);
  const [search, setSearch]         = useState("");
  const [filter, setFilter]         = useState<"all" | "transcript" | "fireflies">("all");
  const [syncing, setSyncing]       = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [companyFilter, setCompanyFilter] = useState("all");
  const [dateFrom, setDateFrom]     = useState("");
  const [dateTo, setDateTo]         = useState("");

  const companyOptions = useMemo(() => {
    const seen = new Map<string, string>();
    meetings.forEach(m => {
      if (m.company) seen.set(m.company.id, m.company.name);
    });
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [meetings]);

  const filtered = useMemo(() => {
    let rows = meetings;

    if (filter === "transcript") rows = rows.filter((m) => m.transcript_text || m.transcript_url);
    if (filter === "fireflies")  rows = rows.filter((m) => !!m.fireflies_id);

    if (companyFilter !== "all") rows = rows.filter(m => m.company?.id === companyFilter);

    if (dateFrom) rows = rows.filter(m => m.date >= dateFrom);
    if (dateTo)   rows = rows.filter(m => m.date <= dateTo + "T23:59:59");

    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (m) =>
          (m.subject ?? "").toLowerCase().includes(q) ||
          (m.summary ?? "").toLowerCase().includes(q) ||
          (m.company?.name ?? "").toLowerCase().includes(q)
      );
    }

    return rows;
  }, [meetings, search, filter, companyFilter, dateFrom, dateTo]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const res = await fetch("/api/fireflies/sync", { method: "POST" });
      const data = await res.json() as { imported?: number; skipped?: number; error?: string };
      if (data.error) {
        setSyncMessage(data.error);
      } else {
        setSyncMessage(`Imported ${data.imported ?? 0} new · ${data.skipped ?? 0} already saved`);
        // Reload the page to show new meetings
        window.location.reload();
      }
    } catch {
      setSyncMessage("Sync failed");
    }
    setSyncing(false);
  }, []);

  const transcriptCount = meetings.filter((m) => m.transcript_text || m.transcript_url).length;
  const firefliesCount  = meetings.filter((m) => !!m.fireflies_id).length;

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* ── Stats bar ── */}
      <div className="grid grid-cols-4 gap-4 px-6 py-4 border-b border-slate-100 bg-white">
        {[
          { label: "Total Meetings",   value: meetings.length },
          { label: "With Transcripts", value: transcriptCount },
          { label: "From Fireflies",   value: firefliesCount },
          { label: "Action Items",     value: meetings.reduce((sum, m) => sum + (m.action_items?.length ?? 0), 0) },
        ].map(s => (
          <div key={s.label}>
            <div className="text-xl font-bold text-slate-900">{s.value}</div>
            <div className="text-xs text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ── */}
      <div className="border-b border-slate-200 bg-white px-6 py-3 flex items-center gap-3 flex-wrap">

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search meetings…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>

        {/* Company filter */}
        {companyOptions.length > 0 && (
          <select
            value={companyFilter}
            onChange={e => setCompanyFilter(e.target.value)}
            className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white"
          >
            <option value="all">All companies</option>
            {companyOptions.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        )}

        {/* Date range filter */}
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
            title="From date"
          />
          <span className="text-xs text-slate-400">–</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
            title="To date"
          />
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="text-slate-400 hover:text-slate-600 p-1"
              title="Clear dates"
            >
              ×
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 text-xs">
          {(["all", "transcript", "fireflies"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-2.5 py-1 rounded-md transition-colors capitalize",
                filter === f
                  ? "bg-white text-slate-800 shadow-sm font-medium"
                  : "text-slate-500 hover:text-slate-700"
              )}
            >
              {f === "all" ? `All (${meetings.length})` :
               f === "transcript" ? `Transcripts (${transcriptCount})` :
               `Fireflies (${firefliesCount})`}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Sync message */}
        {syncMessage && (
          <span className="text-xs text-slate-500">{syncMessage}</span>
        )}

        {/* Sync button */}
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <RefreshCw size={13} className={cn(syncing && "animate-spin")} />
          {syncing ? "Syncing…" : "Sync Fireflies"}
        </button>
      </div>

      {/* ── List ── */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Mic size={32} className="mb-3 opacity-30" />
            <p className="text-sm font-medium">No meetings found</p>
            {search && (
              <p className="text-xs mt-1">Try clearing your search</p>
            )}
            {!search && (
              <p className="text-xs mt-1">
                Click &ldquo;Sync Fireflies&rdquo; to pull recent meetings, or configure the Fireflies
                webhook to auto-sync future meetings.
              </p>
            )}
          </div>
        ) : (
          filtered.map((m) => <MeetingCard key={m.id} meeting={m} />)
        )}
      </div>
    </div>
  );
}
