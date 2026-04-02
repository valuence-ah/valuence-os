"use client";
// ─── Meeting Detail Panel ─────────────────────────────────────────────────────
// 3-tab panel: Summary (+ Next Steps) | Transcript | Links (company + contacts)

import { useState, useCallback, useEffect, useRef } from "react";
import {
  X, FileText, Building2, Users, Search,
  ChevronRight, Clock, Pencil, Plus, Trash2, CheckSquare,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import type { Interaction, Company } from "@/lib/types";
import Link from "next/link";

type MeetingRow = Interaction & { company: Pick<Company, "id" | "name" | "type"> | null };

type Tab = "summary" | "transcript" | "links";

interface ContactResult {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  company_id: string | null;
}

interface CompanyResult {
  id: string;
  name: string;
  type: string | null;
}

interface Props {
  meeting: MeetingRow;
  onClose: () => void;
  onUpdate: (patch: Partial<MeetingRow> & { id: string }) => void;
}

// ── AI Notes Parser ──────────────────────────────────────────────────────────

interface ParsedNotes {
  summary: string;
  nextSteps: string[];
}

function parseAINotes(raw: string | null | undefined): ParsedNotes {
  if (!raw?.trim()) return { summary: "", nextSteps: [] };

  // Detect "Next Steps" / "Action Items" section header (markdown or plain)
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

  // Strip summary header if present
  summaryText = summaryText.replace(summaryHeaderRe, "").trim();

  // Parse next steps bullets
  const nextSteps = nextStepsText
    .split("\n")
    .map(l => l.replace(/^[\s\t]*[-*•\u2022\d]+[.)]\s*/, "").trim())
    .filter(l => l.length > 3 && !/^(?:\*{2}|#{1,3})/.test(l));

  return { summary: summaryText, nextSteps };
}

// ── Tab Button ───────────────────────────────────────────────────────────────

function TabButton({ active, children, onClick }: {
  active: boolean; children: React.ReactNode; onClick: () => void;
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

// ── Summary Tab ──────────────────────────────────────────────────────────────

function SummaryTab({ meeting }: { meeting: MeetingRow }) {
  const rawNotes = meeting.ai_summary ?? meeting.summary ?? meeting.body;
  const { summary, nextSteps } = parseAINotes(rawNotes);

  // Use parsed next steps if available; fall back to stored action_items
  const displayNextSteps = nextSteps.length > 0 ? nextSteps : (meeting.action_items ?? []);

  return (
    <div className="space-y-5">
      {/* Meeting meta row */}
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <div>
          <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Date</p>
          <p className="text-xs text-slate-700">{formatDate(meeting.date)}</p>
        </div>
        {meeting.duration_minutes != null && (
          <div>
            <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Duration</p>
            <p className="text-xs text-slate-700 flex items-center gap-1">
              <Clock size={11} className="text-slate-400" />
              {meeting.duration_minutes} min
            </p>
          </div>
        )}
        <div>
          <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Source</p>
          <span className={cn(
            "inline-flex text-[10px] px-1.5 py-0.5 rounded border font-medium",
            meeting.source === "fellow"
              ? "bg-blue-50 text-blue-700 border-blue-200"
              : "bg-slate-50 text-slate-600 border-slate-200"
          )}>
            {meeting.source ?? "manual"}
          </span>
        </div>
      </div>

      {/* AI Summary */}
      {summary ? (
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Summary</p>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{summary}</p>
        </div>
      ) : (
        <p className="text-sm text-slate-400 italic">No summary available</p>
      )}

      {/* Next Steps */}
      {displayNextSteps.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Next Steps</p>
          <div className="space-y-1.5">
            {displayNextSteps.map((item, i) => (
              <div key={i} className="flex items-start gap-2.5 p-2.5 bg-amber-50 rounded-lg border border-amber-100">
                <CheckSquare size={13} className="mt-0.5 text-amber-500 flex-shrink-0" />
                <p className="text-sm text-slate-700 leading-snug">{item}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Attendees */}
      {meeting.attendees && meeting.attendees.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Attendees</p>
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
    </div>
  );
}

// ── Transcript Tab ───────────────────────────────────────────────────────────

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
      {search && (
        <p className="text-xs text-slate-400">{highlighted.length} matching lines</p>
      )}
      <pre className="text-xs text-slate-600 leading-relaxed whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-[60vh] overflow-y-auto font-mono">
        {search ? highlighted.join("\n") : transcript}
      </pre>
    </div>
  );
}

// ── Company type badge ───────────────────────────────────────────────────────

const TYPE_STYLES: Record<string, string> = {
  Startup:             "bg-blue-50 text-blue-700 border-blue-200",
  "Portfolio Company": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Strategic Partner": "bg-violet-50 text-violet-700 border-violet-200",
  "VC Fund":           "bg-indigo-50 text-indigo-700 border-indigo-200",
  LP:                  "bg-amber-50 text-amber-700 border-amber-200",
};

function TypeBadge({ type }: { type: string | null }) {
  if (!type) return null;
  const style = TYPE_STYLES[type] ?? "bg-slate-50 text-slate-600 border-slate-200";
  return (
    <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", style)}>
      {type}
    </span>
  );
}

// ── Links Tab ────────────────────────────────────────────────────────────────

interface LinksTabProps {
  meeting: MeetingRow;
  linkedCompany: CompanyResult | null;
  linkedContacts: ContactResult[];
  onLinkCompany: (c: CompanyResult | null) => Promise<void>;
  onAddContact: (c: ContactResult) => Promise<void>;
  onRemoveContact: (id: string) => Promise<void>;
}

function LinksTab({
  meeting, linkedCompany, linkedContacts,
  onLinkCompany, onAddContact, onRemoveContact,
}: LinksTabProps) {
  const [companyQuery, setCompanyQuery]     = useState("");
  const [companyResults, setCompanyResults] = useState<CompanyResult[]>([]);
  const [showCompanySearch, setShowCompanySearch] = useState(false);
  const [loadingCo, setLoadingCo]           = useState(false);

  const [contactQuery, setContactQuery]     = useState("");
  const [contactResults, setContactResults] = useState<ContactResult[]>([]);
  const [loadingContact, setLoadingContact] = useState(false);

  const coTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced company search
  useEffect(() => {
    if (coTimer.current) clearTimeout(coTimer.current);
    if (!companyQuery.trim()) { setCompanyResults([]); return; }
    coTimer.current = setTimeout(async () => {
      setLoadingCo(true);
      try {
        const r = await fetch(`/api/search/companies?q=${encodeURIComponent(companyQuery)}`);
        setCompanyResults(await r.json() as CompanyResult[]);
      } finally { setLoadingCo(false); }
    }, 250);
    return () => { if (coTimer.current) clearTimeout(coTimer.current); };
  }, [companyQuery]);

  // Debounced contact search
  useEffect(() => {
    if (ctTimer.current) clearTimeout(ctTimer.current);
    if (!contactQuery.trim()) { setContactResults([]); return; }
    ctTimer.current = setTimeout(async () => {
      setLoadingContact(true);
      try {
        const r = await fetch(`/api/search/contacts?q=${encodeURIComponent(contactQuery)}`);
        setContactResults(await r.json() as ContactResult[]);
      } finally { setLoadingContact(false); }
    }, 250);
    return () => { if (ctTimer.current) clearTimeout(ctTimer.current); };
  }, [contactQuery]);

  const linkedContactIds = new Set(linkedContacts.map(c => c.id));

  const closeCompanySearch = () => {
    setShowCompanySearch(false);
    setCompanyQuery("");
    setCompanyResults([]);
  };

  return (
    <div className="space-y-6">
      {/* ── Company ── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
            <Building2 size={10} /> Company
          </p>
          {linkedCompany && !showCompanySearch && (
            <button
              onClick={() => setShowCompanySearch(true)}
              className="text-[10px] text-blue-600 hover:text-blue-700 font-medium"
            >
              Change
            </button>
          )}
        </div>

        {/* Linked company card */}
        {linkedCompany && !showCompanySearch && (
          <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <Building2 size={14} className="text-slate-400 flex-shrink-0" />
            <div className="flex-1 min-w-0 space-y-0.5">
              <Link
                href={`/crm/companies/${linkedCompany.id}`}
                className="text-sm font-medium text-blue-700 hover:underline block truncate"
              >
                {linkedCompany.name}
              </Link>
              <TypeBadge type={linkedCompany.type} />
            </div>
            <button
              onClick={() => onLinkCompany(null)}
              title="Unlink company"
              className="text-slate-300 hover:text-red-400 transition-colors p-1"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}

        {/* Company search */}
        {(!linkedCompany || showCompanySearch) && (
          <div>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={companyQuery}
                onChange={e => setCompanyQuery(e.target.value)}
                placeholder="Search companies…"
                className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            {companyResults.length > 0 && (
              <div className="mt-1 border border-slate-200 rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto bg-white">
                {companyResults.map(co => (
                  <button
                    key={co.id}
                    onClick={async () => {
                      await onLinkCompany(co);
                      closeCompanySearch();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-blue-50 text-left border-b border-slate-100 last:border-0 transition-colors"
                  >
                    <Building2 size={12} className="text-slate-400 flex-shrink-0" />
                    <span className="flex-1 text-sm text-slate-800">{co.name}</span>
                    <TypeBadge type={co.type} />
                    <ChevronRight size={11} className="text-slate-300" />
                  </button>
                ))}
              </div>
            )}
            {loadingCo && companyQuery && (
              <p className="text-xs text-slate-400 mt-1 px-1">Searching…</p>
            )}
            {!loadingCo && companyQuery && companyResults.length === 0 && (
              <p className="text-xs text-slate-400 mt-1 px-1">No companies found</p>
            )}
            {showCompanySearch && (
              <button
                onClick={closeCompanySearch}
                className="mt-1.5 text-[10px] text-slate-400 hover:text-slate-600"
              >
                Cancel
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Contacts ── */}
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
          <Users size={10} /> Contacts
        </p>

        {/* Linked contacts */}
        {linkedContacts.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {linkedContacts.map(c => (
              <div key={c.id} className="flex items-center gap-2.5 p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-violet-600 text-[10px] font-bold">
                    {(c.first_name[0] ?? "?").toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-800 truncate">
                    {c.first_name} {c.last_name ?? ""}
                  </p>
                  {c.email && (
                    <p className="text-[10px] text-slate-400 truncate">{c.email}</p>
                  )}
                </div>
                <button
                  onClick={() => onRemoveContact(c.id)}
                  title="Remove contact"
                  className="text-slate-300 hover:text-red-400 transition-colors p-1"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add contact search */}
        <div>
          <div className="relative">
            <Plus size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={contactQuery}
              onChange={e => setContactQuery(e.target.value)}
              placeholder="Add a contact…"
              className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          {contactResults.length > 0 && (
            <div className="mt-1 border border-slate-200 rounded-lg shadow-lg overflow-hidden max-h-48 overflow-y-auto bg-white">
              {contactResults
                .filter(c => !linkedContactIds.has(c.id))
                .map(c => (
                  <button
                    key={c.id}
                    onClick={async () => {
                      await onAddContact(c);
                      setContactQuery("");
                      setContactResults([]);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-blue-50 text-left border-b border-slate-100 last:border-0 transition-colors"
                  >
                    <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-violet-600 text-[9px] font-bold">
                        {(c.first_name[0] ?? "?").toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-slate-800">{c.first_name} {c.last_name ?? ""}</span>
                      {c.email && (
                        <span className="text-[10px] text-slate-400 ml-1">· {c.email}</span>
                      )}
                    </div>
                    <Plus size={12} className="text-slate-400 flex-shrink-0" />
                  </button>
                ))}
            </div>
          )}
          {loadingContact && contactQuery && (
            <p className="text-xs text-slate-400 mt-1 px-1">Searching…</p>
          )}
          {!loadingContact && contactQuery && contactResults.filter(c => !linkedContactIds.has(c.id)).length === 0 && contactResults.length >= 0 && contactQuery.length > 1 && (
            <p className="text-xs text-slate-400 mt-1 px-1">No contacts found</p>
          )}
        </div>
      </div>

      {/* CRM resolution status */}
      {meeting.resolution_status && meeting.resolution_status !== "no_external" && (
        <div>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">CRM Resolution</p>
          <div className={cn(
            "px-3 py-2 rounded-lg border text-xs",
            meeting.resolution_status === "resolved"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : meeting.resolution_status === "partial"
              ? "bg-amber-50 border-amber-200 text-amber-700"
              : "bg-red-50 border-red-200 text-red-700"
          )}>
            {meeting.resolution_status === "resolved"   && "✓ All CRM entities resolved"}
            {meeting.resolution_status === "partial"    && "⚠ Some entities need manual review"}
            {meeting.resolution_status === "unresolved" && "✗ No CRM entities matched"}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Panel ───────────────────────────────────────────────────────────────

export function MeetingPanel({ meeting, onClose, onUpdate }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("summary");

  // Title editing
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue]     = useState(meeting.subject ?? "");
  const titleRef = useRef<HTMLInputElement>(null);

  // Linked company/contacts local state
  const [linkedCompany, setLinkedCompany] = useState<CompanyResult | null>(
    meeting.company
      ? { id: meeting.company.id, name: meeting.company.name, type: (meeting.company as { type?: string | null }).type ?? null }
      : null
  );
  const [contactIds, setContactIds]       = useState<string[]>(meeting.contact_ids ?? []);
  const [linkedContacts, setLinkedContacts] = useState<ContactResult[]>([]);

  // Fetch details for already-linked contacts on mount
  useEffect(() => {
    if (contactIds.length === 0) return;
    fetch(`/api/search/contacts?ids=${contactIds.join(",")}`)
      .then(r => r.json())
      .then((data: ContactResult[]) => setLinkedContacts(data))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-focus title input
  useEffect(() => {
    if (editingTitle) titleRef.current?.focus();
  }, [editingTitle]);

  const saveTitle = useCallback(async () => {
    const trimmed = titleValue.trim();
    if (!trimmed || trimmed === (meeting.subject ?? "")) {
      setEditingTitle(false);
      return;
    }
    await fetch(`/api/meetings/${meeting.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: trimmed }),
    });
    onUpdate({ id: meeting.id, subject: trimmed });
    setEditingTitle(false);
  }, [titleValue, meeting.subject, meeting.id, onUpdate]);

  const handleLinkCompany = useCallback(async (co: CompanyResult | null) => {
    setLinkedCompany(co);
    await fetch(`/api/meetings/${meeting.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_id: co?.id ?? null }),
    });
    onUpdate({
      id: meeting.id,
      company_id: co?.id ?? null,
      company: (co ? { id: co.id, name: co.name, type: co.type as Company["type"] } : null) as MeetingRow["company"],
    });
  }, [meeting.id, onUpdate]);

  const handleAddContact = useCallback(async (c: ContactResult) => {
    const newIds = [...new Set([...contactIds, c.id])];
    setContactIds(newIds);
    setLinkedContacts(prev => prev.some(x => x.id === c.id) ? prev : [...prev, c]);
    await fetch(`/api/meetings/${meeting.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_ids: newIds }),
    });
    onUpdate({ id: meeting.id, contact_ids: newIds });
  }, [contactIds, meeting.id, onUpdate]);

  const handleRemoveContact = useCallback(async (id: string) => {
    const newIds = contactIds.filter(x => x !== id);
    setContactIds(newIds);
    setLinkedContacts(prev => prev.filter(c => c.id !== id));
    await fetch(`/api/meetings/${meeting.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_ids: newIds }),
    });
    onUpdate({ id: meeting.id, contact_ids: newIds });
  }, [contactIds, meeting.id, onUpdate]);

  const linkCount = contactIds.length + (linkedCompany ? 1 : 0);

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-[480px] bg-white shadow-2xl z-50 flex flex-col">

        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input
                ref={titleRef}
                value={titleValue}
                onChange={e => setTitleValue(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={e => {
                  if (e.key === "Enter")  saveTitle();
                  if (e.key === "Escape") { setTitleValue(meeting.subject ?? ""); setEditingTitle(false); }
                }}
                className="w-full text-sm font-semibold text-slate-900 border-b border-blue-400 bg-transparent outline-none py-0.5"
              />
            ) : (
              <div className="flex items-start gap-1.5 group">
                <h3 className="text-sm font-semibold text-slate-900 leading-snug break-words">
                  {titleValue || "Meeting"}
                </h3>
                <button
                  onClick={() => setEditingTitle(true)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-blue-500 mt-0.5 flex-shrink-0"
                  title="Edit title"
                >
                  <Pencil size={12} />
                </button>
              </div>
            )}
            <p className="text-xs text-slate-400 mt-0.5">
              {formatDate(meeting.date)}
              {meeting.duration_minutes ? ` · ${meeting.duration_minutes}m` : ""}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 flex-shrink-0">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-2">
          <TabButton active={activeTab === "summary"}    onClick={() => setActiveTab("summary")}>Summary</TabButton>
          <TabButton active={activeTab === "transcript"} onClick={() => setActiveTab("transcript")}>Transcript</TabButton>
          <TabButton active={activeTab === "links"}      onClick={() => setActiveTab("links")}>
            Links{linkCount > 0 ? ` (${linkCount})` : ""}
          </TabButton>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {activeTab === "summary"    && (
            <SummaryTab meeting={{ ...meeting, subject: titleValue }} />
          )}
          {activeTab === "transcript" && <TranscriptTab meeting={meeting} />}
          {activeTab === "links"      && (
            <LinksTab
              meeting={meeting}
              linkedCompany={linkedCompany}
              linkedContacts={linkedContacts}
              onLinkCompany={handleLinkCompany}
              onAddContact={handleAddContact}
              onRemoveContact={handleRemoveContact}
            />
          )}
        </div>
      </div>
    </>
  );
}
