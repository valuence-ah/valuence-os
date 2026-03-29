"use client";
// ─── Strategic Partners CRM — metrics · table · detail panel ─────────────────

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Company, Contact, Interaction, ContactType } from "@/lib/types";
import { cn, formatDate, getInitials, timeAgo } from "@/lib/utils";
import {
  Search, Plus, X, Check, Loader2, Mail, Video, Phone, FileText,
  Building2, Target, TrendingUp, AlertCircle, Users, User, Shield,
  Handshake, MoreHorizontal, ChevronRight, ExternalLink, RefreshCw, MapPin, Link2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type StrategicRole = "Co-invest" | "Customer" | "Pilot" | "Diligence";
type SignalType = "hot" | "warm" | "cold";
type OppType = "Co-invest" | "Introduction" | "Pilot" | "Diligence" | "Customer" | "Value-add";
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
  "Introduction": "bg-amber-100 text-amber-700",
  "Co-invest":    "bg-amber-100 text-amber-700",  // backwards compat
  "Pilot":        "bg-emerald-100 text-emerald-700",
  "Diligence":    "bg-violet-100 text-violet-700",
  "Customer":     "bg-blue-100 text-blue-700",
  "Value-add":    "bg-slate-100 text-slate-600",
};

const PORTCO_STATUS_COLORS: Record<PortcoStatus, string> = {
  "Active pilot":   "bg-emerald-100 text-emerald-700",
  "Intro pending":  "bg-amber-100 text-amber-700",
  "Exploring":      "bg-blue-100 text-blue-700",
  "Not started":    "bg-slate-100 text-slate-500",
};

