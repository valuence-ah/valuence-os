"use client";
// ─── LP CRM — Sophisticated LP pipeline with metrics, table, and detail panel ──

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Company, Contact, Interaction, CompanyType } from "@/lib/types";
import { cn, formatDate, formatCurrency, getInitials, timeAgo } from "@/lib/utils";
import {
  Search, X, ExternalLink, Mail, Phone, User, MapPin, ChevronRight,
  Filter, Download, Plus, Target, TrendingUp, Users, DollarSign,
  BarChart2, Calendar, AlertCircle, CheckSquare, Video, Clock,
  ChevronDown, MoreHorizontal, Loader2, ArrowUpRight, FileText,
} from "lucide-react";

// ── LP Stage config ────────────────────────────────────────────────────────────

const LP_STAGE_OPTIONS = [
  "Lead",
  "Initial Meeting",
  "Discussion in Process",
  "Due Diligence",
  "Committed",
  "Passed",
] as const;
type LpStageOption = typeof LP_STAGE_OPTIONS[number];

const STAGE_DOT: Record<string, string> = {
  "Lead":                   "bg-slate-400",
  "Initial Meeting":        "bg-blue-500",
  "Discussion in Process":  "bg-amber-500",
  "Due Diligence":          "bg-violet-500",
  "Committed":              "bg-emerald-500",
  "Passed":                 "bg-red-400",
};

const STAGE_TEXT: Record<string, string> = {
  "Lead":                   "text-slate-600",
  "Initial Meeting":        "text-blue-700",
  "Discussion in Process":  "text-amber-700",
  "Due Diligence":          "text-violet-700",
  "Committed":              "text-emerald-700",
  "Passed":                 "text-red-600",
};

const STAGE_BG: Record<string, string> = {
  "Lead":                   "bg-slate-100",
  "Initial Meeting":        "bg-blue-50",
  "Discussion in Process":  "bg-amber-50",
  "Due Diligence":          "bg-violet-50",
  "Committed":              "bg-emerald-50",
  "Passed":                 "bg-red-50",
};

// DDQ status derived from stage
function getDdqStatus(stage: string | null): { label: string; color: string } {
  if (!stage) return { label: "Not Started", color: "bg-slate-100 text-slate-500" };
  if (stage === "Lead" || stage === "Initial Meeting")
    return { label: "Not Started", color: "bg-slate-100 text-slate-500" };
  if (stage === "Discussion in Process")
    return { label: "Requested", color: "bg-amber-100 text-amber-700" };
  if (stage === "Due Diligence")
    return { label: "In Progress", color: "bg-blue-100 text-blue-700" };
  if (stage === "Committed")
    return { label: "Complete", color: "bg-emerald-100 text-emerald-700" };
  return { label: "N/A", color: "bg-slate-100 text-slate-400" };
}

// Tier derived from priority
function getTier(priority: string | null): string {
  if (priority === "High") return "Tier 1";
  if (priority === "Medium") return "Tier 2";
  if (priority === "Low") return "Tier 3";
  return "—";
}

// LP type badge color
function getLpTypeBadge(lpType: string | null): string {
  if (!lpType) return "bg-slate-100 text-slate-500";
  const t = lpType.toLowerCase();
  if (t.includes("family")) return "bg-purple-100 text-purple-700";
  if (t.includes("pension")) return "bg-blue-100 text-blue-700";
  if (t.includes("endowment")) return "bg-teal-100 text-teal-700";
  if (t.includes("foundation")) return "bg-orange-100 text-orange-700";
  if (t.includes("fund")) return "bg-indigo-100 text-indigo-700";
  if (t.includes("sovereign")) return "bg-amber-100 text-amber-700";
  if (t.includes("corporate")) return "bg-slate-100 text-slate-600";
  return "bg-gray-100 text-gray-600";
}

