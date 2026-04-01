"use client";
// ─── Meeting Detail Panel (slide-out) ─────────────────────────────────────────
// 5-tab slide-out panel: Summary | Transcript | Action Items | Pipeline Intel | CRM Links

import { useState } from "react";
import {
  X, FileText, CheckSquare, Building2, Users, Search,
  ChevronRight, Check, Clock
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import type { Interaction, Company } from "@/lib/types";
import Link from "next/link";

type MeetingRow = Interaction & { company: Pick<Company, "id" | "name"> | null };

type Tab = "summary" | "transcript" | "actions" | "pipeline" | "crm";

interface Props {
  meeting: MeetingRow;
  onClose: () => void;
}

function TabButton({ active, children, onClick }: {
  tab: Tab; active: boolean; children: React.ReactNode; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-2 text-xs font-medium border-b-2 transition-colors whitespace-nowrap",
        active
          ? "border-blue-600 text-blue-600"
          : "border-transparent text-slate-500 hover:text-slate-700"
      )}
    >
      {children}
    </button>
  );
}

// ── Tab 1: Summary ────────────────────────────────────────────────────────────

function SummaryTab({ meeting }: { meeting: MeetingRow }) {
  const summary = meeting.ai_summary ?? meeting.summary;
  const actionCount = meeting.action_items?.length ?? 0;

  return (
    <div className="space-y-5">
      {/* AI Summary */}
      {summary ? (
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">AI Summary</p>
          <p className="text-sm text-slate-700 leading-relaxed">{summary}</p>
        </div>
      ) : (
        <div className="text-sm text-slate-400 italic">No summary available</div>
      )}

      {/* Meeting metadata */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Date</p>
          <p className="text-sm text-slate-700">{formatDate(meeting.date)}</p>
        </div>
        {meeting.duration_minutes && (
          <div>
            <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Duration</p>
            <p className="text-sm text-slate-700 flex items-center gap-1">
              <Clock size={12} className="text-slate-400" />
              {meeting.duration_minutes} min
            </p>
          </div>
        )}
        <div>
          <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Source</p>
          <span className={cn(
            "inline-flex text-xs px-1.5 py-0.5 rounded border font-medium",
            meeting.source === "fellow"
              ? "bg-blue-50 text-blue-700 border-blue-200"
              : "bg-slate-50 text-slate-600 border-slate-200"
          )}>
            {meeting.source ?? "manual"}
          </span>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Action Items</p>
          <p className="text-sm text-slate-700">{actionCount}</p>
        </div>
      </div>

      {/* Linked company */}
      {meeting.company && (
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Linked Company</p>
          <Link href={`/crm/companies/${meeting.company.id}`}
            className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg hover:bg-blue-50 transition-colors border border-slate-200 group">
            <Building2 size={14} className="text-slate-400 group-hover:text-blue-500" />
            <span className="text-sm font-medium text-slate-800 group-hover:text-blue-700">{meeting.company.name}</span>
            <ChevronRight size={12} className="ml-auto text-slate-300 group-hover:text-blue-400" />
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Tab 2: Transcript ─────────────────────────────────────────────────────────

function TranscriptTab({ meeting }: { meeting: MeetingRow }) {
  const [search, setSearch] = useState("");
  const transcript = meeting.transcript_text;

  const lines = transcript?.split("\n") ?? [];
  const highlighted = search.trim()
    ? lines.filter(l => l.toLowerCase().includes(search.toLowerCase()))
    : lines;

  if (!transcript) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <FileText size={28} className="mb-2 opacity-30" />
        <p className="text-sm">No transcript available</p>
        {meeting.transcript_url && (
          <a href={meeting.transcript_url} target="_blank" rel="noopener noreferrer"
            className="mt-3 text-xs text-blue-600 hover:underline flex items-center gap-1">
            Open external transcript <ChevronRight size={11} />
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search transcript…"
          className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>
      {search && <p className="text-xs text-slate-400">{highlighted.length} matching lines</p>}
      <pre className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-[60vh] overflow-y-auto font-mono">
        {search ? highlighted.map((line, i) => (
          <span key={i} className="block">
            {line.replace(new RegExp(`(${search})`, "gi"), "**$1**")}
          </span>
        )) : transcript}
      </pre>
    </div>
  );
}

// ── Tab 3: Action Items ───────────────────────────────────────────────────────

function ActionItemsTab({ meeting }: { meeting: MeetingRow }) {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const items = meeting.action_items ?? [];

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <CheckSquare size={28} className="mb-2 opacity-30" />
        <p className="text-sm">No action items</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i}
          onClick={() => setChecked(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })}
          className={cn(
            "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all",
            checked.has(i)
              ? "bg-emerald-50 border-emerald-200 opacity-60"
              : "bg-white border-slate-200 hover:border-slate-300"
          )}>
          <div className={cn(
            "w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center mt-0.5",
            checked.has(i) ? "bg-emerald-600 border-emerald-600" : "border-slate-300"
          )}>
            {checked.has(i) && <Check size={10} className="text-white" />}
          </div>
          <p className={cn("text-sm text-slate-700 leading-relaxed", checked.has(i) && "line-through")}>{item}</p>
        </div>
      ))}
      <p className="text-xs text-slate-400 text-center pt-2">
        {checked.size} of {items.length} completed
      </p>
    </div>
  );
}

