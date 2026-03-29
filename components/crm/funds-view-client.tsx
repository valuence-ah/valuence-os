"use client";
// ─── Funds & Co-investors CRM — metrics · table · detail panel ────────────────

import { useState, useMemo, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Company, Contact } from "@/lib/types";
import { cn, formatDate, timeAgo } from "@/lib/utils";
import {
  Search, X, Building2, TrendingUp, Users, AlertCircle,
  CheckCircle2, Zap, ChevronRight, ExternalLink, MapPin, Plus, Check, Sparkles,
} from "lucide-react";

// ── Fund Intelligence Types ────────────────────────────────────────────────────

interface FundData {
  id: string;
  co: string;
  initials: string;
  desc: string;
  type: string;
  loc: string;
  stages: string[];
  checkSize: string;
  cleantech: number;
  techbio: number;
  overallAlign: number;
  coInvest: "active" | "potential" | "none";
  coInvestLabel: string;
  relHealth: number;
  owner: string;
  lastContact: string;
  overdue: boolean;
  nextAction: string;
  dealFlow: "bidirectional" | "inbound" | "outbound" | "none";
  dealFlowLabel: string;
  portfolioOverlap: { initials: string; name: string; role: string }[];
  scores: { label: string; value: number; colorClass: string }[];
  recentInvest: { name: string; round: string; sector: string; date: string }[];
  intel: { headline: string; meta: string; url?: string }[];
  timeline: { icon: string; title: string; date: string; colorClass: string }[];
  introPath: string[];
  keyContacts: string[];
  aum: string;
  fundNum: string;
  leadCapable: boolean;
  strategic: boolean;
}

// ── localStorage key for user-editable overrides per fund ─────────────────────

const LS_KEY = "funds_ext_map";

// Match admin TypeCell: read from `types` array first, fall back to `type` field
function effectiveType(c: Company): string {
  const arr = (c.types as string[] | null) ?? [];
  if (arr.length > 0) return arr[0];
  return c.type ?? "";
}

function companyToFundData(c: Company): FundData {
  const loc = [
    (c as unknown as Record<string, string>).location_city,
    c.location_country,
  ].filter(Boolean).join(", ");
  return {
    id: c.id,
    co: c.name ?? "",
    initials: (c.name ?? "?").split(/\s+/).map((w: string) => w[0] ?? "").join("").slice(0, 2).toUpperCase(),
    desc: c.description ?? "",
    type: effectiveType(c),
    loc,
    stages: [c.stage].filter(Boolean) as string[],
    checkSize: "",
    cleantech: 50,
    techbio: 50,
    overallAlign: 50,
    coInvest: "none",
    coInvestLabel: "No co-invest",
    relHealth: 50,
    owner: "",
    lastContact: "",
    overdue: false,
    nextAction: "",
    dealFlow: "none",
    dealFlowLabel: "None",
    portfolioOverlap: [],
    scores: [
      { label: "Cleantech thesis fit", value: 50, colorClass: "text-green-600" },
      { label: "TechBio thesis fit", value: 50, colorClass: "text-violet-600" },
      { label: "Stage overlap", value: 50, colorClass: "text-blue-600" },
      { label: "Check size fit", value: 50, colorClass: "text-amber-600" },
      { label: "Relationship depth", value: 50, colorClass: "text-slate-600" },
    ],
    recentInvest: [],
    intel: [],
    timeline: [],
    introPath: [],
    keyContacts: [],
    aum: "",
    fundNum: "",
    leadCapable: false,
    strategic: false,
  };
}

// ── Filter pills ───────────────────────────────────────────────────────────────

const FILTER_PILLS = [
  { id: "all",      label: "All funds" },
  { id: "coinvest", label: "Co-investors" },
  { id: "ct",       label: "Cleantech (CT≥60)" },
  { id: "tb",       label: "TechBio (TB≥60)" },
  { id: "lead",     label: "Lead capable" },
  { id: "dealflow", label: "Active deal flow" },
  { id: "warm",     label: "Warm" },
  { id: "overdue",  label: "Overdue" },
] as const;
type FilterId = (typeof FILTER_PILLS)[number]["id"];

type OppUrgency = "high" | "medium" | "low";
type OppType = "Co-invest" | "Introduction" | "Pilot" | "Diligence" | "Customer" | "Value-add";

// ── Helper functions ───────────────────────────────────────────────────────────

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

function relHealthBarColor(v: number): string {
  if (v >= 70) return "bg-emerald-500";
  if (v >= 45) return "bg-blue-500";
  if (v >= 25) return "bg-amber-400";
  return "bg-red-400";
}

function relHealthTextColor(v: number): string {
  if (v >= 70) return "text-emerald-600";
  if (v >= 45) return "text-blue-600";
  if (v >= 25) return "text-amber-600";
  return "text-red-500";
}

function scoreBarColor(v: number): string {
  if (v >= 75) return "bg-emerald-500";
  if (v >= 50) return "bg-blue-500";
  if (v >= 30) return "bg-amber-400";
  return "bg-red-400";
}

function coInvestBadgeClass(status: FundData["coInvest"]): string {
  if (status === "active")    return "bg-emerald-100 text-emerald-700";
  if (status === "potential") return "bg-blue-100 text-blue-700";
  return "bg-slate-100 text-slate-500";
}

function dealFlowBadgeClass(flow: FundData["dealFlow"]): string {
  if (flow === "bidirectional") return "bg-teal-100 text-teal-700";
  if (flow === "inbound")       return "bg-emerald-100 text-emerald-700";
  if (flow === "outbound")      return "bg-blue-100 text-blue-700";
  return "bg-slate-100 text-slate-500";
}

function ownerGradient(owner: string): string {
  if (owner === "Andrew") return "from-blue-500 to-indigo-600";
  if (owner === "Gene")   return "from-violet-500 to-purple-600";
  if (owner === "Lance")  return "from-teal-500 to-cyan-600";
  return "from-slate-400 to-slate-500";
}

function overlapAvatarColor(idx: number): string {
  const colors = [
    "from-blue-500 to-indigo-600",
    "from-emerald-500 to-teal-600",
    "from-violet-500 to-purple-600",
    "from-amber-500 to-orange-600",
    "from-pink-500 to-rose-600",
  ];
  return colors[idx % colors.length];
}

function roleBadgeClass(role: string): string {
  if (role === "Lead investor") return "bg-emerald-100 text-emerald-700";
  if (role === "Co-investor")   return "bg-blue-100 text-blue-700";
  return "bg-slate-100 text-slate-600";
}

function urgencyColors(urgency: OppUrgency): string {
  if (urgency === "high")   return "bg-red-100 text-red-600";
  if (urgency === "medium") return "bg-amber-100 text-amber-600";
  return "bg-slate-100 text-slate-500";
}

