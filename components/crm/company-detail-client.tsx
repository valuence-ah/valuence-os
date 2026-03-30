"use client";
// ─── Company Detail Client ────────────────────────────────────────────────────
// Interactive part of the company detail page.
// Tabs: Overview | Contacts | Interactions | Deals
// Includes "Add Note" and "Log Interaction" actions.

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Company, Contact, Interaction, Deal } from "@/lib/types";
import {
  formatCurrency, formatDate, timeAgo,
  COMPANY_TYPE_COLORS, DEAL_STAGE_COLORS, DEAL_STAGE_LABELS,
  cn, getInitials,
} from "@/lib/utils";
import {
  Globe, Linkedin, ExternalLink, MapPin, Building2,
  MessageSquare, Phone, Mail, Plus, ChevronDown, FileText, Mic, CheckSquare,
  Sparkles, Loader2, AlertCircle, Calendar, Link as LinkIcon,
} from "lucide-react";
import Link from "next/link";
import type { IcMemo } from "@/lib/types";

const TABS = ["Overview", "Contacts", "Interactions", "Deals", "Memos", "Intelligence"] as const;
type Tab = typeof TABS[number];

type MemoSummary = Pick<IcMemo, "id" | "title" | "recommendation" | "status" | "created_at">;

const REC_COLORS: Record<string, string> = {
  invest:         "bg-green-100 text-green-700",
  pass:           "bg-red-100 text-red-600",
  more_diligence: "bg-yellow-100 text-yellow-700",
  pending:        "bg-slate-100 text-slate-500",
};

interface Props {
  company: Company;
  contacts: Contact[];
  interactions: Interaction[];
  deals: Deal[];
  memos: MemoSummary[];
}

