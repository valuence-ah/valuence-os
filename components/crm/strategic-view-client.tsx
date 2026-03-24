"use client";
// ─── Strategic Partners CRM — metrics · table · detail panel ─────────────────

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Company, Contact, Interaction } from "@/lib/types";
import { cn, formatDate, getInitials, timeAgo } from "@/lib/utils";
import {
  Search, Plus, X, Check, Loader2, Mail, Video, Phone, FileText,
  Building2, Target, TrendingUp, AlertCircle, Users, Shield,
  Handshake, MoreHorizontal, ChevronRight, ExternalLink, RefreshCw,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type StrategicRole = "Co-invest" | "Customer" | "Pilot" | "Diligence";
type SignalType = "hot" | "warm" | "cold";
type OppType = "Co-invest" | "Pilot" | "Diligence" | "Customer" | "Value-add";
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
  portco_matches: { portco: string; status: PortcoStatus }[];
  opportunities: { id: string; title: string; type: string; urgency: OppUrgency; description: string }[];
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
  "Co-invest":  "bg-amber-100 text-amber-700",
  "Pilot":      "bg-emerald-100 text-emerald-700",
  "Diligence":  "bg-violet-100 text-violet-700",
  "Customer":   "bg-blue-100 text-blue-700",
  "Value-add":  "bg-slate-100 text-slate-600",
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
  "Last Contact": 110, Signal: 90, Owner: 80,
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
        <span className="text-[11px] text-slate-600">{label}</span>
        {editing ? (
          <input value={input} onChange={e => setInput(e.target.value)}
            onBlur={() => { const v = Math.min(100, Math.max(0, parseInt(input) || 0)); onChange(v); setEditing(false); }}
            onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            className="w-8 text-[11px] font-semibold text-slate-700 text-right border-b border-blue-400 outline-none bg-transparent" />
        ) : (
          <span className="text-[11px] font-semibold text-slate-700 cursor-pointer hover:text-blue-600"
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
  const [panelTab, setPanelTab] = useState<"overview" | "opportunities" | "intelligence" | "tasks">("overview");

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
  const [showOppForm, setShowOppForm]       = useState(false);
  const [oppTitle, setOppTitle]             = useState("");
  const [oppType, setOppType]               = useState<OppType>("Co-invest");
  const [oppUrgency, setOppUrgency]         = useState<OppUrgency>("medium");
  const [oppDesc, setOppDesc]               = useState("");

  // Portco match form
  const [showMatchForm, setShowMatchForm]   = useState(false);
  const [matchPortco, setMatchPortco]       = useState("");
  const [matchStatus, setMatchStatus]       = useState<PortcoStatus>("Not started");

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

  // Description auto-generate
  const [loadingDesc, setLoadingDesc]       = useState(false);

  // Sector auto-generate
  const [loadingSector, setLoadingSector]   = useState(false);

  // Resizable columns
  const [colWidths, setColWidths] = useState<Record<string, number>>(DEFAULT_COL_WIDTHS);
  const resizingCol = useRef<{ col: string; startX: number; startW: number } | null>(null);

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
      if (raw) setExtMap(JSON.parse(raw));
    } catch {}
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

  function getExt(id: string): StrategicExt {
    return extMap[id] ?? { ...DEFAULT_EXT, scores: { ...DEFAULT_EXT.scores } };
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
    setShowOppForm(false);
    setShowMatchForm(false);
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

  function addOpportunity() {
    if (!selected || !oppTitle.trim()) return;
    const newOpp = { id: genId(), title: oppTitle.trim(), type: oppType, urgency: oppUrgency, description: oppDesc.trim() };
    saveExt(selected.id, { opportunities: [...selectedExt.opportunities, newOpp] });
    setOppTitle(""); setOppType("Co-invest"); setOppUrgency("medium"); setOppDesc("");
    setShowOppForm(false);
  }

  function addMatch() {
    if (!selected || !matchPortco.trim()) return;
    const newMatch = { portco: matchPortco.trim(), status: matchStatus };
    saveExt(selected.id, { portco_matches: [...selectedExt.portco_matches, newMatch] });
    setMatchPortco(""); setMatchStatus("Not started"); setShowMatchForm(false);
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
      <div className="flex gap-3 px-5 py-3 bg-white border-b border-slate-200 flex-shrink-0">
        {[
          { label: "Total Strategics",    value: metrics.total,     icon: <Building2 size={14} className="text-slate-500" /> },
          { label: "Active Relationships", value: metrics.active,   icon: <Users size={14} className="text-emerald-500" /> },
          { label: "Co-invest Signals",   value: metrics.coinvest,  icon: <TrendingUp size={14} className="text-amber-500" /> },
          { label: "Open Pilot Opps",     value: metrics.pilot,     icon: <Target size={14} className="text-blue-500" /> },
          { label: "Diligence Experts",   value: metrics.diligence, icon: <Shield size={14} className="text-violet-500" /> },
          { label: "Cooling Off",         value: metrics.cooling,   icon: <AlertCircle size={14} className="text-red-400" /> },
        ].map(m => (
          <div key={m.label} className="flex-1 bg-slate-50 rounded-xl border border-slate-200 px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1">{m.icon}<span className="text-[11px] text-slate-500 font-medium">{m.label}</span></div>
            <p className="text-xl font-bold text-slate-800">{m.value}</p>
          </div>
        ))}
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
            </colgroup>
            <thead className="sticky top-0 z-10 bg-slate-100">
              <tr>
                {Object.keys(DEFAULT_COL_WIDTHS).map(col => (
                  <th key={col} className="text-left px-3 py-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wide border-b border-slate-200 whitespace-nowrap relative select-none">
                    {col}
                    <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize group flex items-center justify-center" onMouseDown={e => onResizeStart(col, e)}>
                      <div className="w-px h-4 bg-slate-300 group-hover:bg-blue-400 transition-colors" />
                    </div>
                  </th>
                ))}
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
                    className={cn("border-b border-slate-100 cursor-pointer transition-colors hover:bg-blue-50",
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
                        <span className={cn("text-[11px] font-semibold tabular-nums w-7 text-right", healthTextColor(h))}>{Math.round(h)}</span>
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
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center py-16 text-sm text-slate-400">No strategic partners found</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── Detail panel ─────────────────────────────────────────────────── */}
        <div className={cn("fixed right-0 top-0 h-full bg-white border-l border-slate-200 shadow-2xl z-30 flex flex-col transition-transform duration-300", selectedId ? "translate-x-0" : "translate-x-full")} style={{ width: 480 }}>
        {selected && (<>
            {/* Panel header */}
            <div className="flex items-start gap-2.5 px-4 py-3 border-b border-slate-200 flex-shrink-0">
              <CompanyAvatar name={selected.name} size="md" />
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-bold text-slate-800 truncate">{selected.name}</h2>
                <p className="text-[11px] text-slate-400 truncate">{selected.sectors?.[0] ?? selected.sub_type ?? "Strategic Partner"}</p>
              </div>
              <button onClick={() => setSelectedId(null)} className="text-slate-400 hover:text-slate-600 flex-shrink-0 mt-0.5">
                <X size={14} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-slate-200 flex-shrink-0">
              {(["overview", "opportunities", "intelligence", "tasks"] as const).map(tab => (
                <button key={tab} onClick={() => setPanelTab(tab)}
                  className={cn("flex-1 text-[11px] font-medium py-2 capitalize transition-colors",
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
                const wordCount = (selected.description ?? "").trim().split(/\s+/).filter(Boolean).length;
                return (
                  <div className="space-y-4">
                    {/* Signal alert */}
                    {sig === "hot" && (
                      <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
                        <p className="text-xs font-semibold text-emerald-700">Hot signal — Engage now</p>
                        {selectedExt.signal_note && <p className="text-[11px] text-emerald-600 mt-0.5">{selectedExt.signal_note}</p>}
                      </div>
                    )}
                    {sig === "warm" && (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                        <p className="text-xs font-semibold text-amber-700">Warm — Follow up recommended</p>
                        {selectedExt.signal_note && <p className="text-[11px] text-amber-600 mt-0.5">{selectedExt.signal_note}</p>}
                      </div>
                    )}

                    {/* Profile */}
                    <div>
                      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Profile</h3>
                      <div className="space-y-2">

                        {/* Sector row */}
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-400 w-24 flex-shrink-0">Sector</span>
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <input
                              value={selected.sectors?.[0] ?? ""}
                              onChange={e => {
                                const val = e.target.value;
                                setCompanies(ps => ps.map(c => c.id === selected.id ? { ...c, sectors: val ? [val] : [] } : c));
                              }}
                              onBlur={async e => {
                                const val = e.target.value.trim();
                                await saveCompanyField(selected.id, { sectors: val ? [val] : [] });
                              }}
                              placeholder="e.g. Energy & Materials"
                              className="flex-1 text-[11px] text-slate-700 border-b border-transparent hover:border-slate-200 focus:border-blue-400 focus:outline-none bg-transparent py-0.5"
                            />
                            <button
                              onClick={generateSector}
                              disabled={loadingSector}
                              className="text-[10px] text-violet-500 hover:text-violet-700 flex-shrink-0 flex items-center gap-0.5"
                              title="Auto-generate sector"
                            >
                              {loadingSector ? <Loader2 size={10} className="animate-spin" /> : "✨"}
                            </button>
                          </div>
                        </div>

                        {/* Location row — City + Country side by side */}
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-400 w-24 flex-shrink-0">Location</span>
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            <input
                              value={selected.location_city ?? ""}
                              onChange={e => {
                                const val = e.target.value;
                                setCompanies(ps => ps.map(c => c.id === selected.id ? { ...c, location_city: val } : c));
                              }}
                              onBlur={async e => {
                                await saveCompanyField(selected.id, { location_city: e.target.value.trim() || null });
                              }}
                              placeholder="City"
                              className="flex-1 text-[11px] text-slate-700 border-b border-transparent hover:border-slate-200 focus:border-blue-400 focus:outline-none bg-transparent py-0.5"
                            />
                            <span className="text-slate-300 text-[11px]">/</span>
                            <input
                              value={selected.location_country ?? ""}
                              onChange={e => {
                                const val = e.target.value;
                                setCompanies(ps => ps.map(c => c.id === selected.id ? { ...c, location_country: val } : c));
                              }}
                              onBlur={async e => {
                                await saveCompanyField(selected.id, { location_country: e.target.value.trim() || null });
                              }}
                              placeholder="Country"
                              className="flex-1 text-[11px] text-slate-700 border-b border-transparent hover:border-slate-200 focus:border-blue-400 focus:outline-none bg-transparent py-0.5"
                            />
                          </div>
                        </div>

                        {/* Website row */}
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-slate-400 w-24 flex-shrink-0">Website</span>
                          <input
                            value={selected.website ?? ""}
                            onChange={e => {
                              const val = e.target.value;
                              setCompanies(ps => ps.map(c => c.id === selected.id ? { ...c, website: val } : c));
                            }}
                            onBlur={async e => {
                              await saveCompanyField(selected.id, { website: e.target.value.trim() || null });
                            }}
                            placeholder="https://…"
                            className="flex-1 text-[11px] text-slate-700 border-b border-transparent hover:border-slate-200 focus:border-blue-400 focus:outline-none bg-transparent py-0.5 min-w-0"
                          />
                        </div>

                        {/* Last Contact row */}
                        <div className="flex items-start gap-2">
                          <span className="text-[11px] text-slate-400 w-24 flex-shrink-0">Last Contact</span>
                          <span className="text-[11px] text-slate-700">{formatDate(selected.last_contact_date)}</span>
                        </div>

                        {/* Description row */}
                        <div className="flex items-start gap-2">
                          <div className="w-24 flex-shrink-0 flex items-center gap-1">
                            <span className="text-[11px] text-slate-400">Description</span>
                            <button
                              onClick={generateDescription}
                              disabled={loadingDesc}
                              className="text-[10px] text-violet-500 hover:text-violet-700 flex-shrink-0"
                              title="Auto-generate description"
                            >
                              {loadingDesc ? <Loader2 size={10} className="animate-spin" /> : "✨"}
                            </button>
                          </div>
                          <div className="flex-1 min-w-0">
                            <textarea
                              rows={2}
                              value={selected.description ?? ""}
                              onChange={e => {
                                const val = e.target.value;
                                setCompanies(ps => ps.map(c => c.id === selected.id ? { ...c, description: val } : c));
                              }}
                              onBlur={async e => {
                                await saveCompanyField(selected.id, { description: e.target.value.trim() || null });
                              }}
                              placeholder="Company description…"
                              className={cn(
                                "w-full text-[11px] text-slate-700 border rounded px-1.5 py-1 focus:outline-none focus:border-blue-400 resize-none bg-transparent",
                                wordCount > 60 ? "border-red-400" : "border-slate-200"
                              )}
                            />
                            <p className={cn("text-[10px] mt-0.5", wordCount > 60 ? "text-red-500" : "text-slate-400")}>
                              {wordCount}/60 words
                            </p>
                          </div>
                        </div>

                      </div>
                    </div>

                    {/* Roles */}
                    <div>
                      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Roles</h3>
                      <div className="grid grid-cols-2 gap-1.5">
                        {ROLES.map(role => (
                          <button key={role} onClick={() => toggleRole(role)}
                            className={cn("flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors",
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
                      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Owner</h3>
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
                      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-2">Relationship Scores</h3>
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
                        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Contacts</h3>
                        <a href={`/crm/companies/${selected.id}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                          Manage <ChevronRight size={11} />
                        </a>
                      </div>
                      <div className="h-[200px] overflow-y-auto space-y-2 pr-1">
                        {loadingDetail ? (
                          [1, 2].map(i => <div key={i} className="h-14 bg-slate-50 rounded-lg animate-pulse" />)
                        ) : contacts.length === 0 ? (
                          <p className="text-xs text-slate-400 italic">No contacts on file</p>
                        ) : contacts.map(c => (
                          <div key={c.id} className="flex items-start gap-2.5 p-2.5 bg-slate-50 rounded-lg">
                            <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${hashColor(c.first_name + (c.last_name ?? ""))} flex items-center justify-center flex-shrink-0`}>
                              <span className="text-white text-[10px] font-bold">{getInitials(`${c.first_name} ${c.last_name ?? ""}`)}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-slate-800 truncate">{c.first_name} {c.last_name}</p>
                              {c.title && <p className="text-[11px] text-slate-400 truncate">{c.title}</p>}
                              {c.email && (
                                <a href={`mailto:${c.email}`} className="flex items-center gap-1 text-[11px] text-blue-500 hover:underline truncate">
                                  <Mail size={9} /> {c.email}
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Activity Timeline */}
                    <div className="pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Activity Timeline</h3>
                        <button
                          onClick={async () => {
                            if (!selected) return;
                            // Re-load interactions for "+ Add Activity" (open a modal or form in panel if needed)
                          }}
                          className="text-xs px-2.5 py-1 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 flex items-center gap-1"
                        >
                          <Plus size={11} /> Add Activity
                        </button>
                      </div>

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
                                        <p className="text-xs font-medium text-slate-700 leading-tight truncate">{int.subject ?? int.type.charAt(0).toUpperCase() + int.type.slice(1)}</p>
                                        {int.body && <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{int.body}</p>}
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
                  {/* Opportunities list */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Opportunities</h3>
                      <button onClick={() => setShowOppForm(v => !v)} className="text-blue-600 hover:text-blue-700">
                        <Plus size={14} />
                      </button>
                    </div>

                    {showOppForm && (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3 space-y-2">
                        <input value={oppTitle} onChange={e => setOppTitle(e.target.value)} placeholder="Title"
                          className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400" />
                        <div className="flex gap-2">
                          <select value={oppType} onChange={e => setOppType(e.target.value as OppType)}
                            className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400">
                            {(["Co-invest", "Pilot", "Diligence", "Customer", "Value-add"] as OppType[]).map(t => <option key={t}>{t}</option>)}
                          </select>
                          <select value={oppUrgency} onChange={e => setOppUrgency(e.target.value as OppUrgency)}
                            className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400">
                            <option value="high">High</option>
                            <option value="medium">Medium</option>
                            <option value="low">Low</option>
                          </select>
                        </div>
                        <textarea value={oppDesc} onChange={e => setOppDesc(e.target.value)} placeholder="Description (optional)"
                          rows={2} className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400 resize-none" />
                        <div className="flex gap-2">
                          <button onClick={addOpportunity} className="flex-1 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors">Add</button>
                          <button onClick={() => setShowOppForm(false)} className="flex-1 py-1 bg-white border border-slate-200 text-slate-600 text-xs rounded hover:bg-slate-50">Cancel</button>
                        </div>
                      </div>
                    )}

                    {selectedExt.opportunities.length === 0 && !showOppForm && (
                      <p className="text-[11px] text-slate-400">No opportunities yet</p>
                    )}
                    <div className="space-y-2">
                      {selectedExt.opportunities.map(opp => (
                        <div key={opp.id} className="border border-slate-200 rounded-lg p-2.5 bg-white">
                          <div className="flex items-start gap-2 mb-1">
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0", OPP_TYPE_COLORS[opp.type] ?? "bg-slate-100 text-slate-600")}>{opp.type}</span>
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0",
                              opp.urgency === "high" ? "bg-red-100 text-red-600" : opp.urgency === "medium" ? "bg-amber-100 text-amber-600" : "bg-slate-100 text-slate-500")}>
                              {opp.urgency}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-slate-800">{opp.title}</p>
                          {opp.description && <p className="text-[11px] text-slate-500 mt-0.5">{opp.description}</p>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Portco matches */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Portco Matches</h3>
                      <button onClick={() => setShowMatchForm(v => !v)} className="text-blue-600 hover:text-blue-700">
                        <Plus size={14} />
                      </button>
                    </div>

                    {showMatchForm && (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3 space-y-2">
                        <input value={matchPortco} onChange={e => setMatchPortco(e.target.value)} placeholder="Portco name"
                          className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400" />
                        <select value={matchStatus} onChange={e => setMatchStatus(e.target.value as PortcoStatus)}
                          className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400">
                          {(["Active pilot", "Intro pending", "Exploring", "Not started"] as PortcoStatus[]).map(s => <option key={s}>{s}</option>)}
                        </select>
                        <div className="flex gap-2">
                          <button onClick={addMatch} className="flex-1 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors">Add</button>
                          <button onClick={() => setShowMatchForm(false)} className="flex-1 py-1 bg-white border border-slate-200 text-slate-600 text-xs rounded hover:bg-slate-50">Cancel</button>
                        </div>
                      </div>
                    )}

                    {selectedExt.portco_matches.length === 0 && !showMatchForm && (
                      <p className="text-[11px] text-slate-400">No portco matches yet</p>
                    )}
                    <div className="space-y-1.5">
                      {selectedExt.portco_matches.map((m, idx) => (
                        <div key={idx} className="flex items-center justify-between py-1.5 border-b border-slate-100">
                          <span className="text-xs font-medium text-slate-700">{m.portco}</span>
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", PORTCO_STATUS_COLORS[m.status])}>{m.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── INTELLIGENCE TAB ─────────────────────────────────────── */}
              {panelTab === "intelligence" && (
                <div className="space-y-4">
                  {/* Refresh button */}
                  <div className="flex items-center justify-between">
                    <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Intel Feed</h3>
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
                    <p className="text-[11px] text-slate-400">Manually add intel</p>
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
                    <p className="text-[11px] text-slate-400">No intel yet — click &quot;Refresh Intelligence&quot; to load</p>
                  )}
                  <div className="space-y-2.5">
                    {selectedExt.intel.map(item => (
                      <div key={item.id} className="border border-slate-200 rounded-lg p-2.5 bg-white">
                        {item.is_signal && (
                          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide bg-emerald-50 px-1.5 py-0.5 rounded mb-1 inline-block">SIGNAL</span>
                        )}
                        <p className="text-xs font-medium text-slate-800">{item.headline}</p>
                        {item.summary && <p className="text-[11px] text-slate-500 mt-0.5">{item.summary}</p>}
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

              {/* ── TASKS TAB ────────────────────────────────────────────── */}
              {panelTab === "tasks" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Tasks</h3>
                    <button onClick={() => setShowTaskForm(v => !v)} className="text-blue-600 hover:text-blue-700">
                      <Plus size={14} />
                    </button>
                  </div>

                  {showTaskForm && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                      <input value={taskText} onChange={e => setTaskText(e.target.value)} placeholder="Task description"
                        className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400" />
                      <input value={taskDue} onChange={e => setTaskDue(e.target.value)} type="date"
                        className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400" />
                      <div className="flex gap-2">
                        <button onClick={addTask} className="flex-1 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors">Add</button>
                        <button onClick={() => setShowTaskForm(false)} className="flex-1 py-1 bg-white border border-slate-200 text-slate-600 text-xs rounded hover:bg-slate-50">Cancel</button>
                      </div>
                    </div>
                  )}

                  {selectedExt.tasks.length === 0 && !showTaskForm && (
                    <p className="text-[11px] text-slate-400">No tasks yet</p>
                  )}
                  <div className="space-y-1.5">
                    {selectedExt.tasks.map(task => (
                      <div key={task.id} className={cn("flex items-start gap-2.5 py-2 border-b border-slate-100", task.done ? "opacity-50" : "")}>
                        <button onClick={() => toggleTask(task.id)}
                          className={cn("flex-shrink-0 w-4 h-4 rounded border mt-0.5 flex items-center justify-center transition-colors",
                            task.done ? "bg-blue-600 border-blue-600" : "border-slate-300 hover:border-blue-400")}>
                          {task.done && <Check size={10} className="text-white" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-xs text-slate-700", task.done && "line-through text-slate-400")}>{task.text}</p>
                          {task.due && <p className="text-[10px] text-slate-400 mt-0.5">Due {formatDate(task.due)}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

            {/* Panel footer */}
            <div className="flex-shrink-0 border-t border-slate-200 px-4 py-3 space-y-2">
              {/* Next action */}
              <div className="space-y-1">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Next Action</p>
                <input value={selectedExt.next_action} onChange={e => saveExt(selected.id, { next_action: e.target.value })}
                  placeholder="Describe next action…"
                  className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400" />
                <input value={selectedExt.next_action_due} onChange={e => saveExt(selected.id, { next_action_due: e.target.value })}
                  type="date" className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400" />
              </div>

              {/* View profile */}
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
