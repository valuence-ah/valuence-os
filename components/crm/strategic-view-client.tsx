"use client";
// ─── Strategic Partners CRM — metrics · table · detail panel ─────────────────

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import type { Company, Contact, Interaction, ContactType } from "@/lib/types";
import { cn, formatDate, getInitials, timeAgo } from "@/lib/utils";
import { useColumnPrefs } from "@/lib/use-column-prefs";
import { MeetingTranscripts } from "@/components/crm/meeting-transcripts";
import {
  Search, Plus, X, Check, Loader2, Mail, Video, Phone, FileText,
  Building2, Target, TrendingUp, AlertCircle, Users, User, Shield,
  Handshake, MoreHorizontal, ChevronRight, ExternalLink, RefreshCw, MapPin, Link2, Star,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type StrategicRole = "Co-invest" | "Customer" | "Pilot" | "Diligence";
type SignalType = "hot" | "warm" | "cold";
type OppType = "Commercialization" | "Co-investment" | "Due diligence" | "Ecosystem" | "Fundraising" | "Introduction" | "Investment" | "Pilot" | "Portfolio Management";
type OppUrgency = "high" | "medium" | "low";
type PortcoStatus = "Active pilot" | "Intro pending" | "Exploring" | "Not started";

interface StrategicExt {
  roles: StrategicRole[];
  health: number | null;
  utility: number;
  signal: SignalType | null;
  signal_note: string;
  next_action: string;
  next_action_due: string;
  owner: string;
  intelCachedAt?: string | null;
  scores: { strategic_focus: number; relationship: number; portco: number; responsiveness: number };
  portco_matches: { portco: string; portcoId: string; status: PortcoStatus; due: string }[];
  opportunities: { id: string; title?: string; company?: string; companyId?: string; type: string; urgency: OppUrgency; description: string; due: string }[];
  intel: { id: string; headline: string; source: string; url?: string; date: string; is_signal: boolean; summary?: string }[];
  tasks: { id: string; text: string; done: boolean; due: string }[];
}

const DEFAULT_EXT: StrategicExt = {
  roles: [],
  health: null,
  utility: 50,
  signal: null,
  signal_note: "",
  next_action: "",
  next_action_due: "",
  owner: "",
  scores: { strategic_focus: 50, relationship: 50, portco: 50, responsiveness: 50 },
  portco_matches: [],
  opportunities: [],
  intel: [],
  tasks: [],
};

const LS_KEY = "strategic_ext_map";
const PS_MAP_KEY = "portco_strategic_map"; // portco name → [{strategicId, strategicName, status, due}]

function upsertPortcoStrategicMap(portcoName: string, portcoId: string, strategicId: string, strategicName: string, status: string, due: string) {
  try {
    const raw = localStorage.getItem(PS_MAP_KEY);
    const map: Record<string, { strategicId: string; strategicName: string; portcoId: string; status: string; due: string }[]> = raw ? JSON.parse(raw) : {};
    const existing = map[portcoName] ?? [];
    const filtered = existing.filter(e => e.strategicId !== strategicId);
    map[portcoName] = [...filtered, { strategicId, strategicName, portcoId, status, due }];
    localStorage.setItem(PS_MAP_KEY, JSON.stringify(map));
  } catch {}
}

// ── Constants ─────────────────────────────────────────────────────────────────

const OWNERS = ["Andrew", "Gene", "Lance"] as const;
const ROLES: StrategicRole[] = ["Co-invest", "Customer", "Pilot", "Diligence"];

const FILTER_PILLS = [
  { id: "all",        label: "All" },
  { id: "coinvest",   label: "Co-invest" },
  { id: "pilot",      label: "Pilot-ready" },
  { id: "diligence",  label: "Diligence" },
  { id: "cooling",    label: "Cooling off" },
] as const;
type FilterId = (typeof FILTER_PILLS)[number]["id"];

const OPP_TYPE_COLORS: Record<string, string> = {
  "Commercialization":   "bg-orange-100 text-orange-700",
  "Co-investment":       "bg-amber-100 text-amber-700",
  "Due diligence":       "bg-violet-100 text-violet-700",
  "Ecosystem":           "bg-teal-100 text-teal-700",
  "Fundraising":         "bg-blue-100 text-blue-700",
  "Introduction":        "bg-amber-100 text-amber-700",
  "Investment":          "bg-emerald-100 text-emerald-700",
  "Pilot":               "bg-emerald-100 text-emerald-700",
  "Portfolio Management":"bg-slate-100 text-slate-600",
  // backwards compat
  "Co-invest":           "bg-amber-100 text-amber-700",
  "Diligence":           "bg-violet-100 text-violet-700",
  "Customer":            "bg-blue-100 text-blue-700",
  "Value-add":           "bg-slate-100 text-slate-600",
};

const PORTCO_STATUS_COLORS: Record<PortcoStatus, string> = {
  "Active pilot":   "bg-emerald-100 text-emerald-700",
  "Intro pending":  "bg-amber-100 text-amber-700",
  "Exploring":      "bg-blue-100 text-blue-700",
  "Not started":    "bg-slate-100 text-slate-500",
};

// Strategic type badge styles — match Admin→Companies→Strategic Type colours
const STRATEGIC_TYPE_STYLES: Record<string, { background: string; color: string }> = {
  "Corporate":  { background: "#fff7ed", color: "#c2410c" },
  "Foundation": { background: "#f0fdf4", color: "#15803d" },
  "Government": { background: "#f0f9ff", color: "#0369a1" },
  "Other":      { background: "#f8fafc", color: "#64748b" },
};

// Column widths for resizable columns
const DEFAULT_COL_WIDTHS: Record<string, number> = {
  Company: 200, "Strategic Type": 140, Sector: 120, "Rel. Health": 110, Utility: 90,
  Roles: 160, "Co-invest": 90, Diligence: 100, "Pilot/Customer": 110,
  "Last Contact": 110, City: 90, Country: 90, Signal: 90, Owner: 80,
};

// ── Helper functions ──────────────────────────────────────────────────────────

function computeHealth(lastContact: string | null): number {
  if (!lastContact) return 10;
  const days = (Date.now() - new Date(lastContact).getTime()) / 86_400_000;
  if (days < 30)  return Math.max(70, Math.min(100, 100 - days * 0.3));
  if (days < 90)  return Math.max(40, 75 - days * 0.4);
  if (days < 180) return Math.max(20, 50 - days * 0.2);
  return Math.max(5, 20 - days * 0.05);
}

function healthToSignal(h: number): SignalType {
  if (h >= 70) return "hot";
  if (h >= 40) return "warm";
  return "cold";
}

function healthColor(h: number): string {
  if (h >= 70) return "bg-emerald-500";
  if (h >= 40) return "bg-amber-400";
  return "bg-red-400";
}

function healthTextColor(h: number): string {
  if (h >= 70) return "text-emerald-600";
  if (h >= 40) return "text-amber-600";
  return "text-red-500";
}

// 10 avatar colors
const AVATAR_COLORS = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-violet-500 to-purple-600",
  "from-amber-500 to-orange-600",
  "from-pink-500 to-rose-600",
  "from-cyan-500 to-sky-600",
  "from-lime-500 to-green-600",
  "from-fuchsia-500 to-pink-600",
  "from-red-500 to-rose-600",
  "from-indigo-500 to-blue-700",
];

function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xfffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CompanyAvatar({ name, website, size = "md" }: { name: string; website?: string | null; size?: "sm" | "md" | "lg" }) {
  const [err, setErr] = useState(false);
  const sz = size === "sm" ? "w-7 h-7 text-[9px]" : size === "lg" ? "w-12 h-12 text-sm" : "w-9 h-9 text-xs";
  const grad = hashColor(name);
  const domain = website ? website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] : null;
  const src = domain ? `https://img.logo.dev/${domain}?token=pk_FYk-9BO1QwS9yyppOxJ2vQ&format=png&size=128` : null;
  useEffect(() => setErr(false), [src]);
  if (src && !err) {
    return (
      <img src={src} alt={name} onError={() => setErr(true)}
        className={`${sz} rounded-md object-contain bg-white border border-slate-200 p-0.5 flex-shrink-0`} />
    );
  }
  return (
    <div className={`${sz} rounded-md bg-gradient-to-br ${grad} flex items-center justify-center flex-shrink-0`}>
      <span className="text-white font-bold">{getInitials(name)}</span>
    </div>
  );
}

function InteractionIcon({ type }: { type: string }) {
  if (type === "email")   return <Mail size={11} className="text-blue-500" />;
  if (type === "call")    return <Phone size={11} className="text-green-500" />;
  if (type === "meeting") return <Video size={11} className="text-violet-500" />;
  return <FileText size={11} className="text-slate-400" />;
}

function UtilityBars({ value, h }: { value: number; h: number }) {
  const bars = 5;
  const filled = Math.round((value / 100) * bars);
  const color = h >= 70 ? "bg-emerald-500" : h >= 40 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-end gap-0.5">
      {Array.from({ length: bars }, (_, i) => (
        <div key={i} className={cn("w-1 rounded-sm", i < filled ? color : "bg-slate-200")}
          style={{ height: `${8 + i * 2}px` }} />
      ))}
    </div>
  );
}

