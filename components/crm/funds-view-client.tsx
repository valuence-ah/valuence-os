"use client";
// ─── Funds & Co-investors CRM — metrics · table · detail panel ────────────────

import { useState, useMemo, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Company, Contact } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";
import { useColumnPrefs } from "@/lib/use-column-prefs";
import { MeetingTranscripts } from "@/components/crm/meeting-transcripts";
import {
  Search, X, Building2, TrendingUp, Users,
  CheckCircle2, Zap, ChevronRight, ExternalLink, MapPin, Plus, Check, Sparkles,
  Loader2, Link2, Star, User, Pencil, RefreshCw, Calendar, FileText, Phone, Mail, Paperclip,
} from "lucide-react";

// ── Logo component — tries stored logo_url first, then logo.dev, then initials ──
function FundLogoImg({ name, website, logoUrl, size = "sm" }: { name: string; website?: string | null; logoUrl?: string | null; size?: "sm" | "md" }) {
  const [err, setErr] = useState(false);
  const sz = size === "sm" ? "w-7 h-7 text-[9px]" : "w-10 h-10 text-xs";
  const domain = website ? website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] : null;
  const autoSrc = domain ? `https://img.logo.dev/${domain}?token=pk_FYk-9BO1QwS9yyppOxJ2vQ&format=png&size=128` : null;
  // Prefer explicitly stored logo, fall back to logo.dev auto-detect
  const src = logoUrl || autoSrc;
  const initials = name.split(/\s+/).map(w => w[0] ?? "").join("").slice(0, 2).toUpperCase();
  if (src && !err) {
    return (
      <img
        src={src} alt={name} onError={() => setErr(true)}
        className={`${sz} rounded-md object-contain bg-white border border-slate-200 p-0.5 flex-shrink-0`}
      />
    );
  }
  return (
    <div className={`${sz} rounded-md bg-gradient-to-br ${hashColor(name)} flex items-center justify-center flex-shrink-0`}>
      <span className="text-white font-bold text-[9px]">{initials}</span>
    </div>
  );
}

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
  portfolioOverlap: { initials: string; name: string; role: string; confidence?: string; match_method?: string }[];
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
  sector: string;
  website: string;
  logo_url: string | null;
  investorType: string;
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
    lastContact: c.last_contact_date ? formatDate(c.last_contact_date) : "",
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
    sector: (c.sectors?.[0] as string | undefined) ?? "",
    website: c.website ?? "",
    logo_url: c.logo_url ?? null,
    investorType: (c as unknown as Record<string, string>).investor_type ?? "",
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

// Investor type badge styles — match Admin→Companies→Investor Type colours
const INVESTOR_TYPE_STYLES: Record<string, { background: string; color: string }> = {
  "Accelerator":     { background: "#fef3c7", color: "#92400e" },
  "Corporate":       { background: "#fff7ed", color: "#c2410c" },
  "Family Office":   { background: "#f5f3ff", color: "#7c3aed" },
  "HNW":             { background: "#fdf4ff", color: "#86198f" },
  "Venture Capital": { background: "#eff6ff", color: "#1d4ed8" },
};

// Human-readable labels for raw investor type values from DB
const INVESTOR_TYPE_LABELS: Record<string, string> = {
  "venture_capital": "Venture Capital",
  "corporate_vc":    "Corporate VC",
  "family_office":   "Family Office",
  "fund_of_fund":    "Fund of Fund",
  "angel":           "Angel",
  "accelerator":     "Accelerator",
  "government":      "Government",
  "other":           "Other",
  // Also handle values that may already be human-readable
  "investor":        "Investor",
  "vc":              "Venture Capital",
};

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