const OPP_TYPE_COLORS: Record<string, string> = {
  "Introduction": "bg-amber-100 text-amber-700",
  "Co-invest":    "bg-amber-100 text-amber-700",
  "Pilot":        "bg-emerald-100 text-emerald-700",
  "Diligence":    "bg-violet-100 text-violet-700",
  "Customer":     "bg-blue-100 text-blue-700",
  "Value-add":    "bg-slate-100 text-slate-600",
};

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  initialCompanies: Company[];
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function FundsViewClient({ initialCompanies }: Props) {
  const supabase = createClient();

  const [search, setSearch]             = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterId>("all");
  const [selectedId, setSelectedId]     = useState<string | null>(null);

  // Panel animation
  const [visible, setVisible] = useState(false);

  // Panel tab
  const [fundTab, setFundTab] = useState<"overview" | "opportunities" | "intelligence">("overview");

  // Live contacts from Supabase — keyed by fund id
  const [fundContacts, setFundContacts] = useState<Record<string, Contact[]>>({});

  // Add Fund modal
  const [showAddFund, setShowAddFund]   = useState(false);
  const [addFundName, setAddFundName]   = useState("");
  const [addFundType, setAddFundType]   = useState("");
  const [addFundLoc, setAddFundLoc]     = useState("");
  const [addFundDesc, setAddFundDesc]   = useState("");

  // Auto-generate description state (set while Haiku is generating for selected fund)
  const [descGenerating, setDescGenerating] = useState(false);

  // Double-click field editing in overview
  const [editingFundField, setEditingFundField] = useState<string | null>(null);
  const [fundOverrides, setFundOverrides] = useState<Record<string, Partial<FundData>>>({});

  // Portfolio overlap editing
  const [showAddOverlap, setShowAddOverlap]   = useState(false);
  const [newOverlapName, setNewOverlapName]   = useState("");
  const [newOverlapRole, setNewOverlapRole]   = useState("Co-investor");
  const [confirmRemoveOverlap, setConfirmRemoveOverlap] = useState<string | null>(null);

  // Key contacts
  const [selectedContact, setSelectedContact] = useState<string | null>(null);
  const [fundContactOrder, setFundContactOrder] = useState<Record<string, string[]>>({});
  const fundContactDragIdx = useRef<number | null>(null);

  // Relationship timeline
  const [showAddRelationship, setShowAddRelationship] = useState(false);
  const [newRelTitle, setNewRelTitle]   = useState("");
  const [newRelDate, setNewRelDate]     = useState("");
  const [fundTimelines, setFundTimelines] = useState<Record<string, { icon: string; title: string; date: string; colorClass: string }[]>>({});

  // Opportunities / Tasks tab
  const [fundOpps, setFundOpps] = useState<Record<string, { id: string; title: string; type: string; urgency: string; desc: string; due: string }[]>>({});
  const [showFundOppForm, setShowFundOppForm] = useState(false);
  const [fundOppTitle, setFundOppTitle]   = useState("");
  const [fundOppType, setFundOppType]     = useState<OppType>("Introduction");
  const [fundOppUrgency, setFundOppUrgency] = useState<OppUrgency>("medium");
  const [fundOppDesc, setFundOppDesc]     = useState("");
  const [fundOppDue, setFundOppDue]       = useState("");

  // Per-fund user-editable overrides (loaded from localStorage on mount)
  const [fundExtMap, setFundExtMap] = useState<Record<string, Partial<FundData>>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) setFundExtMap(JSON.parse(raw) as Record<string, Partial<FundData>>);
    } catch {}
  }, []);

  // Map DB companies → FundData, applying any user overrides from localStorage
  const fundList = useMemo<FundData[]>(
    () => initialCompanies.map(c => ({ ...companyToFundData(c), ...(fundExtMap[c.id] ?? {}) })),
    [initialCompanies, fundExtMap]
  );

  // Ref so the selectedId useEffect always reads the latest fundList (avoids stale closure)
  const fundListRef = useRef<FundData[]>(fundList);
  useEffect(() => { fundListRef.current = fundList; }, [fundList]);

  // Ref so the selectedId useEffect always reads the latest fundOverrides
  const fundOverridesRef = useRef<Record<string, Partial<FundData>>>(fundOverrides);
  useEffect(() => { fundOverridesRef.current = fundOverrides; }, [fundOverrides]);

  // Derived stats
  const stats = useMemo(() => ({
    total:          fundList.length,
    activeCoInvest: fundList.filter(f => f.coInvest === "active").length,
    thesisAligned:  fundList.filter(f => f.overallAlign >= 70).length,
    coInvestReady:  fundList.filter(f => f.leadCapable && f.coInvest !== "none").length,
    warmRel:        fundList.filter(f => f.relHealth >= 60).length,
    sourcingActive: fundList.filter(f => f.dealFlow !== "none").length,
    overdue:        fundList.filter(f => f.overdue).length,
  }), [fundList]);

  // Filtered list
  const filtered = useMemo(() => {
    let list = fundList;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(f =>
        f.co.toLowerCase().includes(q) ||
        f.type.toLowerCase().includes(q) ||
        f.loc.toLowerCase().includes(q) ||
        f.desc.toLowerCase().includes(q)
      );
    }
    if (activeFilter === "coinvest")  list = list.filter(f => f.coInvest === "active");
    if (activeFilter === "ct")        list = list.filter(f => f.cleantech >= 60);
    if (activeFilter === "tb")        list = list.filter(f => f.techbio >= 60);
    if (activeFilter === "lead")      list = list.filter(f => f.leadCapable);
    if (activeFilter === "dealflow")  list = list.filter(f => f.dealFlow !== "none");
    if (activeFilter === "warm")      list = list.filter(f => f.relHealth >= 60);
    if (activeFilter === "overdue")   list = list.filter(f => f.overdue);
    return list;
  }, [search, activeFilter, fundList]);

  // When selectedId changes, animate panel, reset tab, fetch contacts, and auto-generate description
  useEffect(() => {
    if (selectedId) {
      setVisible(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
      setFundTab("overview");
      setEditingFundField(null);
      setSelectedContact(null);
      setShowAddOverlap(false);
      setShowAddRelationship(false);
      setShowFundOppForm(false);
      setDescGenerating(false);

      // Fetch contacts if not already loaded
      if (!fundContacts[selectedId]) {
        (async () => {
          try {
            const { data: byCompany } = await supabase
              .from("contacts")
              .select("*")
              .eq("company_id", selectedId)
              .limit(20);
            setFundContacts(prev => ({ ...prev, [selectedId]: (byCompany as Contact[]) ?? [] }));
          } catch {
            setFundContacts(prev => ({ ...prev, [selectedId]: [] }));
          }
        })();
      }

      // Auto-generate description if missing (use refs to avoid stale closure)
      const fund = fundListRef.current.find(f => f.id === selectedId);
      const hasDesc = !!(fund?.desc && fund.desc.trim().length > 0);
      const alreadyOverridden = !!fundOverridesRef.current[selectedId]?.desc;
      if (!hasDesc && !alreadyOverridden) {
        setDescGenerating(true);
        (async () => {
          try {
            const res = await fetch("/api/funds/generate-descriptions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ company_id: selectedId, force: true }),
            });
            const data = await res.json() as { results?: { status: string; description?: string }[] };
            const desc = data.results?.[0]?.description;
            if (desc) {
              // Update local override so it shows immediately
              setFundOverrides(prev => ({
                ...prev,
                [selectedId]: { ...(prev[selectedId] ?? {}), desc },
              }));
            }
          } catch { /* silently fail */ }
          setDescGenerating(false);
        })();
      }
    } else {
      setVisible(false);
      setDescGenerating(false);
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const baseSelected = selectedId
    ? fundList.find(f => f.id === selectedId) ?? null
    : null;

  // Merge with overrides
  const selected = baseSelected
    ? { ...baseSelected, ...(fundOverrides[selectedId!] ?? {}) }
    : null;

  function setFundFieldOverride(field: keyof FundData, value: string) {
    if (!selectedId) return;
    setFundOverrides(prev => ({
      ...prev,
      [selectedId]: { ...(prev[selectedId] ?? {}), [field]: value },
    }));
    // Also persist to localStorage so the override survives page refresh
    setFundExtMap(prev => {
      const next = { ...prev, [selectedId]: { ...(prev[selectedId] ?? {}), [field]: value } };
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  // Get current portfolio overlap (overrides or base)
  function getCurrentOverlap(): { initials: string; name: string; role: string }[] {
    if (!selectedId || !baseSelected) return [];
    const ov = fundOverrides[selectedId];
    if (ov && ov.portfolioOverlap !== undefined) return ov.portfolioOverlap as { initials: string; name: string; role: string }[];
    return baseSelected.portfolioOverlap;
  }

  function addOverlapItem() {
    if (!selectedId || !newOverlapName.trim()) return;
    const current = getCurrentOverlap();
    const initials = newOverlapName.trim().split(/\s+/).map(w => w[0]?.toUpperCase() ?? "").join("").slice(0, 2);
    const updated = [...current, { initials, name: newOverlapName.trim(), role: newOverlapRole }];
    setFundOverrides(prev => ({
      ...prev,
      [selectedId]: { ...(prev[selectedId] ?? {}), portfolioOverlap: updated },
    }));
    setNewOverlapName(""); setNewOverlapRole("Co-investor"); setShowAddOverlap(false);
  }

  function removeOverlapItem(name: string) {
    if (!selectedId) return;
    const current = getCurrentOverlap();
    const updated = current.filter(p => p.name !== name);
    setFundOverrides(prev => ({
      ...prev,
      [selectedId]: { ...(prev[selectedId] ?? {}), portfolioOverlap: updated },
    }));
    setConfirmRemoveOverlap(null);
  }

  // Get merged timeline (manual entries first)
  function getMergedTimeline() {
    if (!selectedId || !baseSelected) return [];
    const manual = fundTimelines[selectedId] ?? [];
    return [...manual, ...baseSelected.timeline];
  }

  function addRelationshipEntry() {
    if (!selectedId || !newRelTitle.trim()) return;
    const entry = { icon: "●", title: newRelTitle.trim(), date: newRelDate || new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), colorClass: "bg-amber-100 text-amber-700" };
    setFundTimelines(prev => ({
      ...prev,
      [selectedId]: [entry, ...(prev[selectedId] ?? [])],
    }));
    setNewRelTitle(""); setNewRelDate(""); setShowAddRelationship(false);
  }

  function addFundOpportunity() {
    if (!selectedId || !fundOppTitle.trim()) return;
    const newOpp = {
      id: String(Date.now()),
      title: fundOppTitle.trim(),
      type: fundOppType,
      urgency: fundOppUrgency,
      desc: fundOppDesc.trim(),
      due: fundOppDue,
    };
    setFundOpps(prev => ({
      ...prev,
      [selectedId]: [newOpp, ...(prev[selectedId] ?? [])],
    }));
    // Bridge to crm_tasks and strategic_tasks_map
    try {
      const taskId = Date.now();
      const linkedCos = selected ? [selected.co] : [];
      const newTask = {
        id: taskId,
        title: fundOppTitle.trim(),
        cat: "Ecosystem",
        init: "ecosystem",
        prio: fundOppUrgency === "high" ? "High" : fundOppUrgency === "medium" ? "Medium" : "Low",
        status: "Not started",
        prog: 0,
        owner: "Andrew",
        cos: linkedCos,
        start: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        due: fundOppDue ? new Date(fundOppDue).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "",
        daysLeft: 0,
        notes: fundOppDesc.trim(),
        risks: [],
        deps: [],
        comments: [],
      };
      const rawMap = localStorage.getItem("strategic_tasks_map") ?? "{}";
      const map = JSON.parse(rawMap) as Record<string, unknown>;
      map[String(taskId)] = newTask;
      localStorage.setItem("strategic_tasks_map", JSON.stringify(map));
      const rawCrm = localStorage.getItem("crm_tasks");
      const crmTasks = rawCrm ? JSON.parse(rawCrm) as unknown[] : [];
      crmTasks.push(newTask);
      localStorage.setItem("crm_tasks", JSON.stringify(crmTasks));
    } catch {}
    setFundOppTitle(""); setFundOppType("Introduction"); setFundOppUrgency("medium"); setFundOppDesc(""); setFundOppDue("");
    setShowFundOppForm(false);
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-slate-50">

      {/* ── Stat cards ──────────────────────────────────────────────────────── */}
      <div className="flex gap-3 px-5 py-4 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0 h-24">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-500"><Building2 size={14} className="text-white" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">Total Funds</p>
            <p className="text-lg font-bold text-slate-900 leading-tight">{stats.total}</p>
            <p className="text-xs text-slate-400">in network</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0 h-24">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-blue-500"><Users size={14} className="text-white" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">Active Co-investors</p>
            <p className="text-lg font-bold text-slate-900 leading-tight">{stats.activeCoInvest}</p>
            <p className="text-xs text-slate-400">co-investing now</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0 h-24">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-emerald-500"><TrendingUp size={14} className="text-white" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">Thesis Aligned</p>
            <p className="text-lg font-bold text-slate-900 leading-tight">{stats.thesisAligned}</p>
            <p className="text-xs text-slate-400">≥70% alignment</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0 h-24">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-violet-500"><CheckCircle2 size={14} className="text-white" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">Co-invest Ready</p>
            <p className="text-lg font-bold text-slate-900 leading-tight">{stats.coInvestReady}</p>
            <p className="text-xs text-slate-400">ready to co-invest</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0 h-24">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-amber-500"><Zap size={14} className="text-white" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">Warm Relationships</p>
            <p className="text-lg font-bold text-slate-900 leading-tight">{stats.warmRel}</p>
            <p className="text-xs text-slate-400">engaged recently</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0 h-24">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-teal-500"><ChevronRight size={14} className="text-white" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">Sourcing Active</p>
            <p className="text-lg font-bold text-slate-900 leading-tight">{stats.sourcingActive}</p>
            <p className="text-xs text-slate-400">active deal flow</p>
          </div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0 h-24">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-red-400"><AlertCircle size={14} className="text-white" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">Overdue Follow-ups</p>
            <p className="text-lg font-bold text-slate-900 leading-tight">{stats.overdue}</p>
            <p className="text-xs text-slate-400">need attention</p>
          </div>
        </div>
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-5 py-2.5 bg-white border-b border-slate-200 flex-shrink-0 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search funds…"
            className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white w-52 focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {FILTER_PILLS.map(p => (
            <button
              key={p.id}
              onClick={() => setActiveFilter(p.id)}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-full border transition-colors",
                activeFilter === p.id
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-400 ml-auto">
          {filtered.length} fund{filtered.length !== 1 ? "s" : ""}
        </span>
        <button
          onClick={() => setShowAddFund(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={13} /> Add Fund
        </button>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* Table */}
        <div className={cn("flex-1 overflow-auto", selectedId ? "mr-[480px]" : "")}>
          <table className="w-full text-xs border-collapse" style={{ minWidth: 1200 }}>
            <thead className="sticky top-0 z-10 bg-slate-100">
              <tr>
                {[
                  "Fund", "Type", "Stage focus", "Thesis alignment",
                  "Check size", "Co-invest status", "Rel. health",
                  "Portfolio overlap", "Deal flow", "Owner",
                  "Last contact", "Next action", "Location",
                ].map(col => (
                  <th
                    key={col}
                    className="text-left px-3 py-2.5 text-[10px] font-semibold text-slate-500 border-b border-slate-200 whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(fund => {
                const isSelected = fund.id === selectedId;
                const rowBorderClass =
                  fund.coInvest === "active"
                    ? "border-l-2 border-l-blue-400"
                    : fund.overdue
                    ? "border-l-2 border-l-red-300"
                    : "";

                return (
                  <tr
                    key={fund.id}
                    onClick={() => setSelectedId(isSelected ? null : fund.id)}
                    className={cn(
                      "border-b border-slate-100 cursor-pointer transition-colors hover:bg-blue-50",
                      isSelected ? "bg-blue-50" : "",
                      rowBorderClass
                    )}
                  >
                    {/* Fund */}
                    <td className="px-3 py-2.5 min-w-[180px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={cn(
                            "w-7 h-7 rounded-md bg-gradient-to-br flex items-center justify-center flex-shrink-0",
                            hashColor(fund.co)
                          )}
                        >
                          <span className="text-white font-bold text-[9px]">{fund.initials}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1 flex-wrap">
                            <p className="text-xs font-medium text-slate-800 truncate max-w-[140px]">{fund.co}</p>
                            {fund.strategic && (
                              <span className="text-[9px] px-1 py-0.5 rounded bg-violet-100 text-violet-700 font-medium flex-shrink-0">
                                Strategic
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 truncate max-w-[160px]">{fund.desc}</p>
                        </div>
                      </div>
                    </td>

                    {/* Type */}
                    <td className="px-3 py-2.5 min-w-[130px]">
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium whitespace-nowrap">
                        {fund.type}
                      </span>
                    </td>

                    {/* Stage focus */}
                    <td className="px-3 py-2.5 min-w-[130px]">
                      <div className="flex flex-wrap gap-0.5">
                        {fund.stages.map(s => (
                          <span
                            key={s}
                            className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium whitespace-nowrap"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Thesis alignment */}
                    <td className="px-3 py-2.5 min-w-[120px]">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-green-600 w-5 flex-shrink-0">CT</span>
                          <div className="w-10 h-1 bg-slate-100 rounded-full overflow-hidden flex-shrink-0">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${fund.cleantech}%` }} />
                          </div>
                          <span className="text-[9px] text-slate-600 tabular-nums">{fund.cleantech}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[9px] text-violet-600 w-5 flex-shrink-0">TB</span>
                          <div className="w-10 h-1 bg-slate-100 rounded-full overflow-hidden flex-shrink-0">
                            <div className="h-full rounded-full bg-violet-500" style={{ width: `${fund.techbio}%` }} />
                          </div>
                          <span className="text-[9px] text-slate-600 tabular-nums">{fund.techbio}</span>
                        </div>
                      </div>
                    </td>

                    {/* Check size */}
                    <td className="px-3 py-2.5 min-w-[100px]">
                      <span className="text-xs font-medium text-slate-700">{fund.checkSize}</span>
                    </td>

                    {/* Co-invest status */}
                    <td className="px-3 py-2.5 min-w-[130px]">
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap",
                        coInvestBadgeClass(fund.coInvest)
                      )}>
                        {fund.coInvestLabel}
                      </span>
                    </td>

                    {/* Rel. health */}
                    <td className="px-3 py-2.5 min-w-[90px]">
                      <div className="flex items-center gap-1.5">
                        <div className="w-9 h-1.5 bg-slate-100 rounded-full overflow-hidden flex-shrink-0">
                          <div
                            className={cn("h-full rounded-full", relHealthBarColor(fund.relHealth))}
                            style={{ width: `${fund.relHealth}%` }}
                          />
                        </div>
                        <span className={cn("text-xs font-semibold tabular-nums w-6 text-right", relHealthTextColor(fund.relHealth))}>
                          {fund.relHealth}
                        </span>
                      </div>
                    </td>

                    {/* Portfolio overlap */}
                    <td className="px-3 py-2.5 min-w-[100px]">
                      {fund.portfolioOverlap.length > 0 ? (
                        <div className="flex items-center gap-0.5">
                          {fund.portfolioOverlap.slice(0, 3).map((p, i) => (
                            <div
                              key={p.name}
                              title={`${p.name} — ${p.role}`}
                              className={cn(
                                "w-6 h-6 rounded-full bg-gradient-to-br flex items-center justify-center flex-shrink-0 border-2 border-white",
                                overlapAvatarColor(i)
                              )}
                            >
                              <span className="text-white font-bold text-[8px]">{p.initials}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>

                    {/* Deal flow */}
                    <td className="px-3 py-2.5 min-w-[110px]">
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap",
                        dealFlowBadgeClass(fund.dealFlow)
                      )}>
                        {fund.dealFlowLabel}
                      </span>
                    </td>

                    {/* Owner */}
                    <td className="px-3 py-2.5 min-w-[80px]">
                      <div className="flex items-center gap-1.5">
                        <div
                          className={cn(
                            "w-5 h-5 rounded-full bg-gradient-to-br flex items-center justify-center flex-shrink-0",
                            ownerGradient(fund.owner)
                          )}
                        >
                          <span className="text-white font-bold text-[8px]">{fund.owner[0]}</span>
                        </div>
                        <span className="text-xs text-slate-600">{fund.owner}</span>
                      </div>
                    </td>

                    {/* Last contact */}
                    <td className="px-3 py-2.5 min-w-[100px]">
                      <span className={cn(
                        "text-xs",
                        fund.overdue ? "text-red-500 font-medium" : "text-slate-500"
                      )}>
                        {fund.lastContact}
                      </span>
                    </td>

                    {/* Next action */}
                    <td className="px-3 py-2.5 min-w-[180px]">
                      <span className="text-[10px] text-slate-500" title={fund.nextAction}>
                        {fund.nextAction.length > 40
                          ? `${fund.nextAction.slice(0, 40)}…`
                          : fund.nextAction}
                      </span>
                    </td>

                    {/* Location */}
                    <td className="px-3 py-2.5 min-w-[130px]">
                      <div className="flex items-center gap-1">
                        <MapPin size={10} className="text-slate-300 flex-shrink-0" />
                        <span className="text-xs text-slate-400">{fund.loc}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={13} className="text-center py-16 text-sm text-slate-400">
                    No funds found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── Side Panel ────────────────────────────────────────────────────── */}
        <div
          className={cn(
            "fixed right-0 top-0 h-full bg-white border-l border-slate-200 shadow-2xl z-30 flex flex-col transition-transform duration-300",
            visible ? "translate-x-0" : "translate-x-full"
          )}
          style={{ width: 480 }}
        >
          {selected && (
            <>
              {/* Header */}
              <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex-shrink-0">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center flex-shrink-0",
                        hashColor(selected.co)
                      )}
                    >
                      <span className="text-white font-bold text-xs">{selected.initials}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-slate-800 truncate">{selected.co}</p>
                      <p className="text-xs text-slate-500">{selected.type} · {selected.loc}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedId(null)}
                    className="text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0 ml-2 mt-0.5"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-1">
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", coInvestBadgeClass(selected.coInvest))}>
                    {selected.coInvestLabel}
                  </span>
                  {selected.leadCapable && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                      Lead capable
                    </span>
                  )}
                  {selected.strategic && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-violet-100 text-violet-700">
                      Strategic
                    </span>
                  )}
                  {selected.overdue && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-red-100 text-red-600">
                      Overdue
                    </span>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-200 flex-shrink-0">
                {(["overview", "opportunities", "intelligence"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setFundTab(tab)}
                    className={cn(
                      "flex-1 text-xs font-medium py-2 transition-colors",
                      fundTab === tab ? "text-blue-600 border-b-2 border-blue-600" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    {tab === "overview" ? "Overview" : tab === "opportunities" ? "Opportunities / Tasks" : "Intelligence"}
                  </button>
                ))}
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">

                {/* ── OVERVIEW TAB ───────────────────────────────────────────── */}
                {fundTab === "overview" && (
                  <>
                    {/* 0. Description — auto-generated by Claude Haiku on first open */}
                    <div className="px-4 py-3 border-b border-slate-100">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Description</p>
                        {descGenerating && (
                          <span className="flex items-center gap-1 text-[10px] text-violet-500">
                            <Sparkles size={10} className="animate-pulse" /> Generating…
                          </span>
                        )}
                      </div>
                      {editingFundField === "desc" ? (
                        <textarea
                          autoFocus
                          defaultValue={selected.desc}
                          rows={3}
                          placeholder="Write a description of this fund…"
                          onBlur={async (e) => {
                            const val = e.target.value.trim();
                            setFundFieldOverride("desc", val);
                            if (selectedId) {
                              await supabase.from("companies").update({ description: val }).eq("id", selectedId);
                            }
                            setEditingFundField(null);
                          }}
                          onKeyDown={e => { if (e.key === "Escape") { setEditingFundField(null); } }}
                          className="text-xs text-slate-700 leading-relaxed w-full border border-blue-300 rounded-md p-2 focus:outline-none resize-none"
                        />
                      ) : (
                        <p
                          className={cn(
                            "text-xs leading-relaxed cursor-pointer select-none",
                            selected.desc ? "text-slate-700" : "text-slate-400 italic"
                          )}
                          onDoubleClick={() => setEditingFundField("desc")}
                          title="Double-click to edit"
                        >
                          {descGenerating
                            ? <span className="text-slate-300 italic">Writing description…</span>
                            : selected.desc || <span className="italic">No description — double-click to write one</span>
                          }
                        </p>
                      )}
                    </div>

                    {/* 1. Overview — editable fields */}
                    <div className="px-4 py-3">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Overview</p>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                        {(
                          [
                            { label: "AUM", field: "aum" as keyof FundData, value: selected.aum },
                            { label: "Fund number", field: "fundNum" as keyof FundData, value: selected.fundNum },
                            { label: "Check size", field: "checkSize" as keyof FundData, value: selected.checkSize },
                            { label: "Stage focus", field: null, value: selected.stages.join(", ") },
                            { label: "Deal flow", field: null, value: selected.dealFlowLabel },
                            { label: "Owner", field: "owner" as keyof FundData, value: selected.owner },
                            { label: "Last contact", field: "lastContact" as keyof FundData, value: selected.lastContact },
                          ]
                        ).map(({ label, field, value }) => (
                          <div key={label}>
                            <p className="text-[10px] text-slate-400 mb-0.5">{label}</p>
                            {field && editingFundField === String(field) ? (
                              <input
                                autoFocus
                                defaultValue={value}
                                onBlur={e => { setFundFieldOverride(field, e.target.value); setEditingFundField(null); }}
                                onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
                                className="text-xs font-medium text-slate-700 border-b border-blue-400 focus:outline-none bg-transparent w-full py-0.5"
                              />
                            ) : (
                              <p
                                className={cn(
                                  "text-xs font-medium",
                                  label === "Last contact" && selected.overdue ? "text-red-500" : "text-slate-700",
                                  field ? "cursor-default select-none hover:text-blue-600" : ""
                                )}
                                onDoubleClick={() => field && setEditingFundField(String(field))}
                                title={field ? "Double-click to edit" : undefined}
                              >
                                {value}
                              </p>
                            )}
                          </div>
                        ))}
                        {/* Rel. health with bar */}
                        <div>
                          <p className="text-[10px] text-slate-400 mb-0.5">Relationship health</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={cn("h-full rounded-full", relHealthBarColor(selected.relHealth))}
                                style={{ width: `${selected.relHealth}%` }}
                              />
                            </div>
                            <span className={cn("text-xs font-semibold tabular-nums", relHealthTextColor(selected.relHealth))}>
                              {selected.relHealth}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 2. Thesis Alignment */}
                    <div className="px-4 py-3">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Thesis Alignment</p>
                      <div className="flex flex-col gap-2">
                        {selected.scores.map(score => (
                          <div key={score.label} className="flex items-center gap-2">
                            <span className="text-xs text-slate-500 w-36 flex-shrink-0">{score.label}</span>
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={cn("h-full rounded-full", scoreBarColor(score.value))}
                                style={{ width: `${score.value}%` }}
                              />
                            </div>
                            <span className={cn("text-xs font-medium w-7 text-right tabular-nums", score.colorClass)}>
                              {score.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 3. Portfolio / Pipeline Overlap — editable */}
                    <div className="px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Portfolio / Pipeline Overlap</p>
                        <button
                          onClick={() => setShowAddOverlap(v => !v)}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          <Plus size={13} />
                        </button>
                      </div>

                      {showAddOverlap && (
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 mb-2 space-y-2">
                          <input
                            value={newOverlapName}
                            onChange={e => setNewOverlapName(e.target.value)}
                            placeholder="Company name"
                            className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400"
                          />
                          <select
                            value={newOverlapRole}
                            onChange={e => setNewOverlapRole(e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400 bg-white"
                          >
                            <option>Co-investor</option>
                            <option>Lead investor</option>
                            <option>Portfolio company</option>
                          </select>
                          <div className="flex gap-2">
                            <button onClick={addOverlapItem} className="flex-1 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors">Add</button>
                            <button onClick={() => { setShowAddOverlap(false); setNewOverlapName(""); }} className="flex-1 py-1 bg-white border border-slate-200 text-slate-600 text-xs rounded hover:bg-slate-50">Cancel</button>
                          </div>
                        </div>
                      )}

                      {(() => {
                        const overlap = getCurrentOverlap();
                        return overlap.length > 0 ? (
                          <div className="flex flex-col gap-2">
                            {overlap.map((p, i) => (
                              <div key={p.name} className="flex items-center gap-2">
                                <div
                                  className={cn(
                                    "w-7 h-7 rounded-full bg-gradient-to-br flex items-center justify-center flex-shrink-0",
                                    overlapAvatarColor(i)
                                  )}
                                >
                                  <span className="text-white font-bold text-[9px]">{p.initials}</span>
                                </div>
                                <span className="text-xs font-medium text-slate-800 flex-1">{p.name}</span>
                                <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", roleBadgeClass(p.role))}>
                                  {p.role}
                                </span>
                                {confirmRemoveOverlap === p.name ? (
                                  <span className="flex items-center gap-1 flex-shrink-0">
                                    <button onMouseDown={() => removeOverlapItem(p.name)} className="text-xs text-red-600 hover:underline font-medium">Yes</button>
                                    <button onMouseDown={() => setConfirmRemoveOverlap(null)} className="text-xs text-slate-400 hover:underline">No</button>
                                  </span>
                                ) : (
                                  <button onClick={() => setConfirmRemoveOverlap(p.name)} className="text-slate-300 hover:text-red-400 flex-shrink-0">
                                    <X size={11} />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400">No overlap</p>
                        );
                      })()}
                    </div>

                    {/* 4. Recent Investments */}
                    <div className="px-4 py-3">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Recent Investments</p>
                      {selected.recentInvest.length > 0 ? (
                        <div className="flex flex-col gap-1.5">
                          {selected.recentInvest.map(inv => (
                            <div
                              key={inv.name}
                              className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-2 bg-slate-50"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-slate-800 truncate">{inv.name}</p>
                                <p className="text-[10px] text-slate-500">{inv.round}</p>
                              </div>
                              <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium whitespace-nowrap">
                                  {inv.sector}
                                </span>
                                <span className="text-[10px] text-slate-400">{inv.date}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400">No recent investments on record</p>
                      )}
                    </div>

                    {/* 5. Intelligence Feed — compact preview in Overview */}
                    {selected.intel.length > 0 && (
                      <div className="px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Intelligence Feed</p>
                          <button onClick={() => setFundTab("intelligence")} className="text-[10px] text-blue-500 hover:underline">See all</button>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {selected.intel.slice(0, 3).map((item, i) => (
                            item.url ? (
                              <a key={i} href={item.url} target="_blank" rel="noopener noreferrer"
                                className="rounded-lg border border-slate-200 px-2.5 py-2 hover:border-blue-300 hover:bg-blue-50 transition-colors block">
                                <p className="text-xs font-medium text-slate-800 flex items-center gap-1">
                                  {item.headline}
                                  <ExternalLink size={9} className="text-blue-400 flex-shrink-0" />
                                </p>
                                <p className="text-[10px] text-slate-400 mt-0.5">{item.meta}</p>
                              </a>
                            ) : (
                              <div key={i} className="rounded-lg border border-slate-200 px-2.5 py-2">
                                <p className="text-xs font-medium text-slate-800">{item.headline}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">{item.meta}</p>
                              </div>
                            )
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 6. Key Contacts — live from Supabase, 200px, scrollable, clickable */}
                    {(() => {
                      const liveContacts = selectedId ? (fundContacts[selectedId] ?? null) : null;
                      // Build display list: prefer live Supabase contacts, fall back to hardcoded
                      const hardcodedNames = selected.keyContacts.map(s => ({
                        displayStr: s,
                        name: s.replace(/\s*\([^)]*\)$/, "").trim(),
                        role: s.match(/\(([^)]+)\)/)?.[1] ?? null,
                      }));

                      return (
                        <div className="px-4 py-3">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Key Contacts</p>
                          <div className="overflow-y-auto flex flex-col gap-1.5" style={{ maxHeight: 200 }}>
                            {liveContacts === null ? (
                              // Still loading
                              <p className="text-[10px] text-slate-400 italic">Loading contacts…</p>
                            ) : liveContacts.length > 0 ? (
                              // Live Supabase contacts — with drag-to-reorder
                              (() => {
                                const order = selectedId ? (fundContactOrder[selectedId] ?? []) : [];
                                const ordered = order.length > 0
                                  ? [...(liveContacts as Contact[])].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
                                  : (liveContacts as Contact[]);
                                return ordered.map((c: Contact, idx: number) => (
                                  <button
                                    key={c.id}
                                    draggable
                                    onDragStart={(e) => { fundContactDragIdx.current = idx; e.dataTransfer.effectAllowed = "move"; }}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={() => {
                                      if (fundContactDragIdx.current === null || fundContactDragIdx.current === idx) return;
                                      const ids = ordered.map((x: Contact) => x.id);
                                      const [moved] = ids.splice(fundContactDragIdx.current, 1);
                                      ids.splice(idx, 0, moved);
                                      setFundContactOrder(prev => ({ ...prev, [selectedId!]: ids }));
                                      fundContactDragIdx.current = null;
                                    }}
                                    onClick={() => setSelectedContact(selectedContact === c.id ? null : c.id)}
                                    className={cn(
                                      "flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors text-left w-full cursor-grab",
                                      selectedContact === c.id
                                        ? "border-blue-300 bg-blue-50"
                                        : "border-slate-100 bg-slate-50 hover:bg-blue-50 hover:border-blue-200"
                                    )}
                                  >
                                    <div className={cn("w-7 h-7 rounded-full bg-gradient-to-br flex items-center justify-center flex-shrink-0", hashColor(`${c.first_name} ${c.last_name}`))}>
                                      <span className="text-white font-bold text-[9px]">{c.first_name[0]}{c.last_name[0]}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-medium text-slate-800 truncate">{c.first_name} {c.last_name}</p>
                                      {c.title && <p className="text-[10px] text-slate-400 truncate">{c.title}</p>}
                                      {(c.location_city || c.location_country) && (
                                        <p className="text-[10px] text-slate-400 truncate">{[c.location_city, c.location_country].filter(Boolean).join(", ")}</p>
                                      )}
                                    </div>
                                    <ChevronRight size={12} className={cn("text-slate-300 flex-shrink-0 transition-transform", selectedContact === c.id && "rotate-90")} />
                                  </button>
                                ));
                              })()
                            ) : (
                              // No live contacts — fall back to hardcoded display
                              hardcodedNames.map((hc, i) => (
                                <button
                                  key={i}
                                  onClick={() => setSelectedContact(selectedContact === hc.displayStr ? null : hc.displayStr)}
                                  className={cn(
                                    "flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors text-left w-full",
                                    selectedContact === hc.displayStr
                                      ? "border-blue-300 bg-blue-50"
                                      : "border-slate-100 bg-slate-50 hover:bg-blue-50 hover:border-blue-200"
                                  )}
                                >
                                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-300 to-slate-400 flex items-center justify-center flex-shrink-0">
                                    <span className="text-white font-bold text-[9px]">{hc.name[0]}</span>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-medium text-slate-700 truncate">{hc.name}</p>
                                    {hc.role && <p className="text-[10px] text-slate-400 truncate">{hc.role}</p>}
                                  </div>
                                  <ChevronRight size={12} className="text-slate-300 flex-shrink-0" />
                                </button>
                              ))
                            )}
                          </div>

                          {/* Contact detail card — rich for live contacts */}
                          {selectedContact && (() => {
                            const live = (liveContacts as Contact[] | null)?.find((c: Contact) => c.id === selectedContact);
                            if (live) {
                              return (
                                <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs font-semibold text-blue-800">{live.first_name} {live.last_name}</p>
                                    <button onClick={() => setSelectedContact(null)} className="text-blue-400 hover:text-blue-600"><X size={12} /></button>
                                  </div>
                                  {live.title && <p className="text-[10px] text-blue-600 font-medium">{live.title}</p>}
                                  {live.email && (
                                    <a href={`mailto:${live.email}`} className="flex items-center gap-1 text-[10px] text-blue-700 hover:underline truncate">
                                      <ExternalLink size={9} className="flex-shrink-0" />{live.email}
                                    </a>
                                  )}
                                  {live.phone && <p className="text-[10px] text-blue-600">{live.phone}</p>}
                                  {live.last_contact_date && (
                                    <p className="text-[10px] text-blue-500">Last contact: {formatDate(live.last_contact_date)}</p>
                                  )}
                                  {live.location_city && (
                                    <p className="text-[10px] text-blue-400">{live.location_city}{live.location_country ? `, ${live.location_country}` : ""}</p>
                                  )}
                                  {live.linkedin_url && (
                                    <a href={live.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-blue-700 hover:underline">
                                      <ExternalLink size={9} className="flex-shrink-0" />LinkedIn
                                    </a>
                                  )}
                                </div>
                              );
                            }
                            // Fallback for hardcoded contact string
                            const hcStr = typeof selectedContact === "string" ? selectedContact : null;
                            if (hcStr) {
                              const name = hcStr.replace(/\s*\([^)]*\)$/, "").trim();
                              const role = hcStr.match(/\(([^)]+)\)/)?.[1];
                              return (
                                <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                                  <div className="flex items-center justify-between mb-1">
                                    <p className="text-xs font-semibold text-blue-800">{name}</p>
                                    <button onClick={() => setSelectedContact(null)} className="text-blue-400 hover:text-blue-600"><X size={12} /></button>
                                  </div>
                                  {role && <p className="text-[10px] text-blue-600">{role}</p>}
                                  <p className="text-[10px] text-blue-400 mt-1 italic">Not yet in contacts database</p>
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      );
                    })()}

                    {/* 7. Relationship Timeline — with + Add button */}
                    <div className="px-4 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Relationship Timeline</p>
                        <button onClick={() => setShowAddRelationship(v => !v)} className="text-blue-600 hover:text-blue-700">
                          <Plus size={13} />
                        </button>
                      </div>

                      {showAddRelationship && (
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 mb-3 space-y-2">
                          <input
                            value={newRelTitle}
                            onChange={e => setNewRelTitle(e.target.value)}
                            placeholder="Relationship event title"
                            className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400"
                          />
                          <input
                            type="date"
                            value={newRelDate}
                            onChange={e => setNewRelDate(e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400"
                          />
                          <div className="flex gap-2">
                            <button onClick={addRelationshipEntry} className="flex-1 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors">Add</button>
                            <button onClick={() => { setShowAddRelationship(false); setNewRelTitle(""); setNewRelDate(""); }} className="flex-1 py-1 bg-white border border-slate-200 text-slate-600 text-xs rounded hover:bg-slate-50">Cancel</button>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-col">
                        {getMergedTimeline().map((entry, i) => {
                          const allEntries = getMergedTimeline();
                          return (
                            <div key={i} className="flex items-start gap-2 relative">
                              {i < allEntries.length - 1 && (
                                <div className="absolute left-2.5 top-5 w-px bg-slate-200" style={{ height: "calc(100% - 4px)" }} />
                              )}
                              <div
                                className={cn(
                                  "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-bold z-10",
                                  entry.colorClass
                                )}
                              >
                                {entry.icon}
                              </div>
                              <div className="pb-3 min-w-0">
                                <p className="text-xs font-medium text-slate-800">{entry.title}</p>
                                <p className="text-[10px] text-slate-400">{entry.date}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}

                {/* ── OPPORTUNITIES / TASKS TAB ──────────────────────────────── */}
                {fundTab === "opportunities" && (
                  <div className="px-4 py-3 space-y-4">
                    {/* Opportunities */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Opportunities</p>
                        <button onClick={() => setShowFundOppForm(v => !v)} className="text-blue-600 hover:text-blue-700">
                          <Plus size={14} />
                        </button>
                      </div>

                      {showFundOppForm && (
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-3 space-y-2">
                          <input
                            value={fundOppTitle}
                            onChange={e => setFundOppTitle(e.target.value)}
                            placeholder="Opportunity / task title"
                            className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400"
                          />
                          <div className="flex gap-2">
                            <select
                              value={fundOppType}
                              onChange={e => setFundOppType(e.target.value as OppType)}
                              className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400 bg-white"
                            >
                              {(["Co-invest", "Introduction", "Pilot", "Diligence", "Customer", "Value-add"] as OppType[]).map(t => (
                                <option key={t}>{t}</option>
                              ))}
                            </select>
                            <select
                              value={fundOppUrgency}
                              onChange={e => setFundOppUrgency(e.target.value as OppUrgency)}
                              className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400 bg-white"
                            >
                              <option value="high">High</option>
                              <option value="medium">Medium</option>
                              <option value="low">Low</option>
                            </select>
                          </div>
                          <textarea
                            value={fundOppDesc}
                            onChange={e => setFundOppDesc(e.target.value)}
                            placeholder="Description (optional)"
                            rows={2}
                            className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400 resize-none"
                          />
                          <div className="flex items-center gap-2">
                            <label className="text-[10px] text-slate-500 flex-shrink-0">Action date</label>
                            <input
                              type="date"
                              value={fundOppDue}
                              onChange={e => setFundOppDue(e.target.value)}
                              className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400"
                            />
                          </div>
                          <div className="flex gap-2">
                            <button onClick={addFundOpportunity} className="flex-1 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors">Add</button>
                            <button onClick={() => { setShowFundOppForm(false); setFundOppTitle(""); setFundOppDesc(""); setFundOppDue(""); }} className="flex-1 py-1 bg-white border border-slate-200 text-slate-600 text-xs rounded hover:bg-slate-50">Cancel</button>
                          </div>
                        </div>
                      )}

                      {(fundOpps[selected.id] ?? []).length === 0 && !showFundOppForm && (
                        <p className="text-xs text-slate-400">No opportunities yet</p>
                      )}
                      <div className="space-y-2">
                        {(fundOpps[selected.id] ?? []).map(opp => {
                          const isOverdue = opp.due && new Date(opp.due) < new Date(new Date().toDateString());
                          return (
                            <div key={opp.id} className={cn("border rounded-lg p-2.5 bg-white", isOverdue ? "border-red-300 bg-red-50" : "border-slate-200")}>
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-xs font-semibold text-slate-800 min-w-0 truncate">{opp.title}</p>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", OPP_TYPE_COLORS[opp.type] ?? "bg-slate-100 text-slate-600")}>{opp.type}</span>
                                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", urgencyColors(opp.urgency as OppUrgency))}>{opp.urgency}</span>
                                  {isOverdue && <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-600">Overdue</span>}
                                </div>
                              </div>
                              {opp.desc && <p className="text-xs text-slate-500 mt-0.5">{opp.desc}</p>}
                              {opp.due && (
                                <p className={cn("text-[10px] mt-0.5", isOverdue ? "text-red-500 font-medium" : "text-slate-400")}>
                                  Due {opp.due}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Linked tasks from localStorage crm_tasks */}
                    {(() => {
                      try {
                        const raw = localStorage.getItem("crm_tasks");
                        if (!raw) return null;
                        const allTasks = JSON.parse(raw) as Array<{ id: number; title: string; status: string; prio: string; due: string; cos: string[]; cat: string }>;
                        const linked = allTasks.filter(t => t.cos?.some((c: string) => c.toLowerCase() === (selected?.co ?? "").toLowerCase()));
                        if (linked.length === 0) return null;
                        return (
                          <div>
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
                )}

                {/* ── INTELLIGENCE TAB ─────────────────────────────────────── */}
                {fundTab === "intelligence" && (
                  <div className="px-4 py-3">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-3">Intelligence Feed</p>
                    {selected.intel.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No intelligence items yet</p>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {selected.intel.map((item, i) => (
                          item.url ? (
                            <a key={i} href={item.url} target="_blank" rel="noopener noreferrer"
                              className="rounded-xl border border-slate-200 px-3 py-2.5 hover:border-blue-300 hover:bg-blue-50 transition-colors block">
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-xs font-medium text-slate-800">{item.headline}</p>
                                <ExternalLink size={10} className="text-blue-400 flex-shrink-0 mt-0.5" />
                              </div>
                              <p className="text-[10px] text-slate-400 mt-0.5">{item.meta}</p>
                            </a>
                          ) : (
                            <div key={i} className="rounded-xl border border-slate-200 px-3 py-2.5">
                              <p className="text-xs font-medium text-slate-800">{item.headline}</p>
                              <p className="text-[10px] text-slate-400 mt-0.5">{item.meta}</p>
                            </div>
                          )
                        ))}
                      </div>
                    )}
                  </div>
                )}

              </div>

              {/* Footer buttons */}
              <div className="px-4 py-3 border-t border-slate-100 flex-shrink-0">
                <div className="flex gap-2">
                  <button className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors">
                    <ExternalLink size={11} />
                    Email
                  </button>
                  <button className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors">
                    <ExternalLink size={11} />
                    Co-invest brief
                  </button>
                  <button className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors">
                    <ExternalLink size={11} />
                    Find overlap
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

      </div>

      {/* ── Add Fund Modal ───────────────────────────────────────────────────── */}
      {showAddFund && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold text-slate-800">Add Fund</h2>
              <button onClick={() => setShowAddFund(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Fund Name *</label>
                <input
                  value={addFundName}
                  onChange={e => setAddFundName(e.target.value)}
                  placeholder="e.g. Lowercarbon Capital"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Type</label>
                <input
                  value={addFundType}
                  onChange={e => setAddFundType(e.target.value)}
                  placeholder="e.g. Climate VC, Corporate VC"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Location</label>
                <input
                  value={addFundLoc}
                  onChange={e => setAddFundLoc(e.target.value)}
                  placeholder="e.g. San Francisco, USA"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  value={addFundDesc}
                  onChange={e => setAddFundDesc(e.target.value)}
                  placeholder="Brief description…"
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 resize-none"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => {
                  // Close modal without persisting (hardcoded data)
                  setAddFundName(""); setAddFundType(""); setAddFundLoc(""); setAddFundDesc("");
                  setShowAddFund(false);
                }}
                disabled={!addFundName.trim()}
                className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Check size={14} /> Add Fund
              </button>
              <button
                onClick={() => setShowAddFund(false)}
                className="flex-1 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