// ── Interactions tab with expandable meeting transcripts ──────────────────────
function InteractionsTab({ interactions }: { interactions: Interaction[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const meetings    = interactions.filter(i => i.type === "meeting");
  const otherEvents = interactions.filter(i => i.type !== "meeting");

  function InteractionRow({ i }: { i: Interaction }) {
    const isMeeting    = i.type === "meeting";
    const hasTranscript = !!(i.transcript_text);
    const isExpanded   = expandedId === i.id;

    return (
      <div className="border-b border-slate-100 last:border-0">
        <button
          className="w-full text-left px-5 py-3 hover:bg-slate-50 transition-colors"
          onClick={() => isMeeting ? setExpandedId(isExpanded ? null : i.id) : undefined}
          style={{ cursor: isMeeting ? "pointer" : "default" }}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              {isMeeting
                ? <span className="inline-flex items-center gap-1 badge bg-violet-100 text-violet-700"><Mic size={10} /> Meeting</span>
                : <span className="badge bg-slate-100 text-slate-600 capitalize">{i.type}</span>
              }
              {hasTranscript && (
                <span className="badge bg-blue-50 text-blue-600 text-[10px]">Transcript</span>
              )}
              {i.fireflies_id && (
                <span className="badge bg-orange-50 text-orange-600 text-[10px]">Fireflies</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{timeAgo(i.date)}</span>
              {isMeeting && <ChevronDown size={13} className={cn("text-slate-400 transition-transform", isExpanded && "rotate-180")} />}
            </div>
          </div>
          {i.subject && <p className="text-sm font-medium text-slate-800">{i.subject}</p>}
          {/* Summary line (always visible) */}
          {i.summary && !isExpanded && (
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{i.summary}</p>
          )}
          {/* Body for non-meetings */}
          {!isMeeting && i.body && (
            <p className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap">{i.body}</p>
          )}
        </button>

        {/* Expanded meeting detail */}
        {isMeeting && isExpanded && (
          <div className="px-5 pb-4 space-y-3 bg-slate-50/60">
            {/* Summary */}
            {i.summary && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Summary</p>
                <p className="text-sm text-slate-700 leading-relaxed">{i.summary}</p>
              </div>
            )}

            {/* Action items */}
            {(i.action_items?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Action Items</p>
                <ul className="space-y-1">
                  {i.action_items!.map((a, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                      <CheckSquare size={12} className="mt-0.5 text-amber-500 flex-shrink-0" />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Full transcript */}
            {i.transcript_text && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Full Transcript</p>
                <pre className="max-h-64 overflow-y-auto text-xs text-slate-600 leading-relaxed whitespace-pre-wrap bg-white border border-slate-200 rounded-lg p-3 font-mono">
                  {i.transcript_text}
                </pre>
              </div>
            )}

            {/* Transcript file link */}
            {i.transcript_url && (
              <a
                href={i.transcript_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700"
              >
                <ExternalLink size={11} /> Open transcript file
              </a>
            )}
          </div>
        )}
      </div>
    );
  }

  if (interactions.length === 0) {
    return (
      <div className="card">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Interaction History</h3>
        </div>
        <p className="px-5 py-8 text-sm text-slate-400 text-center">No interactions logged yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Meeting Transcripts section */}
      {meetings.length > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Mic size={14} className="text-violet-600" />
            <h3 className="text-sm font-semibold text-slate-800">Meeting Transcripts</h3>
            <span className="ml-auto badge bg-slate-100 text-slate-500">{meetings.length}</span>
          </div>
          <div>
            {meetings.map(i => <InteractionRow key={i.id} i={i} />)}
          </div>
        </div>
      )}

      {/* Other interactions */}
      {otherEvents.length > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Other Interactions</h3>
          </div>
          <div>
            {otherEvents.map(i => <InteractionRow key={i.id} i={i} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Intelligence tab ──────────────────────────────────────────────────────────
interface IntelItem {
  headline: string;
  source: string;
  date: string;
  summary: string;
  url: string | null;
}

function IntelligenceTab({ companyId }: { companyId: string }) {
  const supabase = createClient();
  const [items, setItems]         = useState<IntelItem[]>([]);
  const [signals, setSignals]     = useState<{ id: string; title: string; summary: string | null; source: string | null; url: string | null; relevance_score: number | null; created_at: string }[]>([]);
  const [status, setStatus]       = useState<"idle" | "loading" | "done" | "error">("idle");
  const [exaStatus, setExaStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [exaMsg, setExaMsg]       = useState<string | null>(null);
  const [loadingSignals, setLoadingSignals] = useState(true);

  // Load saved sourcing signals for this company on mount
  useEffect(() => {
    supabase
      .from("sourcing_signals")
      .select("id, title, summary, source, url, relevance_score, created_at")
      .eq("company_id", companyId)
      .order("relevance_score", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setSignals((data ?? []) as typeof signals);
        setLoadingSignals(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function runIntelligence() {
    setStatus("loading");
    setItems([]);
    try {
      const res = await fetch(`/api/companies/${companyId}/intelligence`, { method: "POST" });
      const data = await res.json() as { items?: IntelItem[] };
      setItems(data.items ?? []);
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  async function runExa() {
    setExaStatus("loading");
    setExaMsg(null);
    try {
      const res  = await fetch("/api/agents/exa-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId }),
      });
      const data = await res.json() as { success?: boolean; signals_saved?: number; error?: string };
      if (!data.success) { setExaStatus("error"); setExaMsg(data.error ?? "Research failed"); return; }
      const saved = data.signals_saved ?? 0;
      setExaMsg(`${saved} signal${saved !== 1 ? "s" : ""} saved`);
      setExaStatus("done");
      // Reload signals
      const { data: fresh } = await supabase
        .from("sourcing_signals")
        .select("id, title, summary, source, url, relevance_score, created_at")
        .eq("company_id", companyId)
        .order("relevance_score", { ascending: false })
        .limit(20);
      setSignals((fresh ?? []) as typeof signals);
    } catch {
      setExaStatus("error");
      setExaMsg("Research failed");
    }
  }

  return (
    <div className="space-y-4">

      {/* Action bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={runIntelligence}
          disabled={status === "loading"}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          {status === "loading" ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {status === "loading" ? "Generating…" : "Get AI Intelligence"}
        </button>

        <button
          onClick={runExa}
          disabled={exaStatus === "loading"}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 disabled:opacity-50 transition-colors"
        >
          {exaStatus === "loading" ? <Loader2 size={12} className="animate-spin" /> : <LinkIcon size={12} />}
          {exaStatus === "loading" ? "Searching Exa…" : "Research with Exa"}
        </button>
        {exaMsg && (
          <span className={`text-xs ${exaStatus === "error" ? "text-red-500" : "text-slate-500"}`}>{exaMsg}</span>
        )}
      </div>

      {/* AI Intelligence results */}
      {status === "error" && (
        <div className="flex items-center gap-2 text-sm text-red-500 bg-red-50 rounded-lg px-4 py-3">
          <AlertCircle size={14} /> Failed to generate intelligence. Try again.
        </div>
      )}

      {items.length > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Sparkles size={14} className="text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-800">AI Intelligence</h3>
            <span className="ml-auto text-[10px] text-slate-400">Generated by Claude · may contain inaccuracies</span>
          </div>
          <div className="divide-y divide-slate-100">
            {items.map((item, i) => (
              <div key={i} className="px-5 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-slate-800 leading-snug">{item.headline}</p>
                  <div className="flex items-center gap-1.5 flex-shrink-0 text-[10px] text-slate-400">
                    <Calendar size={10} />
                    {item.date}
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{item.summary}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{item.source}</span>
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-0.5">
                      <ExternalLink size={9} /> Source
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Saved Exa signals */}
      <div className="card">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <LinkIcon size={14} className="text-teal-600" />
          <h3 className="text-sm font-semibold text-slate-800">Saved Signals</h3>
          {signals.length > 0 && <span className="ml-auto badge bg-slate-100 text-slate-500">{signals.length}</span>}
        </div>
        {loadingSignals ? (
          <div className="px-5 py-8 flex justify-center">
            <Loader2 size={16} className="animate-spin text-slate-300" />
          </div>
        ) : signals.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-400 text-center">
            No signals yet. Click &quot;Research with Exa&quot; to pull signals for this company.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {signals.map(s => (
              <div key={s.id} className="px-5 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-slate-800 leading-snug">{s.title}</p>
                  {s.relevance_score != null && (
                    <span className={cn(
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0",
                      s.relevance_score >= 0.7 ? "bg-green-100 text-green-700" :
                      s.relevance_score >= 0.5 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                    )}>
                      {Math.round(s.relevance_score * 100)}%
                    </span>
                  )}
                </div>
                {s.summary && <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2">{s.summary}</p>}
                <div className="flex items-center gap-2 mt-1.5">
                  {s.source && <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{s.source}</span>}
                  {s.url && (
                    <a href={s.url} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-0.5">
                      <ExternalLink size={9} /> Source
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function CompanyDetailClient({ company, contacts: initContacts, interactions: initInteractions, deals, memos }: Props) {
  const supabase = createClient();
  const [tab, setTab]             = useState<Tab>("Overview");
  const [contacts, setContacts]   = useState(initContacts);
  const [interactions, setInteractions] = useState(initInteractions);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteText, setNoteText]   = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactForm, setContactForm] = useState<Partial<Contact>>({ type: "Founder / Mgmt" as Contact["type"] });
  const [savingContact, setSavingContact] = useState(false);

  async function saveNote() {
    if (!noteText.trim()) return;
    setSavingNote(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase
      .from("interactions")
      .insert({ type: "note", body: noteText, company_id: company.id, date: new Date().toISOString(), created_by: user?.id })
      .select().single();
    setSavingNote(false);
    if (data) { setInteractions(p => [data, ...p]); setNoteText(""); setShowNoteForm(false); }
  }

  async function saveContact(e: React.FormEvent) {
    e.preventDefault();
    setSavingContact(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase
      .from("contacts")
      .insert({ ...contactForm, company_id: company.id, created_by: user?.id })
      .select().single();
    setSavingContact(false);
    if (data) {
      setContacts(p => [data, ...p]);
      setShowContactForm(false);
      setContactForm({ type: "Founder / Mgmt" as Contact["type"] });
    }
  }

  const latestDeal = deals[0];

  return (
    <div className="flex-1 overflow-auto p-6 space-y-4">

      {/* Header card */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
              {getInitials(company.name)}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-slate-900">{company.name}</h1>
                <span className={cn("badge capitalize", COMPANY_TYPE_COLORS[company.type] ?? "bg-slate-100 text-slate-600")}>
                  {company.type.replace("_", " ")}
                </span>
                {company.deal_status && (
                  <span className={cn("badge", DEAL_STAGE_COLORS[company.deal_status] ?? "bg-slate-100 text-slate-600")}>
                    {company.deal_status.replace("_", " ")}
                  </span>
                )}
              </div>
              {company.description && (
                <p className="text-sm text-slate-500 mt-1 max-w-lg">{company.description}</p>
              )}
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                {company.location_city && (
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <MapPin size={12} /> {[company.location_city, company.location_country].filter(Boolean).join(", ")}
                  </span>
                )}
                {company.founded_year && (
                  <span className="text-xs text-slate-500">Founded {company.founded_year}</span>
                )}
              </div>
            </div>
          </div>

          {/* Links */}
          <div className="flex gap-2 flex-shrink-0">
            {company.website && (
              <a href={company.website} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-blue-600 transition-colors" title="Website">
                <Globe size={16} />
              </a>
            )}
            {company.linkedin_url && (
              <a href={company.linkedin_url} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-blue-600 transition-colors" title="LinkedIn">
                <Linkedin size={16} />
              </a>
            )}
          </div>
        </div>

        {/* Quick stats */}
        {company.type === "startup" && (
          <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-100">
            <div>
              <p className="text-xs text-slate-400 font-medium">Total Raised</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{formatCurrency(company.funding_raised, true) || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Stage</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5 capitalize">{company.stage ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Last Contact</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{formatDate(company.last_contact_date)}</p>
            </div>
          </div>
        )}
        {company.type === "lp" && (
          <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-slate-100">
            <div>
              <p className="text-xs text-slate-400 font-medium">AUM</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{formatCurrency(company.aum, true) || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">LP Type</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5 capitalize">{company.lp_type?.replace("_", " ") ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Last Contact</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{formatDate(company.last_contact_date)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === t
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            {t}
            {t === "Contacts" && contacts.length > 0 && <span className="ml-1.5 badge bg-slate-100 text-slate-500">{contacts.length}</span>}
            {t === "Interactions" && interactions.length > 0 && <span className="ml-1.5 badge bg-slate-100 text-slate-500">{interactions.length}</span>}
            {t === "Memos" && memos.length > 0 && <span className="ml-1.5 badge bg-slate-100 text-slate-500">{memos.length}</span>}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === "Overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Notes */}
          <div className="lg:col-span-2 card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-800">Notes</h3>
              <button onClick={() => setShowNoteForm(!showNoteForm)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                <Plus size={12} /> Add note
              </button>
            </div>
            {showNoteForm && (
              <div className="mb-4 space-y-2">
                <textarea
                  className="textarea"
                  rows={3}
                  placeholder="Add a note…"
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button onClick={() => setShowNoteForm(false)} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                  <button onClick={saveNote} disabled={savingNote || !noteText.trim()} className="px-3 py-1 bg-blue-600 text-white text-xs rounded-lg disabled:opacity-50">
                    {savingNote ? "Saving…" : "Save note"}
                  </button>
                </div>
              </div>
            )}
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{company.notes || <span className="text-slate-400 italic">No notes yet.</span>}</p>
          </div>

          {/* Details */}
          <div className="card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-800">Details</h3>
            {[
              { label: "Source",        value: company.source },
              { label: "First contact", value: formatDate(company.first_contact_date) },
              { label: "Last contact",  value: formatDate(company.last_contact_date) },
              { label: "Sectors",       value: company.sectors?.join(", ") },
              { label: "Employees",     value: company.employee_count },
              { label: "Added",         value: formatDate(company.created_at) },
            ].map(({ label, value }) => (
              value ? (
                <div key={label}>
                  <p className="text-xs text-slate-400 font-medium">{label}</p>
                  <p className="text-sm text-slate-700 capitalize">{value}</p>
                </div>
              ) : null
            ))}
          </div>
        </div>
      )}

      {/* ── CONTACTS TAB ── */}
      {tab === "Contacts" && (
        <div className="card">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Contacts at {company.name}</h3>
            <button onClick={() => setShowContactForm(!showContactForm)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
              <Plus size={12} /> Add contact
            </button>
          </div>

          {showContactForm && (
            <form onSubmit={saveContact} className="p-5 bg-slate-50 border-b border-slate-200 grid grid-cols-2 gap-3">
              <input required className="input" placeholder="First name *" value={contactForm.first_name ?? ""} onChange={e => setContactForm(p => ({ ...p, first_name: e.target.value }))} />
              <input required className="input" placeholder="Last name *" value={contactForm.last_name ?? ""} onChange={e => setContactForm(p => ({ ...p, last_name: e.target.value }))} />
              <input className="input" placeholder="Email" type="email" value={contactForm.email ?? ""} onChange={e => setContactForm(p => ({ ...p, email: e.target.value }))} />
              <input className="input" placeholder="Title / Role" value={contactForm.title ?? ""} onChange={e => setContactForm(p => ({ ...p, title: e.target.value }))} />
              <select className="select" value={contactForm.type} onChange={e => setContactForm(p => ({ ...p, type: e.target.value as Contact["type"] }))}>
                <option value="Founder / Mgmt">Founder / Mgmt</option>
                <option value="Investor">Investor</option>
                <option value="Limited Partner">Limited Partner</option>
                <option value="Strategic">Strategic</option>
                <option value="Ecosystem">Ecosystem</option>
                <option value="Advisor / KOL">Advisor / KOL</option>
                <option value="Employee">Employee</option>
                <option value="Lawyer">Lawyer</option>
                <option value="Government/Academic">Government/Academic</option>
                <option value="Other">Other</option>
              </select>
              <select className="select" value={contactForm.relationship_strength ?? ""} onChange={e => setContactForm(p => ({ ...p, relationship_strength: e.target.value as Contact["relationship_strength"] }))}>
                <option value="">Relationship strength</option>
                <option value="strong">Strong</option>
                <option value="medium">Medium</option>
                <option value="weak">Weak</option>
                <option value="new">New</option>
              </select>
              <div className="col-span-2 flex gap-2">
                <button type="button" onClick={() => setShowContactForm(false)} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                <button type="submit" disabled={savingContact} className="px-3 py-1 bg-blue-600 text-white text-xs rounded-lg disabled:opacity-50">
                  {savingContact ? "Saving…" : "Add contact"}
                </button>
              </div>
            </form>
          )}

          <div className="divide-y divide-slate-100">
            {contacts.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-400 text-center">No contacts yet.</p>
            ) : (
              contacts.map(c => (
                <div key={c.id} className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-600">
                      {getInitials(`${c.first_name} ${c.last_name}`)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{c.first_name} {c.last_name}</p>
                      <p className="text-xs text-slate-400">{c.title ?? c.type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {c.email && <a href={`mailto:${c.email}`} className="text-slate-400 hover:text-blue-600"><Mail size={14} /></a>}
                    {c.phone && <a href={`tel:${c.phone}`} className="text-slate-400 hover:text-blue-600"><Phone size={14} /></a>}
                    {c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-blue-600"><Linkedin size={14} /></a>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── INTERACTIONS TAB ── */}
      {tab === "Interactions" && (
        <InteractionsTab interactions={interactions} />
      )}

      {/* ── MEMOS TAB ── */}
      {tab === "Memos" && (
        <div className="card">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">IC Memos</h3>
            <Link
              href="/memos"
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              View all memos →
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {memos.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <FileText className="mx-auto text-slate-300 mb-2" size={28} />
                <p className="text-sm text-slate-400">No memos yet.</p>
                <p className="text-xs text-slate-400 mt-1">Click <strong>Generate IC Memo</strong> in the header to create one.</p>
              </div>
            ) : (
              memos.map(memo => (
                <Link
                  key={memo.id}
                  href={`/memos/${memo.id}`}
                  className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">{memo.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{new Date(memo.created_at).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {memo.recommendation && (
                      <span className={cn("badge capitalize", REC_COLORS[memo.recommendation] ?? "bg-slate-100 text-slate-500")}>
                        {memo.recommendation.replace("_", " ")}
                      </span>
                    )}
                    <span className="badge bg-slate-100 text-slate-500 capitalize">
                      {memo.status.replace("_", " ")}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── DEALS TAB ── */}
      {tab === "Deals" && (
        <div className="card">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Deals</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {deals.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-400 text-center">No deals yet.</p>
            ) : (
              deals.map(d => (
                <div key={d.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <span className={cn("badge capitalize", DEAL_STAGE_COLORS[d.stage] ?? "bg-slate-100")}>{DEAL_STAGE_LABELS[d.stage] ?? d.stage}</span>
                    {d.investment_amount && (
                      <p className="text-sm font-semibold text-slate-800 mt-1">{formatCurrency(d.investment_amount, true)}</p>
                    )}
                    {d.instrument && <p className="text-xs text-slate-500 capitalize">{d.instrument.replace("_", " ")}</p>}
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    {d.valuation_cap && <p>Cap: {formatCurrency(d.valuation_cap, true)}</p>}
                    {d.ic_date && <p>IC: {formatDate(d.ic_date)}</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── INTELLIGENCE TAB ── */}
      {tab === "Intelligence" && (
        <IntelligenceTab companyId={company.id} />
      )}

    </div>
  );
}