// Probability by stage
function calcProbPct(stage: string | null): number {
  if (stage === "Lead") return 0;
  if (stage === "Initial Meeting") return 0.05;
  if (stage === "Discussion in Process") return 0.10;
  if (stage === "Due Diligence") return 0.25;
  if (stage === "Committed") return 1.0;
  return 0;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPct(pct: number): string {
  return pct === 0 ? "0%" : `${Math.round(pct * 100)}%`;
}

function formatCompact(val: number | null | undefined): string {
  return formatCurrency(val, true);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CompanyLogo({ company, size = "md" }: { company: Company; size?: "sm" | "md" | "lg" }) {
  const [imgError, setImgError] = useState(false);
  const sz =
    size === "sm" ? "w-7 h-7 text-[9px]" :
    size === "lg" ? "w-12 h-12 text-sm" :
    "w-9 h-9 text-xs";

  const domain = company.website?.replace(/^https?:\/\//, "").split("/")[0];
  const logoSrc = company.logo_url ?? (domain ? `https://logo.clearbit.com/${domain}` : null);

  useEffect(() => { setImgError(false); }, [logoSrc]);

  if (logoSrc && !imgError) {
    return (
      <img
        src={logoSrc}
        alt={company.name}
        onError={() => setImgError(true)}
        className={`${sz} rounded-md object-contain bg-white border border-slate-200 p-0.5 flex-shrink-0`}
      />
    );
  }
  return (
    <div className={`${sz} rounded-md bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0`}>
      <span className="text-white font-bold">{getInitials(company.name)}</span>
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${accent}`}>
        <Icon size={14} className="text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">{label}</p>
        <p className="text-lg font-bold text-slate-900 leading-tight truncate">{value}</p>
        {sub && <p className="text-[11px] text-slate-400 leading-tight">{sub}</p>}
      </div>
    </div>
  );
}

function InteractionIcon({ type }: { type: string }) {
  if (type === "email") return <Mail size={11} className="text-blue-500" />;
  if (type === "call") return <Phone size={11} className="text-green-500" />;
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
        <div
          className={cn(
            "h-full rounded-full transition-all",
            value >= 75 ? "bg-emerald-500" : value >= 50 ? "bg-amber-400" : "bg-slate-300"
          )}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

const FILTER_PILLS = [
  { id: "all", label: "All stages" },
  { id: "family", label: "Family office" },
  { id: "anchor", label: "Anchor tier" },
  { id: "overdue", label: "Overdue follow-ups" },
  { id: "coinvest", label: "Co-invest interest" },
] as const;

type FilterId = typeof FILTER_PILLS[number]["id"];

const ALL_TYPE_OPTIONS: { value: CompanyType; label: string }[] = [
  { value: "startup",           label: "Startup" },
  { value: "limited partner",   label: "Limited Partner" },
  { value: "investor",          label: "Investor" },
  { value: "strategic partner", label: "Strategic Partner" },
  { value: "ecosystem_partner", label: "Ecosystem Partner" },
  { value: "other",             label: "Other" },
];

interface Props {
  initialCompanies: Company[];
}

export function LpViewClient({ initialCompanies }: Props) {
  const supabase = createClient();

  // ── State ──────────────────────────────────────────────────────────────────
  const [companies, setCompanies]         = useState<Company[]>(initialCompanies);
  const [selectedId, setSelectedId]       = useState<string | null>(null);
  const [search, setSearch]               = useState("");
  const [activeFilter, setActiveFilter]   = useState<FilterId>("all");
  const [contacts, setContacts]           = useState<Contact[]>([]);
  const [interactions, setInteractions]   = useState<Interaction[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [editStage, setEditStage]         = useState<string>("");
  const [editGoal, setEditGoal]           = useState<string>("");
  const [editType, setEditType]           = useState<string>("");
  const [lastEmailMap, setLastEmailMap]   = useState<Record<string, string>>({});
  const [contactCountMap, setContactCountMap] = useState<Record<string, number>>({});
  const [contactNamesMap, setContactNamesMap] = useState<Record<string, string>>({});

  // ── Load last email dates ──────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("interactions")
        .select("company_id, date, type")
        .in("type", ["email", "call", "meeting"])
        .order("date", { ascending: false });
      if (!data) return;
      const map: Record<string, string> = {};
      const typeMap: Record<string, string> = {};
      for (const row of data) {
        if (row.company_id && !map[row.company_id]) {
          map[row.company_id] = row.date;
          typeMap[row.company_id] = row.type;
        }
      }
      setLastEmailMap(map);
    }
    load();
  }, [supabase]);

  useEffect(() => {
    async function load() {
      if (companies.length === 0) return;
      const ids = companies.map((c) => c.id);
      const { data } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, company_id")
        .in("company_id", ids);
      if (!data) return;
      const counts: Record<string, number> = {};
      const names: Record<string, string> = {};
      for (const contact of data) {
        if (!contact.company_id) continue;
        counts[contact.company_id] = (counts[contact.company_id] ?? 0) + 1;
        if (!names[contact.company_id]) {
          names[contact.company_id] = `${contact.first_name} ${contact.last_name}`;
        }
      }
      setContactCountMap(counts);
      setContactNamesMap(names);
    }
    load();
  }, [companies, supabase]);

  // ── Computed metrics ───────────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const active = companies.filter((c) => c.lp_stage && c.lp_stage !== "Passed");
    const committed = companies.filter((c) => c.lp_stage === "Committed");
    const softCircled = companies.filter((c) =>
      c.lp_stage === "Due Diligence" || c.lp_stage === "Discussion in Process"
    );
    const pipeline = companies.filter((c) =>
      c.lp_stage && !["Passed", "Committed"].includes(c.lp_stage)
    );

    const fundTarget = companies.reduce((s, c) => s + (c.commitment_goal ?? 0), 0);
    const committedAmt = committed.reduce((s, c) => s + (c.commitment_goal ?? 0), 0);
    const softAmt = softCircled.reduce((s, c) => s + (c.commitment_goal ?? 0), 0);
    const pipelineAmt = pipeline.reduce((s, c) => s + (c.commitment_goal ?? 0), 0);
    const goalsWithValue = companies.filter((c) => c.commitment_goal != null);
    const avgCheck = goalsWithValue.length > 0
      ? goalsWithValue.reduce((s, c) => s + (c.commitment_goal ?? 0), 0) / goalsWithValue.length
      : 0;
    const convRate = companies.length > 0
      ? Math.round((committed.length / companies.length) * 100)
      : 0;

    return {
      fundTarget, committedAmt, softAmt, pipelineAmt,
      avgCheck, convRate, activeCount: active.length,
      committedPct: fundTarget > 0 ? (committedAmt / fundTarget) * 100 : 0,
      softPct:      fundTarget > 0 ? (softAmt / fundTarget) * 100 : 0,
      pipelinePct:  fundTarget > 0 ? (pipelineAmt / fundTarget) * 100 : 0,
    };
  }, [companies]);

  // ── Filtered rows ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return companies.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) &&
          !(c.location_city ?? "").toLowerCase().includes(q) &&
          !(c.lp_type ?? "").toLowerCase().includes(q)) return false;

      if (activeFilter === "family") {
        return (c.lp_type ?? "").toLowerCase().includes("family");
      }
      if (activeFilter === "anchor") {
        return c.priority === "High";
      }
      if (activeFilter === "overdue") {
        const last = lastEmailMap[c.id];
        if (!last) return true; // never contacted = overdue
        const daysSince = (Date.now() - new Date(last).getTime()) / 86_400_000;
        return daysSince > 30;
      }
      if (activeFilter === "coinvest") {
        return (c.tags ?? []).some((t) => t.toLowerCase().includes("co-invest"));
      }
      return true;
    });
  }, [companies, search, activeFilter, lastEmailMap]);

  // ── Load detail ────────────────────────────────────────────────────────────
  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    const [{ data: ctcts }, { data: ints }] = await Promise.all([
      supabase.from("contacts").select("*").eq("company_id", id).order("is_primary_contact", { ascending: false }),
      supabase.from("interactions").select("*").eq("company_id", id).order("date", { ascending: false }).limit(15),
    ]);
    setContacts(ctcts ?? []);
    setInteractions(ints ?? []);
    setLoadingDetail(false);
  }, [supabase]);

  function selectCompany(id: string) {
    const co = companies.find((c) => c.id === id);
    if (!co) return;
    setSelectedId(id);
    setEditStage(co.lp_stage ?? "");
    setEditGoal(co.commitment_goal != null ? String(co.commitment_goal) : "");
    setEditType(co.type ?? "");
    loadDetail(id);
  }

  const selected = companies.find((c) => c.id === selectedId) ?? null;

  // ── Save field ─────────────────────────────────────────────────────────────
  async function saveField(id: string, patch: Partial<Company>) {
    const { data, error } = await supabase
      .from("companies").update(patch).eq("id", id).select().single();
    if (!error && data) {
      setCompanies((prev) => prev.map((c) => (c.id === data.id ? (data as Company) : c)));
      if ("lp_stage" in patch) setEditStage((data as Company).lp_stage ?? "");
      if ("commitment_goal" in patch)
        setEditGoal((data as Company).commitment_goal != null ? String((data as Company).commitment_goal) : "");
    }
  }

  // Derived for panel
  const prob = selected ? calcProbPct(selected.lp_stage) : 0;
  const goal = selected?.commitment_goal ?? null;
  const expectedCommitment = goal != null ? goal * prob : null;
  const primaryContact = contacts.find((c) => c.is_primary_contact) ?? contacts[0] ?? null;
  const lastInteraction = interactions[0] ?? null;

  // Mandate alignment scores (computed from available data)
  const mandateScores = useMemo(() => {
    if (!selected) return null;
    const stageScore = {
      "Lead": 20, "Initial Meeting": 35, "Discussion in Process": 55,
      "Due Diligence": 75, "Committed": 95, "Passed": 10,
    }[selected.lp_stage ?? ""] ?? 20;
    const ticketScore = selected.commitment_goal
      ? Math.min(100, Math.round((selected.commitment_goal / 5_000_000) * 100))
      : 30;
    const geoScore = selected.location_country ? 70 : 40;
    const sectorScore = selected.fund_focus ? 75 : 50;
    return { stageScore, ticketScore, geoScore, sectorScore };
  }, [selected]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-slate-50">

      {/* ── Metrics bar ──────────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-slate-200 bg-white">
        <div className="flex gap-3 mb-4">
          <MetricCard
            label="Fund Target" value={formatCompact(metrics.fundTarget || null)}
            sub={`${companies.length} LPs`} icon={Target} accent="bg-blue-500"
          />
          <MetricCard
            label="Committed" value={formatCompact(metrics.committedAmt || null)}
            sub={`${formatPct(metrics.committedPct / 100)} of target`} icon={CheckSquare} accent="bg-emerald-500"
          />
          <MetricCard
            label="Soft-circled" value={formatCompact(metrics.softAmt || null)}
            sub={`${formatPct(metrics.softPct / 100)} of target`} icon={TrendingUp} accent="bg-amber-500"
          />
          <MetricCard
            label="Active Pipeline" value={String(metrics.activeCount)}
            sub={formatCompact(metrics.pipelineAmt || null)} icon={BarChart2} accent="bg-violet-500"
          />
          <MetricCard
            label="Avg Check Size" value={formatCompact(metrics.avgCheck || null)}
            icon={DollarSign} accent="bg-indigo-500"
          />
          <MetricCard
            label="Conversion Rate" value={`${metrics.convRate}%`}
            sub="committed / total" icon={ArrowUpRight} accent="bg-rose-500"
          />
        </div>

        {/* Progress bar */}
        {metrics.fundTarget > 0 && (
          <div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(metrics.committedPct, 100)}%` }}
              />
              <div
                className="h-full bg-amber-400 transition-all"
                style={{ width: `${Math.min(metrics.softPct, 100 - metrics.committedPct)}%` }}
              />
              <div
                className="h-full bg-blue-300 transition-all"
                style={{ width: `${Math.min(metrics.pipelinePct, 100 - metrics.committedPct - metrics.softPct)}%` }}
              />
            </div>
            <div className="flex gap-4 mt-1.5">
              <span className="flex items-center gap-1 text-[10px] text-slate-500">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                Committed {formatPct(metrics.committedPct / 100)}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-slate-500">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                Soft-circled {formatPct(metrics.softPct / 100)}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-slate-500">
                <span className="w-2 h-2 rounded-full bg-blue-300 inline-block" />
                Pipeline {formatPct(metrics.pipelinePct / 100)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="px-5 py-3 border-b border-slate-200 bg-white flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="pl-8 pr-3 py-1.5 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
            placeholder="Search LPs…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Filter pills */}
        <div className="flex gap-1.5 flex-wrap">
          {FILTER_PILLS.map((pill) => (
            <button
              key={pill.id}
              onClick={() => setActiveFilter(pill.id)}
              className={cn(
                "px-3 py-1 text-xs font-medium rounded-full border transition-colors",
                activeFilter === pill.id
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600"
              )}
            >
              {pill.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* Actions */}
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
          <Download size={12} /> Export CSV
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          <Plus size={12} /> Add LP
        </button>

        <span className="text-xs text-slate-400 ml-1">{filtered.length} LP{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* ── Table + Panel ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* Table */}
        <div className={cn("flex-1 overflow-auto transition-all", selected ? "mr-[460px]" : "")}>
          <table className="w-full text-sm border-collapse min-w-[1100px]">
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="w-8 px-3 py-2.5">
                  <input type="checkbox" className="rounded border-slate-300" />
                </th>
                {[
                  "Company", "LP Type", "Tier", "Stage",
                  "Commit Goal", "Expected", "Prob %",
                  "Last Touchpoint", "Next Follow-up",
                  "DDQ Status", "Strategic Value", "City",
                ].map((col) => (
                  <th
                    key={col}
                    className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
                <th className="w-8 px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-16 text-center text-slate-400 text-sm">
                    {search ? `No results for "${search}"` : "No LPs found"}
                  </td>
                </tr>
              ) : (
                filtered.map((co) => {
                  const isActive   = co.id === selectedId;
                  const p          = calcProbPct(co.lp_stage);
                  const expected   = co.commitment_goal != null ? co.commitment_goal * p : null;
                  const ddq        = getDdqStatus(co.lp_stage);
                  const tier       = getTier(co.priority);
                  const lastDate   = lastEmailMap[co.id] ?? null;
                  const daysAgo    = lastDate
                    ? Math.floor((Date.now() - new Date(lastDate).getTime()) / 86_400_000)
                    : null;
                  const isOverdue  = daysAgo != null && daysAgo > 30;
                  const tags       = (co.tags ?? []).slice(0, 2);

                  return (
                    <tr
                      key={co.id}
                      onClick={() => selectCompany(co.id)}
                      className={cn(
                        "border-b border-slate-100 cursor-pointer transition-colors group",
                        isActive ? "bg-blue-50" : "hover:bg-slate-50 bg-white"
                      )}
                    >
                      {/* Checkbox */}
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="rounded border-slate-300" />
                      </td>

                      {/* Company */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <CompanyLogo company={co} size="sm" />
                          <span className={cn("font-medium text-sm truncate max-w-[140px]",
                            isActive ? "text-blue-700" : "text-slate-800"
                          )}>
                            {co.name}
                          </span>
                        </div>
                      </td>

                      {/* LP Type */}
                      <td className="px-3 py-2.5">
                        {co.lp_type ? (
                          <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap", getLpTypeBadge(co.lp_type))}>
                            {co.lp_type}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Tier */}
                      <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">
                        {tier}
                      </td>

                      {/* Stage */}
                      <td className="px-3 py-2.5">
                        {co.lp_stage ? (
                          <div className="flex items-center gap-1.5">
                            <span className={cn("w-2 h-2 rounded-full flex-shrink-0", STAGE_DOT[co.lp_stage] ?? "bg-slate-300")} />
                            <span className={cn("text-xs font-medium whitespace-nowrap", STAGE_TEXT[co.lp_stage] ?? "text-slate-600")}>
                              {co.lp_stage}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Commit goal */}
                      <td className="px-3 py-2.5 text-right text-xs text-slate-700 tabular-nums whitespace-nowrap">
                        {formatCompact(co.commitment_goal)}
                      </td>

                      {/* Expected */}
                      <td className="px-3 py-2.5 text-right text-xs font-medium text-slate-800 tabular-nums whitespace-nowrap">
                        {expected != null ? formatCompact(expected) : <span className="text-slate-300">—</span>}
                      </td>

                      {/* Prob % */}
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-10 h-1.5 bg-slate-100 rounded-full overflow-hidden flex-shrink-0">
                            <div
                              className={cn("h-full rounded-full", p > 0 ? "bg-emerald-500" : "bg-slate-200")}
                              style={{ width: `${p * 100}%` }}
                            />
                          </div>
                          <span className={cn("text-xs tabular-nums", p > 0 ? "text-emerald-600 font-medium" : "text-slate-400")}>
                            {formatPct(p)}
                          </span>
                        </div>
                      </td>

                      {/* Last touchpoint */}
                      <td className="px-3 py-2.5">
                        {lastDate ? (
                          <div className="flex items-center gap-1.5">
                            <Mail size={11} className="text-blue-400 flex-shrink-0" />
                            <span className={cn("text-xs whitespace-nowrap", isOverdue ? "text-red-500 font-medium" : "text-slate-500")}>
                              {timeAgo(lastDate)}
                            </span>
                            {isOverdue && <AlertCircle size={10} className="text-red-400 flex-shrink-0" />}
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">Never</span>
                        )}
                      </td>

                      {/* Next follow-up */}
                      <td className="px-3 py-2.5">
                        {co.last_contact_date ? (
                          <span className="text-xs text-slate-500 whitespace-nowrap">
                            {formatDate(co.last_contact_date)}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>

                      {/* DDQ Status */}
                      <td className="px-3 py-2.5">
                        <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap", ddq.color)}>
                          {ddq.label}
                        </span>
                      </td>

                      {/* Strategic value tags */}
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1 flex-wrap">
                          {tags.length > 0 ? tags.map((t) => (
                            <span key={t} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                              {t}
                            </span>
                          )) : <span className="text-slate-300 text-xs">—</span>}
                        </div>
                      </td>

                      {/* City */}
                      <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                        {co.location_city ?? <span className="text-slate-300">—</span>}
                      </td>

                      {/* More */}
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <button className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded hover:bg-slate-200 text-slate-400 transition-all">
                          <MoreHorizontal size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Detail panel ─────────────────────────────────────────────────── */}
        <div
          className={cn(
            "fixed right-0 top-0 h-full bg-white border-l border-slate-200 shadow-2xl z-30 flex flex-col transition-transform duration-300 ease-in-out",
            selected ? "translate-x-0" : "translate-x-full"
          )}
          style={{ width: 460 }}
        >
          {selected && (
            <>
              {/* Panel header */}
              <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <CompanyLogo company={selected} size="lg" />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-bold text-slate-900 truncate">{selected.name}</h2>
                    {selected.lp_type && (
                      <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", getLpTypeBadge(selected.lp_type))}>
                        {selected.lp_type}
                      </span>
                    )}
                    <div className="flex items-center gap-3 mt-1.5">
                      {selected.location_city && (
                        <span className="flex items-center gap-1 text-[11px] text-slate-400">
                          <MapPin size={9} /> {[selected.location_city, selected.location_country].filter(Boolean).join(", ")}
                        </span>
                      )}
                      {selected.website && (
                        <a href={selected.website} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[11px] text-blue-500 hover:underline">
                          <ExternalLink size={9} /> Website
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedId(null)}
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 flex-shrink-0"
                >
                  <X size={14} />
                </button>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 px-5 py-3 border-b border-slate-100">
                <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex-1 justify-center">
                  <Mail size={11} /> Email
                </button>
                <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 flex-1 justify-center">
                  <FileText size={11} /> Prep Brief
                </button>
                <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 flex-1 justify-center">
                  <ChevronDown size={11} /> Update Stage
                </button>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

                {/* ── LP Status ── */}
                <div>
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">LP Status</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Stage</p>
                      <select
                        className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-700"
                        value={editStage}
                        onChange={async (e) => {
                          setEditStage(e.target.value);
                          await saveField(selected.id, { lp_stage: e.target.value || null });
                        }}
                      >
                        <option value="">Not set</option>
                        {LP_STAGE_OPTIONS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Commitment Goal</p>
                      <input
                        type="number"
                        className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-700"
                        placeholder="e.g. 5000000"
                        value={editGoal}
                        onChange={(e) => setEditGoal(e.target.value)}
                        onBlur={async () => {
                          const num = parseFloat(editGoal);
                          await saveField(selected.id, { commitment_goal: isNaN(num) ? null : num });
                        }}
                      />
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Probability</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${prob * 100}%` }} />
                        </div>
                        <span className={cn("text-sm font-bold", prob > 0 ? "text-emerald-600" : "text-slate-400")}>
                          {formatPct(prob)}
                        </span>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Expected</p>
                      <span className="text-sm font-bold text-slate-800">
                        {expectedCommitment != null ? formatCompact(expectedCommitment) : "—"}
                      </span>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">DDQ Status</p>
                      <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", getDdqStatus(selected.lp_stage).color)}>
                        {getDdqStatus(selected.lp_stage).label}
                      </span>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Tier</p>
                      <span className="text-xs font-medium text-slate-700">{getTier(selected.priority)}</span>
                    </div>
                  </div>
                </div>

                {/* ── Mandate Alignment ── */}
                {mandateScores && (
                  <div className="pt-4 border-t border-slate-100">
                    <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Mandate Alignment</h3>
                    <div className="space-y-3">
                      <AlignmentBar label="Relationship strength" value={mandateScores.stageScore} />
                      <AlignmentBar label="Ticket size fit" value={mandateScores.ticketScore} />
                      <AlignmentBar label="Geographic alignment" value={mandateScores.geoScore} />
                      <AlignmentBar label="Sector focus" value={mandateScores.sectorScore} />
                    </div>
                  </div>
                )}

                {/* ── Contacts ── */}
                <div className="pt-4 border-t border-slate-100">
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Contacts</h3>
                  {loadingDetail ? (
                    <div className="space-y-2">
                      {[1, 2].map((i) => (
                        <div key={i} className="h-12 bg-slate-50 rounded-lg animate-pulse" />
                      ))}
                    </div>
                  ) : contacts.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No contacts linked yet</p>
                  ) : (
                    <div className="space-y-2">
                      {contacts.map((c) => (
                        <div key={c.id} className="flex items-center gap-2.5 p-2.5 bg-slate-50 rounded-lg">
                          <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                            <User size={11} className="text-violet-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-slate-800 truncate">
                              {c.first_name} {c.last_name}
                              {c.is_primary_contact && (
                                <span className="ml-1.5 text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Primary</span>
                              )}
                            </p>
                            <p className="text-[11px] text-slate-500 truncate">{c.title ?? c.type}</p>
                          </div>
                          <div className="flex gap-1.5 text-slate-400">
                            {c.email && <a href={`mailto:${c.email}`} className="hover:text-blue-500"><Mail size={11} /></a>}
                            {c.phone && <a href={`tel:${c.phone}`} className="hover:text-green-500"><Phone size={11} /></a>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ── Activity Timeline ── */}
                <div className="pt-4 border-t border-slate-100">
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Activity Timeline</h3>
                  {loadingDetail ? (
                    <div className="space-y-2">
                      {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-slate-50 rounded-lg animate-pulse" />)}
                    </div>
                  ) : interactions.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No interactions recorded</p>
                  ) : (
                    <div className="relative pl-4">
                      <div className="absolute left-1.5 top-0 bottom-0 w-px bg-slate-100" />
                      <div className="space-y-3">
                        {interactions.slice(0, 8).map((int) => (
                          <div key={int.id} className="relative flex gap-2.5">
                            <div className="absolute -left-4 mt-0.5 w-3 h-3 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center flex-shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start gap-1.5">
                                <InteractionIcon type={int.type} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-slate-700 leading-tight truncate">
                                    {int.subject ?? (int.type.charAt(0).toUpperCase() + int.type.slice(1))}
                                  </p>
                                  {int.body && (
                                    <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2">{int.body}</p>
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

                {/* ── Open Tasks ── */}
                <div className="pt-4 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Open Tasks</h3>
                    <button className="text-[11px] text-blue-500 hover:underline">+ Add</button>
                  </div>
                  <div className="space-y-2">
                    {[
                      { label: "Send fund materials", due: "Due today", overdue: true },
                      { label: "Schedule follow-up call", due: "Due in 3 days", overdue: false },
                    ].map((task, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 bg-slate-50 rounded-lg">
                        <input type="checkbox" className="mt-0.5 rounded border-slate-300 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-700">{task.label}</p>
                          <p className={cn("text-[10px]", task.overdue ? "text-red-500" : "text-slate-400")}>{task.due}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* View full profile */}
                <a
                  href={`/crm/companies/${selected.id}`}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline pt-2"
                >
                  View full company profile <ChevronRight size={12} />
                </a>
              </div>
            </>
          )}
        </div>

        {/* Overlay */}
        {selected && (
          <div className="fixed inset-0 bg-black/5 z-20" onClick={() => setSelectedId(null)} />
        )}
      </div>
    </div>
  );
}