// ── Tab 4: Pipeline Intelligence ──────────────────────────────────────────────

function PipelineTab({ meeting }: { meeting: MeetingRow }) {
  return (
    <div className="space-y-4">
      {meeting.company ? (
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Linked Pipeline Deal</p>
          <Link href={`/crm/companies/${meeting.company.id}`}
            className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200 hover:bg-blue-100 transition-colors group">
            <Building2 size={14} className="text-blue-500" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-800">{meeting.company.name}</p>
            </div>
            <ChevronRight size={12} className="text-blue-400" />
          </Link>
        </div>
      ) : (
        <div className="text-center py-10 text-slate-400">
          <Building2 size={28} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No company linked to this meeting</p>
          <p className="text-xs mt-1">Use the Resolution modal to link a company</p>
        </div>
      )}
    </div>
  );
}

// ── Tab 5: CRM Links ──────────────────────────────────────────────────────────

function CRMLinksTab({ meeting }: { meeting: MeetingRow }) {
  const hasResolution = !!meeting.resolution_status && meeting.resolution_status !== "no_external";

  return (
    <div className="space-y-5">
      {/* Linked Contacts */}
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
          <Users size={10} /> Linked Contacts
        </p>
        {meeting.contact_ids && meeting.contact_ids.length > 0 ? (
          <div className="space-y-2">
            {(meeting.attendees ?? []).slice(0, 5).map((a, i) => {
              const att = a as { name?: string; email?: string };
              return (
                <div key={i} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                  <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                    <span className="text-violet-600 text-[10px] font-bold">
                      {(att.name?.[0] ?? "?").toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">{att.name ?? att.email}</p>
                    <p className="text-[10px] text-slate-400 truncate">{att.email}</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-slate-400 italic">No contacts linked yet</p>
        )}
      </div>

      {/* Resolution status */}
      {hasResolution && (
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Resolution Status</p>
          <div className={cn(
            "px-3 py-2 rounded-lg border text-xs",
            meeting.resolution_status === "resolved"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : meeting.resolution_status === "partial"
              ? "bg-amber-50 border-amber-200 text-amber-700"
              : "bg-red-50 border-red-200 text-red-700"
          )}>
            {meeting.resolution_status === "resolved" && "✓ All CRM entities resolved"}
            {meeting.resolution_status === "partial" && "⚠ Some entities need manual review"}
            {meeting.resolution_status === "unresolved" && "✗ No CRM entities matched"}
          </div>
        </div>
      )}

      {/* Linked company */}
      {meeting.company && (
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
            <Building2 size={10} /> Linked Company
          </p>
          <Link href={`/crm/companies/${meeting.company.id}`}
            className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200 hover:bg-blue-50 transition-colors group">
            <Building2 size={14} className="text-slate-400 group-hover:text-blue-500" />
            <span className="text-sm font-medium text-slate-800">{meeting.company.name}</span>
            <ChevronRight size={12} className="ml-auto text-slate-300" />
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export function MeetingPanel({ meeting, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("summary");

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-[480px] bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between">
          <div className="flex-1 min-w-0 pr-3">
            <h3 className="text-sm font-semibold text-slate-900 truncate">{meeting.subject ?? "Meeting"}</h3>
            <p className="text-xs text-slate-400 mt-0.5">{formatDate(meeting.date)}{meeting.duration_minutes ? ` · ${meeting.duration_minutes}m` : ""}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 overflow-x-auto px-2">
          {([
            { key: "summary", label: "Summary" },
            { key: "transcript", label: "Transcript" },
            { key: "actions", label: `Actions (${meeting.action_items?.length ?? 0})` },
            { key: "pipeline", label: "Pipeline" },
            { key: "crm", label: "CRM Links" },
          ] as { key: Tab; label: string }[]).map(t => (
            <TabButton key={t.key} tab={t.key} active={activeTab === t.key} onClick={() => setActiveTab(t.key)}>
              {t.label}
            </TabButton>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {activeTab === "summary"    && <SummaryTab meeting={meeting} />}
          {activeTab === "transcript" && <TranscriptTab meeting={meeting} />}
          {activeTab === "actions"    && <ActionItemsTab meeting={meeting} />}
          {activeTab === "pipeline"   && <PipelineTab meeting={meeting} />}
          {activeTab === "crm"        && <CRMLinksTab meeting={meeting} />}
        </div>
      </div>
    </>
  );
}
