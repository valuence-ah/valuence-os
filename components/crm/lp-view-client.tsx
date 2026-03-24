"use client";
// ─── LP CRM — metrics · table · kanban · map · detail panel · AI features ─────

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Company, Contact, Interaction } from "@/lib/types";
import { cn, formatDate, formatCurrency, getInitials, timeAgo } from "@/lib/utils";
import {
  Search, X, ExternalLink, Mail, Phone, User, MapPin, ChevronRight,
  Download, Plus, Target, TrendingUp, DollarSign,
  BarChart2, AlertCircle, CheckSquare, Video,
  ChevronDown, ChevronUp, ChevronsUpDown, MoreHorizontal, Loader2, ArrowUpRight, FileText,
  Pencil, Check, LayoutGrid, List, Globe, Wand2, Send, Copy, RefreshCw,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const OWNERS = ["Andrew", "Gene", "Lance"] as const;
type Owner = typeof OWNERS[number];

const LP_TYPE_OPTIONS = [
  "Anchor", "Family Office", "Strategic", "Sovereign Wealth",
  "Financial Institution", "Other",
] as const;
const LP_TYPE_BADGE: Record<string, string> = {
  "Anchor":               "bg-indigo-100 text-indigo-700",
  "Family Office":        "bg-purple-100 text-purple-700",
  "Strategic":            "bg-teal-100 text-teal-700",
  "Sovereign Wealth":     "bg-amber-100 text-amber-700",
  "Financial Institution":"bg-sky-100 text-sky-700",
  "Other":                "bg-slate-100 text-slate-600",
};
function getLpTypeBadge(t: string | null) { return LP_TYPE_BADGE[t ?? ""] ?? "bg-gray-100 text-gray-600"; }

const LP_STAGE_OPTIONS = [
  "Lead", "Initial Meeting", "Discussion in Process",
  "Due Diligence", "Committed", "Passed",
] as const;
const STAGE_DOT:  Record<string, string> = {
  Lead: "bg-slate-400", "Initial Meeting": "bg-blue-500",
  "Discussion in Process": "bg-amber-500", "Due Diligence": "bg-violet-500",
  Committed: "bg-emerald-500", Passed: "bg-red-400",
};
const STAGE_TEXT: Record<string, string> = {
  Lead: "text-slate-600", "Initial Meeting": "text-blue-700",
  "Discussion in Process": "text-amber-700", "Due Diligence": "text-violet-700",
  Committed: "text-emerald-700", Passed: "text-red-600",
};
const STAGE_BG: Record<string, string> = {
  Lead: "bg-slate-50", "Initial Meeting": "bg-blue-50",
  "Discussion in Process": "bg-amber-50", "Due Diligence": "bg-violet-50",
  Committed: "bg-emerald-50", Passed: "bg-red-50",
};

const TIER_OPTIONS = ["Tier 1", "Tier 2", "Tier 3"] as const;
const TIER_TO_PRIORITY: Record<string, "High" | "Medium" | "Low"> = { "Tier 1": "High", "Tier 2": "Medium", "Tier 3": "Low" };
const PRIORITY_TO_TIER: Record<string, string> = { High: "Tier 1", Medium: "Tier 2", Low: "Tier 3" };

const COINVEST_SECTORS = ["Cleantech", "Techbio", "Other"] as const;

// DDQ — derived from stage (read-only)
const DDQ_COLOR: Record<string, string> = {
  "Not Started": "bg-slate-100 text-slate-500",
  "In Progress": "bg-blue-100 text-blue-700",
  "Complete":    "bg-emerald-100 text-emerald-700",
  "N/A":         "bg-slate-100 text-slate-400",
};
function getDdqLabel(stage: string | null): string {
  if (!stage || ["Lead", "Initial Meeting", "Discussion in Process"].includes(stage)) return "Not Started";
  if (stage === "Due Diligence") return "In Progress";
  if (stage === "Committed")     return "Complete";
  return "N/A";
}
function getDdqColor(l: string) { return DDQ_COLOR[l] ?? "bg-slate-100 text-slate-500"; }

function calcProb(stage: string | null): number {
  if (stage === "Lead") return 0;
  if (stage === "Initial Meeting") return 0.05;
  if (stage === "Discussion in Process") return 0.10;
  if (stage === "Due Diligence") return 0.25;
  if (stage === "Committed") return 1.0;
  return 0;
}

function fmt(v: number | null | undefined) { return formatCurrency(v, true); }
function pct(p: number) { return p === 0 ? "0%" : `${Math.round(p * 100)}%`; }

// ── Column widths ─────────────────────────────────────────────────────────────
const DEFAULT_COL_WIDTHS: Record<string, number> = {
  Company: 180, "LP Type": 110, Tier: 75, Stage: 150,
  "Commit Goal": 110, Expected: 100, "Prob %": 100,
  "Last Touchpoint": 130, "Last Contact": 120,
  "DDQ Status": 110, "Co-invest": 90, "Sector": 90,
  Owner: 90, City: 80, Country: 90,
};

// ── Small helpers ─────────────────────────────────────────────────────────────
function CompanyLogo({ company, size = "md" }: { company: Company; size?: "sm" | "md" | "lg" }) {
  const [err, setErr] = useState(false);
  const sz = size === "sm" ? "w-7 h-7 text-[9px]" : size === "lg" ? "w-12 h-12 text-sm" : "w-9 h-9 text-xs";
  const domain = company.website?.replace(/^https?:\/\//, "").split("/")[0];
  const src = company.logo_url ?? (domain ? `https://logo.clearbit.com/${domain}` : null);
  useEffect(() => setErr(false), [src]);
  if (src && !err) return <img src={src} alt={company.name} onError={() => setErr(true)} className={`${sz} rounded-md object-contain bg-white border border-slate-200 p-0.5 flex-shrink-0`} />;
  return <div className={`${sz} rounded-md bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0`}><span className="text-white font-bold">{getInitials(company.name)}</span></div>;
}

function InteractionIcon({ type }: { type: string }) {
  if (type === "email")   return <Mail size={11} className="text-blue-500" />;
  if (type === "call")    return <Phone size={11} className="text-green-500" />;
  if (type === "meeting") return <Video size={11} className="text-violet-500" />;
  return <FileText size={11} className="text-slate-400" />;
}

function AlignmentBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-[11px] text-slate-600">{label}</span>
        <span className="text-[11px] font-semibold text-slate-700">{value}%</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", value >= 75 ? "bg-emerald-500" : value >= 50 ? "bg-amber-400" : "bg-slate-300")} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

// Custom stage dropdown
function StagePicker({ value, onChange }: { value: string; onChange: (s: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-2 py-1.5 border border-slate-200 rounded-md bg-white hover:border-blue-300 transition-colors text-left">
        {value ? (
          <><span className={cn("w-2 h-2 rounded-full flex-shrink-0", STAGE_DOT[value])} /><span className={cn("text-xs flex-1", STAGE_TEXT[value])}>{value}</span></>
        ) : <span className="text-xs text-slate-400 flex-1">Not set</span>}
        <ChevronDown size={12} className="text-slate-400 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1 overflow-hidden">
          <button onClick={() => { onChange(""); setOpen(false); }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-50 text-left">
            <span className="w-2 h-2 rounded-full bg-slate-200 flex-shrink-0" />
            <span className="text-xs text-slate-400">Not set</span>
            {!value && <Check size={10} className="ml-auto text-blue-600" />}
          </button>
          {LP_STAGE_OPTIONS.map(s => (
            <button key={s} onClick={() => { onChange(s); setOpen(false); }}
              className={cn("w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-50 text-left", value === s ? STAGE_BG[s] : "")}>
              <span className={cn("w-2 h-2 rounded-full flex-shrink-0", STAGE_DOT[s])} />
              <span className={cn("text-xs", STAGE_TEXT[s])}>{s}</span>
              {value === s && <Check size={10} className="ml-auto text-blue-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Markdown-ish renderer for AI output
function AiMarkdown({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="text-sm text-slate-700 space-y-1.5">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        const bold = line.replace(/\*\*(.*?)\*\*/g, (_: string, m: string) => `<strong>${m}</strong>`);
        const isHeading = line.startsWith("**") && line.endsWith("**");
        if (isHeading) return <p key={i} className="text-xs font-bold text-slate-900 uppercase tracking-wide mt-3 mb-1" dangerouslySetInnerHTML={{ __html: bold }} />;
        const isBullet = line.startsWith("•") || line.startsWith("-") || line.match(/^\d+\./);
        if (isBullet) return <p key={i} className="pl-3 text-xs text-slate-600" dangerouslySetInnerHTML={{ __html: `&nbsp;&nbsp;${bold}` }} />;
        return <p key={i} className="text-xs text-slate-700" dangerouslySetInnerHTML={{ __html: bold }} />;
      })}
    </div>
  );
}

// ── Kanban view ───────────────────────────────────────────────────────────────
function KanbanView({ companies, onSelect, selectedId, lastTouchMap }: {
  companies: Company[]; onSelect: (id: string) => void;
  selectedId: string | null; lastTouchMap: Record<string, { date: string; type: string }>;
}) {
  const unassigned = companies.filter(c => !c.lp_stage);
  return (
    <div className="flex gap-3 p-4 overflow-x-auto h-full items-start">
      {LP_STAGE_OPTIONS.map(stage => {
        const items = companies.filter(c => c.lp_stage === stage);
        const total = items.reduce((s, c) => s + (c.commitment_goal ?? 0), 0);
        return (
          <div key={stage} className="flex-shrink-0 w-52 flex flex-col">
            <div className={cn("flex items-center gap-2 px-3 py-2 rounded-t-xl border border-b-0", STAGE_BG[stage] ?? "bg-slate-50", "border-slate-200")}>
              <span className={cn("w-2 h-2 rounded-full flex-shrink-0", STAGE_DOT[stage])} />
              <span className={cn("text-xs font-semibold flex-1", STAGE_TEXT[stage])}>{stage}</span>
              <span className="text-[11px] text-slate-400">{items.length}</span>
            </div>
            {total > 0 && <div className="px-3 py-1 bg-white border-x border-slate-200"><span className="text-[10px] text-slate-400">{fmt(total)}</span></div>}
            <div className="flex flex-col gap-2 p-2 bg-slate-50 border border-slate-200 rounded-b-xl min-h-[80px] overflow-y-auto max-h-[calc(100vh-320px)]">
              {items.map(co => {
                const touch = lastTouchMap[co.id];
                const overdue = touch ? (Date.now() - new Date(touch.date).getTime()) / 86_400_000 > 30 : false;
                return (
                  <div key={co.id} onClick={() => onSelect(co.id)}
                    className={cn("bg-white rounded-lg p-2.5 border cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all", selectedId === co.id ? "border-blue-400 shadow-sm" : "border-slate-200")}>
                    <div className="flex items-start gap-2 mb-1.5">
                      <CompanyLogo company={co} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-800 leading-tight truncate">{co.name}</p>
                        {co.lp_type && <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium mt-0.5 inline-block", getLpTypeBadge(co.lp_type))}>{co.lp_type}</span>}
                      </div>
                    </div>
                    {co.commitment_goal && <p className="text-[11px] text-slate-600 tabular-nums">{fmt(co.commitment_goal)}</p>}
                    {touch && (
                      <div className="flex items-center gap-1 mt-1">
                        <InteractionIcon type={touch.type} />
                        <span className={cn("text-[10px]", overdue ? "text-red-500" : "text-slate-400")}>{timeAgo(touch.date)}</span>
                        {overdue && <AlertCircle size={9} className="text-red-400" />}
                      </div>
                    )}
                  </div>
                );
              })}
              {items.length === 0 && <p className="text-[11px] text-slate-300 text-center py-4">Empty</p>}
            </div>
          </div>
        );
      })}
      {unassigned.length > 0 && (
        <div className="flex-shrink-0 w-52 flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2 rounded-t-xl border border-b-0 bg-slate-50 border-slate-200">
            <span className="w-2 h-2 rounded-full flex-shrink-0 bg-slate-300" />
            <span className="text-xs font-semibold flex-1 text-slate-500">No Stage</span>
            <span className="text-[11px] text-slate-400">{unassigned.length}</span>
          </div>
          <div className="flex flex-col gap-2 p-2 bg-slate-50 border border-slate-200 rounded-b-xl min-h-[80px]">
            {unassigned.map(co => (
              <div key={co.id} onClick={() => onSelect(co.id)}
                className={cn("bg-white rounded-lg p-2.5 border cursor-pointer hover:border-blue-300", selectedId === co.id ? "border-blue-400" : "border-slate-200")}>
                <div className="flex items-center gap-2"><CompanyLogo company={co} size="sm" /><p className="text-xs font-semibold text-slate-800 truncate">{co.name}</p></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Map view ──────────────────────────────────────────────────────────────────
const REGION_MAP: Record<string, string> = {
  "United States": "Americas", "Canada": "Americas", "Brazil": "Americas", "Mexico": "Americas",
  "United Kingdom": "Europe", "Germany": "Europe", "France": "Europe", "Sweden": "Europe",
  "Netherlands": "Europe", "Switzerland": "Europe", "Denmark": "Europe", "Norway": "Europe",
  "Finland": "Europe", "Spain": "Europe", "Italy": "Europe", "Belgium": "Europe",
  "Luxembourg": "Europe", "Austria": "Europe", "Portugal": "Europe",
  "UAE": "Middle East & Africa", "Saudi Arabia": "Middle East & Africa", "Qatar": "Middle East & Africa",
  "Kuwait": "Middle East & Africa", "Bahrain": "Middle East & Africa", "Israel": "Middle East & Africa",
  "South Africa": "Middle East & Africa",
  "Japan": "Asia-Pacific", "China": "Asia-Pacific", "South Korea": "Asia-Pacific",
  "Singapore": "Asia-Pacific", "Hong Kong": "Asia-Pacific", "Australia": "Asia-Pacific",
  "New Zealand": "Asia-Pacific", "India": "Asia-Pacific", "Taiwan": "Asia-Pacific",
};
const REGIONS = ["Americas", "Europe", "Middle East & Africa", "Asia-Pacific", "Other"];
const REGION_COLOR: Record<string, string> = { "Americas": "border-blue-200 bg-blue-50", "Europe": "border-emerald-200 bg-emerald-50", "Middle East & Africa": "border-amber-200 bg-amber-50", "Asia-Pacific": "border-violet-200 bg-violet-50", "Other": "border-slate-200 bg-slate-50" };
const REGION_HEADER: Record<string, string> = { "Americas": "text-blue-700 bg-blue-100", "Europe": "text-emerald-700 bg-emerald-100", "Middle East & Africa": "text-amber-700 bg-amber-100", "Asia-Pacific": "text-violet-700 bg-violet-100", "Other": "text-slate-600 bg-slate-100" };

function MapView({ companies, onSelect, selectedId }: { companies: Company[]; onSelect: (id: string) => void; selectedId: string | null }) {
  const byRegion = useMemo(() => {
    const map: Record<string, Company[]> = {};
    for (const reg of REGIONS) map[reg] = [];
    for (const co of companies) map[REGION_MAP[co.location_country ?? ""] ?? "Other"].push(co);
    return map;
  }, [companies]);
  return (
    <div className="flex-1 overflow-auto p-5">
      <div className="grid grid-cols-5 gap-3 mb-5">
        {REGIONS.map(reg => {
          const items = byRegion[reg];
          const total = items.reduce((s, c) => s + (c.commitment_goal ?? 0), 0);
          return (
            <div key={reg} className={cn("rounded-xl border p-3", REGION_COLOR[reg])}>
              <p className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full inline-block mb-2", REGION_HEADER[reg])}>{reg}</p>
              <p className="text-2xl font-bold text-slate-800">{items.length}</p>
              <p className="text-[11px] text-slate-500">LP{items.length !== 1 ? "s" : ""}</p>
              {total > 0 && <p className="text-xs font-semibold text-slate-700 mt-1">{fmt(total)}</p>}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-4">
        {REGIONS.map(reg => {
          const items = byRegion[reg];
          if (!items.length) return null;
          const byCountry: Record<string, Company[]> = {};
          for (const co of items) { const c = co.location_country ?? "Unknown"; if (!byCountry[c]) byCountry[c] = []; byCountry[c].push(co); }
          return (
            <div key={reg} className={cn("rounded-xl border p-4", REGION_COLOR[reg])}>
              <h3 className={cn("text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-full inline-block mb-3", REGION_HEADER[reg])}>{reg}</h3>
              <div className="space-y-3">
                {Object.entries(byCountry).sort((a, b) => b[1].length - a[1].length).map(([country, cos]) => (
                  <div key={country}>
                    <div className="flex items-center gap-2 mb-1.5"><MapPin size={11} className="text-slate-400 flex-shrink-0" /><span className="text-xs font-semibold text-slate-700">{country}</span><span className="text-[10px] text-slate-400 ml-auto">{cos.length} LP{cos.length !== 1 ? "s" : ""}</span></div>
                    <div className="flex flex-wrap gap-1.5">
                      {cos.map(co => (
                        <button key={co.id} onClick={() => onSelect(co.id)}
                          className={cn("flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium transition-all", selectedId === co.id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:text-blue-700")}>
                          <CompanyLogo company={co} size="sm" />{co.name}
                          {co.lp_stage && <span className={cn("w-1.5 h-1.5 rounded-full", STAGE_DOT[co.lp_stage])} />}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Filter pills ──────────────────────────────────────────────────────────────
const FILTER_PILLS = [
  { id: "all",      label: "All" },
  { id: "anchor",   label: "Anchor" },
  { id: "family",   label: "Family Office" },
  { id: "overdue",  label: "Overdue follow-ups" },
  { id: "coinvest", label: "Co-invest interest" },
] as const;
type FilterId = typeof FILTER_PILLS[number]["id"];

// ── Add LP modal ──────────────────────────────────────────────────────────────
interface AddLPForm {
  name: string; owner: string; lp_stage: string;
  commitment_goal: string; location_city: string; location_country: string;
  contact: { first_name: string; last_name: string; email: string; title: string; location_city: string; location_country: string } | null;
}
const EMPTY_ADD_LP: AddLPForm = { name: "", owner: "", lp_stage: "", commitment_goal: "", location_city: "", location_country: "", contact: null };
const EMPTY_CONTACT = { first_name: "", last_name: "", email: "", title: "", location_city: "", location_country: "" };

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
interface Props { initialCompanies: Company[] }

export function LpViewClient({ initialCompanies }: Props) {
  const supabase = createClient();

  // Core
  const [companies, setCompanies]         = useState<Company[]>(initialCompanies);
  const [selectedId, setSelectedId]       = useState<string | null>(null);
  const [search, setSearch]               = useState("");
  const [activeFilter, setActiveFilter]   = useState<FilterId>("all");
  const [viewMode, setViewMode]           = useState<"table" | "kanban" | "map">("table");
  const [contacts, setContacts]           = useState<Contact[]>([]);
  const [interactions, setInteractions]   = useState<Interaction[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Always re-fetch companies from Supabase on mount — bypasses Next.js Router Cache
  // which can replay stale initialCompanies after client-side navigation.
  useEffect(() => {
    supabase
      .from("companies")
      .select("*")
      .contains("types", ["limited partner"])
      .order("name", { ascending: true })
      .limit(10000)
      .then(({ data }) => { if (data) setCompanies(data as Company[]); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Panel edit state
  const [editStage, setEditStage]     = useState("");
  const [editGoal, setEditGoal]       = useState("");
  const [editLpType, setEditLpType]   = useState("");
  const [editCity, setEditCity]       = useState("");
  const [editCountry, setEditCountry] = useState("");

  // Sort + city/country filters
  const [sortCol, setSortCol]     = useState<string | null>(null);
  const [sortDir, setSortDir]     = useState<"asc" | "desc">("asc");
  const [filterCity, setFilterCity]       = useState("");
  const [filterCountry, setFilterCountry] = useState("");

  // localStorage maps — co-invest, owner
  const [coinvestMap, setCoinvestMap] = useState<Record<string, { interest: "Yes" | "No" | ""; sector: string }>>({});
  const [ownerMap, setOwnerMap]       = useState<Record<string, string>>({});

  useEffect(() => {
    try {
      const ci = localStorage.getItem("lp_coinvest_map"); if (ci) setCoinvestMap(JSON.parse(ci));
      const ow = localStorage.getItem("lp_owner_map");    if (ow) setOwnerMap(JSON.parse(ow));
    } catch {}
  }, []);

  function saveCoinvest(id: string, interest: "Yes" | "No" | "", sector: string) {
    setCoinvestMap(prev => { const n = { ...prev, [id]: { interest, sector } }; localStorage.setItem("lp_coinvest_map", JSON.stringify(n)); return n; });
  }
  function saveOwner(id: string, owner: string) {
    setOwnerMap(prev => { const n = { ...prev, [id]: owner }; localStorage.setItem("lp_owner_map", JSON.stringify(n)); return n; });
  }

  // Fund target
  const [fundTarget, setFundTarget]               = useState(0);
  const [editingFundTarget, setEditingFundTarget] = useState(false);
  const [fundTargetInput, setFundTargetInput]     = useState("");
  const fundTargetRef = useRef<HTMLInputElement>(null);

  useEffect(() => { const s = localStorage.getItem("lp_fund_target"); if (s) setFundTarget(parseFloat(s) || 0); }, []);
  useEffect(() => { if (editingFundTarget) { setFundTargetInput(fundTarget > 0 ? String(fundTarget) : ""); setTimeout(() => fundTargetRef.current?.focus(), 50); } }, [editingFundTarget, fundTarget]);

  function saveFundTarget() {
    const val = parseFloat(fundTargetInput.replace(/[^0-9.]/g, "")) || 0;
    setFundTarget(val); localStorage.setItem("lp_fund_target", String(val)); setEditingFundTarget(false);
  }

  // Contacts manage
  const [contactsManaging, setContactsManaging]     = useState(false);
  const [showAddContactForm, setShowAddContactForm] = useState(false);
  const [newContact, setNewContact]                 = useState(EMPTY_CONTACT);
  const [addingContact, setAddingContact]           = useState(false);

  // Activity
  const [addingActivity, setAddingActivity] = useState(false);
  const [activityDate, setActivityDate]     = useState(() => new Date().toISOString().slice(0, 10));
  const [activityType, setActivityType]     = useState<"call" | "meeting" | "email">("call");
  const [activityNote, setActivityNote]     = useState("");
  const [savingActivity, setSavingActivity] = useState(false);

  // Fireflies summary state per selected company
  const [ffLoading, setFfLoading]   = useState(false);
  const [ffSummary, setFfSummary]   = useState<string | null>(null);
  const [ffCount, setFfCount]       = useState<number>(0);
  const [ffError, setFfError]       = useState<string | null>(null);

  // AI Prep Brief
  const [showPrepBrief, setShowPrepBrief]   = useState(false);
  const [briefLoading, setBriefLoading]     = useState(false);
  const [briefContent, setBriefContent]     = useState("");
  const [briefError, setBriefError]         = useState("");

  // Outreach Draft
  const [showOutreach, setShowOutreach]     = useState(false);
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [outreachContent, setOutreachContent] = useState("");
  const [outreachError, setOutreachError]   = useState("");
  const [outreachSender, setOutreachSender] = useState("");

  // Add LP modal
  const [showAddLP, setShowAddLP]       = useState(false);
  const [addLPForm, setAddLPForm]       = useState<AddLPForm>(EMPTY_ADD_LP);
  const [addLPContact, setAddLPContact] = useState(EMPTY_CONTACT);
  const [showAddLPContact, setShowAddLPContact] = useState(false);
  const [savingLP, setSavingLP]         = useState(false);

  // Resizable columns
  const [colWidths, setColWidths] = useState<Record<string, number>>(DEFAULT_COL_WIDTHS);
  const resizingCol = useRef<{ col: string; startX: number; startW: number } | null>(null);

  function onResizeStart(col: string, e: React.MouseEvent) {
    e.preventDefault();
    resizingCol.current = { col, startX: e.clientX, startW: colWidths[col] };
    function onMove(ev: MouseEvent) { if (!resizingCol.current) return; const diff = ev.clientX - resizingCol.current.startX; setColWidths(prev => ({ ...prev, [resizingCol.current!.col]: Math.max(50, resizingCol.current!.startW + diff) })); }
    function onUp() { resizingCol.current = null; document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); }
    document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
  }

  // Remote data
  const [lastTouchMap, setLastTouchMap] = useState<Record<string, { date: string; type: string }>>({});

  useEffect(() => {
    supabase.from("interactions").select("company_id, date, type").in("type", ["email", "call", "meeting"]).order("date", { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, { date: string; type: string }> = {};
        for (const r of data) if (r.company_id && !map[r.company_id]) map[r.company_id] = { date: r.date, type: r.type };
        setLastTouchMap(map);
      });
  }, [supabase]);

  // Metrics
  const metrics = useMemo(() => {
    const committed   = companies.filter(c => c.lp_stage === "Committed");
    const softCircled = companies.filter(c => c.lp_stage === "Discussion in Process" || c.lp_stage === "Due Diligence");
    const pipeline    = companies.filter(c => c.lp_stage && !["Passed", "Committed"].includes(c.lp_stage));
    const active      = companies.filter(c => c.lp_stage && c.lp_stage !== "Passed");
    const committedAmt  = committed.reduce((s, c) => s + (c.commitment_goal ?? 0), 0);
    const softAmt       = softCircled.reduce((s, c) => s + (c.commitment_goal ?? 0), 0);
    const pipelineAmt   = pipeline.reduce((s, c) => s + (c.commitment_goal ?? 0), 0);
    const totalExpected = companies.reduce((s, c) => s + (c.commitment_goal ?? 0) * calcProb(c.lp_stage), 0);
    const convRate      = companies.length ? Math.round((committed.length / companies.length) * 100) : 0;
    return {
      committedAmt, softAmt, pipelineAmt, totalExpected, convRate, activeCount: active.length,
      committedPct: fundTarget > 0 ? (committedAmt / fundTarget) * 100 : 0,
      softPct:      fundTarget > 0 ? (softAmt / fundTarget) * 100 : 0,
    };
  }, [companies, fundTarget]);

  // Unique cities + countries for dropdowns
  const uniqueCities    = useMemo(() => [...new Set(companies.map(c => c.location_city).filter(Boolean) as string[])].sort(), [companies]);
  const uniqueCountries = useMemo(() => [...new Set(companies.map(c => c.location_country).filter(Boolean) as string[])].sort(), [companies]);

  // Filtered + sorted
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = companies.filter(c => {
      if (q && !c.name.toLowerCase().includes(q) && !(c.location_city ?? "").toLowerCase().includes(q) && !(c.lp_type ?? "").toLowerCase().includes(q)) return false;
      if (filterCity    && c.location_city    !== filterCity)    return false;
      if (filterCountry && c.location_country !== filterCountry) return false;
      if (activeFilter === "anchor")   return c.lp_type === "Anchor";
      if (activeFilter === "family")   return c.lp_type === "Family Office";
      if (activeFilter === "overdue") { const last = lastTouchMap[c.id]?.date; return !last || (Date.now() - new Date(last).getTime()) / 86_400_000 > 30; }
      if (activeFilter === "coinvest") return coinvestMap[c.id]?.interest === "Yes";
      return true;
    });

    if (sortCol) {
      list = [...list].sort((a, b) => {
        let av: string | number | null = null;
        let bv: string | number | null = null;
        const col = sortCol;
        if (col === "Company")        { av = a.name;                               bv = b.name; }
        else if (col === "LP Type")   { av = a.lp_type ?? "";                      bv = b.lp_type ?? ""; }
        else if (col === "Tier")      { av = a.priority ?? "";                     bv = b.priority ?? ""; }
        else if (col === "Stage")     { av = a.lp_stage ?? "";                     bv = b.lp_stage ?? ""; }
        else if (col === "Commit Goal") { av = a.commitment_goal ?? 0;             bv = b.commitment_goal ?? 0; }
        else if (col === "Expected")  { av = (a.commitment_goal ?? 0) * calcProb(a.lp_stage); bv = (b.commitment_goal ?? 0) * calcProb(b.lp_stage); }
        else if (col === "Prob %")    { av = calcProb(a.lp_stage);                 bv = calcProb(b.lp_stage); }
        else if (col === "Last Touchpoint") { av = lastTouchMap[a.id]?.date ?? ""; bv = lastTouchMap[b.id]?.date ?? ""; }
        else if (col === "Last Contact") { av = a.last_contact_date ?? "";         bv = b.last_contact_date ?? ""; }
        else if (col === "DDQ Status") { av = getDdqLabel(a.lp_stage);             bv = getDdqLabel(b.lp_stage); }
        else if (col === "Co-invest") { av = coinvestMap[a.id]?.interest ?? "";    bv = coinvestMap[b.id]?.interest ?? ""; }
        else if (col === "Sector")    { av = coinvestMap[a.id]?.sector ?? "";      bv = coinvestMap[b.id]?.sector ?? ""; }
        else if (col === "Owner")     { av = ownerMap[a.id] ?? "";                 bv = ownerMap[b.id] ?? ""; }
        else if (col === "City")      { av = a.location_city ?? "";                bv = b.location_city ?? ""; }
        else if (col === "Country")   { av = a.location_country ?? "";             bv = b.location_country ?? ""; }
        if (av === null || av === "") return sortDir === "asc" ? 1 : -1;
        if (bv === null || bv === "") return sortDir === "asc" ? -1 : 1;
        const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return list;
  }, [companies, search, activeFilter, lastTouchMap, coinvestMap, filterCity, filterCountry, sortCol, sortDir, ownerMap]);

  // Load detail
  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    const [{ data: ctcts }, { data: ints }] = await Promise.all([
      supabase.from("contacts").select("*").eq("company_id", id).order("is_primary_contact", { ascending: false }),
      supabase.from("interactions").select("*").eq("company_id", id).order("date", { ascending: false }).limit(30),
    ]);
    setContacts(ctcts ?? []);
    setInteractions(ints ?? []);
    setLoadingDetail(false);
  }, [supabase]);

  function selectCompany(id: string) {
    const co = companies.find(c => c.id === id);
    if (!co) return;
    setSelectedId(id);
    setEditStage(co.lp_stage ?? "");
    setEditGoal(co.commitment_goal != null ? String(co.commitment_goal) : "");
    setEditLpType(co.lp_type ?? "");
    setEditCity(co.location_city ?? "");
    setEditCountry(co.location_country ?? "");
    setContactsManaging(false);
    setShowAddContactForm(false);
    setAddingActivity(false);
    setFfSummary(null); setFfError(null); setFfCount(0);
    setBriefContent(""); setBriefError("");
    setOutreachContent(""); setOutreachError("");
    loadDetail(id);
  }

  const selected = companies.find(c => c.id === selectedId) ?? null;

  // Save — pure optimistic, no full-row re-fetch (prevents race condition overwriting other fields)
  async function saveField(id: string, patch: Partial<Company>) {
    // Snapshot previous state for rollback
    const prev = companies.find(c => c.id === id);
    setCompanies(ps => ps.map(c => c.id === id ? { ...c, ...patch } : c));
    const { error } = await supabase.from("companies").update(patch).eq("id", id);
    if (error) {
      console.error("saveField error:", error);
      // Roll back optimistic update
      if (prev) setCompanies(ps => ps.map(c => c.id === id ? prev : c));
      return;
    }
    if ("lp_stage" in patch) setEditStage(patch.lp_stage ?? "");
    if ("commitment_goal" in patch) setEditGoal(patch.commitment_goal != null ? String(patch.commitment_goal) : "");
    if ("lp_type" in patch) setEditLpType(patch.lp_type ?? "");
    if ("location_city" in patch) setEditCity(patch.location_city ?? "");
    if ("location_country" in patch) setEditCountry(patch.location_country ?? "");
  }

  async function handleAddActivity() {
    if (!selected) return;
    setSavingActivity(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: newInt } = await supabase.from("interactions").insert({
      company_id: selected.id, type: activityType, date: activityDate,
      subject: { call: "Call", meeting: "Meeting", email: "Email" }[activityType],
      body: activityNote.trim() || null, created_by: user?.id ?? null,
    }).select().single();
    setSavingActivity(false);
    if (newInt) {
      setInteractions(prev => [newInt as Interaction, ...prev]);
      setLastTouchMap(prev => ({ ...prev, [selected.id]: { date: activityDate, type: activityType } }));
    }
    setAddingActivity(false); setActivityNote(""); setActivityDate(new Date().toISOString().slice(0, 10)); setActivityType("call");
  }

  async function handleAddContact() {
    if (!selected || !newContact.first_name.trim()) return;
    setAddingContact(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: newC } = await supabase.from("contacts").insert({
      first_name: newContact.first_name.trim(), last_name: newContact.last_name.trim() || null,
      email: newContact.email.trim() || null, title: newContact.title.trim() || null,
      location_city: newContact.location_city.trim() || null, location_country: newContact.location_country.trim() || null,
      company_id: selected.id, type: "lp" as const, status: "active" as const,
      is_primary_contact: contacts.length === 0, created_by: user?.id ?? null,
    }).select().single();
    setAddingContact(false);
    if (newC) { setContacts(prev => [...prev, newC as Contact]); setShowAddContactForm(false); setNewContact(EMPTY_CONTACT); }
  }

  // Add LP
  async function handleAddLP() {
    if (!addLPForm.name.trim()) return;
    setSavingLP(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: newCo } = await supabase.from("companies").insert({
      name: addLPForm.name.trim(),
      type: "lp" as const,
      lp_stage: addLPForm.lp_stage || null,
      commitment_goal: addLPForm.commitment_goal ? parseFloat(addLPForm.commitment_goal) : null,
      location_city: addLPForm.location_city.trim() || null,
      location_country: addLPForm.location_country.trim() || null,
      created_by: user?.id ?? null,
    }).select().single();
    if (newCo) {
      if (addLPForm.owner) saveOwner(newCo.id, addLPForm.owner);
      if (showAddLPContact && addLPContact.first_name.trim()) {
        await supabase.from("contacts").insert({
          first_name: addLPContact.first_name.trim(), last_name: addLPContact.last_name.trim() || null,
          email: addLPContact.email.trim() || null, title: addLPContact.title.trim() || null,
          location_city: addLPContact.location_city.trim() || null, location_country: addLPContact.location_country.trim() || null,
          company_id: newCo.id, type: "lp" as const, status: "active" as const,
          is_primary_contact: true, created_by: user?.id ?? null,
        });
      }
      setCompanies(prev => [newCo as Company, ...prev]);
      setShowAddLP(false); setAddLPForm(EMPTY_ADD_LP); setAddLPContact(EMPTY_CONTACT); setShowAddLPContact(false);
      selectCompany(newCo.id);
    }
    setSavingLP(false);
  }

  // Fireflies summary
  async function loadFirefliesSummary() {
    if (!selected) return;
    setFfLoading(true); setFfError(null); setFfSummary(null);
    const contactEmails = contacts.map(c => c.email).filter(Boolean);
    try {
      const res = await fetch("/api/lp/fireflies-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactEmails, companyName: selected.name }),
      });
      const data = await res.json();
      if (data.error && !data.summary) { setFfError(data.error); }
      else { setFfSummary(data.summary); setFfCount(data.transcriptCount ?? 0); }
    } catch (e: any) { setFfError(e.message); }
    setFfLoading(false);
  }

  // AI Prep Brief
  async function generatePrepBrief() {
    if (!selected) return;
    setBriefLoading(true); setBriefError("");
    try {
      const res = await fetch("/api/lp/prep-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: selected, contacts, interactions: interactions.slice(0, 5),
          mandateScores,
          coinvestInterest: coinvestMap[selected.id]?.interest,
          coinvestSector: coinvestMap[selected.id]?.sector,
          owner: ownerMap[selected.id],
        }),
      });
      const data = await res.json();
      if (data.error) setBriefError(data.error);
      else setBriefContent(data.brief ?? "");
    } catch (e: any) { setBriefError(e.message); }
    setBriefLoading(false);
  }

  // Outreach draft
  async function generateOutreachDraft() {
    if (!selected) return;
    setOutreachLoading(true); setOutreachError("");
    try {
      const primaryC = contacts.find(c => c.is_primary_contact) ?? contacts[0] ?? null;
      const res = await fetch("/api/lp/outreach-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: selected, contact: primaryC,
          interactions: interactions.slice(0, 3),
          mandateScores, stage: selected.lp_stage, senderName: outreachSender || ownerMap[selected.id],
        }),
      });
      const data = await res.json();
      if (data.error) setOutreachError(data.error);
      else setOutreachContent(data.draft ?? "");
    } catch (e: any) { setOutreachError(e.message); }
    setOutreachLoading(false);
  }

  const prob = selected ? calcProb(selected.lp_stage) : 0;
  const expectedCommitment = selected?.commitment_goal != null ? selected.commitment_goal * prob : null;
  const primaryContact = contacts.find(c => c.is_primary_contact) ?? contacts[0] ?? null;

  const mandateScores = useMemo(() => {
    if (!selected) return null;
    return {
      stageScore:  ({ Lead: 20, "Initial Meeting": 35, "Discussion in Process": 55, "Due Diligence": 75, Committed: 95, Passed: 10 }[selected.lp_stage ?? ""] ?? 20),
      ticketScore: selected.commitment_goal ? Math.min(100, Math.round((selected.commitment_goal / 5_000_000) * 100)) : 30,
      geoScore:    selected.location_country ? 70 : 40,
      sectorScore: selected.fund_focus ? 75 : 50,
    };
  }, [selected]);

  // 90-day stats from interactions
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const emails90d   = interactions.filter(i => i.type === "email"   && i.date >= ninetyDaysAgo).length;
  const meetings90d = interactions.filter(i => (i.type === "meeting" || i.type === "call") && i.date >= ninetyDaysAgo).length;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-slate-50">

      {/* ── Fund target modal ──────────────────────────────────────────────── */}
      {editingFundTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setEditingFundTarget(false)}>
          <div className="bg-white rounded-xl shadow-xl p-5 w-72" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold text-slate-800 mb-1">Set Fund Target</p>
            <p className="text-xs text-slate-500 mb-3">Total fundraising goal for this fund.</p>
            <input ref={fundTargetRef} type="number" placeholder="e.g. 100000000" value={fundTargetInput}
              onChange={e => setFundTargetInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") saveFundTarget(); if (e.key === "Escape") setEditingFundTarget(false); }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditingFundTarget(false)} className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={saveFundTarget} className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add LP modal ───────────────────────────────────────────────────── */}
      {showAddLP && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAddLP(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">Add LP</h2>
              <button onClick={() => setShowAddLP(false)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400"><X size={14} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Company Name *</label>
                <input type="text" placeholder="e.g. Atinum Investment" value={addLPForm.name}
                  onChange={e => setAddLPForm(p => ({ ...p, name: e.target.value }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Relationship Owner</label>
                <div className="flex gap-2">
                  {OWNERS.map(o => (
                    <button key={o} onClick={() => setAddLPForm(p => ({ ...p, owner: p.owner === o ? "" : o }))}
                      className={cn("px-3 py-1.5 text-xs font-medium rounded-full border transition-colors", addLPForm.owner === o ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300")}>
                      {o}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">LP Stage</label>
                <StagePicker value={addLPForm.lp_stage} onChange={v => setAddLPForm(p => ({ ...p, lp_stage: v }))} />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Commitment Goal</label>
                <input type="number" placeholder="e.g. 5000000" value={addLPForm.commitment_goal}
                  onChange={e => setAddLPForm(p => ({ ...p, commitment_goal: e.target.value }))}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">City</label>
                  <input type="text" placeholder="Seoul" value={addLPForm.location_city}
                    onChange={e => setAddLPForm(p => ({ ...p, location_city: e.target.value }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Country</label>
                  <input type="text" placeholder="South Korea" value={addLPForm.location_country}
                    onChange={e => setAddLPForm(p => ({ ...p, location_country: e.target.value }))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              {/* Contact section */}
              {!showAddLPContact ? (
                <button onClick={() => setShowAddLPContact(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-slate-200 rounded-xl text-xs text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors">
                  <Plus size={12} /> Add Contact
                </button>
              ) : (
                <div className="border border-blue-200 rounded-xl bg-blue-50 p-3 space-y-2">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[11px] font-semibold text-slate-700">Contact Details</p>
                    <button onClick={() => { setShowAddLPContact(false); setAddLPContact(EMPTY_CONTACT); }} className="text-slate-400 hover:text-slate-600"><X size={12} /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="First name *" value={addLPContact.first_name} onChange={e => setAddLPContact(p => ({ ...p, first_name: e.target.value }))} />
                    <input className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Last name" value={addLPContact.last_name} onChange={e => setAddLPContact(p => ({ ...p, last_name: e.target.value }))} />
                  </div>
                  <input className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" type="email" placeholder="Email" value={addLPContact.email} onChange={e => setAddLPContact(p => ({ ...p, email: e.target.value }))} />
                  <input className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Title / Role" value={addLPContact.title} onChange={e => setAddLPContact(p => ({ ...p, title: e.target.value }))} />
                  <div className="grid grid-cols-2 gap-2">
                    <input className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="City" value={addLPContact.location_city} onChange={e => setAddLPContact(p => ({ ...p, location_city: e.target.value }))} />
                    <input className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Country" value={addLPContact.location_country} onChange={e => setAddLPContact(p => ({ ...p, location_country: e.target.value }))} />
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 px-5 py-4 border-t border-slate-100">
              <button onClick={() => setShowAddLP(false)} className="flex-1 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={handleAddLP} disabled={savingLP || !addLPForm.name.trim()}
                className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {savingLP ? <><Loader2 size={13} className="animate-spin" />Adding…</> : "Add LP"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Prep Brief modal ────────────────────────────────────────────── */}
      {showPrepBrief && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowPrepBrief(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Wand2 size={16} className="text-violet-600" />
                <h2 className="text-base font-bold text-slate-900">AI Prep Brief — {selected.name}</h2>
              </div>
              <button onClick={() => setShowPrepBrief(false)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400"><X size={14} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {!briefContent && !briefLoading && !briefError && (
                <div className="text-center py-8">
                  <Wand2 size={32} className="text-violet-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-500 mb-4">Generate a context-aware meeting prep brief for {selected.name}.<br />Pulls from LP profile, mandate scores, and recent touchpoints.</p>
                  <button onClick={generatePrepBrief}
                    className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-lg hover:bg-violet-700 flex items-center gap-2 mx-auto">
                    <Wand2 size={14} /> Generate Brief
                  </button>
                </div>
              )}
              {briefLoading && (
                <div className="flex flex-col items-center py-12 gap-3">
                  <Loader2 size={24} className="animate-spin text-violet-500" />
                  <p className="text-sm text-slate-500">Claude is generating your prep brief…</p>
                </div>
              )}
              {briefError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{briefError}</div>}
              {briefContent && !briefLoading && (
                <div className="prose prose-sm max-w-none">
                  <AiMarkdown text={briefContent} />
                </div>
              )}
            </div>
            {briefContent && (
              <div className="flex gap-2 px-5 py-3 border-t border-slate-100">
                <button onClick={() => navigator.clipboard.writeText(briefContent)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">
                  <Copy size={11} /> Copy
                </button>
                <button onClick={generatePrepBrief}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50">
                  <RefreshCw size={11} /> Regenerate
                </button>
                <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-violet-600 text-white rounded-lg hover:bg-violet-700">
                  <FileText size={11} /> Print / Save
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Outreach Draft modal ───────────────────────────────────────────── */}
      {showOutreach && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowOutreach(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Send size={15} className="text-blue-600" />
                <h2 className="text-base font-bold text-slate-900">Outreach Draft — {selected.name}</h2>
              </div>
              <button onClick={() => setShowOutreach(false)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400"><X size={14} /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {!outreachContent && !outreachLoading && !outreachError && (
                <div className="text-center py-6 space-y-4">
                  <Send size={28} className="text-blue-200 mx-auto" />
                  <p className="text-sm text-slate-500">Generate a stage-specific outreach email for {selected.name}.</p>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide block mb-1">Sender name</label>
                    <div className="flex gap-2 justify-center">
                      {OWNERS.map(o => (
                        <button key={o} onClick={() => setOutreachSender(outreachSender === o ? "" : o)}
                          className={cn("px-3 py-1 text-xs rounded-full border transition-colors", outreachSender === o ? "bg-blue-600 text-white border-blue-600" : "border-slate-200 text-slate-600 hover:border-blue-300")}>
                          {o}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={generateOutreachDraft}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 flex items-center gap-2 mx-auto">
                    <Send size={13} /> Generate Draft
                  </button>
                </div>
              )}
              {outreachLoading && <div className="flex flex-col items-center py-12 gap-3"><Loader2 size={24} className="animate-spin text-blue-500" /><p className="text-sm text-slate-500">Claude is drafting your email…</p></div>}
              {outreachError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">{outreachError}</div>}
              {outreachContent && !outreachLoading && (
                <pre className="text-sm text-slate-700 font-sans whitespace-pre-wrap leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-200">{outreachContent}</pre>
              )}
            </div>
            {outreachContent && (
              <div className="flex gap-2 px-5 py-3 border-t border-slate-100">
                <button onClick={() => navigator.clipboard.writeText(outreachContent)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"><Copy size={11} /> Copy</button>
                <button onClick={() => { setOutreachContent(""); setOutreachError(""); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50"><RefreshCw size={11} /> Regenerate</button>
                <a href={`mailto:${primaryContact?.email ?? ""}?subject=${encodeURIComponent(outreachContent.split("\n")[0]?.replace("Subject: ", "") ?? "")}&body=${encodeURIComponent(outreachContent)}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 ml-auto"><Mail size={11} /> Open in Mail</a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Metrics bar ────────────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-slate-200 bg-white">
        <div className="flex gap-3 mb-4">
          {/* Fund Target */}
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-blue-500"><Target size={14} className="text-white" /></div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">Fund Target</p>
                <button onClick={() => setEditingFundTarget(true)} className="text-slate-300 hover:text-slate-500"><Pencil size={9} /></button>
              </div>
              <p className="text-lg font-bold text-slate-900 leading-tight truncate">{fundTarget > 0 ? fmt(fundTarget) : <span className="text-slate-300 text-sm">Click ✏ to set</span>}</p>
              <p className="text-[11px] text-slate-400">{companies.length} LPs</p>
            </div>
          </div>
          {/* Active Pipeline */}
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-violet-500"><BarChart2 size={14} className="text-white" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">Active Pipeline</p>
              <p className="text-lg font-bold text-slate-900 leading-tight">{metrics.activeCount}</p>
              <p className="text-[11px] text-slate-400">{fmt(metrics.pipelineAmt || null)}</p>
            </div>
          </div>
          {/* Expected Commitment */}
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-indigo-500"><DollarSign size={14} className="text-white" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">Expected Commitment</p>
              <p className="text-lg font-bold text-slate-900 leading-tight">{fmt(metrics.totalExpected || null)}</p>
              <p className="text-[11px] text-slate-400">probability-weighted</p>
            </div>
          </div>
          {/* Soft-circled */}
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-amber-500"><TrendingUp size={14} className="text-white" /></div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">Soft-circled</p>
                <span className="text-[10px] text-slate-300 font-normal">(DD Stage)</span>
              </div>
              <p className="text-lg font-bold text-slate-900 leading-tight">{fmt(metrics.softAmt || null)}</p>
              {fundTarget > 0 && <p className="text-[11px] text-slate-400">{pct(metrics.softPct / 100)} of target</p>}
            </div>
          </div>
          {/* Committed */}
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-emerald-500"><CheckSquare size={14} className="text-white" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">Committed</p>
              <p className="text-lg font-bold text-slate-900 leading-tight">{fmt(metrics.committedAmt || null)}</p>
              {fundTarget > 0 && <p className="text-[11px] text-slate-400">{pct(metrics.committedPct / 100)} of target</p>}
            </div>
          </div>
          {/* Conversion Rate */}
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-rose-500"><ArrowUpRight size={14} className="text-white" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">Conversion Rate</p>
              <p className="text-lg font-bold text-slate-900 leading-tight">{metrics.convRate}%</p>
              <p className="text-[11px] text-slate-400">committed / total</p>
            </div>
          </div>
        </div>

        {/* Progress bar — Committed · Expected · Soft-circled */}
        {fundTarget > 0 && (() => {
          const committedW  = Math.min(metrics.committedPct, 100);
          const expectedPct = (metrics.totalExpected / fundTarget) * 100;
          const expectedW   = Math.min(expectedPct, Math.max(0, 100 - committedW));
          const softW       = Math.min(metrics.softPct, Math.max(0, 100 - committedW - expectedW));
          return (
            <div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${committedW}%` }} />
                <div className="h-full bg-indigo-400 transition-all"  style={{ width: `${expectedW}%` }} />
                <div className="h-full bg-amber-400 transition-all"   style={{ width: `${softW}%` }} />
              </div>
              <div className="flex gap-4 mt-1.5">
                {[{ color: "bg-emerald-500", label: "Committed",           p: committedW },
                  { color: "bg-indigo-400",  label: "Expected Commitment", p: expectedPct },
                  { color: "bg-amber-400",   label: "Soft-circled",        p: metrics.softPct },
                ].map(i => (
                  <span key={i.label} className="flex items-center gap-1 text-[10px] text-slate-500">
                    <span className={`w-2 h-2 rounded-full ${i.color}`} />{i.label} {pct(i.p / 100)}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div className="px-5 py-3 border-b border-slate-200 bg-white flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="pl-8 pr-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
            placeholder="Search LPs…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {FILTER_PILLS.map(pill => (
            <button key={pill.id} onClick={() => setActiveFilter(pill.id)}
              className={cn("px-3 py-1 text-xs font-medium rounded-full border transition-colors",
                activeFilter === pill.id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600")}>
              {pill.label}
            </button>
          ))}
        </div>
        {/* City filter */}
        <select value={filterCity} onChange={e => setFilterCity(e.target.value)}
          className={cn("text-xs border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors",
            filterCity ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600")}>
          <option value="">All Cities</option>
          {uniqueCities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {/* Country filter */}
        <select value={filterCountry} onChange={e => setFilterCountry(e.target.value)}
          className={cn("text-xs border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-400 transition-colors",
            filterCountry ? "border-blue-400 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-600")}>
          <option value="">All Countries</option>
          {uniqueCountries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="flex-1" />
        <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
          {([["table", List], ["kanban", LayoutGrid], ["map", Globe]] as const).map(([mode, Icon]) => (
            <button key={mode} onClick={() => setViewMode(mode)}
              className={cn("px-2.5 py-1.5 text-xs flex items-center gap-1.5 transition-colors", viewMode === mode ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50")}>
              <Icon size={13} /><span className="capitalize">{mode}</span>
            </button>
          ))}
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
          <Download size={12} /> Export CSV
        </button>
        <button onClick={() => setShowAddLP(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          <Plus size={12} /> Add LP
        </button>
        <span className="text-xs text-slate-400">{filtered.length} LP{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* ── Main area ──────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* Table */}
        {viewMode === "table" && (
          <div className={cn("flex-1 overflow-auto", selected ? "mr-[480px]" : "")}>
            <table className="w-full text-sm border-collapse" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: 40 }} />
                {Object.keys(DEFAULT_COL_WIDTHS).map(col => <col key={col} style={{ width: colWidths[col] }} />)}
                <col style={{ width: 40 }} />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5"><input type="checkbox" className="rounded border-slate-300" /></th>
                  {Object.keys(DEFAULT_COL_WIDTHS).map(col => {
                    const isSorted = sortCol === col;
                    const SortIcon = isSorted ? (sortDir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
                    return (
                      <th key={col} className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider relative select-none">
                        <button className="flex items-center gap-1 hover:text-slate-800 transition-colors truncate"
                          onClick={() => { if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortCol(col); setSortDir("asc"); } }}>
                          <span className="truncate">{col}</span>
                          <SortIcon size={10} className={isSorted ? "text-blue-500 flex-shrink-0" : "text-slate-300 flex-shrink-0"} />
                        </button>
                        <div className="absolute right-0 top-0 h-full w-2 cursor-col-resize group flex items-center justify-center" onMouseDown={e => onResizeStart(col, e)}>
                          <div className="w-px h-4 bg-slate-300 group-hover:bg-blue-400 transition-colors" />
                        </div>
                      </th>
                    );
                  })}
                  <th className="w-10 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={17} className="px-4 py-16 text-center text-slate-400 text-sm">{search ? `No results for "${search}"` : "No LPs found"}</td></tr>
                ) : filtered.map(co => {
                  const isActive = co.id === selectedId;
                  const p = calcProb(co.lp_stage);
                  const expected = co.commitment_goal != null ? co.commitment_goal * p : null;
                  const ddqLabel = getDdqLabel(co.lp_stage);
                  const touch = lastTouchMap[co.id];
                  const overdue = touch ? (Date.now() - new Date(touch.date).getTime()) / 86_400_000 > 30 : false;
                  const ci = coinvestMap[co.id];
                  const ow = ownerMap[co.id];
                  return (
                    <tr key={co.id} onClick={() => selectCompany(co.id)}
                      className={cn("border-b border-slate-100 cursor-pointer transition-colors group", isActive ? "bg-blue-50" : "hover:bg-slate-50 bg-white")}>
                      <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}><input type="checkbox" className="rounded border-slate-300" /></td>
                      <td className="px-3 py-2.5"><div className="flex items-center gap-2"><CompanyLogo company={co} size="sm" /><span className={cn("font-medium text-sm truncate", isActive ? "text-blue-700" : "text-slate-800")}>{co.name}</span></div></td>
                      <td className="px-3 py-2.5">{co.lp_type ? <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap", getLpTypeBadge(co.lp_type))}>{co.lp_type}</span> : <span className="text-slate-300 text-xs">—</span>}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">{PRIORITY_TO_TIER[co.priority ?? ""] ?? "—"}</td>
                      <td className="px-3 py-2.5">{co.lp_stage ? <div className="flex items-center gap-1.5"><span className={cn("w-2 h-2 rounded-full flex-shrink-0", STAGE_DOT[co.lp_stage])} /><span className={cn("text-xs font-medium truncate", STAGE_TEXT[co.lp_stage])}>{co.lp_stage}</span></div> : <span className="text-slate-300 text-xs">—</span>}</td>
                      <td className="px-3 py-2.5 text-right text-xs text-slate-700 tabular-nums">{fmt(co.commitment_goal)}</td>
                      <td className="px-3 py-2.5 text-right text-xs font-medium text-slate-800 tabular-nums">{expected != null ? fmt(expected) : <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2.5"><div className="flex items-center gap-1.5"><div className="w-10 h-1.5 bg-slate-100 rounded-full overflow-hidden flex-shrink-0"><div className={cn("h-full rounded-full", p > 0 ? "bg-emerald-500" : "bg-slate-200")} style={{ width: `${p * 100}%` }} /></div><span className={cn("text-xs tabular-nums", p > 0 ? "text-emerald-600 font-medium" : "text-slate-400")}>{pct(p)}</span></div></td>
                      <td className="px-3 py-2.5">{touch ? <div className="flex items-center gap-1.5"><InteractionIcon type={touch.type} /><span className={cn("text-xs", overdue ? "text-red-500 font-medium" : "text-slate-500")}>{timeAgo(touch.date)}</span>{overdue && <AlertCircle size={10} className="text-red-400" />}</div> : <span className="text-slate-300 text-xs">Never</span>}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">{co.last_contact_date ? formatDate(co.last_contact_date) : <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2.5"><span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", getDdqColor(ddqLabel))}>{ddqLabel}</span></td>
                      <td className="px-3 py-2.5 text-xs">{ci?.interest ? <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", ci.interest === "Yes" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500")}>{ci.interest}</span> : <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">{ci?.interest === "Yes" && ci.sector ? ci.sector : <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">{ow ?? <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">{co.location_city ?? <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">{co.location_country ?? <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}><button className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded hover:bg-slate-200 text-slate-400"><MoreHorizontal size={13} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {viewMode === "kanban" && <div className={cn("flex-1 overflow-hidden flex flex-col", selected ? "mr-[480px]" : "")}><KanbanView companies={filtered} onSelect={selectCompany} selectedId={selectedId} lastTouchMap={lastTouchMap} /></div>}
        {viewMode === "map"    && <div className={cn("flex-1 overflow-hidden flex flex-col", selected ? "mr-[480px]" : "")}><MapView companies={filtered} onSelect={selectCompany} selectedId={selectedId} /></div>}

        {/* ── Detail panel ─────────────────────────────────────────────────── */}
        <div className={cn("fixed right-0 top-0 h-full bg-white border-l border-slate-200 shadow-2xl z-30 flex flex-col transition-transform duration-300", selected ? "translate-x-0" : "translate-x-full")} style={{ width: 480 }}>
          {selected && (<>
            {/* Header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <CompanyLogo company={selected} size="lg" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-bold text-slate-900 truncate">{selected.name}</h2>
                  {selected.lp_type && <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", getLpTypeBadge(selected.lp_type))}>{selected.lp_type}</span>}
                  <div className="flex items-center gap-3 mt-1">
                    {(editCity || editCountry) && <span className="flex items-center gap-1 text-[11px] text-slate-400"><MapPin size={9} />{[editCity, editCountry].filter(Boolean).join(", ")}</span>}
                    {selected.website && <a href={selected.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-blue-500 hover:underline"><ExternalLink size={9} />Website</a>}
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedId(null)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 flex-shrink-0"><X size={14} /></button>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 px-5 py-3 border-b border-slate-100">
              <a href={`mailto:${primaryContact?.email ?? ""}`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex-1 justify-center">
                <Mail size={11} /> Email
              </a>
              <button onClick={() => { setShowPrepBrief(true); if (!briefContent) generatePrepBrief(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-violet-300 text-violet-700 rounded-lg hover:bg-violet-50 flex-1 justify-center">
                <Wand2 size={11} /> Prep Brief (AI)
              </button>
              <button onClick={() => { setShowOutreach(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 flex-1 justify-center">
                <Send size={11} /> Outreach
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

              {/* Relationship Owner */}
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-2">Relationship Owner</p>
                <div className="flex gap-2">
                  {OWNERS.map(o => (
                    <button key={o} onClick={() => saveOwner(selected.id, ownerMap[selected.id] === o ? "" : o)}
                      className={cn("px-3 py-1 text-xs font-medium rounded-full border transition-colors", ownerMap[selected.id] === o ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300")}>
                      {o}
                    </button>
                  ))}
                </div>
              </div>

              {/* LP Engagement */}
              <div className="pt-2 border-t border-slate-100">
                <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">LP Engagement</h3>
                <div className="space-y-3">
                  {/* Row 1: LP Type | Stage */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">LP Type</p>
                      <select className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-700"
                        value={editLpType}
                        onChange={async e => { const v = e.target.value; setEditLpType(v); await saveField(selected.id, { lp_type: v || null }); }}>
                        <option value="">Not set</option>
                        {LP_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Stage</p>
                      <StagePicker value={editStage} onChange={async s => { setEditStage(s); await saveField(selected.id, { lp_stage: s || null }); }} />
                    </div>
                  </div>
                  {/* Row 2: Commitment Goal | Expected % */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Commitment Goal</p>
                      <input type="number" placeholder="e.g. 5000000" value={editGoal}
                        onChange={e => setEditGoal(e.target.value)}
                        onBlur={async () => { const n = parseFloat(editGoal); await saveField(selected.id, { commitment_goal: isNaN(n) ? null : n }); }}
                        className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-700" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Expected</p>
                      <p className="text-sm font-bold text-slate-800">{expectedCommitment != null ? fmt(expectedCommitment) : "—"}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${prob * 100}%` }} /></div>
                        <span className={cn("text-[10px] font-semibold", prob > 0 ? "text-emerald-600" : "text-slate-400")}>{pct(prob)}</span>
                      </div>
                    </div>
                  </div>
                  {/* Row 3: Tier (Anchor/Core/Other) | DDQ Status */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">
                        Tier <span className="font-normal normal-case text-slate-300">(Anchor / Core / Other)</span>
                      </p>
                      <select className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-700"
                        value={PRIORITY_TO_TIER[selected.priority ?? ""] ?? ""}
                        onChange={async e => { const t = e.target.value; const priority = TIER_TO_PRIORITY[t] ?? null; await saveField(selected.id, { priority }); }}>
                        <option value="">—</option>
                        {TIER_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">DDQ Status</p>
                      <span className={cn("text-[11px] px-2 py-1 rounded-full font-medium inline-block mt-0.5", getDdqColor(getDdqLabel(selected.lp_stage)))}>
                        {getDdqLabel(selected.lp_stage)}
                      </span>
                    </div>
                  </div>
                  {/* Row 4: Co-invest Interest | Co-invest Sector */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Co-invest Interest</p>
                      <div className="flex gap-1.5">
                        {(["Yes", "No"] as const).map(v => (
                          <button key={v} onClick={() => saveCoinvest(selected.id, coinvestMap[selected.id]?.interest === v ? "" : v, coinvestMap[selected.id]?.sector ?? "")}
                            className={cn("flex-1 py-1 text-xs font-medium rounded border transition-colors", coinvestMap[selected.id]?.interest === v ? (v === "Yes" ? "bg-emerald-100 text-emerald-700 border-emerald-300" : "bg-slate-100 text-slate-600 border-slate-300") : "bg-white text-slate-500 border-slate-200 hover:border-blue-300")}>
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Co-invest Sector</p>
                      {coinvestMap[selected.id]?.interest === "Yes" ? (
                        <select className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-700"
                          value={coinvestMap[selected.id]?.sector ?? ""}
                          onChange={e => saveCoinvest(selected.id, "Yes", e.target.value)}>
                          <option value="">Select…</option>
                          {COINVEST_SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <p className="text-xs text-slate-300 py-1.5">—</p>
                      )}
                    </div>
                  </div>
                  {/* Location row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">City</p>
                      <input type="text" placeholder="e.g. Seoul" value={editCity}
                        onChange={e => setEditCity(e.target.value)}
                        onBlur={async () => { await saveField(selected.id, { location_city: editCity.trim() || null }); }}
                        className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-700" />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Country</p>
                      <input type="text" placeholder="e.g. South Korea" value={editCountry}
                        onChange={e => setEditCountry(e.target.value)}
                        onBlur={async () => { await saveField(selected.id, { location_country: editCountry.trim() || null }); }}
                        className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-700" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Mandate Alignment */}
              {mandateScores && (
                <div className="pt-4 border-t border-slate-100">
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Mandate Alignment</h3>
                  <div className="space-y-3">
                    <AlignmentBar label="Relationship strength" value={mandateScores.stageScore} />
                    <AlignmentBar label="Ticket size fit"       value={mandateScores.ticketScore} />
                    <AlignmentBar label="Geographic alignment"  value={mandateScores.geoScore} />
                    <AlignmentBar label="Sector focus"          value={mandateScores.sectorScore} />
                  </div>
                </div>
              )}

              {/* Contacts — 300px scrollable */}
              <div className="pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Contacts</h3>
                  <button onClick={() => { setContactsManaging(v => !v); setShowAddContactForm(false); }} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    {contactsManaging ? "Done" : <>Manage <ChevronRight size={11} /></>}
                  </button>
                </div>
                <div className="h-[200px] overflow-y-auto space-y-2 pr-1">
                  {loadingDetail ? (
                    [1, 2].map(i => <div key={i} className="h-14 bg-slate-50 rounded-lg animate-pulse" />)
                  ) : contactsManaging ? (<>
                    {contacts.length === 0 && !showAddContactForm && <p className="text-xs text-slate-400 italic">No contacts linked yet.</p>}
                    {contacts.map(c => (
                      <div key={c.id} className="flex items-start gap-2.5 p-3 border border-slate-100 rounded-xl hover:border-blue-200 hover:bg-blue-50 transition-colors">
                        <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5"><User size={11} className="text-violet-600" /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-800 truncate">{c.first_name} {c.last_name}{c.is_primary_contact && <span className="ml-1.5 text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Primary</span>}</p>
                          {c.title && <p className="text-[11px] text-slate-500 truncate">{c.title}</p>}
                          {c.email && <p className="text-[11px] text-blue-600 truncate">{c.email}</p>}
                          {(c.location_city || c.location_country) && <p className="text-[11px] text-slate-400">{[c.location_city, c.location_country].filter(Boolean).join(", ")}</p>}
                        </div>
                        <button onClick={async () => { if (!confirm(`Remove ${c.first_name}?`)) return; await supabase.from("contacts").delete().eq("id", c.id); setContacts(prev => prev.filter(x => x.id !== c.id)); }}
                          className="w-6 h-6 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:border-red-200 hover:text-red-400 flex-shrink-0"><X size={11} /></button>
                      </div>
                    ))}
                    {showAddContactForm ? (
                      <div className="border border-blue-200 rounded-xl bg-blue-50 p-3 space-y-2">
                        <p className="text-[11px] font-semibold text-slate-700">New Contact</p>
                        <div className="grid grid-cols-2 gap-2">
                          <input className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="First name *" value={newContact.first_name} onChange={e => setNewContact(p => ({ ...p, first_name: e.target.value }))} />
                          <input className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Last name" value={newContact.last_name} onChange={e => setNewContact(p => ({ ...p, last_name: e.target.value }))} />
                        </div>
                        <input className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" type="email" placeholder="Email" value={newContact.email} onChange={e => setNewContact(p => ({ ...p, email: e.target.value }))} />
                        <input className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Title / Role" value={newContact.title} onChange={e => setNewContact(p => ({ ...p, title: e.target.value }))} />
                        <div className="grid grid-cols-2 gap-2">
                          <input className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="City" value={newContact.location_city} onChange={e => setNewContact(p => ({ ...p, location_city: e.target.value }))} />
                          <input className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Country" value={newContact.location_country} onChange={e => setNewContact(p => ({ ...p, location_country: e.target.value }))} />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => { setShowAddContactForm(false); setNewContact(EMPTY_CONTACT); }} className="flex-1 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-white">Cancel</button>
                          <button disabled={addingContact || !newContact.first_name.trim()} onClick={handleAddContact}
                            className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg flex items-center justify-center gap-1">
                            {addingContact ? <><Loader2 size={11} className="animate-spin" />Adding…</> : <><Check size={11} />Add</>}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setShowAddContactForm(true)} className="w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-slate-200 rounded-xl text-xs text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors"><Plus size={12} /> Add Contact</button>
                    )}
                  </>) : contacts.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No contacts linked yet</p>
                  ) : contacts.map(c => (
                    <div key={c.id} className="flex items-start gap-2.5 p-2.5 bg-slate-50 rounded-lg">
                      <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5"><User size={11} className="text-violet-600" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-800 truncate">{c.first_name} {c.last_name}{c.is_primary_contact && <span className="ml-1.5 text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Primary</span>}</p>
                        {c.title && <p className="text-[11px] text-slate-500 truncate">{c.title}</p>}
                        {c.email && <p className="text-[11px] text-blue-600 truncate">{c.email}</p>}
                        {(c.location_city || c.location_country) && <p className="text-[11px] text-slate-400 flex items-center gap-0.5"><MapPin size={9} />{[c.location_city, c.location_country].filter(Boolean).join(", ")}</p>}
                      </div>
                      <div className="flex gap-1.5 text-slate-400 flex-shrink-0">
                        {c.email && <a href={`mailto:${c.email}`} className="hover:text-blue-500"><Mail size={11} /></a>}
                        {c.phone && <a href={`tel:${c.phone}`} className="hover:text-green-500"><Phone size={11} /></a>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Activity Timeline */}
              <div className="pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Activity Timeline</h3>
                  <button onClick={() => setAddingActivity(v => !v)}
                    className="text-xs px-2.5 py-1 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 flex items-center gap-1">
                    <Plus size={11} /> Add Activity
                  </button>
                </div>

                {/* Scrollable activity content */}
                <div className="h-[300px] overflow-y-auto pr-1 space-y-3">

                {/* 3 Activity Tiles */}
                <div className="grid grid-cols-3 gap-2">
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
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center cursor-pointer hover:bg-amber-100 transition-colors" onClick={ffSummary || ffLoading ? undefined : loadFirefliesSummary}>
                    <FileText size={14} className="text-amber-500 mx-auto mb-1" />
                    {ffLoading ? <Loader2 size={14} className="animate-spin text-amber-500 mx-auto" /> : <p className="text-lg font-bold text-amber-700">{ffCount > 0 ? ffCount : "—"}</p>}
                    <p className="text-[10px] text-amber-600 font-medium">Fireflies</p>
                    <p className="text-[10px] text-slate-400">{ffSummary ? "click to refresh" : "click to load"}</p>
                  </div>
                </div>

                {/* Fireflies summary */}
                {ffError && <div className="mb-3 p-2.5 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600">{ffError.includes("not configured") ? "Fireflies API key not configured (FIREFLIES_API_KEY missing)." : ffError}</div>}
                {ffSummary && (
                  <div className="mb-3 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide mb-2">AI Meeting Summary (Fireflies + Claude)</p>
                    <div className="text-xs text-slate-700 space-y-1 leading-relaxed">{ffSummary.split("\n").filter(Boolean).map((line, i) => <p key={i}>{line}</p>)}</div>
                  </div>
                )}

                {/* Add Activity form */}
                {addingActivity && (
                  <div className="mb-3 p-3 border border-blue-200 rounded-xl bg-blue-50 space-y-2">
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
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => { setAddingActivity(false); setActivityNote(""); }} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-white">Cancel</button>
                      <button onClick={handleAddActivity} disabled={savingActivity} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 flex items-center gap-1">
                        {savingActivity ? <><Loader2 size={10} className="animate-spin" />Saving…</> : <><Check size={10} />Save</>}
                      </button>
                    </div>
                  </div>
                )}

                {/* Timeline */}
                {loadingDetail ? (
                  [1, 2, 3].map(i => <div key={i} className="h-10 bg-slate-50 rounded-lg animate-pulse mb-2" />)
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
                </div>{/* end scrollable activity content */}
              </div>

              {/* Open Tasks */}
              <div className="pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Open Tasks</h3>
                  <button className="text-[11px] text-blue-500 hover:underline">+ Add</button>
                </div>
                <div className="space-y-2">
                  {[{ label: "Send fund materials", due: "Due today", overdue: true }, { label: "Schedule follow-up call", due: "Due in 3 days", overdue: false }].map((task, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg">
                      <input type="checkbox" className="mt-0.5 rounded border-slate-300 flex-shrink-0" />
                      <div><p className="text-xs text-slate-700">{task.label}</p><p className={cn("text-[10px]", task.overdue ? "text-red-500" : "text-slate-400")}>{task.due}</p></div>
                    </div>
                  ))}
                </div>
              </div>

              <a href={`/crm/companies/${selected.id}`} className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline pt-2">
                View full company profile <ChevronRight size={12} />
              </a>
            </div>
          </>)}
        </div>

        {selected && <div className="fixed inset-0 bg-black/5 z-20 pointer-events-none" />}
      </div>
    </div>
  );
}