// Column widths for resizable columns
const DEFAULT_COL_WIDTHS: Record<string, number> = {
  Company: 200, Sector: 120, "Rel. Health": 110, Utility: 90,
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

function CompanyAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "w-7 h-7 text-[9px]" : size === "lg" ? "w-12 h-12 text-sm" : "w-9 h-9 text-xs";
  const grad = hashColor(name);
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

// ── Main Component ────────────────────────────────────────────────────────────

interface Props { initialCompanies: Company[] }

export function StrategicViewClient({ initialCompanies }: Props) {
  const supabase = createClient();

  // Core state
  const [companies, setCompanies]         = useState<Company[]>(initialCompanies);
  const [selectedId, setSelectedId]       = useState<string | null>(null);
  const [search, setSearch]               = useState("");
  const [activeFilter, setActiveFilter]   = useState<FilterId>("all");
  const [interactions, setInteractions]   = useState<Interaction[]>([]);
  const [contacts, setContacts]           = useState<Contact[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Panel tab
  const [panelTab, setPanelTab] = useState<"overview" | "opportunities" | "intelligence">("overview");
  // Remove company confirm
  const [confirmRemoveCompanyId, setConfirmRemoveCompanyId] = useState<string | null>(null);

  // localStorage ext map
  const [extMap, setExtMap] = useState<Record<string, StrategicExt>>({});

  // Last touch map (loaded once on mount)
  const [lastTouchMap, setLastTouchMap] = useState<Record<string, { date: string; type: string }>>({});

  // Add partner modal
  const [showAddPartner, setShowAddPartner] = useState(false);
  const [addName, setAddName]               = useState("");
  const [addSector, setAddSector]           = useState("");
  const [addDesc, setAddDesc]               = useState("");
  const [savingPartner, setSavingPartner]   = useState(false);

  // Opportunity form
  const [showOppForm, setShowOppForm]         = useState(false);
  const [oppTitle, setOppTitle]               = useState("");
  const [oppType, setOppType]                 = useState<OppType>("Introduction");
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

  // Resizable columns
  const [colWidths, setColWidths] = useState<Record<string, number>>(DEFAULT_COL_WIDTHS);
  const resizingCol = useRef<{ col: string; startX: number; startW: number } | null>(null);
  const activityFormRef = useRef<HTMLDivElement>(null);
  const linkSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onResizeStart(col: string, e: React.MouseEvent) {
    e.preventDefault();
    resizingCol.current = { col, startX: e.clientX, startW: colWidths[col] };
    function onMove(ev: MouseEvent) {
      if (!resizingCol.current) return;
      const diff = ev.clientX - resizingCol.current.startX;
      setColWidths(prev => ({ ...prev, [resizingCol.current!.col]: Math.max(50, resizingCol.current!.startW + diff) }));
    }
    function onUp() {
      resizingCol.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // Re-fetch on mount
  useEffect(() => {
    supabase
      .from("companies")
      .select("*")
      .contains("types", ["strategic partner"])
      .order("name", { ascending: true })
      .limit(10000)
      .then(({ data }) => { if (data) setCompanies(data as Company[]); });
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
      name: addName.trim(),
      description: addDesc.trim() || null,
      sectors: addSector.trim() ? [addSector.trim()] : null,
      types: ["strategic partner"],
    }).select().single();
    if (newCo) setCompanies(prev => [...prev, newCo as Company].sort((a, b) => a.name.localeCompare(b.name)));
    setAddName(""); setAddSector(""); setAddDesc(""); setShowAddPartner(false);
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
        saveExt(selected.id, { intel: [...newItems, ...currentExt.intel] });
      }
    } catch {}
    setLoadingIntel(false);
  }

  // ── Add Activity ──────────────────────────────────────────────────────────
  async function handleAddActivity() {
    if (!selected) return;
    setSavingActivity(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: newInt } = await supabase.from("interactions").insert({
      company_id: selected.id, type: activityType, date: activityDate,
      subject: { call: "Call", meeting: "Meeting", email: "Email" }[activityType],
      body: activityNote.trim() || null, created_by: user?.id ?? null,
      contact_ids: activityContactIds.length > 0 ? activityContactIds : null,
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
      const { data } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, email, title, company_id")
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(8);
      setLinkContactSuggestions((data as Contact[]) ?? []);
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
          cat: "Ecosystem",
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
    setOppCompany(""); setOppCompanyId(""); setOppSearch(""); setOppType("Introduction"); setOppUrgency("medium"); setOppDesc(""); setOppDue("");
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

      {/* ── Metrics bar ──────────────────────────────────────────────────────── */}
      <div className="flex gap-3 px-5 py-4 bg-white border-b border-slate-200 flex-shrink-0">
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
        <div className="flex gap-1">
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

        {/* Table */}
        <div className={cn("flex-1 overflow-auto", selectedId ? "mr-[480px]" : "")}>
          <table className="w-full text-sm border-collapse" style={{ tableLayout: "fixed" }}>
            <colgroup>
              {Object.keys(DEFAULT_COL_WIDTHS).map(col => <col key={col} style={{ width: colWidths[col] }} />)}
              <col style={{ width: 40 }} />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-100">
              <tr>
                {Object.keys(DEFAULT_COL_WIDTHS).map(col => (
                  <th key={col} className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 border-b border-slate-200 whitespace-nowrap relative select-none">
                    {col}
                    <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize group flex items-center justify-center" onMouseDown={e => onResizeStart(col, e)}>
                      <div className="w-px h-4 bg-slate-300 group-hover:bg-blue-400 transition-colors" />
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
                        <CompanyAvatar name={co.name} size="sm" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 truncate max-w-[150px]">{co.name}</p>
                          {co.description && <p className="text-[10px] text-slate-400 truncate max-w-[150px]">{co.description}</p>}
                        </div>
                      </div>
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
                  <td colSpan={14} className="text-center py-16 text-sm text-slate-400">No strategic partners found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── Detail panel ─────────────────────────────────────────────────── */}
        <div className={cn("fixed right-0 top-0 h-full bg-white border-l border-slate-200 shadow-2xl z-30 flex flex-col transition-transform duration-300", selectedId ? "translate-x-0" : "translate-x-full")} style={{ width: 480 }}>
        {selected && (<>
            {/* Panel header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <CompanyAvatar name={selected.name} size="lg" />
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
              <button onClick={() => setSelectedId(null)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 flex-shrink-0">
                <X size={14} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 flex-shrink-0">
              {(["overview", "opportunities", "intelligence"] as const).map(tab => (
                <button key={tab} onClick={() => setPanelTab(tab)}
                  className={cn("flex-1 text-xs font-medium py-2 capitalize transition-colors",
                    panelTab === tab ? "text-blue-600 border-b-2 border-blue-600" : "text-slate-500 hover:text-slate-700")}>
                  {tab}
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
                            className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center cursor-pointer hover:bg-amber-100 transition-colors"
                            onClick={() => loadIntelligence()}
                          >
                            <FileText size={14} className="text-amber-500 mx-auto mb-1" />
                            {loadingIntel
                              ? <Loader2 size={14} className="animate-spin text-amber-500 mx-auto" />
                              : <p className="text-lg font-bold text-amber-700">{selectedExt.intel.length > 0 ? selectedExt.intel.length : "—"}</p>
                            }
                            <p className="text-[10px] text-amber-600 font-medium">Intelligence</p>
                            <p className="text-[10px] text-slate-400">click to load</p>
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
                            {(["Co-invest", "Introduction", "Pilot", "Diligence", "Customer", "Value-add"] as OppType[]).map(t => <option key={t}>{t}</option>)}
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
                          <label className="text-[10px] text-slate-500 flex-shrink-0">Action date</label>
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
                        const allTasks = JSON.parse(raw) as Array<{id: number; title: string; status: string; prio: string; due: string; cos: string[]; cat: string}>;
                        const linked = allTasks.filter(t => t.cos?.some((c: string) => c.toLowerCase() === (selected?.name ?? "").toLowerCase()));
                        if (linked.length === 0) return null;
                        return (
                          <div className="mt-3">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Linked Tasks</p>
                            <div className="space-y-1.5">
                              {linked.map(t => (
                                <div key={t.id} className="border border-slate-200 rounded-lg p-2 bg-white flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-medium text-slate-700 truncate">{t.title}</p>
                                    {t.due && <p className="text-[10px] text-slate-400 mt-0.5">Due {t.due}</p>}
                                  </div>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{t.status}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      } catch { return null; }
                    })()}
                  </div>
                </div>
              )}

              {/* ── INTELLIGENCE TAB ─────────────────────────────────────── */}
              {panelTab === "intelligence" && (
                <div className="space-y-4">
                  {/* Refresh button */}
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Intel Feed</h3>
                    <button
                      onClick={loadIntelligence}
                      disabled={loadingIntel}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {loadingIntel ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                      {loadingIntel ? "Loading…" : "Refresh Intelligence"}
                    </button>
                  </div>

                  {/* Signal alert based on intel */}
                  {(() => {
                    const signalItems = selectedExt.intel.filter(i => i.is_signal);
                    if (signalItems.length > 0) {
                      return (
                        <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
                          <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-wide mb-0.5">Signal Detected</p>
                          <p className="text-xs text-emerald-700">{signalItems[0].headline}</p>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Add intel form */}
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-slate-400">Manually add intel</p>
                    <button onClick={() => setShowIntelForm(v => !v)} className="text-blue-600 hover:text-blue-700">
                      <Plus size={14} />
                    </button>
                  </div>

                  {showIntelForm && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3 space-y-2">
                      <input value={intelHeadline} onChange={e => setIntelHeadline(e.target.value)} placeholder="Headline"
                        className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400" />
                      <div className="flex gap-2">
                        <input value={intelSource} onChange={e => setIntelSource(e.target.value)} placeholder="Source"
                          className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400" />
                        <input value={intelDate} onChange={e => setIntelDate(e.target.value)} type="date"
                          className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400" />
                      </div>
                      <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                        <input type="checkbox" checked={intelSignal} onChange={e => setIntelSignal(e.target.checked)} className="rounded" />
                        Mark as signal
                      </label>
                      <div className="flex gap-2">
                        <button onClick={addIntel} className="flex-1 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors">Add</button>
                        <button onClick={() => setShowIntelForm(false)} className="flex-1 py-1 bg-white border border-slate-200 text-slate-600 text-xs rounded hover:bg-slate-50">Cancel</button>
                      </div>
                    </div>
                  )}

                  {selectedExt.intel.length === 0 && !showIntelForm && !loadingIntel && (
                    <p className="text-xs text-slate-400">No intel yet — click &quot;Refresh Intelligence&quot; to load</p>
                  )}
                  <div className="space-y-2.5">
                    {selectedExt.intel.map(item => (
                      <div key={item.id} className="border border-slate-200 rounded-lg p-2.5 bg-white">
                        {item.is_signal && (
                          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide bg-emerald-50 px-1.5 py-0.5 rounded mb-1 inline-block">SIGNAL</span>
                        )}
                        <p className="text-xs font-medium text-slate-800">{item.headline}</p>
                        {item.summary && <p className="text-xs text-slate-500 mt-0.5">{item.summary}</p>}
                        <div className="flex items-center gap-2 mt-1">
                          {item.source && item.url ? (
                            <a href={item.url} target="_blank" rel="noopener noreferrer"
                              className="text-[10px] text-blue-600 hover:underline">{item.source}</a>
                          ) : item.source ? (
                            <span className="text-[10px] text-slate-400">{item.source}</span>
                          ) : null}
                          <span className="text-[10px] text-slate-400">{formatDate(item.date)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
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
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-slate-800">Add Strategic Partner</h2>
              <button onClick={() => setShowAddPartner(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Company Name *</label>
                <input value={addName} onChange={e => setAddName(e.target.value)} placeholder="e.g. Mitsubishi Corporation"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Sector</label>
                <input value={addSector} onChange={e => setAddSector(e.target.value)} placeholder="e.g. Energy, Technology"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                <textarea value={addDesc} onChange={e => setAddDesc(e.target.value)} placeholder="Brief description…"
                  rows={3} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 resize-none" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={savePartner} disabled={!addName.trim() || savingPartner}
                className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {savingPartner ? <Loader2 size={14} className="animate-spin" /> : null} Add Partner
              </button>
              <button onClick={() => setShowAddPartner(false)}
                className="flex-1 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