const STAGE_ORDER = ["Pre-Seed", "Seed", "Series A", "Series B"];
function sortStages(stages: string[]): string[] {
  return [...stages].sort((a, b) => {
    const ai = STAGE_ORDER.indexOf(a);
    const bi = STAGE_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
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

// ── InlinePickerCell ───────────────────────────────────────────────────────────

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
    setPos({ top: rect.bottom + 4, left: rect.left });
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

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  initialCompanies: Company[];
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function FundsViewClient({ initialCompanies }: Props) {
  const supabase = createClient();
  const router = useRouter();

  const [companies, setCompanies]        = useState<Company[]>(initialCompanies);
  const [search, setSearch]             = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterId>("all");
  const [investorTypeMap, setInvestorTypeMap] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [changeTypePos, setChangeTypePos] = useState<{ top: number; right: number } | null>(null);

  // Panel animation
  const [visible, setVisible] = useState(false);

  // Panel tab
  const [fundTab, setFundTab] = useState<"overview" | "opportunities" | "intelligence">("overview");

  // Live contacts from Supabase — keyed by fund id
  const [fundContacts, setFundContacts] = useState<Record<string, Contact[]>>({});

  // Add Fund modal
  const [showAddFund, setShowAddFund]                   = useState(false);
  const [addFundName, setAddFundName]                   = useState("");
  const [addFundType, setAddFundType]                   = useState("");
  const [addFundCity, setAddFundCity]                   = useState("");
  const [addFundCountry, setAddFundCountry]             = useState("");
  const [addFundStages, setAddFundStages]               = useState<string[]>([]);
  const [addFundOwner, setAddFundOwner]                 = useState("");
  const [showAddFundContact, setShowAddFundContact]     = useState(false);
  const [addFundContactFirst, setAddFundContactFirst]   = useState("");
  const [addFundContactLast, setAddFundContactLast]     = useState("");
  const [addFundContactEmail, setAddFundContactEmail]   = useState("");
  const [savingFund, setSavingFund]                     = useState(false);

  // Tracks which fund IDs are currently having descriptions generated
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());

  // Tracks which fund IDs are currently having overlap / recent investments generated
  const [generatingOverlapIds, setGeneratingOverlapIds] = useState<Set<string>>(new Set());
  const [generatingRecentIds,  setGeneratingRecentIds]  = useState<Set<string>>(new Set());
  const [fundInvestmentsUpdatedAt, setFundInvestmentsUpdatedAt] = useState<Record<string, string | null>>({});

  // Ref to avoid re-generating overlap/recent for funds already attempted this session
  const generatedDataRef = useRef<Set<string>>(new Set());

  // Interaction timeline per fund
  const [fundInteractions, setFundInteractions] = useState<Record<string, Array<{ id: string; type: string; subject: string | null; body: string | null; date: string; contact_ids?: string[] | null }>>>({});
  const [fundAddingNote, setFundAddingNote]   = useState(false);
  const [fundNoteText, setFundNoteText]       = useState("");
  const [fundNoteDate, setFundNoteDate]       = useState(new Date().toISOString().slice(0, 10));
  const [fundNoteType, setFundNoteType]       = useState<"note" | "call" | "email">("note");
  const [fundNoteContactIds, setFundNoteContactIds] = useState<string[]>([]);
  const [fundSavingNote, setFundSavingNote]   = useState(false);

  // Fund key-contact add / link
  const [showFundAddContact, setShowFundAddContact]   = useState(false);
  const [fundNewContact, setFundNewContact]           = useState({ first_name: "", last_name: "", email: "", title: "" });
  const [fundAddingContact, setFundAddingContact]     = useState(false);
  const [showFundLinkContact, setShowFundLinkContact] = useState(false);
  const [fundLinkSearch, setFundLinkSearch]           = useState("");
  const [fundLinkSuggestions, setFundLinkSuggestions] = useState<Contact[]>([]);
  const [fundLinkingContact, setFundLinkingContact]   = useState(false);
  const fundLinkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fund intelligence per company
  type FundIntelItem = { headline: string; source: string; date: string; summary?: string; url?: string };
  const [fundIntelMap, setFundIntelMap]       = useState<Record<string, FundIntelItem[]>>({});
  const [fundIntelCachedAt, setFundIntelCachedAt] = useState<Record<string, string>>({});
  const [fundIntelLoading, setFundIntelLoading] = useState(false);
  const [fundIntelError, setFundIntelError]   = useState<string | null>(null);

  // Fund starred intel — persisted to localStorage
  const [fundStarredIntel, setFundStarredIntel] = useState<Record<string, string[]>>({});
  useEffect(() => {
    try { const s = localStorage.getItem("fund_starred_intel"); if (s) setFundStarredIntel(JSON.parse(s)); } catch {}
  }, []);
  function toggleFundStar(companyId: string, headline: string) {
    setFundStarredIntel(prev => {
      const current = prev[companyId] ?? [];
      const next = current.includes(headline) ? current.filter(h => h !== headline) : [...current, headline];
      const updated = { ...prev, [companyId]: next };
      try { localStorage.setItem("fund_starred_intel", JSON.stringify(updated)); } catch {}
      return updated;
    });
  }

  // ── Add Fund ─────────────────────────────────────────────────────────────────
  async function handleAddFund() {
    if (!addFundName.trim()) return;
    setSavingFund(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: newCo, error } = await supabase.from("companies").insert({
        name:             addFundName.trim(),
        type:             "fund",
        investor_type:    addFundType || null,
        location_city:    addFundCity.trim() || null,
        location_country: addFundCountry.trim() || null,
        fund_focus:       addFundStages.length > 0 ? addFundStages.join(", ") : null,
        created_by:       user?.id,
      }).select().single();

      if (!error && newCo && showAddFundContact && addFundContactFirst.trim()) {
        await supabase.from("contacts").insert({
          first_name:  addFundContactFirst.trim(),
          last_name:   addFundContactLast.trim() || null,
          email:       addFundContactEmail.trim() || null,
          company_id:  newCo.id,
          created_by:  user?.id,
        });
      }
    } catch {}
    // Reset
    setAddFundName(""); setAddFundType(""); setAddFundCity(""); setAddFundCountry("");
    setAddFundStages([]); setAddFundOwner("");
    setAddFundContactFirst(""); setAddFundContactLast(""); setAddFundContactEmail("");
    setShowAddFundContact(false);
    setShowAddFund(false);
    setSavingFund(false);
    router.refresh();
  }

  async function fetchFundIntelligence() {
    if (!selectedId || fundIntelLoading) return;
    setFundIntelLoading(true);
    setFundIntelError(null);
    try {
      const res = await fetch(`/api/companies/${selectedId}/intelligence`, { method: "POST" });
      if (res.ok) {
        const data = await res.json() as { items?: FundIntelItem[] };
        const items = data.items ?? [];
        setFundIntelMap(prev => ({ ...prev, [selectedId]: items }));
        const cachedAt = new Date().toISOString();
        setFundIntelCachedAt(prev => ({ ...prev, [selectedId]: cachedAt }));
        try { localStorage.setItem(`fund_intel_${selectedId}`, JSON.stringify({ items, cachedAt })); } catch {}
      } else {
        setFundIntelError("Could not load intelligence");
      }
    } catch {
      setFundIntelError("Network error");
    } finally {
      setFundIntelLoading(false);
    }
  }

  // Double-click field editing in overview
  const [editingFundField, setEditingFundField] = useState<string | null>(null);

  // Key Contact inline editing
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactEditForm, setContactEditForm]   = useState<{
    first_name: string; last_name: string; title: string; email: string; phone: string; linkedin_url: string;
  }>({ first_name: "", last_name: "", title: "", email: "", phone: "", linkedin_url: "" });
  const [savingContact, setSavingContact]       = useState(false);

  function startEditContact(c: Contact) {
    setEditingContactId(c.id);
    setContactEditForm({
      first_name:   c.first_name ?? "",
      last_name:    c.last_name  ?? "",
      title:        c.title      ?? "",
      email:        c.email      ?? "",
      phone:        c.phone      ?? "",
      linkedin_url: c.linkedin_url ?? "",
    });
  }

  async function saveEditContact() {
    if (!editingContactId || !selectedId) return;
    setSavingContact(true);
    const patch = {
      first_name:   contactEditForm.first_name.trim() || null,
      last_name:    contactEditForm.last_name.trim()  || null,
      title:        contactEditForm.title.trim()       || null,
      email:        contactEditForm.email.trim()       || null,
      phone:        contactEditForm.phone.trim()       || null,
      linkedin_url: contactEditForm.linkedin_url.trim() || null,
    };
    await supabase.from("contacts").update(patch).eq("id", editingContactId);
    // Update local state
    setFundContacts(prev => ({
      ...prev,
      [selectedId]: (prev[selectedId] ?? []).map((c: Contact) =>
        c.id === editingContactId ? ({ ...c, ...patch, first_name: patch.first_name ?? c.first_name } as Contact) : c
      ),
    }));
    setEditingContactId(null);
    setSavingContact(false);
  }

  // Auto-generate loaders for profile rows
  const [loadingFundSector, setLoadingFundSector] = useState(false);
  const [loadingFundDesc,   setLoadingFundDesc]   = useState(false);

  async function generateFundSector() {
    if (!selected || !selectedId) return;
    setLoadingFundSector(true);
    try {
      const res = await fetch("/api/strategic/sector", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: selectedId, name: selected.co, description: selected.desc }),
      });
      const data = await res.json();
      if (data.sector) {
        setFundFieldOverride("sector", data.sector);
        await supabase.from("companies").update({ sectors: [data.sector] }).eq("id", selectedId);
      }
    } catch { /* silent */ }
    setLoadingFundSector(false);
  }

  async function generateFundDesc() {
    if (!selected || !selectedId) return;
    setLoadingFundDesc(true);
    try {
      const res = await fetch("/api/funds/generate-descriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: selectedId, force: true }),
      });
      const data = await res.json();
      const result = data.results?.[0];
      if (result?.description) {
        setFundFieldOverride("desc", result.description);
      }
    } catch { /* silent */ }
    setLoadingFundDesc(false);
  }
  async function refreshRecentInvestments() {
    if (!selectedId) return;
    setGeneratingRecentIds(prev => new Set(prev).add(selectedId));
    try {
      const res = await fetch("/api/funds/generate-recent-investments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: selectedId, force: true }),
      });
      if (res.ok) {
        const data = await res.json() as { investments?: { name: string; round: string; sector: string; date: string }[]; updated_at?: string | null };
        if (data.investments?.length) {
          setFundOverrides(prev => ({
            ...prev,
            [selectedId]: { ...(prev[selectedId] ?? {}), recentInvest: data.investments },
          }));
        }
        if (data.updated_at !== undefined) {
          setFundInvestmentsUpdatedAt(prev => ({ ...prev, [selectedId]: data.updated_at ?? null }));
        }
      }
    } catch { /* silent */ }
    setGeneratingRecentIds(prev => { const s = new Set(prev); s.delete(selectedId); return s; });
  }

  async function handleAddFundNote() {
    if (!selectedId) return;
    setFundSavingNote(true);
    try {
      const { data: newInt } = await supabase.from("interactions").insert({
        company_id:  selectedId,
        type:        fundNoteType,
        date:        fundNoteDate,
        subject:     fundNoteType === "note" ? "Note" : fundNoteType === "call" ? "Call" : "Email",
        body:        fundNoteText.trim() || null,
        contact_ids: fundNoteContactIds.length > 0 ? fundNoteContactIds : null,
      }).select().single();
      if (newInt) {
        const newEntry = { id: newInt.id, type: newInt.type, subject: newInt.subject, body: newInt.body, date: newInt.date, contact_ids: (newInt as { contact_ids?: string[] }).contact_ids };
        setFundInteractions(prev => ({
          ...prev,
          [selectedId]: [newEntry as { id: string; type: string; subject: string | null; body: string | null; date: string; contact_ids?: string[] | null }, ...(prev[selectedId] ?? [])],
        }));
        // Update last_contact_date on the company
        await supabase.from("companies").update({ last_contact_date: fundNoteDate }).eq("id", selectedId);
      }
      setFundNoteText(""); setFundAddingNote(false); setFundNoteContactIds([]);
    } catch { /* silent */ }
    setFundSavingNote(false);
  }

  const [fundOverrides, setFundOverrides] = useState<Record<string, Partial<FundData>>>({});

  // Portfolio overlap editing
  const [showAddOverlap, setShowAddOverlap]   = useState(false);
  const [newOverlapName, setNewOverlapName]   = useState("");
  const [newOverlapRole, setNewOverlapRole]   = useState("Co-investor");
  const [confirmRemoveOverlap, setConfirmRemoveOverlap] = useState<string | null>(null);
  // Overlap company search (pipeline-only)
  const [overlapSearchResults, setOverlapSearchResults] = useState<{ id: string; name: string }[]>([]);
  const [overlapSearchOpen, setOverlapSearchOpen] = useState(false);
  const overlapSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Co-invest brief modal
  const [showCoInvestBrief, setShowCoInvestBrief] = useState(false);

  // Table quick-filters (stage pill / sector badge click)
  const [stageFilter, setStageFilter]   = useState<string | null>(null);
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);

  // Column widths — persisted to Supabase via useColumnPrefs
  const COL_KEYS = ["Fund", "Type", "Investor Type", "Stage focus", "Sector", "Thesis alignment", "Check size", "Co-invest status", "Rel. health", "Portfolio overlap", "Deal flow", "Owner", "Last contact", "Next action", "City", "Country"] as const;
  type ColKey = (typeof COL_KEYS)[number];
  const { columnWidths, setColumnWidth } = useColumnPrefs("crm_funds");
  // Derive colWidths from hook (keyed by column name)
  const colWidths = columnWidths as Partial<Record<ColKey, number>>;

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
    () => companies.map(c => ({
      ...companyToFundData(c),
      ...(fundExtMap[c.id] ?? {}),
      ...(investorTypeMap[c.id] !== undefined ? { investorType: investorTypeMap[c.id] } : {}),
    })),
    [companies, fundExtMap, investorTypeMap]
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
    if (stageFilter)  list = list.filter(f => f.stages.includes(stageFilter));
    if (sectorFilter) list = list.filter(f => f.sector.toLowerCase().includes(sectorFilter.toLowerCase()));
    return list;
  }, [search, activeFilter, stageFilter, sectorFilter, fundList]);

  // On mount: batch-generate descriptions for all funds that don't have one
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/funds/generate-descriptions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ force: false }), // only missing ones
        });
        if (!res.ok) return;
        const data = await res.json() as {
          results?: { id: string; name: string; status: string; description?: string }[];
        };
        if (!data.results?.length) return;
        // Apply all generated descriptions immediately into overrides
        setFundOverrides(prev => {
          const next = { ...prev };
          for (const r of data.results!) {
            if (r.status === "ok" && r.description && r.id) {
              next[r.id] = { ...(prev[r.id] ?? {}), desc: r.description };
            }
          }
          return next;
        });
      } catch { /* silent */ }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When selectedId changes, animate panel, reset tab, and fetch contacts
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
      setChangeTypePos(null);

      // Pre-load cached intelligence so it shows immediately when tab opens
      if (!fundIntelMap[selectedId]) {
        try {
          const s = localStorage.getItem(`fund_intel_${selectedId}`);
          if (s) {
            const { items, cachedAt } = JSON.parse(s) as { items: FundIntelItem[]; cachedAt: string };
            setFundIntelMap(prev => ({ ...prev, [selectedId]: items ?? [] }));
            setFundIntelCachedAt(prev => ({ ...prev, [selectedId]: cachedAt }));
          }
        } catch {}
      }
      setShowAddRelationship(false);
      setShowFundOppForm(false);

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

      // Fetch interaction timeline for this fund
      if (!fundInteractions[selectedId]) {
        (async () => {
          try {
            const { data: ints } = await supabase
              .from("interactions")
              .select("id, type, subject, body, date, contact_ids")
              .eq("company_id", selectedId)
              .neq("type", "deck_upload")
              .order("date", { ascending: false })
              .limit(30);
            setFundInteractions(prev => ({ ...prev, [selectedId]: (ints ?? []) as Array<{ id: string; type: string; subject: string | null; body: string | null; date: string; contact_ids?: string[] | null }> }));
          } catch {
            setFundInteractions(prev => ({ ...prev, [selectedId]: [] }));
          }
        })();
      }

      // If this specific fund still has no description, generate it now
      const fund = fundListRef.current.find(f => f.id === selectedId);
      const hasDesc = !!(fund?.desc?.trim()) || !!(fundOverridesRef.current[selectedId]?.desc);
      if (!hasDesc) {
        setGeneratingIds(prev => new Set(prev).add(selectedId));
        (async () => {
          try {
            const res = await fetch("/api/funds/generate-descriptions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ company_id: selectedId, force: true }),
            });
            const data = await res.json() as { results?: { id: string; status: string; description?: string }[] };
            const r = data.results?.[0];
            if (r?.status === "ok" && r.description) {
              setFundOverrides(prev => ({
                ...prev,
                [selectedId]: { ...(prev[selectedId] ?? {}), desc: r.description },
              }));
            }
          } catch { /* silent */ }
          setGeneratingIds(prev => { const s = new Set(prev); s.delete(selectedId); return s; });
        })();
      }

      // Portfolio / Pipeline overlap — fetch once per fund per session
      if (!generatedDataRef.current.has(`overlap:${selectedId}`)) {
        generatedDataRef.current.add(`overlap:${selectedId}`);
        setGeneratingOverlapIds(prev => new Set(prev).add(selectedId));
        (async () => {
          try {
            const res = await fetch("/api/funds/generate-overlap", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ company_id: selectedId, force: false }),
            });
            if (res.ok) {
              const data = await res.json() as { overlap?: { initials: string; name: string; role: string; confidence?: string; match_method?: string }[] };
              if (data.overlap) {
                setFundOverrides(prev => ({
                  ...prev,
                  [selectedId]: { ...(prev[selectedId] ?? {}), portfolioOverlap: data.overlap },
                }));
              }
            }
          } catch { /* silent */ }
          setGeneratingOverlapIds(prev => { const s = new Set(prev); s.delete(selectedId); return s; });
        })();
      }

      // Recent investments — load from DB cache first, generate if missing
      if (!generatedDataRef.current.has(`recent:${selectedId}`)) {
        generatedDataRef.current.add(`recent:${selectedId}`);
        setGeneratingRecentIds(prev => new Set(prev).add(selectedId));
        (async () => {
          try {
            const res = await fetch("/api/funds/generate-recent-investments", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ company_id: selectedId, force: false }),
            });
            if (res.ok) {
              const data = await res.json() as { investments?: { name: string; round: string; sector: string; date: string }[]; updated_at?: string | null };
              if (data.investments?.length) {
                setFundOverrides(prev => ({
                  ...prev,
                  [selectedId]: { ...(prev[selectedId] ?? {}), recentInvest: data.investments },
                }));
              }
              if (data.updated_at !== undefined) {
                setFundInvestmentsUpdatedAt(prev => ({ ...prev, [selectedId]: data.updated_at ?? null }));
              }
            }
          } catch { /* silent */ }
          setGeneratingRecentIds(prev => { const s = new Set(prev); s.delete(selectedId); return s; });
        })();
      }
    } else {
      setVisible(false);
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const baseSelected = selectedId
    ? fundList.find(f => f.id === selectedId) ?? null
    : null;

  // Merge with overrides
  const selected = baseSelected
    ? { ...baseSelected, ...(fundOverrides[selectedId!] ?? {}) }
    : null;

  async function handleChangeType(newType: string) {
    if (!selectedId) return;
    setCompanies(prev => prev.map(c =>
      c.id === selectedId ? { ...c, type: newType as Company["type"], types: [newType] } : c
    ));
    setChangeTypePos(null);
    await supabase.from("companies").update({ type: newType, types: [newType] }).eq("id", selectedId);
  }


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

  // Fund contact management
  async function addFundContact() {
    if (!selectedId || !fundNewContact.first_name.trim()) return;
    setFundAddingContact(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: newC } = await supabase.from("contacts").insert({
      first_name: fundNewContact.first_name.trim(),
      last_name: fundNewContact.last_name.trim() || null,
      email: fundNewContact.email.trim() || null,
      title: fundNewContact.title.trim() || null,
      company_id: selectedId,
      type: "fund_manager" as const,
      status: "active" as const,
      created_by: user?.id ?? null,
    }).select().single();
    if (newC) {
      setFundContacts(prev => ({ ...prev, [selectedId]: [...(prev[selectedId] ?? []), newC as Contact] }));
      setFundNewContact({ first_name: "", last_name: "", email: "", title: "" });
      setShowFundAddContact(false);
    }
    setFundAddingContact(false);
  }

  function searchFundLinkContacts(query: string) {
    if (fundLinkTimer.current) clearTimeout(fundLinkTimer.current);
    setFundLinkSearch(query);
    if (!query.trim() || query.length < 2) { setFundLinkSuggestions([]); return; }
    fundLinkTimer.current = setTimeout(async () => {
      const { data } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, email, title, company_id")
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(8);
      setFundLinkSuggestions((data as Contact[]) ?? []);
    }, 250);
  }

  async function linkFundContact(contactId: string) {
    if (!selectedId) return;
    setFundLinkingContact(true);
    const { data, error } = await supabase.from("contacts").update({ company_id: selectedId }).eq("id", contactId).select().single();
    if (!error && data) {
      setFundContacts(prev => ({ ...prev, [selectedId]: [...(prev[selectedId] ?? []), data as Contact] }));
      setShowFundLinkContact(false);
      setFundLinkSearch(""); setFundLinkSuggestions([]);
    }
    setFundLinkingContact(false);
  }

  // Get current portfolio overlap (overrides or base)
  function getCurrentOverlap(): { initials: string; name: string; role: string; confidence?: string; match_method?: string }[] {
    if (!selectedId || !baseSelected) return [];
    const ov = fundOverrides[selectedId];
    if (ov && ov.portfolioOverlap !== undefined) return ov.portfolioOverlap as { initials: string; name: string; role: string; confidence?: string; match_method?: string }[];
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

  async function searchPipelineCompanies(q: string) {
    if (!q.trim()) { setOverlapSearchResults([]); setOverlapSearchOpen(false); return; }
    try {
      const res = await fetch(`/api/search/companies?q=${encodeURIComponent(q)}&type=startup`);
      if (res.ok) {
        const data = await res.json() as { id: string; name: string }[];
        setOverlapSearchResults(data);
        setOverlapSearchOpen(data.length > 0);
      }
    } catch { /* silent */ }
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
        <div className="flex items-center gap-1.5 ml-auto">
          {stageFilter && (
            <button
              onClick={() => setStageFilter(null)}
              className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full border border-blue-200 hover:bg-blue-200"
            >
              Stage: {stageFilter} <X size={10} />
            </button>
          )}
          {sectorFilter && (
            <button
              onClick={() => setSectorFilter(null)}
              className="flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full border border-emerald-200 hover:bg-emerald-200"
            >
              Sector: {sectorFilter} <X size={10} />
            </button>
          )}
          <span className="text-xs text-slate-400">
            {filtered.length} fund{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={() => setShowAddFund(true)}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
        >
          <Plus size={13} /> Add Fund
        </button>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* Table */}
        <div className={cn("flex-1 overflow-auto", selectedId ? "mr-[480px]" : "")}>
          <table className="w-full text-sm border-collapse" style={{ minWidth: 1200 }}>
            <thead className="sticky top-0 z-10 bg-slate-100">
              <tr>
                {COL_KEYS.map(col => (
                  <th
                    key={col}
                    className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 border-b border-slate-200 whitespace-nowrap relative select-none"
                    style={{ width: colWidths[col] ?? 140, minWidth: 60 }}
                  >
                    {col}
                    {/* Resize handle on right border */}
                    <div
                      onMouseDown={startResize(col, colWidths[col] ?? 140)}
                      style={{ position: "absolute", right: 0, top: 0, height: "100%", width: 4, cursor: "col-resize" }}
                      className="hover:bg-teal-400 active:bg-teal-600"
                    />
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
                        <FundLogoImg name={fund.co} website={fund.website} size="sm" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1 flex-wrap">
                            <p className="text-sm font-medium text-slate-800 truncate max-w-[140px]">{fund.co}</p>
                            {fund.strategic && (
                              <span className="text-[10px] px-1 py-0.5 rounded bg-violet-100 text-violet-700 font-medium flex-shrink-0">
                                Strategic
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Type */}
                    <td className="px-3 py-2.5 min-w-[130px]">
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium whitespace-nowrap">
                        {fund.type}
                      </span>
                    </td>

                    {/* Investor Type */}
                    <td className="px-3 py-2.5 min-w-[130px]" onClick={e => e.stopPropagation()}>
                      <InlinePickerCell
                        value={fund.investorType}
                        options={["Accelerator","Corporate","Family Office","HNW","Venture Capital"]}
                        styles={INVESTOR_TYPE_STYLES}
                        onPick={async (val) => {
                          setInvestorTypeMap(prev => ({ ...prev, [fund.id]: val }));
                          const sb = createClient();
                          await sb.from("companies").update({ investor_type: val || null }).eq("id", fund.id);
                        }}
                      />
                    </td>

                    {/* Stage focus */}
                    <td className="px-3 py-2.5 min-w-[150px]">
                      <div className="flex flex-wrap gap-0.5">
                        {sortStages(fund.stages).map(s => (
                          <button
                            key={s}
                            onClick={e => { e.stopPropagation(); setStageFilter(stageFilter === s ? null : s); }}
                            className={cn(
                              "text-xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap border transition-colors",
                              stageFilter === s
                                ? "bg-blue-600 text-white border-blue-600"
                                : "bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100 hover:border-blue-300"
                            )}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </td>

                    {/* Sector */}
                    <td className="px-3 py-2.5 min-w-[120px]">
                      {fund.sector ? (
                        <button
                          onClick={e => { e.stopPropagation(); setSectorFilter(sectorFilter === fund.sector ? null : fund.sector); }}
                          className={cn(
                            "text-xs px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap border transition-colors",
                            sectorFilter === fund.sector
                              ? "bg-emerald-600 text-white border-emerald-600"
                              : "bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100 hover:border-emerald-300"
                          )}
                        >
                          {fund.sector}
                        </button>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>

                    {/* Thesis alignment */}
                    <td className="px-3 py-2.5 min-w-[120px]">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-green-600 w-5 flex-shrink-0">CT</span>
                          <div className="w-10 h-1 bg-slate-100 rounded-full overflow-hidden flex-shrink-0">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${fund.cleantech}%` }} />
                          </div>
                          <span className="text-[10px] text-slate-600 tabular-nums">{fund.cleantech}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] text-violet-600 w-5 flex-shrink-0">TB</span>
                          <div className="w-10 h-1 bg-slate-100 rounded-full overflow-hidden flex-shrink-0">
                            <div className="h-full rounded-full bg-violet-500" style={{ width: `${fund.techbio}%` }} />
                          </div>
                          <span className="text-[10px] text-slate-600 tabular-nums">{fund.techbio}</span>
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
                              <span className="text-white font-bold text-[9px]">{p.initials}</span>
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
                      <span className="text-xs text-slate-500" title={fund.nextAction}>
                        {fund.nextAction.length > 40
                          ? `${fund.nextAction.slice(0, 40)}…`
                          : fund.nextAction}
                      </span>
                    </td>

                    {/* City */}
                    <td className="px-3 py-2.5 min-w-[110px]">
                      {(() => {
                        const city = fund.loc.includes(",") ? fund.loc.split(",")[0].trim() : fund.loc;
                        return city ? (
                          <div className="flex items-center gap-1">
                            <MapPin size={10} className="text-slate-300 flex-shrink-0" />
                            <span className="text-xs text-slate-400">{city}</span>
                          </div>
                        ) : <span className="text-slate-300 text-xs">—</span>;
                      })()}
                    </td>

                    {/* Country */}
                    <td className="px-3 py-2.5 min-w-[110px]">
                      {(() => {
                        const parts = fund.loc.split(",");
                        const country = parts.length > 1 ? parts.slice(1).join(",").trim() : "";
                        return country ? (
                          <span className="text-xs text-slate-400">{country}</span>
                        ) : <span className="text-slate-300 text-xs">—</span>;
                      })()}
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={15} className="text-center py-16 text-sm text-slate-400">
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
                    <FundLogoImg
                      name={selected.co}
                      website={selected.website}
                      logoUrl={selected.logo_url}
                      size="md"
                    />
                    <div className="min-w-0">
                      <p className="text-base font-semibold text-slate-800 truncate">{selected.co}</p>
                      <p className="text-xs text-slate-500">
                        {INVESTOR_TYPE_LABELS[selected.type] ?? selected.type}
                        {selected.loc ? ` · ${selected.loc}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-2 mt-0.5">
                    {/* Change Type — fixed so it escapes overflow-y: auto */}
                    <button
                      onClick={e => {
                        const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                        setChangeTypePos(changeTypePos ? null : { top: r.bottom + 4, right: window.innerWidth - r.right });
                      }}
                      className="text-[10px] text-slate-400 hover:text-blue-600 transition-colors px-1.5 py-0.5 rounded hover:bg-blue-50 border border-transparent hover:border-blue-100 whitespace-nowrap"
                      title="Change company type"
                    >Change Type</button>
                    <button
                      onClick={() => { setSelectedId(null); setChangeTypePos(null); }}
                      className="text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>
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
                    onClick={() => {
                      setFundTab(tab);
                      if (tab === "intelligence" && selectedId && !fundIntelMap[selectedId]?.length && !fundIntelLoading) {
                        fetchFundIntelligence();
                      }
                    }}
                    className={cn(
                      "flex-1 text-xs font-medium py-2 transition-colors flex items-center justify-center gap-1",
                      fundTab === tab ? "text-blue-600 border-b-2 border-blue-600" : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    {tab === "intelligence" && <Sparkles size={10} />}
                    {tab === "overview" ? "Overview" : tab === "opportunities" ? "Opportunities / Tasks" : "Intelligence"}
                  </button>
                ))}
              </div>

              {/* Scrollable body */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100">

                {/* ── OVERVIEW TAB ───────────────────────────────────────────── */}
                {fundTab === "overview" && (
                  <>
                    {/* Fund Overview — profile rows matching Strategic format */}
                    <div className="px-4 py-4">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">Fund Overview</h3>
                      <div className="space-y-2.5">

                        {/* Row 1: Sector focus */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 w-24 flex-shrink-0">Sector focus</span>
                          <div className="flex items-center gap-1.5 flex-1 min-w-0">
                            {editingFundField === "sector" ? (
                              <input
                                autoFocus
                                defaultValue={selected.sector}
                                onBlur={async e => {
                                  const val = e.target.value.trim();
                                  setFundFieldOverride("sector", val);
                                  if (selectedId) await supabase.from("companies").update({ sectors: val ? [val] : null }).eq("id", selectedId);
                                  setEditingFundField(null);
                                }}
                                onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
                                className="flex-1 text-xs text-slate-700 border-b border-blue-400 focus:outline-none bg-transparent py-0.5"
                              />
                            ) : (
                              <span
                                onDoubleClick={() => setEditingFundField("sector")}
                                className="flex-1 text-xs text-slate-700 py-0.5 cursor-default select-none"
                              >
                                {selected.sector || <span className="text-slate-300 italic text-[10px]">Double-click to edit</span>}
                              </span>
                            )}
                            <button
                              onClick={generateFundSector}
                              disabled={loadingFundSector}
                              className="text-[10px] text-violet-500 hover:text-violet-700 flex-shrink-0"
                              title="Auto-generate sector focus"
                            >
                              {loadingFundSector ? <Loader2 size={10} className="animate-spin" /> : "✨"}
                            </button>
                          </div>
                        </div>

                        {/* Row 2: Stage focus — multi-select pills */}
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-slate-400 w-24 flex-shrink-0 pt-0.5">Stage focus</span>
                          <div className="flex flex-wrap gap-1">
                            {(["Pre-Seed", "Seed", "Series A", "Series B"] as const).map(stage => {
                              const active = selected.stages.includes(stage);
                              return (
                                <button
                                  key={stage}
                                  onClick={() => {
                                    if (!selectedId) return;
                                    const next = active
                                      ? selected.stages.filter(s => s !== stage)
                                      : [...selected.stages, stage];
                                    setFundOverrides(prev => ({
                                      ...prev,
                                      [selectedId]: { ...(prev[selectedId] ?? {}), stages: next },
                                    }));
                                    setFundExtMap(prev => {
                                      const updated = { ...prev, [selectedId]: { ...(prev[selectedId] ?? {}), stages: next } };
                                      try { localStorage.setItem(LS_KEY, JSON.stringify(updated)); } catch {}
                                      return updated;
                                    });
                                  }}
                                  className={cn(
                                    "px-2 py-0.5 text-xs font-medium rounded-full border transition-colors",
                                    active
                                      ? "bg-blue-600 text-white border-blue-600"
                                      : "bg-white text-slate-500 border-slate-200 hover:border-blue-300"
                                  )}
                                >
                                  {stage}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        {/* Row 3: Website */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 w-24 flex-shrink-0">Website</span>
                          <div className="flex-1 min-w-0">
                            {editingFundField === "website" ? (
                              <input
                                autoFocus
                                defaultValue={selected.website}
                                onBlur={async e => {
                                  const val = e.target.value.trim();
                                  setFundFieldOverride("website", val);
                                  if (selectedId) await supabase.from("companies").update({ website: val || null }).eq("id", selectedId);
                                  setEditingFundField(null);
                                }}
                                onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
                                placeholder="https://…"
                                className="w-full text-xs text-slate-700 border-b border-blue-400 focus:outline-none bg-transparent py-0.5"
                              />
                            ) : (
                              <span
                                onDoubleClick={() => setEditingFundField("website")}
                                className="text-xs text-slate-700 py-0.5 cursor-default select-none truncate block"
                              >
                                {selected.website
                                  ? <a href={selected.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline" onClick={e => e.stopPropagation()}>{selected.website}</a>
                                  : <span className="text-slate-300 italic text-[10px]">Double-click to edit</span>
                                }
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Row 4: Last contact */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 w-24 flex-shrink-0">Last contact</span>
                          <span className={cn("text-xs", selected.overdue ? "text-red-500 font-medium" : "text-slate-700")}>
                            {selected.lastContact || "—"}
                          </span>
                        </div>

                        {/* Row 5: AUM */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-400 w-24 flex-shrink-0">AUM</span>
                          <div className="flex-1 min-w-0">
                            {editingFundField === "aum" ? (
                              <input
                                autoFocus
                                defaultValue={selected.aum}
                                onBlur={e => { setFundFieldOverride("aum", e.target.value.trim()); setEditingFundField(null); }}
                                onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur(); }}
                                placeholder="e.g. $500M"
                                className="w-full text-xs text-slate-700 border-b border-blue-400 focus:outline-none bg-transparent py-0.5"
                              />
                            ) : (
                              <span
                                onDoubleClick={() => setEditingFundField("aum")}
                                className="text-xs text-slate-700 py-0.5 cursor-default select-none"
                              >
                                {selected.aum || <span className="text-slate-300 italic text-[10px]">Double-click to edit</span>}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Row 6: Description with ✨ auto-gen */}
                        <div className="flex items-start gap-2">
                          <div className="w-24 flex-shrink-0 flex items-center gap-1 pt-0.5">
                            <span className="text-xs text-slate-400">Description</span>
                            <button
                              onClick={generateFundDesc}
                              disabled={loadingFundDesc || !!(selectedId && generatingIds.has(selectedId))}
                              className="text-[10px] text-violet-500 hover:text-violet-700 flex-shrink-0"
                              title="Auto-generate description"
                            >
                              {(loadingFundDesc || !!(selectedId && generatingIds.has(selectedId)))
                                ? <Loader2 size={10} className="animate-spin" />
                                : "✨"
                              }
                            </button>
                          </div>
                          <div className="flex-1 min-w-0">
                            {editingFundField === "desc" ? (
                              <textarea
                                autoFocus
                                defaultValue={selected.desc}
                                rows={4}
                                placeholder="Write a description of this fund…"
                                onBlur={async e => {
                                  const val = e.target.value.trim();
                                  setFundFieldOverride("desc", val);
                                  if (selectedId) await supabase.from("companies").update({ description: val }).eq("id", selectedId);
                                  setEditingFundField(null);
                                }}
                                onKeyDown={e => { if (e.key === "Escape") setEditingFundField(null); }}
                                className="text-xs text-slate-700 leading-relaxed w-full border border-blue-300 rounded-md p-2 focus:outline-none resize-none"
                              />
                            ) : (
                              <p
                                onDoubleClick={() => setEditingFundField("desc")}
                                className={cn("text-xs leading-relaxed cursor-default select-none", selected.desc ? "text-slate-700" : "text-slate-300 italic")}
                              >
                                {selected.desc || "No description yet — click ✨ to generate"}
                              </p>
                            )}
                          </div>
                        </div>

                      </div>

                      {/* Owner — pill buttons */}
                      <div className="mt-4 pt-3 border-t border-slate-100">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Owner</p>
                        <div className="flex gap-1.5">
                          {(["Andrew", "Gene", "Lance"] as const).map(o => (
                            <button
                              key={o}
                              onClick={() => setFundFieldOverride("owner", selected.owner === o ? "" : o)}
                              className={cn(
                                "px-2.5 py-0.5 text-xs font-medium rounded-full border transition-colors",
                                selected.owner === o
                                  ? "bg-blue-600 text-white border-blue-600"
                                  : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
                              )}
                            >
                              {o}
                            </button>
                          ))}
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
                        <div className="flex items-center gap-2">
                          {selectedId && generatingOverlapIds.has(selectedId) && (
                            <span className="flex items-center gap-1 text-[10px] text-violet-500 font-medium">
                              <Sparkles size={10} className="animate-pulse" /> Scanning…
                            </span>
                          )}
                          <button
                            onClick={() => setShowAddOverlap(v => !v)}
                            className="text-blue-600 hover:text-blue-700"
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                      </div>

                      {showAddOverlap && (
                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 mb-2 space-y-2">
                          {/* Search input — restricted to pipeline (startup) companies */}
                          <div className="relative">
                            <input
                              value={newOverlapName}
                              onChange={e => {
                                setNewOverlapName(e.target.value);
                                if (overlapSearchTimer.current) clearTimeout(overlapSearchTimer.current);
                                overlapSearchTimer.current = setTimeout(() => searchPipelineCompanies(e.target.value), 300);
                              }}
                              onFocus={() => { if (overlapSearchResults.length > 0) setOverlapSearchOpen(true); }}
                              onBlur={() => setTimeout(() => setOverlapSearchOpen(false), 150)}
                              placeholder="Search pipeline companies..."
                              className="w-full px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:border-blue-400"
                            />
                            {overlapSearchOpen && overlapSearchResults.length > 0 && (
                              <div className="absolute top-full left-0 right-0 mt-0.5 bg-white border border-slate-200 rounded-lg shadow-lg z-30 max-h-36 overflow-y-auto">
                                {overlapSearchResults.map(r => (
                                  <button
                                    key={r.id}
                                    onMouseDown={() => {
                                      setNewOverlapName(r.name);
                                      setOverlapSearchResults([]);
                                      setOverlapSearchOpen(false);
                                    }}
                                    className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-slate-50 text-left"
                                  >
                                    <span className="text-xs text-slate-700">{r.name}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <p className="text-[10px] text-gray-400 italic -mt-1">Only showing pipeline companies (startups)</p>
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
                            <button onClick={() => { setShowAddOverlap(false); setNewOverlapName(""); setOverlapSearchResults([]); setOverlapSearchOpen(false); }} className="flex-1 py-1 bg-white border border-slate-200 text-slate-600 text-xs rounded hover:bg-slate-50">Cancel</button>
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
                                {p.confidence && (
                                  <span className={cn("text-[10px] px-1 py-0.5 rounded font-medium", p.confidence === "high" ? "bg-emerald-50 text-emerald-600" : p.confidence === "medium" ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-400")}>
                                    {p.confidence}
                                  </span>
                                )}
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
                          <p className="text-xs text-slate-400">
                            {selectedId && generatingOverlapIds.has(selectedId) ? "Scanning pipeline…" : "No pipeline overlap found"}
                          </p>
                        );
                      })()}
                    </div>

                    {/* 4. Recent Investments */}
                    <div className="px-4 py-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Recent Investments</p>
                          {selectedId && fundInvestmentsUpdatedAt[selectedId] && (
                            <span className="text-[10px] text-slate-300">
                              · {new Date(fundInvestmentsUpdatedAt[selectedId]!).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={refreshRecentInvestments}
                          disabled={!!(selectedId && generatingRecentIds.has(selectedId))}
                          title="Refresh investments via AI"
                          className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-violet-600 transition-colors disabled:opacity-50"
                        >
                          {selectedId && generatingRecentIds.has(selectedId) ? (
                            <><Sparkles size={10} className="animate-pulse text-violet-500" /> Generating…</>
                          ) : (
                            <><RefreshCw size={10} /> Refresh</>
                          )}
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-400 italic mb-2">Recent investments (via live search)</p>
                      {(() => {
                        const filtered = selected.recentInvest;
                        return filtered.length > 0 ? (
                          <div className="flex flex-col gap-1.5">
                            {filtered.map(inv => (
                              <div
                                key={inv.name}
                                className="flex items-start justify-between gap-2 rounded-lg border border-slate-100 px-2.5 py-2 bg-slate-50"
                              >
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-slate-800 truncate">{inv.name}</p>
                                  <p className="text-[10px] text-slate-500">{inv.round}</p>
                                </div>
                                <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium whitespace-nowrap">
                                    {inv.sector}
                                  </span>
                                  <span className="text-[10px] text-slate-400">{inv.date}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400">
                            {selectedId && generatingRecentIds.has(selectedId) ? "Searching…" : "No recent investments found."}
                          </p>
                        );
                      })()}
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
                                      {c.last_contact_date && (
                                        <p className="text-[10px] text-blue-500 font-medium truncate">Last contact: {formatDate(c.last_contact_date)}</p>
                                      )}
                                      {c.title && <p className="text-[10px] text-slate-400 truncate">{c.title}</p>}
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
                              const isEditing = editingContactId === live.id;
                              return (
                                <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 space-y-1.5">
                                  {/* Header row with edit / close buttons */}
                                  <div className="flex items-center justify-between gap-1">
                                    {isEditing ? (
                                      <div className="flex gap-1 flex-1">
                                        <input
                                          className="flex-1 text-xs font-semibold bg-white border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                          value={contactEditForm.first_name}
                                          onChange={e => setContactEditForm(p => ({ ...p, first_name: e.target.value }))}
                                          placeholder="First"
                                        />
                                        <input
                                          className="flex-1 text-xs font-semibold bg-white border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                          value={contactEditForm.last_name}
                                          onChange={e => setContactEditForm(p => ({ ...p, last_name: e.target.value }))}
                                          placeholder="Last"
                                        />
                                      </div>
                                    ) : (
                                      <p className="text-xs font-semibold text-blue-800 flex-1">{live.first_name} {live.last_name}</p>
                                    )}
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      {isEditing ? (
                                        <>
                                          <button
                                            onClick={saveEditContact}
                                            disabled={savingContact}
                                            className="text-[10px] px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 font-medium"
                                          >
                                            {savingContact ? "Saving…" : "Save"}
                                          </button>
                                          <button onClick={() => setEditingContactId(null)} className="text-blue-400 hover:text-blue-600"><X size={12} /></button>
                                        </>
                                      ) : (
                                        <>
                                          <button
                                            onClick={() => startEditContact(live)}
                                            title="Edit contact"
                                            className="text-blue-400 hover:text-blue-600 p-0.5"
                                          >
                                            <Pencil size={11} />
                                          </button>
                                          <button onClick={() => setSelectedContact(null)} className="text-blue-400 hover:text-blue-600"><X size={12} /></button>
                                        </>
                                      )}
                                    </div>
                                  </div>

                                  {/* Title */}
                                  {isEditing ? (
                                    <input
                                      className="w-full text-[10px] bg-white border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                      value={contactEditForm.title}
                                      onChange={e => setContactEditForm(p => ({ ...p, title: e.target.value }))}
                                      placeholder="Title / Role"
                                    />
                                  ) : (
                                    live.title && <p className="text-[10px] text-blue-600 font-medium">{live.title}</p>
                                  )}

                                  {/* Email */}
                                  {isEditing ? (
                                    <input
                                      type="email"
                                      className="w-full text-[10px] bg-white border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                      value={contactEditForm.email}
                                      onChange={e => setContactEditForm(p => ({ ...p, email: e.target.value }))}
                                      placeholder="Email"
                                    />
                                  ) : (
                                    live.email && (
                                      <a href={`mailto:${live.email}`} className="flex items-center gap-1 text-[10px] text-blue-700 hover:underline truncate">
                                        <ExternalLink size={9} className="flex-shrink-0" />{live.email}
                                      </a>
                                    )
                                  )}

                                  {/* Phone */}
                                  {isEditing ? (
                                    <input
                                      className="w-full text-[10px] bg-white border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                      value={contactEditForm.phone}
                                      onChange={e => setContactEditForm(p => ({ ...p, phone: e.target.value }))}
                                      placeholder="Phone"
                                    />
                                  ) : (
                                    live.phone && <p className="text-[10px] text-blue-600">{live.phone}</p>
                                  )}

                                  {/* LinkedIn */}
                                  {isEditing ? (
                                    <input
                                      className="w-full text-[10px] bg-white border border-blue-300 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                      value={contactEditForm.linkedin_url}
                                      onChange={e => setContactEditForm(p => ({ ...p, linkedin_url: e.target.value }))}
                                      placeholder="LinkedIn URL"
                                    />
                                  ) : (
                                    live.linkedin_url && (
                                      <a href={live.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[10px] text-blue-600 hover:underline truncate">
                                        <ExternalLink size={9} className="flex-shrink-0" />LinkedIn
                                      </a>
                                    )
                                  )}

                                  {!isEditing && live.last_contact_date && (
                                    <p className="text-[10px] text-blue-500">Last contact: {formatDate(live.last_contact_date)}</p>
                                  )}
                                  {!isEditing && live.location_city && (
                                    <p className="text-[10px] text-blue-400">{live.location_city}{live.location_country ? `, ${live.location_country}` : ""}</p>
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

                          {/* Add / Link contact buttons */}
                          <div className="mt-2 space-y-1.5">
                            {showFundAddContact ? (
                              <div className="border border-blue-200 rounded-xl bg-blue-50 p-3 space-y-2">
                                <p className="text-xs font-semibold text-slate-700">New Contact</p>
                                <div className="grid grid-cols-2 gap-1.5">
                                  <input className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="First name *" value={fundNewContact.first_name} onChange={e => setFundNewContact(p => ({ ...p, first_name: e.target.value }))} />
                                  <input className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Last name" value={fundNewContact.last_name} onChange={e => setFundNewContact(p => ({ ...p, last_name: e.target.value }))} />
                                </div>
                                <input className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" type="email" placeholder="Email" value={fundNewContact.email} onChange={e => setFundNewContact(p => ({ ...p, email: e.target.value }))} />
                                <input className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Title / Role" value={fundNewContact.title} onChange={e => setFundNewContact(p => ({ ...p, title: e.target.value }))} />
                                <div className="flex gap-1.5">
                                  <button onClick={() => { setShowFundAddContact(false); setFundNewContact({ first_name: "", last_name: "", email: "", title: "" }); }} className="flex-1 py-1 border border-slate-200 rounded text-xs text-slate-600 hover:bg-white">Cancel</button>
                                  <button disabled={fundAddingContact || !fundNewContact.first_name.trim()} onClick={addFundContact}
                                    className="flex-1 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1">
                                    {fundAddingContact ? <><Loader2 size={10} className="animate-spin" />Adding…</> : <><Check size={10} />Add</>}
                                  </button>
                                </div>
                              </div>
                            ) : showFundLinkContact ? (
                              <div className="border border-indigo-200 rounded-xl bg-indigo-50 p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                  <p className="text-xs font-semibold text-slate-700">Link Existing Contact</p>
                                  <button onClick={() => { setShowFundLinkContact(false); setFundLinkSearch(""); setFundLinkSuggestions([]); }}><X size={12} className="text-slate-400" /></button>
                                </div>
                                <input className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                  placeholder="Search name or email…" value={fundLinkSearch}
                                  onChange={e => searchFundLinkContacts(e.target.value)} autoFocus />
                                {fundLinkSuggestions.length > 0 && (
                                  <div className="max-h-[140px] overflow-y-auto border border-slate-200 rounded-lg bg-white divide-y divide-slate-100">
                                    {fundLinkSuggestions.map(c => (
                                      <button key={c.id} disabled={fundLinkingContact} onClick={() => linkFundContact(c.id)}
                                        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-indigo-50 disabled:opacity-50">
                                        <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0"><User size={10} className="text-indigo-600" /></div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs font-medium text-slate-800 truncate">{c.first_name} {c.last_name}</p>
                                          {c.email && <p className="text-[10px] text-slate-400 truncate">{c.email}</p>}
                                        </div>
                                        {c.company_id && c.company_id !== selectedId && <span className="text-[10px] text-amber-600 bg-amber-50 px-1 rounded flex-shrink-0">Linked</span>}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {fundLinkSearch.length >= 2 && fundLinkSuggestions.length === 0 && <p className="text-[10px] text-slate-400 italic">No contacts found</p>}
                              </div>
                            ) : (
                              <div className="flex gap-1.5">
                                <button onClick={() => setShowFundAddContact(true)} className="flex-1 flex items-center justify-center gap-1 py-1.5 border-2 border-dashed border-slate-200 rounded-xl text-xs text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors"><Plus size={11} /> Add New</button>
                                <button onClick={() => setShowFundLinkContact(true)} className="flex-1 flex items-center justify-center gap-1 py-1.5 border-2 border-dashed border-indigo-200 rounded-xl text-xs text-indigo-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"><Link2 size={11} /> Link Existing</button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* 7. Interaction Timeline */}
                    <div className="px-4 py-3 border-t border-slate-100 mt-1">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Interaction Timeline</h3>
                        <button
                          onClick={() => { setFundAddingNote(p => !p); setFundNoteDate(new Date().toISOString().slice(0, 10)); }}
                          className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-blue-600 transition-colors border border-slate-200 rounded px-2 py-0.5 hover:border-blue-300"
                        >
                          <Plus size={9} /> Add
                        </button>
                      </div>

                      {fundAddingNote && (
                        <div className="mb-3 p-3 border border-blue-200 rounded-xl bg-blue-50 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Date</label>
                              <input type="date" className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" value={fundNoteDate} onChange={e => setFundNoteDate(e.target.value)} />
                            </div>
                            <div>
                              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1 block">Type</label>
                              <select className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" value={fundNoteType} onChange={e => setFundNoteType(e.target.value as "note" | "call" | "email")}>
                                <option value="note">Note</option>
                                <option value="call">Call</option>
                                <option value="email">Email</option>
                              </select>
                            </div>
                          </div>
                          <textarea className="w-full text-sm border border-slate-200 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" rows={2} placeholder="Notes (optional)…" value={fundNoteText} onChange={e => setFundNoteText(e.target.value)} />
                          {(() => {
                            const liveContacts = selectedId ? (fundContacts[selectedId] ?? []) : [];
                            if (liveContacts.length === 0) return null;
                            return (
                              <div>
                                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Tag Contacts</p>
                                <div className="max-h-[100px] overflow-y-auto border border-slate-200 rounded-lg bg-white p-1.5 space-y-1">
                                  {liveContacts.map((c: Contact) => (
                                    <label key={c.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 px-1 py-0.5 rounded">
                                      <input type="checkbox" checked={fundNoteContactIds.includes(c.id)} onChange={e => setFundNoteContactIds(prev => e.target.checked ? [...prev, c.id] : prev.filter(id => id !== c.id))} className="w-3 h-3 accent-blue-600" />
                                      <span className="text-xs text-slate-700">{c.first_name} {c.last_name}</span>
                                    </label>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => { setFundAddingNote(false); setFundNoteText(""); setFundNoteContactIds([]); }} className="text-xs px-3 py-1.5 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-100">Cancel</button>
                            <button onClick={handleAddFundNote} disabled={fundSavingNote} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 flex items-center gap-1">
                              {fundSavingNote ? <><Loader2 size={10} className="animate-spin" /> Saving…</> : <><Check size={10} /> Save</>}
                            </button>
                          </div>
                        </div>
                      )}

                      {(() => {
                        const ints = selectedId ? (fundInteractions[selectedId] ?? null) : null;
                        if (ints === null) return <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-slate-50 rounded-lg animate-pulse" />)}</div>;
                        if (ints.length === 0) return <p className="text-xs text-slate-400 italic">No interactions recorded yet</p>;
                        const kindIcon: Record<string, React.ReactNode> = {
                          meeting: <Calendar size={12} className="text-violet-500" />,
                          note:    <FileText size={12} className="text-slate-500" />,
                          email:   <Mail size={12} className="text-blue-500" />,
                          call:    <Phone size={12} className="text-green-500" />,
                        };
                        const kindColor: Record<string, string> = {
                          meeting: "border-violet-100 bg-violet-50",
                          note:    "border-slate-200 bg-slate-50",
                          email:   "border-blue-100 bg-blue-50",
                          call:    "border-green-100 bg-green-50",
                        };
                        return (
                          <div className="relative pl-4 max-h-[280px] overflow-y-auto pr-1">
                            <div className="absolute left-1.5 top-0 bottom-0 w-px bg-slate-100" />
                            <div className="space-y-2">
                              {ints.map(int => {
                                const liveContacts = selectedId ? (fundContacts[selectedId] ?? []) : [];
                                return (
                                  <div key={int.id} className="relative flex gap-2">
                                    <div className="absolute -left-4 mt-0.5 w-3 h-3 rounded-full bg-white border-2 border-slate-200" />
                                    <div className={cn("flex-1 rounded-lg border px-2.5 py-2 min-w-0", kindColor[int.type] ?? "border-slate-200 bg-slate-50")}>
                                      <div className="flex items-start justify-between gap-1">
                                        <div className="flex items-center gap-1.5 min-w-0">
                                          {kindIcon[int.type] ?? <FileText size={12} className="text-slate-400" />}
                                          <span className="text-xs font-medium text-slate-700 truncate">{int.subject ?? int.type.charAt(0).toUpperCase() + int.type.slice(1)}</span>
                                        </div>
                                        <div className="flex items-center gap-1 flex-shrink-0">
                                          <span className="text-[10px] text-slate-400">{formatDate(int.date)}</span>
                                          <button onClick={async () => { if (!confirm("Delete this interaction?")) return; await supabase.from("interactions").delete().eq("id", int.id); setFundInteractions(prev => ({ ...prev, [selectedId!]: (prev[selectedId!] ?? []).filter(i => i.id !== int.id) })); }} className="text-slate-300 hover:text-red-400 ml-1"><X size={10} /></button>
                                        </div>
                                      </div>
                                      {int.body && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{int.body}</p>}
                                      {int.contact_ids && int.contact_ids.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                          {int.contact_ids.map((cid: string) => {
                                            const tc = liveContacts.find((c: Contact) => c.id === cid);
                                            if (!tc) return null;
                                            return <span key={cid} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium"><User size={8} />{tc.first_name} {tc.last_name}</span>;
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* 8. Relationship Timeline — with + Add button */}
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

                    {/* 9. Meeting Transcripts */}
                    <div className="px-4 py-3 border-t border-slate-100">
                      <MeetingTranscripts companyId={selectedId} />
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
                  <div className="px-4 py-4 space-y-4 flex-1 overflow-y-auto">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Key Updates · Past 180 Days</p>
                        {selectedId && fundIntelCachedAt[selectedId] && !fundIntelLoading && (
                          <span className="text-[10px] text-slate-400">· {(() => { const d = Date.now() - new Date(fundIntelCachedAt[selectedId]).getTime(); const m = Math.floor(d/60000); if (m < 60) return `${m}m ago`; const h = Math.floor(m/60); if (h < 24) return `${h}h ago`; return `${Math.floor(h/24)}d ago`; })()}</span>
                        )}
                      </div>
                      <button
                        onClick={fetchFundIntelligence}
                        disabled={fundIntelLoading}
                        className="text-xs px-2.5 py-1 border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1"
                      >
                        {fundIntelLoading ? <><Loader2 size={10} className="animate-spin" />Loading…</> : <><Sparkles size={10} />Refresh</>}
                      </button>
                    </div>

                    {fundIntelLoading ? (
                      <div className="space-y-2">
                        {[1,2,3,4].map(i => <div key={i} className="h-16 bg-slate-50 rounded-lg animate-pulse" />)}
                      </div>
                    ) : fundIntelError ? (
                      <p className="text-xs text-red-400 italic">{fundIntelError}</p>
                    ) : !(fundIntelMap[selectedId ?? ""]?.length) ? (
                      <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-xl">
                        <Sparkles size={24} className="mx-auto mb-2 text-slate-300" />
                        <p className="text-xs text-slate-400 mb-1">No intelligence loaded</p>
                        <p className="text-[11px] text-slate-300">Click Refresh to fetch latest signals</p>
                      </div>
                    ) : (() => {
                      const items = fundIntelMap[selectedId ?? ""] ?? [];
                      const cutoff = new Date(Date.now() - 180 * 86_400_000);
                      const recent = items.filter(i => !i.date || new Date(i.date) >= cutoff)
                                       .sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());
                      const starred = (fundStarredIntel[selectedId ?? ""] ?? []);
                      const starredItems = items.filter(i => starred.includes(i.headline));

                      function FundIntelCard({ item }: { item: FundIntelItem }) {
                        const isStarred = starred.includes(item.headline);
                        const inner = (
                          <div className="border border-slate-200 rounded-xl p-3 bg-white hover:bg-slate-50 transition-colors">
                            <div className="flex items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-slate-800 leading-snug mb-1">{item.headline}</p>
                                {item.summary && <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-3">{item.summary}</p>}
                              </div>
                              <button
                                onClick={e => { e.preventDefault(); e.stopPropagation(); selectedId && toggleFundStar(selectedId, item.headline); }}
                                className={cn("flex-shrink-0 mt-0.5 transition-colors", isStarred ? "text-amber-400" : "text-slate-200 hover:text-amber-300")}
                              >
                                <Star size={13} fill={isStarred ? "currentColor" : "none"} />
                              </button>
                            </div>
                            <div className="flex items-center justify-between mt-2 gap-2">
                              <span className="text-[10px] text-slate-400">{item.source} · {item.date}</span>
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
                          <div className="space-y-2.5">
                            {(recent.length > 0 ? recent : items).map((item, i) => (
                              <FundIntelCard key={i} item={item} />
                            ))}
                          </div>
                          {starredItems.length > 0 && (
                            <div className="pt-3 border-t border-slate-100">
                              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                                <Star size={9} fill="currentColor" className="text-amber-400" /> Saved
                              </p>
                              <div className="space-y-2.5">
                                {starredItems.map((item, i) => (
                                  <FundIntelCard key={i} item={item} />
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                )}

              </div>

              {/* Footer buttons */}
              <div className="px-4 py-3 border-t border-slate-100 flex-shrink-0">
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCoInvestBrief(true)}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 transition-colors"
                  >
                    <ExternalLink size={11} />
                    Co-invest brief
                  </button>
                  <button
                    onClick={() => {
                      setFundTab("overview");
                      if (!selectedId) return;
                      // Force re-run overlap (remove from session cache so it re-fetches)
                      generatedDataRef.current.delete(`overlap:${selectedId}`);
                      setGeneratingOverlapIds(prev => new Set(prev).add(selectedId!));
                      (async () => {
                        try {
                          const res = await fetch("/api/funds/generate-overlap", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ company_id: selectedId }),
                          });
                          if (res.ok) {
                            const data = await res.json() as { overlap?: { initials: string; name: string; role: string }[] };
                            if (data.overlap) {
                              setFundOverrides(prev => ({
                                ...prev,
                                [selectedId!]: { ...(prev[selectedId!] ?? {}), portfolioOverlap: data.overlap },
                              }));
                            }
                          }
                        } catch { /* silent */ }
                        setGeneratingOverlapIds(prev => { const s = new Set(prev); s.delete(selectedId!); return s; });
                      })();
                    }}
                    className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors"
                  >
                    {selectedId && generatingOverlapIds.has(selectedId)
                      ? <><Loader2 size={11} className="animate-spin" /> Scanning…</>
                      : <><Search size={11} /> Find overlap</>
                    }
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

      </div>

      {/* ── Co-invest Brief Modal ───────────────────────────────────────────── */}
      {showCoInvestBrief && selected && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowCoInvestBrief(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
              <div>
                <h2 className="text-base font-bold text-slate-800">Co-invest Brief</h2>
                <p className="text-xs text-slate-500 mt-0.5">{selected.co}</p>
              </div>
              <button onClick={() => setShowCoInvestBrief(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="px-5 py-4 space-y-5">
              {/* Overview */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Fund Overview</p>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><p className="text-slate-400 mb-0.5">Type</p><p className="font-medium text-slate-700">{selected.type || "—"}</p></div>
                  <div><p className="text-slate-400 mb-0.5">Location</p><p className="font-medium text-slate-700">{selected.loc || "—"}</p></div>
                  <div><p className="text-slate-400 mb-0.5">AUM</p><p className="font-medium text-slate-700">{selected.aum || "—"}</p></div>
                  <div><p className="text-slate-400 mb-0.5">Check size</p><p className="font-medium text-slate-700">{selected.checkSize || "—"}</p></div>
                  <div><p className="text-slate-400 mb-0.5">Stage focus</p><p className="font-medium text-slate-700">{selected.stages.join(", ") || "—"}</p></div>
                  <div><p className="text-slate-400 mb-0.5">Co-invest status</p><p className="font-medium text-slate-700">{selected.coInvestLabel}</p></div>
                </div>
              </div>
              {/* Description */}
              {selected.desc && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">About</p>
                  <p className="text-xs text-slate-600 leading-relaxed">{selected.desc}</p>
                </div>
              )}
              {/* Thesis alignment */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Thesis Alignment</p>
                <div className="space-y-2">
                  {[
                    { label: "Cleantech", value: selected.cleantech, color: "bg-emerald-500" },
                    { label: "TechBio", value: selected.techbio, color: "bg-violet-500" },
                    { label: "Overall", value: selected.overallAlign, color: "bg-blue-500" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="text-xs text-slate-500 w-20 flex-shrink-0">{label}</span>
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-slate-700 w-8 text-right tabular-nums">{value}%</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Portfolio overlap */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  Portfolio Overlap
                  {selectedId && generatingOverlapIds.has(selectedId) && (
                    <span className="ml-2 text-violet-500 font-normal normal-case"><Loader2 size={9} className="inline animate-spin mr-0.5" />Scanning…</span>
                  )}
                </p>
                {selected.portfolioOverlap.length > 0 ? (
                  <div className="space-y-1.5">
                    {selected.portfolioOverlap.map(p => (
                      <div key={p.name} className="flex items-center gap-2 text-xs">
                        <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                          <span className="text-[9px] font-bold text-blue-700">{p.initials}</span>
                        </div>
                        <span className="font-medium text-slate-700 flex-1">{p.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${p.role === "Lead investor" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{p.role}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">
                    {selectedId && generatingOverlapIds.has(selectedId) ? "Scanning your pipeline…" : "No portfolio overlap found"}
                  </p>
                )}
              </div>
              {/* Recent investments */}
              {selected.recentInvest.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Recent Investments</p>
                  <div className="space-y-1.5">
                    {selected.recentInvest.map(inv => (
                      <div key={inv.name} className="flex items-center justify-between text-xs p-2 bg-slate-50 rounded-lg">
                        <div>
                          <p className="font-medium text-slate-800">{inv.name}</p>
                          <p className="text-slate-400">{inv.round}</p>
                        </div>
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">{inv.sector}</span>
                          <span className="text-slate-400">{inv.date}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Relationship */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Relationship Health</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${selected.relHealth >= 70 ? "bg-emerald-500" : selected.relHealth >= 40 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${selected.relHealth}%` }} />
                  </div>
                  <span className="text-sm font-bold text-slate-700 tabular-nums">{selected.relHealth}/100</span>
                </div>
                {selected.owner && (
                  <p className="text-xs text-slate-500 mt-1.5">Owner: <span className="font-medium text-slate-700">{selected.owner}</span></p>
                )}
                {selected.lastContact && (
                  <p className="text-xs text-slate-500 mt-0.5">Last contact: <span className="font-medium text-slate-700">{selected.lastContact}</span></p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Fund Modal ───────────────────────────────────────────────────── */}
      {showAddFund && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setShowAddFund(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800">Add Fund / VC</h2>
              <button onClick={() => setShowAddFund(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              {/* Fund Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Fund Name *</label>
                <input
                  value={addFundName}
                  onChange={e => setAddFundName(e.target.value)}
                  placeholder="e.g. Lowercarbon Capital"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {/* Investor Type */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Investor Type</label>
                <select
                  value={addFundType}
                  onChange={e => setAddFundType(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">Select type…</option>
                  {["Venture Capital", "Corporate VC", "Family Office", "Fund of Fund", "Angel", "Accelerator", "Government", "Other"].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              {/* City + Country */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">City</label>
                  <input value={addFundCity} onChange={e => setAddFundCity(e.target.value)} placeholder="e.g. San Francisco"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Country</label>
                  <input value={addFundCountry} onChange={e => setAddFundCountry(e.target.value)} placeholder="e.g. USA"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              {/* Stage Focus — multi-select checkboxes */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Stage Focus</label>
                <div className="flex flex-wrap gap-2">
                  {["Pre-Seed", "Seed", "Series A", "Series B", "Growth", "Multi-Stage"].map(s => {
                    const on = addFundStages.includes(s);
                    return (
                      <button key={s} type="button"
                        onClick={() => setAddFundStages(prev => on ? prev.filter(x => x !== s) : [...prev, s])}
                        className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                          on ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600")}>
                        {on && <Check size={10} />}{s}
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Contact section */}
              {!showAddFundContact ? (
                <button type="button" onClick={() => setShowAddFundContact(true)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-slate-200 rounded-xl text-xs text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors">
                  <Plus size={12} /> Add Contact
                </button>
              ) : (
                <div className="border border-blue-200 rounded-xl bg-blue-50 p-3 space-y-2">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-slate-700">Contact Details</p>
                    <button type="button" onClick={() => { setShowAddFundContact(false); setAddFundContactFirst(""); setAddFundContactLast(""); setAddFundContactEmail(""); }}
                      className="text-slate-400 hover:text-slate-600"><X size={12} /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                      placeholder="First name *" value={addFundContactFirst} onChange={e => setAddFundContactFirst(e.target.value)} />
                    <input className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                      placeholder="Last name" value={addFundContactLast} onChange={e => setAddFundContactLast(e.target.value)} />
                  </div>
                  <input className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    type="email" placeholder="Email" value={addFundContactEmail} onChange={e => setAddFundContactEmail(e.target.value)} />
                </div>
              )}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setShowAddFund(false)}
                className="flex-1 py-2 bg-white border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={handleAddFund} disabled={!addFundName.trim() || savingFund}
                className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {savingFund ? <><Loader2 size={13} className="animate-spin" />Adding…</> : <><Check size={14} /> Add Fund</>}
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