function ScoreBar({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(String(value));
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-xs text-slate-600">{label}</span>
        {editing ? (
          <input value={input} onChange={e => setInput(e.target.value)}
            onBlur={() => { const v = Math.min(100, Math.max(0, parseInt(input) || 0)); onChange(v); setEditing(false); }}
            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="w-8 text-xs font-semibold text-slate-700 text-right border-b border-blue-400 outline-none bg-transparent" />
        ) : (
          <span className="text-xs font-semibold text-slate-700 cursor-pointer hover:text-blue-600"
            onClick={() => { setInput(String(value)); setEditing(true); }}>{value}%</span>
        )}
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", value >= 75 ? "bg-emerald-500" : value >= 50 ? "bg-amber-400" : "bg-slate-300")}
          style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// ── InlinePickerCell ──────────────────────────────────────────────────────────

function InlinePickerCell({
  value, options, styles, onPick,
}: {
  value: string;
  options: string[];
  styles: Record<string, { background: string; color: string }>;
  onPick: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const estimatedH = (options.length + 1) * 34;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const top = spaceBelow < estimatedH && rect.top > spaceBelow
      ? Math.max(8, rect.top - estimatedH - 4)
      : rect.bottom + 4;
    setPos({ top, left: rect.left });
    setOpen(o => !o);
  }

  useEffect(() => {
    if (!open) return;
    function handler() { setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <>
      <span ref={ref} onClick={toggle} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center" }}>
        {value ? (
          <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 9999, fontWeight: 500, ...(styles[value] ?? { background: "#f1f5f9", color: "#475569" }) }}>
            {value}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: "#cbd5e1" }}>— Add</span>
        )}
      </span>
      {open && pos && createPortal(
        <div style={{ position: "fixed", top: pos.top, left: pos.left, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 99999, minWidth: 180, overflow: "hidden", fontFamily: "inherit" }} onMouseDown={e => e.stopPropagation()}>
          <div onMouseDown={() => { onPick(""); setOpen(false); }} style={{ padding: "7px 12px", fontSize: 12, color: "#94a3b8", cursor: "pointer", borderBottom: "1px solid #f8fafc" }}>— Clear</div>
          {options.map(opt => (
            <div key={opt} onMouseDown={() => { onPick(opt); setOpen(false); }} style={{ padding: "7px 12px", fontSize: 12, cursor: "pointer" }}>
              <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 9999, fontWeight: 500, ...(styles[opt] ?? {}) }}>{opt}</span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props { initialCompanies: Company[] }

export function StrategicViewClient({ initialCompanies }: Props) {
  const supabase = createClient();

  // Core state
  const [companies, setCompanies]         = useState<Company[]>(initialCompanies);
  const [strategicTypeMap, setStrategicTypeMap] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId]       = useState<string | null>(null);
  const [search, setSearch]               = useState("");
  const [activeFilter, setActiveFilter]   = useState<FilterId>("all");
  const [interactions, setInteractions]   = useState<Interaction[]>([]);
  const [contacts, setContacts]           = useState<Contact[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Panel tab
  const [panelTab, setPanelTab] = useState<"overview" | "opportunities" | "company_news" | "intelligence">("overview");
  // Company News (Exa-powered) — keyed by company id so each company keeps its own news
  type StrategicNewsItem = { headline: string; source: string; date: string; summary: string; url: string | null };
  const [newsMap, setNewsMap]               = useState<Record<string, StrategicNewsItem[]>>({});
  const [newsLoading, setNewsLoading]       = useState(false);
  const [newsCachedAt, setNewsCachedAt]     = useState<Record<string, string>>({});
  const [newsSource, setNewsSource]         = useState<Record<string, "exa" | "claude">>({});
  // Company News starred — persisted to localStorage keyed by company id
  const [newsStarred, setNewsStarred]       = useState<Record<string, string[]>>({});
  // Partnership Intelligence (alignment-style)
  const [partnerAlign, setPartnerAlign]     = useState<{ alignment_summary: string; portfolio_picks: { id: string | null; name: string; reason: string; sectors: string[]; stage: string | null; description: string | null; website: string | null }[]; pipeline_picks: { id: string | null; name: string; reason: string; sectors: string[]; stage: string | null; description: string | null; website: string | null }[] } | null>(null);
  const [partnerAlignLoading, setPartnerAlignLoading] = useState(false);
  const [partnerAlignGeneratedAt, setPartnerAlignGeneratedAt] = useState<string | null>(null);
  // Remove company confirm
  const [confirmRemoveCompanyId, setConfirmRemoveCompanyId] = useState<string | null>(null);
  // Change type
  const [changeTypePos, setChangeTypePos] = useState<{ top: number; right: number } | null>(null);

  // localStorage ext map
  const [extMap, setExtMap] = useState<Record<string, StrategicExt>>({});

  // Last touch map (loaded once on mount)
  const [lastTouchMap, setLastTouchMap] = useState<Record<string, { date: string; type: string }>>({});

  // Add partner modal
  const [showAddPartner, setShowAddPartner] = useState(false);
  const [addName, setAddName]               = useState("");
  const [addSector, setAddSector]           = useState("");
  const [addType, setAddType]               = useState("ecosystem_partner");
  const [addWebsite, setAddWebsite]         = useState("");
  const [addCity, setAddCity]               = useState("");
  const [addCountry, setAddCountry]         = useState("");
  const [savingPartner, setSavingPartner]   = useState(false);

  // Opportunity form
  const [showOppForm, setShowOppForm]         = useState(false);
  const [oppTitle, setOppTitle]               = useState("");
  const [oppType, setOppType]                 = useState<OppType>("Ecosystem");
  const [oppUrgency, setOppUrgency]           = useState<OppUrgency>("medium");
  const [oppCompany, setOppCompany]           = useState("");
  const [oppCompanyId, setOppCompanyId]       = useState("");
  const [oppSearch, setOppSearch]             = useState("");
  const [showOppDropdown, setShowOppDropdown] = useState(false);
  const [oppDesc, setOppDesc]                 = useState("");
  const [oppDue, setOppDue]                   = useState("");
  const [confirmDeleteOppId, setConfirmDeleteOppId] = useState<string | null>(null);

  // Intel form
  const [showIntelForm, setShowIntelForm]   = useState(false);
  const [intelHeadline, setIntelHeadline]   = useState("");
  const [intelSource, setIntelSource]       = useState("");
  const [intelDate, setIntelDate]           = useState(() => new Date().toISOString().slice(0, 10));
  const [intelSignal, setIntelSignal]       = useState(false);

  // Intel auto-load
  const [loadingIntel, setLoadingIntel]     = useState(false);

  // Task form
  const [showTaskForm, setShowTaskForm]     = useState(false);
  const [taskText, setTaskText]             = useState("");
  const [taskDue, setTaskDue]               = useState("");

  // Inline field editing (double-click to edit)
  const [editingField, setEditingField]     = useState<string | null>(null);

  // Description auto-generate
  const [loadingDesc, setLoadingDesc]       = useState(false);

  // Sector auto-generate
  const [loadingSector, setLoadingSector]   = useState(false);

  // Activity form
  const [addingActivity, setAddingActivity] = useState(false);
  const [activityDate, setActivityDate]     = useState(() => new Date().toISOString().slice(0, 10));
  const [activityType, setActivityType]     = useState<"call" | "meeting" | "email">("call");
  const [activityNote, setActivityNote]     = useState("");
  const [savingActivity, setSavingActivity] = useState(false);
  const [activityContactIds, setActivityContactIds] = useState<string[]>([]);

  // Link existing contact
  const [showLinkContactForm, setShowLinkContactForm] = useState(false);
  const [linkContactSearch, setLinkContactSearch]     = useState("");
  const [linkContactSuggestions, setLinkContactSuggestions] = useState<Contact[]>([]);
  const [linkingContact, setLinkingContact]           = useState(false);

  // Contacts manage mode
  const [showAddContactForm, setShowAddContactForm] = useState(false);
  const [newContactFirst, setNewContactFirst] = useState("");
  const [newContactLast, setNewContactLast]   = useState("");
  const [newContactEmail, setNewContactEmail] = useState("");
  const [newContactTitle, setNewContactTitle] = useState("");
  const [addingContact, setAddingContact]     = useState(false);
  const [contactOrder, setContactOrder]       = useState<string[]>([]);
  const strContactDragIdx                     = useRef<number | null>(null);

  // Pipeline companies for portco match dropdown
  const [pipelineCompanies, setPipelineCompanies] = useState<{ id: string; name: string }[]>([]);

  // Resizable columns — persisted to Supabase via useColumnPrefs
  const { columnWidths, setColumnWidth } = useColumnPrefs("crm_strategic");
  const colWidths: Record<string, number> = { ...DEFAULT_COL_WIDTHS, ...columnWidths };
  const activityFormRef = useRef<HTMLDivElement>(null);
  const linkSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linkSearchAbort = useRef<AbortController | null>(null);

  function startResize(colName: string, currentWidth: number) {
    return (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startW = currentWidth;
      function onMove(ev: MouseEvent) {
        setColumnWidth(colName, Math.max(60, Math.min(500, startW + (ev.clientX - startX))));
      }
      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    };
  }

  // Re-fetch on mount using correct client-side type filtering (bypasses Next.js Router Cache).
  // Must mirror the same STRATEGIC_TYPES Set used in app/(dashboard)/crm/strategic/page.tsx.
  useEffect(() => {
    const STRATEGIC_TYPES = new Set(["corporate", "ecosystem_partner", "ecosystem", "strategic partner", "strategic_partner", "eco partner", "eco_partner"]);
    supabase
      .from("companies")
      .select("*")
      .order("name", { ascending: true })
      .limit(10000)
      .then(({ data }) => {
        if (!data) return;
        const partners = (data as Company[]).filter(c => {
          const t = (c.type ?? "").toLowerCase().trim();
          if (STRATEGIC_TYPES.has(t)) return true;
          return (c.types ?? []).some((x: string) => STRATEGIC_TYPES.has((x ?? "").toLowerCase().trim()));
        });
        setCompanies(partners);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") setExtMap(parsed as Record<string, StrategicExt>);
      }
    } catch {
      // Corrupted localStorage — clear it so the page doesn't keep crashing
      try { localStorage.removeItem(LS_KEY); } catch {}
    }
  }, []);

  // Load pipeline companies for portco match dropdown
  useEffect(() => {
    supabase.from("companies").select("id, name").contains("types", ["startup"])
      .order("name", { ascending: true }).then(({ data }) => {
        if (data) setPipelineCompanies(data as { id: string; name: string }[]);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load last touch map
  useEffect(() => {
    supabase
      .from("interactions")
      .select("company_id, date, type")
      .in("type", ["email", "call", "meeting"])
      .order("date", { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, { date: string; type: string }> = {};
        for (const r of data) if (r.company_id && !map[r.company_id]) map[r.company_id] = { date: r.date, type: r.type };
        setLastTouchMap(map);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close Add Activity form on outside click
  useEffect(() => {
    if (!addingActivity) return;
    function handleOutside(e: MouseEvent) {
      if (activityFormRef.current && !activityFormRef.current.contains(e.target as Node)) {
        setAddingActivity(false);
        setActivityNote("");
        setActivityContactIds([]);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [addingActivity]);

  function getExt(id: string): StrategicExt {
    const stored = extMap[id];
    if (!stored) return { ...DEFAULT_EXT, scores: { ...DEFAULT_EXT.scores } };
    // Defensively merge with defaults so old/partial localStorage data doesn't crash
    return {
      ...DEFAULT_EXT,
      ...stored,
      roles:          Array.isArray(stored.roles)           ? stored.roles          : [],
      portco_matches: Array.isArray(stored.portco_matches)  ? stored.portco_matches : [],
      opportunities:  Array.isArray(stored.opportunities)   ? stored.opportunities  : [],
      intel:          Array.isArray(stored.intel)           ? stored.intel          : [],
      tasks:          Array.isArray(stored.tasks)           ? stored.tasks          : [],
      scores: {
        ...DEFAULT_EXT.scores,
        ...(stored.scores && typeof stored.scores === "object" ? stored.scores : {}),
      },
    };
  }

  function saveExt(id: string, patch: Partial<StrategicExt>) {
    setExtMap(prev => {
      const updated = { ...prev, [id]: { ...getExt(id), ...prev[id], ...patch } };
      try { localStorage.setItem(LS_KEY, JSON.stringify(updated)); } catch {}
      return updated;
    });
  }

  function getHealth(co: Company): number {
    const ext = getExt(co.id);
    if (ext.health != null) return ext.health;
    return computeHealth(co.last_contact_date ?? null);
  }

  function getSignal(co: Company): SignalType {
    const ext = getExt(co.id);
    if (ext.signal != null) return ext.signal;
    return healthToSignal(getHealth(co));
  }

  // Change company type
  async function handleChangeType(newType: string) {
    if (!selectedId) return;
    const id = selectedId;
    const snapshot = companies.find(c => c.id === id);
    setChangeTypePos(null);
    const strategicTypes = ["corporate", "ecosystem_partner", "government"];
    if (!strategicTypes.includes(newType)) {
      setCompanies(prev => prev.filter(c => c.id !== id));
      setSelectedId(null);
    } else {
      setCompanies(prev => prev.map(c =>
        c.id === id ? { ...c, type: newType as Company["type"], types: [newType] } : c
      ));
    }
    const { error } = await supabase.from("companies").update({ type: newType, types: [newType] }).eq("id", id);
    if (error && snapshot) {
      setCompanies(prev => [snapshot, ...prev.filter(c => c.id !== id)]);
    }
  }

  // Save company field to Supabase (optimistic update)
  async function saveCompanyField(id: string, patch: Partial<Company>) {
    const prev = companies.find(c => c.id === id);
    setCompanies(ps => ps.map(c => c.id === id ? { ...c, ...patch } : c));
    const { error } = await supabase.from("companies").update(patch).eq("id", id);
    if (error) {
      console.error("saveCompanyField error:", error);
      if (prev) setCompanies(ps => ps.map(c => c.id === id ? prev : c));
    }
  }

  // Metrics
  const metrics = useMemo(() => {
    const now = Date.now();
    const total        = companies.length;
    const active       = companies.filter(c => { const last = lastTouchMap[c.id]?.date ?? c.last_contact_date; return last && (now - new Date(last).getTime()) / 86_400_000 < 90; }).length;
    const coinvest     = companies.filter(c => getExt(c.id).roles.includes("Co-invest")).length;
    const pilot        = companies.filter(c => getExt(c.id).roles.includes("Pilot")).length;
    const diligence    = companies.filter(c => getExt(c.id).roles.includes("Diligence")).length;
    const cooling      = companies.filter(c => { const last = lastTouchMap[c.id]?.date ?? c.last_contact_date; return !last || (now - new Date(last).getTime()) / 86_400_000 > 180; }).length;
    return { total, active, coinvest, pilot, diligence, cooling };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies, lastTouchMap, extMap]);

  // Filtered list
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const now = Date.now();
    return companies.filter(c => {
      if (q && !c.name.toLowerCase().includes(q) && !(c.description ?? "").toLowerCase().includes(q)) return false;
      const ext = getExt(c.id);
      if (activeFilter === "coinvest")  return ext.roles.includes("Co-invest");
      if (activeFilter === "pilot")     return ext.roles.includes("Pilot");
      if (activeFilter === "diligence") return ext.roles.includes("Diligence");
      if (activeFilter === "cooling") {
        const last = lastTouchMap[c.id]?.date ?? c.last_contact_date;
        return !last || (now - new Date(last).getTime()) / 86_400_000 > 180;
      }
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companies, search, activeFilter, lastTouchMap, extMap]);

  // Load detail
  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    const [{ data: ctcts }, { data: ints }] = await Promise.all([
      supabase.from("contacts").select("*").eq("company_id", id).order("is_primary_contact", { ascending: false }),
      supabase.from("interactions").select("*").eq("company_id", id).order("date", { ascending: false }).limit(20),
    ]);
    setContacts((ctcts ?? []) as Contact[]);
    setInteractions((ints ?? []) as Interaction[]);
    setLoadingDetail(false);
  }, [supabase]);

  function selectCompany(id: string) {
    setSelectedId(id);
    setPanelTab("overview");
    setEditingField(null);
    setShowOppForm(false);
    setShowIntelForm(false);
    setShowTaskForm(false);
    setChangeTypePos(null);
    loadDetail(id);
  }

  const selected = companies.find(c => c.id === selectedId) ?? null;
  const selectedExt = selected ? getExt(selected.id) : DEFAULT_EXT;

  // Computed utility = average of 4 scores
  function computedUtility(ext: StrategicExt): number {
    return Math.round((ext.scores.strategic_focus + ext.scores.relationship + ext.scores.portco + ext.scores.responsiveness) / 4);
  }

  // Save partner
  async function savePartner() {
    if (!addName.trim()) return;
    setSavingPartner(true);
    const { data: newCo } = await supabase.from("companies").insert({
      name:             addName.trim(),
      type:             addType || "ecosystem_partner",
      website:          addWebsite.trim() || null,
      sectors:          addSector.trim() ? [addSector.trim()] : null,
      location_city:    addCity.trim() || null,
      location_country: addCountry.trim() || null,
    }).select().single();
    if (newCo) {
      setCompanies(prev => [...prev, newCo as Company].sort((a, b) => a.name.localeCompare(b.name)));
      // Auto-run logo.dev for corporate / government types
      if (newCo.website && (addType === "corporate" || addType === "government")) {
        fetch("/api/logo-finder/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId: newCo.id }),
        }).catch(() => {});
      }
    }
    setAddName(""); setAddSector(""); setAddType("ecosystem_partner");
    setAddWebsite(""); setAddCity(""); setAddCountry("");
    setShowAddPartner(false);
    setSavingPartner(false);
  }

  // Auto-generate description
  async function generateDescription() {
    if (!selected) return;
    setLoadingDesc(true);
    try {
      const res = await fetch("/api/strategic/describe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: selected.id, name: selected.name, sectors: selected.sectors }),
      });
      const data = await res.json();
      if (data.description) {
        setCompanies(ps => ps.map(c => c.id === selected.id ? { ...c, description: data.description } : c));
      }
    } catch {}
    setLoadingDesc(false);
  }

  // Auto-generate sector
  async function generateSector() {
    if (!selected) return;
    setLoadingSector(true);
    try {
      const res = await fetch("/api/strategic/sector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: selected.id, name: selected.name, description: selected.description }),
      });
      const data = await res.json();
      if (data.sector) {
        setCompanies(ps => ps.map(c => c.id === selected.id ? { ...c, sectors: [data.sector] } : c));
      }
    } catch {}
    setLoadingSector(false);
  }

  // Auto-load intelligence
  async function loadIntelligence() {
    if (!selected) return;
    setLoadingIntel(true);
    try {
      const res = await fetch("/api/strategic/intel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: selected.id, name: selected.name, sectors: selected.sectors }),
      });
      const data = await res.json();
      if (data.items && data.items.length > 0) {
        const currentExt = getExt(selected.id);
        const existingIds = new Set(currentExt.intel.map((i: { id: string }) => i.id));
        const newItems = data.items.filter((item: { id: string }) => !existingIds.has(item.id));
        saveExt(selected.id, { intel: [...newItems, ...currentExt.intel], intelCachedAt: new Date().toISOString() });
      }
    } catch {}
    setLoadingIntel(false);
  }

  // ── Company News (Exa-powered) ───────────────────────────────────────────
  // Load starred from localStorage on mount
  useEffect(() => {
    try { const s = localStorage.getItem("strategic_news_starred"); if (s) setNewsStarred(JSON.parse(s)); } catch {}
  }, []);

  function toggleNewsStar(companyId: string, headline: string) {
    setNewsStarred(prev => {
      const current = prev[companyId] ?? [];
      const next = current.includes(headline) ? current.filter(h => h !== headline) : [...current, headline];
      const updated = { ...prev, [companyId]: next };
      try { localStorage.setItem("strategic_news_starred", JSON.stringify(updated)); } catch {}
      return updated;
    });
  }

  async function loadCompanyNews() {
    if (!selected) return;
    setNewsLoading(true);
    try {
      const res = await fetch(`/api/lp/${selected.id}/news`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const data = await res.json() as { items?: StrategicNewsItem[]; source?: "exa" | "claude" };
      if (data.items) {
        const id = selected.id;
        setNewsMap(prev => ({ ...prev, [id]: data.items! }));
        setNewsCachedAt(prev => ({ ...prev, [id]: new Date().toISOString() }));
        if (data.source) setNewsSource(prev => ({ ...prev, [id]: data.source! }));
      }
    } catch {}
    setNewsLoading(false);
  }

  // ── Partnership Intelligence ──────────────────────────────────────────────
  async function generatePartnerAlignment() {
    if (!selected) return;
    setPartnerAlignLoading(true);
    try {
      const res = await fetch(`/api/lp/${selected.id}/alignment`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ configName: "partnership_intelligence" }),
      });
      const data = await res.json();
      if (!data.error) { setPartnerAlign(data); setPartnerAlignGeneratedAt(new Date().toISOString()); }
    } catch {}
    setPartnerAlignLoading(false);
  }

  // ── Add Activity ──────────────────────────────────────────────────────────
  async function handleAddActivity() {
    if (!selected) return;
    setSavingActivity(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: newInt } = await supabase.from("interactions").insert({
      company_id:        selected.id, type: activityType, date: activityDate,
      subject:           { call: "Call", meeting: "Meeting", email: "Email" }[activityType],
      body:              activityNote.trim() || null, created_by: user?.id ?? null,
      contact_ids:       activityContactIds.length > 0 ? activityContactIds : null,
      resolution_status: activityType === "meeting" ? "resolved" : null,
    }).select().single();
    setSavingActivity(false);
    if (newInt) setInteractions(prev => [newInt as Interaction, ...prev]);
    // Update last_contact_date for tagged contacts
    if (activityContactIds.length > 0) {
      await supabase.from("contacts").update({ last_contact_date: new Date(activityDate).toISOString() }).in("id", activityContactIds);
      setContacts(prev => prev.map(c => activityContactIds.includes(c.id) ? { ...c, last_contact_date: new Date(activityDate).toISOString() } : c));
    }
    setAddingActivity(false); setActivityNote(""); setActivityDate(new Date().toISOString().slice(0, 10)); setActivityType("call"); setActivityContactIds([]);
  }

  // ── Link existing contact ─────────────────────────────────────────────────
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

  async function handleAddContact() {
    if (!selected || !newContactFirst.trim()) return;
    setAddingContact(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: newC, error } = await supabase.from("contacts").insert({
      first_name: newContactFirst.trim(), last_name: newContactLast.trim() || null,
      email: newContactEmail.trim() || null, title: newContactTitle.trim() || null,
      company_id: selected.id, type: "Other" as ContactType, status: "active" as const,
      is_primary_contact: contacts.length === 0, created_by: user?.id ?? null,
    }).select().single();
    setAddingContact(false);
    if (error) { alert(error.message); return; }
    if (newC) {
      setContacts(prev => [...prev, newC as Contact]);
      setShowAddContactForm(false);
      setNewContactFirst(""); setNewContactLast(""); setNewContactEmail(""); setNewContactTitle("");
    }
  }

  // ── Panel helpers ──────────────────────────────────────────────────────────

  function toggleRole(role: StrategicRole) {
    if (!selected) return;
    const current = selectedExt.roles;
    const next = current.includes(role) ? current.filter(r => r !== role) : [...current, role];
    saveExt(selected.id, { roles: next });
  }

  function setOwner(owner: string) {
    if (!selected) return;
    saveExt(selected.id, { owner });
  }

  function setScore(key: keyof StrategicExt["scores"], v: number) {
    if (!selected) return;
    saveExt(selected.id, { scores: { ...selectedExt.scores, [key]: v } });
  }

  function deleteOpportunity(id: string) {
    if (!selected) return;
    saveExt(selected.id, { opportunities: selectedExt.opportunities.filter(o => o.id !== id) });
  }

  function addOpportunity() {
    if (!selected || !oppCompany.trim()) return;
    const newOpp = { id: genId(), company: oppCompany.trim(), companyId: oppCompanyId, type: oppType, urgency: oppUrgency, description: oppDesc.trim(), due: oppDue };
    const newTask = { id: genId(), text: `${oppType}: ${oppCompany.trim()}`, done: false, due: oppDue };
    saveExt(selected.id, {
      opportunities: [...selectedExt.opportunities, newOpp],
      tasks: [...selectedExt.tasks, newTask],
    });
    if (oppCompanyId) {
      upsertPortcoStrategicMap(oppCompany.trim(), oppCompanyId, selected.id, selected.name, oppType, oppDue);
    }
    // Bridge: create task in tasks page via localStorage (writes to both keys so /tasks picks it up on mount)
    if (oppTitle.trim()) {
      try {
        const taskId = Date.now();
        const linkedCos = selected
          ? (oppCompany.trim() ? [selected.name, oppCompany.trim()] : [selected.name])
          : [];
        const newTask = {
          id: taskId,
          title: oppTitle.trim(),
          cat: oppType,
          init: "ecosystem",
          prio: oppUrgency === "high" ? "High" : oppUrgency === "medium" ? "Medium" : "Low",
          status: "Not started",
          prog: 0,
          owner: "Andrew",
          cos: linkedCos,
          start: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
          due: oppDue ? new Date(oppDue).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "",
          daysLeft: 0,
          notes: oppDesc.trim(),
          risks: [],
          deps: [],
          comments: [],
        };
        // Write to strategic_tasks_map
        const rawMap = localStorage.getItem("strategic_tasks_map") ?? "{}";
        const map = JSON.parse(rawMap) as Record<string, unknown>;
        map[String(taskId)] = newTask;
        localStorage.setItem("strategic_tasks_map", JSON.stringify(map));
        // ALSO write directly to crm_tasks so pipeline/funds see it immediately
        const rawCrm = localStorage.getItem("crm_tasks");
        const crmTasks = rawCrm ? JSON.parse(rawCrm) as unknown[] : [];
        crmTasks.push(newTask);
        localStorage.setItem("crm_tasks", JSON.stringify(crmTasks));
      } catch {}
    }
    setOppTitle("");
    setOppCompany(""); setOppCompanyId(""); setOppSearch(""); setOppType("Ecosystem"); setOppUrgency("medium"); setOppDesc(""); setOppDue("");
    setShowOppForm(false);
  }

  function addIntel() {
    if (!selected || !intelHeadline.trim()) return;
    const newIntel = { id: genId(), headline: intelHeadline.trim(), source: intelSource.trim(), url: "", date: intelDate, is_signal: intelSignal, summary: "" };
    saveExt(selected.id, { intel: [newIntel, ...selectedExt.intel] });
    setIntelHeadline(""); setIntelSource(""); setIntelDate(new Date().toISOString().slice(0, 10)); setIntelSignal(false);
    setShowIntelForm(false);
  }

  function addTask() {
    if (!selected || !taskText.trim()) return;
    const newTask = { id: genId(), text: taskText.trim(), done: false, due: taskDue };
    saveExt(selected.id, { tasks: [...selectedExt.tasks, newTask] });
    setTaskText(""); setTaskDue(""); setShowTaskForm(false);
  }

  function toggleTask(taskId: string) {
    if (!selected) return;
    const tasks = selectedExt.tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t);
    saveExt(selected.id, { tasks });
  }

  // 90-day stats from interactions
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const emails90d   = interactions.filter(i => i.type === "email" && i.date >= ninetyDaysAgo).length;
  const meetings90d = interactions.filter(i => (i.type === "meeting" || i.type === "call") && i.date >= ninetyDaysAgo).length;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-slate-50">

      {/* ── Metrics bar — hidden on mobile ───────────────────────────────────── */}
      <div className="hidden md:flex gap-3 px-5 py-4 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0 h-24">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-500"><Building2 size={14} className="text-white" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">Total Strategics</p>
            <p className="text-lg font-bold text-slate-900 leading-tight">{metrics.total}</p>
            <p className="text-xs text-slate-400">in network</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0 h-24">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-emerald-500"><Users size={14} className="text-white" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">Active Relationships</p>
            <p className="text-lg font-bold text-slate-900 leading-tight">{metrics.active}</p>
            <p className="text-xs text-slate-400">contacted &lt;90d</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0 h-24">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-amber-500"><TrendingUp size={14} className="text-white" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">Co-invest Signals</p>
            <p className="text-lg font-bold text-slate-900 leading-tight">{metrics.coinvest}</p>
            <p className="text-xs text-slate-400">co-invest flagged</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0 h-24">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-blue-500"><Target size={14} className="text-white" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">Open Pilot Opps</p>
            <p className="text-lg font-bold text-slate-900 leading-tight">{metrics.pilot}</p>
            <p className="text-xs text-slate-400">pilot / customer</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0 h-24">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-violet-500"><Shield size={14} className="text-white" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">Diligence Experts</p>
            <p className="text-lg font-bold text-slate-900 leading-tight">{metrics.diligence}</p>
            <p className="text-xs text-slate-400">expert advisors</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0 h-24">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-red-400"><AlertCircle size={14} className="text-white" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">Cooling Off</p>
            <p className="text-lg font-bold text-slate-900 leading-tight">{metrics.cooling}</p>
            <p className="text-xs text-slate-400">no contact &gt;180d</p>
          </div>
        </div>
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-2.5 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search partners…"
            className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white w-56 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
        </div>
        <div className="hidden md:flex gap-1">
          {FILTER_PILLS.map(p => (
            <button key={p.id} onClick={() => setActiveFilter(p.id)}
              className={cn("px-3 py-1 text-xs font-medium rounded-full border transition-colors",
                activeFilter === p.id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300")}>
              {p.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} partner{filtered.length !== 1 ? "s" : ""}</span>
        <button onClick={() => setShowAddPartner(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors">
          <Plus size={13} /> Add Partner
        </button>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* Mobile card list — Company name + Strategic Type only */}
        <div className="md:hidden flex-1 overflow-auto">
          {filtered.map(co => {
            const stratType = strategicTypeMap[co.id] !== undefined
              ? strategicTypeMap[co.id]
              : (co as unknown as Record<string, string>).strategic_type ?? "";
            const style = STRATEGIC_TYPE_STYLES[stratType] ?? { background: "#f8fafc", color: "#64748b" };
            return (
              <div key={co.id} onClick={() => selectCompany(co.id)}
                className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-white cursor-pointer hover:bg-slate-50 active:bg-slate-100">
                <div className="flex items-center gap-2.5 min-w-0 mr-3">
                  <CompanyAvatar name={co.name} website={co.website} size="sm" />
                  <span className="text-sm font-medium text-slate-800 truncate">{co.name}</span>
                </div>
                {stratType
                  ? <span className="text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0" style={style}>{stratType}</span>
                  : <span className="text-slate-300 text-xs flex-shrink-0">—</span>}
              </div>
            );
          })}
          {filtered.length === 0 && <p className="px-4 py-12 text-center text-sm text-slate-400">No strategic partners found</p>}
        </div>

        {/* Table */}
        <div className={cn("hidden md:block md:flex-1 md:overflow-auto", selectedId ? "md:mr-[480px]" : "")}>
          <table className="w-full text-sm border-collapse" style={{ tableLayout: "fixed" }}>
            <colgroup>
              {Object.keys(DEFAULT_COL_WIDTHS).map(col => <col key={col} style={{ width: colWidths[col] }} />)}
              <col style={{ width: 40 }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-100">
              <tr>
                {Object.keys(DEFAULT_COL_WIDTHS).map(col => (
                  <th key={col} className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 border-b border-slate-200 whitespace-nowrap relative select-none" style={{ width: colWidths[col] ?? 120, minWidth: 60 }}>
                    {col}
                    <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize group flex items-center justify-center" onMouseDown={startResize(col, colWidths[col] ?? 120)}>
                      <div className="w-px h-4 bg-slate-300 group-hover:bg-teal-400 transition-colors" />
                    </div>
                  </th>
                ))}
                <th className="border-b border-slate-200 w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(co => {
                const ext  = getExt(co.id);
                const h    = ext.health ?? computeHealth(co.last_contact_date ?? null);
                const sig  = ext.signal ?? healthToSignal(h);
                const sigDot = sig === "hot" ? "bg-emerald-500" : sig === "warm" ? "bg-amber-400" : "bg-slate-300";
                const lastTouch = lastTouchMap[co.id]?.date ?? co.last_contact_date;
                const isSelected = co.id === selectedId;
                const utilityVal = computedUtility(ext);
                return (
                  <tr key={co.id} onClick={() => selectCompany(co.id)}
                    className={cn("group border-b border-slate-100 cursor-pointer transition-colors hover:bg-blue-50",
                      isSelected ? "bg-blue-50 border-l-2 border-l-blue-500" : "")}>
                    {/* Company */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <CompanyAvatar name={co.name} website={co.website} size="sm" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 truncate max-w-[150px]">{co.name}</p>
                          {co.description && <p className="text-[10px] text-slate-400 truncate max-w-[150px]">{co.description}</p>}
                        </div>
                      </div>
                    </td>
                    {/* Strategic Type */}
                    <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                      <InlinePickerCell
                        value={(strategicTypeMap[co.id] !== undefined ? strategicTypeMap[co.id] : (co as unknown as Record<string, string>).strategic_type) ?? ""}
                        options={["Corporate","Foundation","Government","Other"]}
                        styles={STRATEGIC_TYPE_STYLES}
                        onPick={async (val) => {
                          setStrategicTypeMap(prev => ({ ...prev, [co.id]: val }));
                          const sb = createClient();
                          await sb.from("companies").update({ strategic_type: val || null }).eq("id", co.id);
                        }}
                      />
                    </td>
                    {/* Sector */}
                    <td className="px-3 py-2.5">
                      <span className="text-xs text-slate-600">{co.sectors?.[0] ?? "—"}</span>
                    </td>
                    {/* Rel. Health */}
                    <td className="px-3 py-2.5 min-w-[120px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={cn("h-full rounded-full", healthColor(h))} style={{ width: `${h}%` }} />
                        </div>
                        <span className={cn("text-xs font-semibold tabular-nums w-7 text-right", healthTextColor(h))}>{Math.round(h)}</span>
                      </div>
                    </td>
                    {/* Utility */}
                    <td className="px-3 py-2.5">
                      <UtilityBars value={utilityVal} h={h} />
                    </td>
                    {/* Roles */}
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {ext.roles.length > 0 ? ext.roles.map(r => (
                          <span key={r} className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", OPP_TYPE_COLORS[r] ?? "bg-slate-100 text-slate-600")}>{r}</span>
                        )) : <span className="text-[10px] text-slate-300">—</span>}
                      </div>
                    </td>
                    {/* Co-invest */}
                    <td className="px-3 py-2.5 text-center">
                      {ext.roles.includes("Co-invest")
                        ? <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">Yes</span>
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    {/* Diligence */}
                    <td className="px-3 py-2.5 text-center">
                      {ext.roles.includes("Diligence")
                        ? <span className="text-[10px] font-medium text-violet-600 bg-violet-50 px-1.5 py-0.5 rounded-full">Available</span>
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    {/* Pilot/Customer */}
                    <td className="px-3 py-2.5 text-center">
                      {(ext.roles.includes("Pilot") || ext.roles.includes("Customer"))
                        ? <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">Open</span>
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                    {/* Last Contact */}
                    <td className="px-3 py-2.5">
                      <span className="text-xs text-slate-500">{lastTouch ? timeAgo(lastTouch) : "—"}</span>
                    </td>
                    {/* City */}
                    <td className="px-3 py-2.5">
                      <span className="text-xs text-slate-500">{co.location_city ?? "—"}</span>
                    </td>
                    {/* Country */}
                    <td className="px-3 py-2.5">
                      <span className="text-xs text-slate-500">{co.location_country ?? "—"}</span>
                    </td>
                    {/* Signal */}
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <div className={cn("w-2 h-2 rounded-full", sigDot)} />
                        <span className="text-[10px] text-slate-500 capitalize">{sig}</span>
                      </div>
                    </td>
                    {/* Owner */}
                    <td className="px-3 py-2.5">
                      <span className="text-xs text-slate-600">{ext.owner || "—"}</span>
                    </td>
                    {/* Remove */}
                    <td className="px-2 py-2.5 text-right" onClick={e => e.stopPropagation()}>
                      {confirmRemoveCompanyId === co.id ? (
                        <span className="flex items-center gap-1 justify-end">
                          <button onMouseDown={() => { setCompanies(ps => ps.filter(c => c.id !== co.id)); if (selectedId === co.id) setSelectedId(null); setConfirmRemoveCompanyId(null); }} className="text-[10px] text-red-600 font-medium hover:underline">Yes</button>
                          <button onMouseDown={() => setConfirmRemoveCompanyId(null)} className="text-[10px] text-slate-400 hover:underline">No</button>
                        </span>
                      ) : (
                        <button onClick={() => setConfirmRemoveCompanyId(co.id)}
                          className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded border border-slate-200 hover:border-red-400 hover:bg-red-50 transition-all">
                          <X size={10} className="text-slate-400 hover:text-red-500" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={14} className="py-16">
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <Handshake size={28} className="text-gray-300 mb-3" />
                      <p className="text-sm font-medium text-gray-500">No strategic partners found</p>
                      <p className="text-xs text-gray-400 mt-1">Try adjusting your filters</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── Detail panel ─────────────────────────────────────────────────── */}
        <div className={cn("fixed right-0 top-0 h-full bg-white border-l border-slate-200 shadow-2xl z-40 flex flex-col transition-transform duration-300", selectedId ? "translate-x-0" : "translate-x-full")} style={{ width: "min(480px, 100vw)" }}>
        {selected && (<>
            {/* Panel header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <CompanyAvatar name={selected.name} website={selected.website} size="lg" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-bold text-slate-900 truncate">{selected.name}</h2>
                  {selected.sectors?.[0] && (
                    <span className="inline-block text-xs px-2 py-0.5 rounded-full font-medium bg-violet-100 text-violet-700 mt-0.5">{selected.sectors[0]}</span>
                  )}
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {(selected.location_city || selected.location_country) && (
                      <span className="flex items-center gap-1 text-xs text-slate-400">
                        <MapPin size={9} />{[selected.location_city, selected.location_country].filter(Boolean).join(", ")}
                      </span>
                    )}
                    {selected.website && (
                      <a href={selected.website} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-500 hover:underline">
                        <ExternalLink size={9} />Website
                      </a>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={e => {
                    const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                    setChangeTypePos(changeTypePos ? null : { top: r.bottom + 4, right: window.innerWidth - r.right });
                  }}
                  className="text-[10px] text-slate-400 hover:text-blue-600 transition-colors px-1.5 py-0.5 rounded hover:bg-blue-50 border border-transparent hover:border-blue-100 whitespace-nowrap"
                  title="Change company type"
                >Change Type</button>
                <button onClick={() => { setSelectedId(null); setChangeTypePos(null); }} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400">
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 flex-shrink-0">
              {([
                { key: "overview",      label: "Overview" },
                { key: "opportunities", label: "Opportunity/Task" },
                { key: "company_news",  label: "Company News" },
                { key: "intelligence",  label: "Intelligence" },
              ] as const).map(({ key, label }) => (
                <button key={key} onClick={() => setPanelTab(key)}
                  className={cn("flex-1 text-xs font-medium py-2 transition-colors",
                    panelTab === key ? "text-blue-600 border-b-2 border-blue-600" : "text-slate-500 hover:text-slate-700")}>
                  {label}
                </button>
              ))}
            </div>

            {/* Panel body */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

              {/* ── OVERVIEW TAB ──────────────────────────────────────────── */}
              {panelTab === "overview" && (() => {
                const h   = selectedExt.health ?? computeHealth(selected.last_contact_date ?? null);
                const sig = selectedExt.signal ?? healthToSignal(h);
                const utilityVal = computedUtility(selectedExt);
                return (
                  <div className="space-y-4">
                    {/* Signal alert */}
                    {sig === "hot" && (
                      <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
                        <p className="text-xs font-semibold text-emerald-700">Hot signal — Engage now</p>
                        {selectedExt.signal_note && <p className="text-xs text-emerald-600 mt-0.5">{selectedExt.signal_note}</p>}
                      </div>
                    )}
                    {sig === "warm" && (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                        <p className="text-xs font-semibold text-amber-700">Warm — Follow up recommended</p>
                        {selectedExt.signal_note && <p className="text-xs text-amber-600 mt-0.5">{selectedExt.signal_note}</p>}
                      </div>
                    )}

                    {/* Profile */}
                    <div>
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Profile</h3>
                      <div className="space-y-2">

                        {/* Sector row */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 w-24 flex-shrink-0">Sector</span>
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            {editingField === "sector" ? (
                              <input autoFocus
                                value={selected.sectors?.[0] ?? ""}
                                onChange={e => { const v = e.target.value; setCompanies(ps => ps.map(c => c.id === selected.id ? { ...c, sectors: v ? [v] : [] } : c)); }}
                                onBlur={async e => { await saveCompanyField(selected.id, { sectors: e.target.value.trim() ? [e.target.value.trim()] : [] }); setEditingField(null); }}
                                onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
                                className="flex-1 text-xs text-slate-700 border-b border-blue-400 focus:outline-none bg-transparent py-0.5"
                              />
                            ) : (
                              <span onDoubleClick={() => setEditingField("sector")}
                                className="flex-1 text-xs text-slate-700 py-0.5 cursor-default select-none">
                                {selected.sectors?.[0] || <span className="text-slate-300 italic text-[10px]">Double-click to edit</span>}
                              </span>
                            )}
                            <button onClick={generateSector} disabled={loadingSector}
                              className="text-[10px] text-violet-500 hover:text-violet-700 flex-shrink-0" title="Auto-generate sector">
                              {loadingSector ? <Loader2 size={10} className="animate-spin" /> : "✨"}
                            </button>
                          </div>
                        </div>

                        {/* Location row — City + Country side by side */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 w-24 flex-shrink-0">Location</span>
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            {editingField === "city" ? (
                              <input autoFocus
                                value={selected.location_city ?? ""}
                                onChange={e => { const v = e.target.value; setCompanies(ps => ps.map(c => c.id === selected.id ? { ...c, location_city: v } : c)); }}
                                onBlur={async e => { await saveCompanyField(selected.id, { location_city: e.target.value.trim() || null }); setEditingField(null); }}
                                onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
                                placeholder="City"
                                className="flex-1 text-xs text-slate-700 border-b border-blue-400 focus:outline-none bg-transparent py-0.5"
                              />
                            ) : (
                              <span onDoubleClick={() => setEditingField("city")}
                                className="flex-1 text-xs text-slate-700 py-0.5 cursor-default select-none">
                                {selected.location_city || <span className="text-slate-300 italic text-[10px]">City</span>}
                              </span>
                            )}
                            <span className="text-slate-300 text-xs flex-shrink-0">/</span>
                            {editingField === "country" ? (
                              <input autoFocus
                                value={selected.location_country ?? ""}
                                onChange={e => { const v = e.target.value; setCompanies(ps => ps.map(c => c.id === selected.id ? { ...c, location_country: v } : c)); }}
                                onBlur={async e => { await saveCompanyField(selected.id, { location_country: e.target.value.trim() || null }); setEditingField(null); }}
                                onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
                                placeholder="Country"
                                className="flex-1 text-xs text-slate-700 border-b border-blue-400 focus:outline-none bg-transparent py-0.5"
                              />
                            ) : (
                              <span onDoubleClick={() => setEditingField("country")}
                                className="flex-1 text-xs text-slate-700 py-0.5 cursor-default select-none">
                                {selected.location_country || <span className="text-slate-300 italic text-[10px]">Country</span>}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Website row */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 w-24 flex-shrink-0">Website</span>
                          <div className="flex-1 min-w-0">
                            {editingField === "website" ? (
                              <input autoFocus
                                value={selected.website ?? ""}
                                onChange={e => { const v = e.target.value; setCompanies(ps => ps.map(c => c.id === selected.id ? { ...c, website: v } : c)); }}
                                onBlur={async e => { await saveCompanyField(selected.id, { website: e.target.value.trim() || null }); setEditingField(null); }}
                                onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
                                placeholder="https://…"
                                className="w-full text-xs text-slate-700 border-b border-blue-400 focus:outline-none bg-transparent py-0.5"
                              />
                            ) : (
                              <span onDoubleClick={() => setEditingField("website")}
                                className="text-xs text-slate-700 py-0.5 cursor-default select-none truncate block">
                                {selected.website || <span className="text-slate-300 italic text-[10px]">Double-click to edit</span>}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Last Contact row */}
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-slate-400 w-24 flex-shrink-0">Last Contact</span>
                          <span className="text-xs text-slate-700">{formatDate(selected.last_contact_date)}</span>
                        </div>

                        {/* Description row */}
                        <div className="flex items-start gap-2">
                          <div className="w-24 flex-shrink-0 flex items-center gap-1">
                            <span className="text-xs text-slate-400">Description</span>
                            <button onClick={generateDescription} disabled={loadingDesc}
                              className="text-[10px] text-violet-500 hover:text-violet-700 flex-shrink-0" title="Auto-generate description">
                              {loadingDesc ? <Loader2 size={10} className="animate-spin" /> : "✨"}
                            </button>
                          </div>
                          <div className="flex-1 min-w-0">
                            {editingField === "description" ? (
                              <textarea autoFocus rows={3}
                                value={selected.description ?? ""}
                                onChange={e => { const v = e.target.value; setCompanies(ps => ps.map(c => c.id === selected.id ? { ...c, description: v } : c)); }}
                                onBlur={async e => { await saveCompanyField(selected.id, { description: e.target.value.trim() || null }); setEditingField(null); }}
                                className="w-full text-xs text-slate-700 border border-blue-400 rounded px-1.5 py-1 focus:outline-none resize-none bg-white"
                              />
                            ) : (
                              <p onDoubleClick={() => setEditingField("description")}
                                className="text-xs text-slate-700 leading-relaxed cursor-default select-none">
                                {selected.description || <span className="text-slate-400 italic">No description yet — click ✨ to generate</span>}
                              </p>
                            )}
                          </div>
                        </div>

                      </div>
                    </div>

                    {/* Roles */}
                    <div>
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Roles</h3>
                      <div className="grid grid-cols-2 gap-1.5">
                        {ROLES.map(role => (
                          <button key={role} onClick={() => toggleRole(role)}
                            className={cn("flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors",
                              selectedExt.roles.includes(role)
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-white text-slate-600 border-slate-200 hover:border-blue-300")}>
                            {selectedExt.roles.includes(role) ? <Check size={11} /> : <div className="w-3 h-3 rounded border border-slate-300" />}
                            {role}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Owner */}
                    <div>
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Owner</h3>
                      <div className="flex gap-2">
                        {OWNERS.map(o => (
                          <button key={o} onClick={() => setOwner(o)}
                            className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                              selectedExt.owner === o ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300")}>
                            {o}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Relationship scores */}
                    <div>
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Relationship Scores</h3>
                      <div className="space-y-2.5">
                        <ScoreBar label="Strategic Focus Alignment" value={selectedExt.scores.strategic_focus} onChange={v => setScore("strategic_focus", v)} />
                        <ScoreBar label="Relationship Strength" value={selectedExt.scores.relationship} onChange={v => setScore("relationship", v)} />
                        <ScoreBar label="Portco Synergy"       value={selectedExt.scores.portco}       onChange={v => setScore("portco", v)} />
                        <ScoreBar label="Responsiveness"       value={selectedExt.scores.responsiveness} onChange={v => setScore("responsiveness", v)} />
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1.5">Utility (avg): {computedUtility(selectedExt)}%</p>
                    </div>

                    {/* Contacts section */}
                    <div className="pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Contacts</h3>
                      </div>
                      <div className="space-y-2 pr-1">
                        {loadingDetail ? (
                          <>{[1, 2].map(i => <div key={i} className="h-14 bg-slate-50 rounded-lg animate-pulse" />)}</>
                        ) : (
                          <>
                            {/* Contact list — always draggable + deletable */}
                            <div className="max-h-[200px] overflow-y-auto space-y-2">
                              {contacts.length === 0 && !showAddContactForm && !showLinkContactForm && (
                                <p className="text-xs text-slate-400 italic">No contacts linked yet.</p>
                              )}
                              {(contactOrder.length > 0 ? [...contacts].sort((a, b) => contactOrder.indexOf(a.id) - contactOrder.indexOf(b.id)) : contacts).map((c, idx, arr) => (
                                <div key={c.id}
                                  draggable
                                  onDragStart={() => { strContactDragIdx.current = idx; }}
                                  onDragOver={e => e.preventDefault()}
                                  onDrop={() => {
                                    if (strContactDragIdx.current === null || strContactDragIdx.current === idx) return;
                                    const order = arr.map(x => x.id);
                                    const [moved] = order.splice(strContactDragIdx.current, 1);
                                    order.splice(idx, 0, moved);
                                    setContactOrder(order);
                                    strContactDragIdx.current = null;
                                  }}
                                  className="flex items-start gap-2 p-2.5 border border-slate-100 rounded-xl cursor-grab hover:border-slate-200 bg-slate-50 hover:bg-white transition-colors">
                                  <div className={`w-7 h-7 rounded-full bg-gradient-to-br ${hashColor(c.first_name + (c.last_name ?? ""))} flex items-center justify-center flex-shrink-0`}>
                                    <span className="text-white text-[9px] font-bold">{getInitials(`${c.first_name} ${c.last_name ?? ""}`)}</span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-slate-800 truncate">{c.first_name} {c.last_name}</p>
                                    {c.title && <p className="text-[10px] text-slate-400 truncate">{c.title}</p>}
                                    {c.email && <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-[10px] text-blue-500 hover:underline truncate"><Mail size={9} />{c.email}</a>}
                                  </div>
                                  <button onClick={async () => { if (!confirm(`Remove ${c.first_name}?`)) return; await supabase.from("contacts").delete().eq("id", c.id); setContacts(prev => prev.filter(x => x.id !== c.id)); }}
                                    className="w-5 h-5 flex items-center justify-center rounded border border-slate-200 text-slate-300 hover:border-red-200 hover:text-red-400 flex-shrink-0 mt-0.5"><X size={10} /></button>
                                </div>
                              ))}
                            </div>

                            {/* Add / Link forms */}
                            {showAddContactForm ? (
                              <div className="border border-blue-200 rounded-xl bg-blue-50 p-2.5 space-y-2">
                                <p className="text-xs font-semibold text-slate-700">New Contact</p>
                                <div className="grid grid-cols-2 gap-1.5">
                                  <input className="text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="First name *" value={newContactFirst} onChange={e => setNewContactFirst(e.target.value)} />
                                  <input className="text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="Last name" value={newContactLast} onChange={e => setNewContactLast(e.target.value)} />
                                </div>
                                <input className="w-full text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" type="email" placeholder="Email" value={newContactEmail} onChange={e => setNewContactEmail(e.target.value)} />
                                <input className="w-full text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400" placeholder="Title" value={newContactTitle} onChange={e => setNewContactTitle(e.target.value)} />
                                <div className="flex gap-1.5">
                                  <button onClick={() => { setShowAddContactForm(false); setNewContactFirst(""); setNewContactLast(""); setNewContactEmail(""); setNewContactTitle(""); }} className="flex-1 py-1 border border-slate-200 rounded text-xs text-slate-600 hover:bg-white">Cancel</button>
                                  <button disabled={addingContact || !newContactFirst.trim()} onClick={handleAddContact}
                                    className="flex-1 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium rounded flex items-center justify-center gap-1">
                                    {addingContact ? <><Loader2 size={10} className="animate-spin" />Adding…</> : <><Check size={10} />Add</>}
                                  </button>
                                </div>
                              </div>
                            ) : showLinkContactForm ? (
                              <div className="border border-indigo-200 rounded-xl bg-indigo-50 p-2.5 space-y-2">
                                <div className="flex items-center justify-between">
                                  <p className="text-xs font-semibold text-slate-700">Link Existing</p>
                                  <button onClick={() => { setShowLinkContactForm(false); setLinkContactSearch(""); setLinkContactSuggestions([]); }}><X size={11} className="text-slate-400" /></button>
                                </div>
                                <input className="w-full text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                                  placeholder="Search by name or email…" value={linkContactSearch}
                                  onChange={e => searchLinkContacts(e.target.value)} autoFocus />
                                {linkContactSuggestions.length > 0 && (
                                  <div className="max-h-[120px] overflow-y-auto border border-slate-200 rounded bg-white divide-y divide-slate-100">
                                    {linkContactSuggestions.map(c => (
                                      <button key={c.id} disabled={linkingContact} onClick={() => linkContactToCompany(c.id)}
                                        className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-indigo-50 disabled:opacity-50">
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs font-medium text-slate-800 truncate">{c.first_name} {c.last_name}</p>
                                          {c.email && <p className="text-[10px] text-slate-400 truncate">{c.email}</p>}
                                        </div>
                                        {c.company_id && c.company_id !== selected?.id && <span className="text-[10px] text-amber-600 bg-amber-50 px-1 rounded flex-shrink-0">Linked</span>}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {linkContactSearch.length >= 2 && linkContactSuggestions.length === 0 && <p className="text-[10px] text-slate-400 italic">No contacts found</p>}
                              </div>
                            ) : (
                              /* Always-visible action buttons */
                              <div className="flex gap-1.5 pt-1">
                                <button onClick={() => { setShowAddContactForm(true); setShowLinkContactForm(false); }} className="flex-1 flex items-center justify-center gap-1 py-1.5 border-2 border-dashed border-slate-200 rounded-xl text-xs text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors"><Plus size={11} /> Add new</button>
                                <button onClick={() => { setShowLinkContactForm(true); setShowAddContactForm(false); }} className="flex-1 flex items-center justify-center gap-1 py-1.5 border-2 border-dashed border-indigo-200 rounded-xl text-xs text-indigo-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"><Link2 size={11} /> Link existing</button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Activity Timeline */}
                    <div className="pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Activity Timeline</h3>
                        <button
                          onClick={() => setAddingActivity(v => !v)}
                          className="text-xs px-2.5 py-1 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 flex items-center gap-1"
                        >
                          <Plus size={11} /> Add Activity
                        </button>
                      </div>

                      {/* Add Activity form */}
                      {addingActivity && (
                        <div ref={activityFormRef} className="mb-3 p-3 border border-blue-200 rounded-xl bg-blue-50 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Date</label>
                              <input type="date" className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" value={activityDate} onChange={e => setActivityDate(e.target.value)} />
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Type</label>
                              <select className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" value={activityType} onChange={e => setActivityType(e.target.value as "call" | "meeting" | "email")}>
                                <option value="call">Call</option>
                                <option value="meeting">Meeting</option>
                                <option value="email">Email</option>
                              </select>
                            </div>
                          </div>
                          <textarea className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" rows={2} placeholder="Notes (optional)…" value={activityNote} onChange={e => setActivityNote(e.target.value)} />
                          {/* Tag Contacts */}
                          <div>
                            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Tag Contacts</p>
                            {contacts.length === 0 ? (
                              <p className="text-[10px] text-slate-300 italic">No contacts linked yet</p>
                            ) : (
                              <div className="max-h-[80px] overflow-y-auto border border-slate-200 rounded bg-white p-1.5 space-y-1">
                                {contacts.map(c => (
                                  <label key={c.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 px-1 py-0.5 rounded">
                                    <input type="checkbox" checked={activityContactIds.includes(c.id)}
                                      onChange={e => setActivityContactIds(prev => e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id))}
                                      className="w-3 h-3 accent-blue-600" />
                                    <span className="text-xs text-slate-700">{c.first_name} {c.last_name}</span>
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => { setAddingActivity(false); setActivityNote(""); setActivityContactIds([]); }} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-white">Cancel</button>
                            <button onClick={handleAddActivity} disabled={savingActivity} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 flex items-center gap-1">
                              {savingActivity ? <><Loader2 size={10} className="animate-spin" />Saving…</> : <><Check size={10} />Save</>}
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="h-[300px] overflow-y-auto space-y-3 pr-1">
                        {/* 3 metric tiles */}
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                            <Mail size={14} className="text-blue-500 mx-auto mb-1" />
                            <p className="text-lg font-bold text-blue-700">{emails90d}</p>
                            <p className="text-[10px] text-blue-500 font-medium">Emails</p>
                            <p className="text-[10px] text-slate-400">past 90 days</p>
                          </div>
                          <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 text-center">
                            <Video size={14} className="text-violet-500 mx-auto mb-1" />
                            <p className="text-lg font-bold text-violet-700">{meetings90d}</p>
                            <p className="text-[10px] text-violet-500 font-medium">Meetings</p>
                            <p className="text-[10px] text-slate-400">past 90 days</p>
                          </div>
                          <div
                            className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-center cursor-pointer hover:bg-emerald-100 transition-colors"
                            onClick={() => { setPanelTab("company_news"); if (!(newsMap[selected?.id ?? ""]?.length)) loadCompanyNews(); }}
                          >
                            <FileText size={14} className="text-emerald-500 mx-auto mb-1" />
                            <p className="text-lg font-bold text-emerald-700">{(newsMap[selected?.id ?? ""] ?? []).length > 0 ? (newsMap[selected?.id ?? ""] ?? []).length : "—"}</p>
                            <p className="text-[10px] text-emerald-600 font-medium">Company News</p>
                            <p className="text-[10px] text-slate-400">click to view</p>
                          </div>
                        </div>

                        {/* Timeline list */}
                        {loadingDetail ? (
                          [1, 2, 3].map(i => <div key={i} className="h-10 bg-slate-50 rounded-lg animate-pulse" />)
                        ) : interactions.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">No interactions recorded</p>
                        ) : (
                          <div className="relative pl-4">
                            <div className="absolute left-1.5 top-0 bottom-0 w-px bg-slate-100" />
                            <div className="space-y-3">
                              {interactions.slice(0, 12).map(int => (
                                <div key={int.id} className="relative flex gap-2.5">
                                  <div className="absolute -left-4 mt-0.5 w-3 h-3 rounded-full bg-white border-2 border-slate-200" />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-start gap-1.5">
                                      <InteractionIcon type={int.type} />
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-1">
                                          <p className="text-xs font-medium text-slate-700 leading-tight truncate">{int.subject ?? int.type.charAt(0).toUpperCase() + int.type.slice(1)}</p>
                                          <button
                                            onClick={async () => { if (!confirm("Delete this interaction?")) return; await supabase.from("interactions").delete().eq("id", int.id); setInteractions(prev => prev.filter(i => i.id !== int.id)); }}
                                            className="text-slate-300 hover:text-red-400 flex-shrink-0 ml-1"
                                            title="Delete"
                                          ><X size={10} /></button>
                                        </div>
                                        {int.body && <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{int.body}</p>}
                                        {(int as { contact_ids?: string[] }).contact_ids && (int as { contact_ids?: string[] }).contact_ids!.length > 0 && (
                                          <div className="flex flex-wrap gap-1 mt-1">
                                            {(int as { contact_ids?: string[] }).contact_ids!.map((cid: string) => {
                                              const tc = contacts.find(c => c.id === cid);
                                              if (!tc) return null;
                                              return <span key={cid} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium"><User size={8} />{tc.first_name} {tc.last_name}</span>;
                                            })}
                                          </div>
                                        )}
                                        <p className="text-[10px] text-slate-400 mt-0.5">{formatDate(int.date)}</p>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Meeting Transcripts */}
                    <div className="border-t border-slate-100 pt-3">
                      <MeetingTranscripts companyId={selected?.id} />
                    </div>
                  </div>
                );
              })()}

              {/* ── OPPORTUNITIES TAB ────────────────────────────────────── */}
              {panelTab === "opportunities" && (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Opportunities</h3>
                      <button onClick={() => setShowOppForm(v => !v)} className="text-blue-600 hover:text-blue-700">
                        <Plus size={14} />
                      </button>
                    </div>

                    {showOppForm && (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3 space-y-2">
                        {/* Opportunity / Task title */}
                        <input value={oppTitle} onChange={e => setOppTitle(e.target.value)} placeholder="Opportunity / task title"
                          className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400" />
                        {/* Key Opportunity | Priority */}
                        <div className="flex gap-2">
                          <select value={oppType} onChange={e => setOppType(e.target.value as OppType)}
                            className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400 bg-white">
                            {(["Commercialization", "Co-investment", "Due diligence", "Ecosystem", "Fundraising", "Introduction", "Investment", "Pilot", "Portfolio Management"] as OppType[]).map(t => <option key={t}>{t}</option>)}
                          </select>
                          <select value={oppUrgency} onChange={e => setOppUrgency(e.target.value as OppUrgency)}
                            className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400 bg-white">
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                          </select>
                        </div>
                        {/* Company — searchable or free text */}
                        <div className="relative">
                          <input value={oppSearch}
                            onChange={e => { setOppSearch(e.target.value); setOppCompany(e.target.value); setOppCompanyId(""); setShowOppDropdown(true); }}
                            onFocus={() => setShowOppDropdown(true)}
                            onBlur={() => setTimeout(() => setShowOppDropdown(false), 150)}
                            placeholder="Company / opportunity name"
                            className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400" />
                          {showOppDropdown && (
                            <div className="absolute z-20 top-full left-0 right-0 bg-white border border-slate-200 rounded shadow-lg max-h-36 overflow-y-auto mt-0.5">
                              {pipelineCompanies.filter(c => !oppSearch || c.name.toLowerCase().includes(oppSearch.toLowerCase())).slice(0, 10).map(c => (
                                <button key={c.id} onMouseDown={() => { setOppCompany(c.name); setOppSearch(c.name); setOppCompanyId(c.id); setShowOppDropdown(false); }}
                                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 text-slate-700 font-medium">
                                  {c.name}
                                </button>
                              ))}
                              {oppSearch && pipelineCompanies.filter(c => c.name.toLowerCase().includes(oppSearch.toLowerCase())).length === 0 && (
                                <p className="px-3 py-2 text-xs text-slate-400 italic">No match — will be added as-is</p>
                              )}
                            </div>
                          )}
                        </div>
                        <textarea value={oppDesc} onChange={e => setOppDesc(e.target.value)} placeholder="Description (optional)"
                          rows={2} className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400 resize-none" />
                        <div className="flex items-center gap-2">
                          <label className="text-[10px] text-slate-500 flex-shrink-0">Target date</label>
                          <input type="date" value={oppDue} onChange={e => setOppDue(e.target.value)}
                            className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400" />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={addOpportunity} className="flex-1 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors">Add</button>
                          <button onClick={() => { setShowOppForm(false); setOppCompany(""); setOppSearch(""); setOppCompanyId(""); setOppTitle(""); }} className="flex-1 py-1 bg-white border border-slate-200 text-slate-600 text-xs rounded hover:bg-slate-50">Cancel</button>
                        </div>
                      </div>
                    )}

                    {selectedExt.opportunities.length === 0 && !showOppForm && (
                      <p className="text-xs text-slate-400">No opportunities yet</p>
                    )}
                    <div className="space-y-2">
                      {selectedExt.opportunities.map(opp => {
                        const isOverdue = opp.due && new Date(opp.due) < new Date(new Date().toDateString());
                        const label = opp.company || opp.title || "";
                        return (
                          <div key={opp.id} className={cn("border rounded-lg p-2.5 bg-white", isOverdue ? "border-red-300 bg-red-50" : "border-slate-200")}>
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-xs font-semibold text-slate-800 min-w-0 truncate">{label}</p>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", OPP_TYPE_COLORS[opp.type] ?? "bg-slate-100 text-slate-600")}>{opp.type}</span>
                                <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium",
                                  opp.urgency === "high" ? "bg-red-100 text-red-600" : opp.urgency === "medium" ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500")}>
                                  {opp.urgency}
                                </span>
                                {isOverdue && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-600">Overdue</span>}
                                {confirmDeleteOppId === opp.id ? (
                                  <span className="flex items-center gap-1">
                                    <button onMouseDown={() => { deleteOpportunity(opp.id); setConfirmDeleteOppId(null); }} className="text-xs text-red-600 hover:underline font-medium">Yes</button>
                                    <button onMouseDown={() => setConfirmDeleteOppId(null)} className="text-xs text-slate-400 hover:underline">No</button>
                                  </span>
                                ) : (
                                  <button onClick={() => setConfirmDeleteOppId(opp.id)} className="text-slate-400 hover:text-red-500"><X size={12} /></button>
                                )}
                              </div>
                            </div>
                            {opp.description && <p className="text-xs text-slate-500 mt-0.5">{opp.description}</p>}
                            {opp.due && (
                              <p className={cn("text-[10px] mt-0.5", isOverdue ? "text-red-500 font-medium" : "text-slate-400")}>
                                Due {formatDate(opp.due)}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {/* Tasks linked from /tasks page */}
                    {(() => {
                      try {
                        const raw = localStorage.getItem("crm_tasks");
                        if (!raw) return null;
                        const allTasks = JSON.parse(raw) as Array<{id: number; title: string; status: string; prio: string; due: string; cos: string[]; cat: string; archived?: boolean}>;
                        const linked = allTasks.filter(t => t.cos?.some((c: string) => c.toLowerCase() === (selected?.name ?? "").toLowerCase()));
                        if (linked.length === 0) return null;
                        const outstanding = linked.filter(t => t.status !== "Completed" && !t.archived);
                        const done = linked.filter(t => t.status === "Completed" || t.archived);
                        const PRIO_DOT_S: Record<string, string> = { Critical: "bg-red-500", High: "bg-amber-500", Medium: "bg-blue-400", Low: "bg-slate-400" };
                        const STATUS_CLS_S: Record<string, string> = {
                          "On track": "bg-green-50 text-green-700", "At risk": "bg-amber-50 text-amber-700",
                          "Overdue": "bg-red-50 text-red-700", "Completed": "bg-slate-100 text-slate-400", "Not started": "bg-slate-100 text-slate-500",
                        };
                        return (
                          <div className="border-t border-slate-100 mt-3 pt-3">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Linked Tasks</p>
                            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                              {outstanding.map(t => (
                                <a key={t.id} href="/tasks" className="flex items-start gap-2 border border-slate-200 rounded-lg p-2 bg-white hover:bg-blue-50 hover:border-blue-200 transition-colors cursor-pointer">
                                  <span className={cn("mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0", PRIO_DOT_S[t.prio] ?? "bg-slate-300")} />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium text-slate-700 truncate">{t.title}</p>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium", STATUS_CLS_S[t.status] ?? "bg-slate-100 text-slate-500")}>{t.status}</span>
                                      {t.due && <span className="text-[10px] text-slate-400">Due {t.due}</span>}
                                    </div>
                                  </div>
                                </a>
                              ))}
                              {done.length > 0 && outstanding.length > 0 && (
                                <div className="border-t border-slate-100 pt-1.5 mt-1">
                                  <p className="text-[9px] font-semibold text-slate-300 uppercase tracking-wide mb-1">Completed / Archived</p>
                                </div>
                              )}
                              {done.map(t => (
                                <a key={t.id} href="/tasks" className="flex items-start gap-2 border border-slate-100 rounded-lg p-2 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer opacity-60">
                                  <span className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 bg-slate-300" />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium text-slate-500 truncate line-through">{t.title}</p>
                                    {t.due && <span className="text-[10px] text-slate-400">Due {t.due}</span>}
                                  </div>
                                </a>
                              ))}
                            </div>
                          </div>
                        );
                      } catch { return null; }
                    })()}
                  </div>
                </div>
              )}

              {/* ── COMPANY NEWS TAB (Exa-powered) ───────────────────────── */}
              {panelTab === "company_news" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Recent News</h3>
                      {selected && newsSource[selected.id] && !newsLoading && (
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", newsSource[selected.id] === "exa" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                          {newsSource[selected.id] === "exa" ? "⚡ Live · Exa" : "AI · Claude"}
                        </span>
                      )}
                      {selected && newsCachedAt[selected.id] && !newsLoading && (
                        <span className="text-[10px] text-slate-400">· {(() => { const d = Date.now() - new Date(newsCachedAt[selected.id]).getTime(); const m = Math.floor(d/60000); if (m < 60) return `${m}m ago`; const h = Math.floor(m/60); if (h < 24) return `${h}h ago`; return `${Math.floor(h/24)}d ago`; })()}</span>
                      )}
                    </div>
                    <button onClick={loadCompanyNews} disabled={newsLoading}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                      {newsLoading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                      {newsLoading ? "Loading…" : "Refresh"}
                    </button>
                  </div>
                  {newsLoading && <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />)}</div>}
                  {!newsLoading && !(newsMap[selected?.id ?? ""]?.length) && (
                    <div className="text-center py-8 text-slate-400">
                      <FileText size={20} className="mx-auto mb-2 opacity-40" />
                      <p className="text-xs">Click Refresh to fetch live news via Exa</p>
                    </div>
                  )}
                  {!newsLoading && (() => {
                    const compId = selected?.id ?? "";
                    const allItems = newsMap[compId] ?? [];
                    const starred = newsStarred[compId] ?? [];
                    const unstarred = allItems.filter(i => !starred.includes(i.headline));
                    const starredItems = allItems.filter(i => starred.includes(i.headline));
                    function NewsCard({ item }: { item: StrategicNewsItem }) {
                      const isStarred = starred.includes(item.headline);
                      const inner = (
                        <div className="border border-slate-200 rounded-lg p-2.5 bg-white hover:bg-slate-50 transition-colors">
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-slate-800 leading-snug">{item.headline}</p>
                              {item.summary && <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-3">{item.summary}</p>}
                            </div>
                            <button
                              onClick={e => { e.preventDefault(); e.stopPropagation(); toggleNewsStar(compId, item.headline); }}
                              className={cn("flex-shrink-0 mt-0.5 transition-colors", isStarred ? "text-amber-400" : "text-slate-200 hover:text-amber-300")}
                            >
                              <Star size={13} fill={isStarred ? "currentColor" : "none"} />
                            </button>
                          </div>
                          <div className="flex items-center justify-between mt-1.5 gap-2">
                            <span className="text-[10px] text-slate-400">{item.source}{item.date ? ` · ${item.date}` : ""}</span>
                            {item.url && <ExternalLink size={9} className="text-blue-400 flex-shrink-0" />}
                          </div>
                        </div>
                      );
                      return item.url ? (
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="block">{inner}</a>
                      ) : inner;
                    }
                    return (
                      <>
                        <div className="space-y-2">
                          {unstarred.map((item, i) => <NewsCard key={i} item={item} />)}
                        </div>
                        {starredItems.length > 0 && (
                          <div className="pt-3 border-t border-slate-100 space-y-2">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                              <Star size={9} fill="currentColor" className="text-amber-400" /> Saved
                            </p>
                            {starredItems.map((item, i) => <NewsCard key={i} item={item} />)}
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* ── INTELLIGENCE TAB (Partnership alignment) ──────────────── */}
              {panelTab === "intelligence" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Partnership Intelligence</h3>
                      {partnerAlignGeneratedAt && !partnerAlignLoading && (
                        <p className="text-[10px] text-slate-400 mt-0.5">Generated {new Date(partnerAlignGeneratedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                      )}
                    </div>
                    <button onClick={generatePartnerAlignment} disabled={partnerAlignLoading}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                      {partnerAlignLoading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                      {partnerAlignLoading ? "Generating…" : partnerAlign ? "Regenerate" : "Generate"}
                    </button>
                  </div>
                  {partnerAlignLoading && <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />)}</div>}
                  {!partnerAlignLoading && !partnerAlign && (
                    <div className="text-center py-8 text-slate-400">
                      <Target size={20} className="mx-auto mb-2 opacity-40" />
                      <p className="text-xs">Generate a partnership brief — portfolio &amp; pipeline alignment for this partner</p>
                    </div>
                  )}
                  {partnerAlign && !partnerAlignLoading && (<>
                    {partnerAlign.alignment_summary && (
                      <div className="p-3 bg-teal-50 border border-teal-100 rounded-xl">
                        <p className="text-[10px] font-bold text-teal-700 uppercase tracking-wide mb-1">Partnership Fit</p>
                        <p className="text-xs text-teal-800 leading-relaxed">{partnerAlign.alignment_summary}</p>
                      </div>
                    )}
                    {partnerAlign.portfolio_picks.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Portfolio Highlights</p>
                        <div className="space-y-2">
                          {partnerAlign.portfolio_picks.map((p, i) => (
                            <div key={i} className="border border-emerald-100 rounded-lg p-2.5 bg-emerald-50">
                              <p className="text-xs font-semibold text-slate-800">{p.name}</p>
                              <p className="text-xs text-slate-600 mt-0.5">{p.reason}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {partnerAlign.pipeline_picks.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide mb-2">Pipeline Interest</p>
                        <div className="space-y-2">
                          {partnerAlign.pipeline_picks.map((p, i) => (
                            <div key={i} className="border border-blue-100 rounded-lg p-2.5 bg-blue-50">
                              <p className="text-xs font-semibold text-slate-800">{p.name}</p>
                              <p className="text-xs text-slate-600 mt-0.5">{p.reason}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>)}
                </div>
              )}

            </div>

            {/* Panel footer */}
            <div className="flex-shrink-0 border-t border-slate-200 px-4 py-3">
              <a href={`/crm/companies/${selected.id}`}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors">
                View Profile <ExternalLink size={11} />
              </a>
            </div>
          </>)}
        </div>
      </div>

      {/* ── Add Partner Modal ────────────────────────────────────────────────── */}
      {showAddPartner && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowAddPartner(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800">Add Strategic Partner</h2>
              <button onClick={() => setShowAddPartner(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {/* Company Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Company Name *</label>
                <input value={addName} onChange={e => setAddName(e.target.value)} placeholder="e.g. Mitsubishi Corporation"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {/* Type selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Type</label>
                <div className="flex gap-2">
                  {[
                    { label: "Corporate",    value: "corporate" },
                    { label: "Ecosystem",    value: "ecosystem_partner" },
                    { label: "Gov / Academic", value: "government" },
                  ].map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setAddType(opt.value)}
                      className={cn("flex-1 py-2 text-xs font-medium rounded-lg border transition-colors",
                        addType === opt.value
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600")}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Website */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Website</label>
                <input value={addWebsite} onChange={e => setAddWebsite(e.target.value)} placeholder="e.g. mitsubishicorp.com"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {/* Sector */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Sector</label>
                <input value={addSector} onChange={e => setAddSector(e.target.value)} placeholder="e.g. Energy, Technology"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {/* Location */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">City</label>
                  <input value={addCity} onChange={e => setAddCity(e.target.value)} placeholder="e.g. Tokyo"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Country</label>
                  <input value={addCountry} onChange={e => setAddCountry(e.target.value)} placeholder="e.g. Japan"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setShowAddPartner(false)}
                className="flex-1 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={savePartner} disabled={!addName.trim() || savingPartner}
                className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {savingPartner ? <><Loader2 size={14} className="animate-spin" />Adding…</> : "Add Partner"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change Type dropdown — fixed so it escapes overflow containers */}
      {changeTypePos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setChangeTypePos(null)} />
          <div
            className="fixed z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[160px]"
            style={{ top: changeTypePos.top, right: changeTypePos.right }}
          >
            {[
              { value: "startup",           label: "Startup" },
              { value: "lp",               label: "LP" },
              { value: "fund",             label: "Fund / VC" },
              { value: "ecosystem_partner",label: "Ecosystem Partner" },
              { value: "corporate",        label: "Corporate" },
              { value: "government",       label: "Gov / Academic" },
              { value: "other",            label: "Other" },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => handleChangeType(opt.value)}
                className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
              >{opt.label}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
