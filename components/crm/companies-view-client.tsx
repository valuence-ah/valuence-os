"use client";
// ─── CRM Companies View ────────────────────────────────────────────────────────
// Unified table for all 6 CRM views with filters, sortable columns, and a
// "Customize" panel where users can toggle which columns are visible.
// Column visibility is persisted to localStorage per view.

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Company, CompanyType } from "@/lib/types";
import { cn, formatCurrency, formatDate, truncate } from "@/lib/utils";
import {
  Plus, Search, ExternalLink, ChevronUp, ChevronDown,
  ArrowUpDown, X, Settings2, GripVertical, RotateCcw,
} from "lucide-react";

export type CrmView = "pipeline" | "lps" | "funds" | "strategic" | "other" | "all";

// ── Column definitions ─────────────────────────────────────────────────────────

type ColumnKey =
  | "type" | "deal_status" | "sectors" | "stage"
  | "aum" | "funding_raised" | "location"
  | "last_contact_date" | "website" | "source" | "created_at";

type SortKey = "name" | "updated_at" | "last_contact_date" | "funding_raised" | "aum" | "created_at";
type SortDir = "asc" | "desc";

interface ColumnDef {
  key: ColumnKey;
  label: string;
  sortKey?: SortKey;
  minWidth?: string;
  render: (c: Company) => React.ReactNode;
}

const DEAL_STATUS_BADGE: Record<string, string> = {
  sourced:     "bg-sky-50 text-sky-700 border border-sky-100",
  active_deal: "bg-blue-50 text-blue-700 border border-blue-100",
  portfolio:   "bg-emerald-50 text-emerald-700 border border-emerald-100",
  passed:      "bg-red-50 text-red-600 border border-red-100",
  monitoring:  "bg-amber-50 text-amber-700 border border-amber-100",
};
const DEAL_STATUS_LABEL: Record<string, string> = {
  sourced: "Sourced", active_deal: "Active", portfolio: "Portfolio",
  passed: "Passed", monitoring: "Monitoring",
};
const TYPE_BADGE: Record<string, string> = {
  startup:           "bg-blue-50 text-blue-700 border border-blue-100",
  lp:                "bg-purple-50 text-purple-700 border border-purple-100",
  fund:              "bg-indigo-50 text-indigo-700 border border-indigo-100",
  ecosystem_partner: "bg-teal-50 text-teal-700 border border-teal-100",
  corporate:         "bg-orange-50 text-orange-700 border border-orange-100",
  government:        "bg-slate-100 text-slate-600 border border-slate-200",
  other:             "bg-gray-50 text-gray-600 border border-gray-200",
};
const TYPE_LABEL: Record<string, string> = {
  startup: "Startup", lp: "LP", fund: "Fund",
  ecosystem_partner: "Eco Partner", corporate: "Corporate",
  government: "Government", other: "Other",
};

// All possible columns (rendered as cells)
const ALL_COLUMN_DEFS: Record<ColumnKey, ColumnDef> = {
  type: {
    key: "type", label: "Type", minWidth: "100px",
    render: c => (
      <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium", TYPE_BADGE[c.type] ?? "bg-slate-50 text-slate-600")}>
        {TYPE_LABEL[c.type] ?? c.type}
      </span>
    ),
  },
  deal_status: {
    key: "deal_status", label: "Status", minWidth: "110px",
    render: c => c.deal_status
      ? <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium", DEAL_STATUS_BADGE[c.deal_status] ?? "bg-slate-50 text-slate-600")}>
          {DEAL_STATUS_LABEL[c.deal_status] ?? c.deal_status}
        </span>
      : <span className="text-slate-300 text-xs">—</span>,
  },
  sectors: {
    key: "sectors", label: "Sectors", minWidth: "140px",
    render: c => (
      <div className="flex flex-wrap gap-1">
        {(c.sectors ?? []).slice(0, 2).map(s => (
          <span key={s} className="bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded capitalize">{s}</span>
        ))}
        {(c.sectors?.length ?? 0) > 2 && <span className="text-slate-400 text-xs">+{(c.sectors?.length ?? 0) - 2}</span>}
        {(c.sectors?.length ?? 0) === 0 && <span className="text-slate-300 text-xs">—</span>}
      </div>
    ),
  },
  stage: {
    key: "stage", label: "Stage", minWidth: "90px",
    render: c => c.stage
      ? <span className="bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded capitalize">{c.stage.replace(/_/g, " ")}</span>
      : <span className="text-slate-300 text-xs">—</span>,
  },
  aum: {
    key: "aum", label: "AUM", sortKey: "aum", minWidth: "110px",
    render: c => c.aum
      ? <span className="text-sm text-slate-700">{formatCurrency(c.aum)}</span>
      : <span className="text-slate-300 text-xs">—</span>,
  },
  funding_raised: {
    key: "funding_raised", label: "Total Raised", sortKey: "funding_raised", minWidth: "120px",
    render: c => c.funding_raised
      ? <span className="text-sm text-slate-700">{formatCurrency(c.funding_raised)}</span>
      : <span className="text-slate-300 text-xs">—</span>,
  },
  location: {
    key: "location", label: "Location", minWidth: "130px",
    render: c => {
      const loc = [c.location_city, c.location_country].filter(Boolean).join(", ");
      return loc ? <span className="text-sm text-slate-500">{loc}</span> : <span className="text-slate-300 text-xs">—</span>;
    },
  },
  last_contact_date: {
    key: "last_contact_date", label: "Last Contact", sortKey: "last_contact_date", minWidth: "110px",
    render: c => c.last_contact_date
      ? <span className="text-xs text-slate-400 whitespace-nowrap">{formatDate(c.last_contact_date)}</span>
      : <span className="text-slate-300 text-xs">—</span>,
  },
  website: {
    key: "website", label: "Website", minWidth: "80px",
    render: c => c.website
      ? <a href={c.website} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 truncate max-w-[120px]">
          <ExternalLink size={12} />
          {c.website.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
        </a>
      : <span className="text-slate-300 text-xs">—</span>,
  },
  source: {
    key: "source", label: "Source", minWidth: "100px",
    render: c => c.source
      ? <span className="text-xs text-slate-500">{c.source}</span>
      : <span className="text-slate-300 text-xs">—</span>,
  },
  created_at: {
    key: "created_at", label: "Date Added", sortKey: "created_at", minWidth: "100px",
    render: c => <span className="text-xs text-slate-400 whitespace-nowrap">{formatDate(c.created_at)}</span>,
  },
};

// ── Per-view configuration ─────────────────────────────────────────────────────

interface ViewConfig {
  emptyText: string;
  defaultType: CompanyType;
  addLabel: string;
  availableCols: ColumnKey[];
  defaultCols: ColumnKey[];
  sortKeys: { key: SortKey; label: string }[];
  filters: ("deal_status" | "sector" | "stage" | "sub_type" | "type")[];
}

const VIEW_CONFIG: Record<CrmView, ViewConfig> = {
  pipeline: {
    emptyText: "No startups in the pipeline yet.",
    defaultType: "startup", addLabel: "Add Startup",
    availableCols: ["deal_status", "sectors", "stage", "funding_raised", "location", "last_contact_date", "website", "source", "created_at"],
    defaultCols:   ["deal_status", "sectors", "stage", "location", "last_contact_date"],
    sortKeys: [
      { key: "name", label: "Name" }, { key: "updated_at", label: "Updated" },
      { key: "last_contact_date", label: "Last Contact" }, { key: "funding_raised", label: "Funding" },
    ],
    filters: ["deal_status", "sector", "stage"],
  },
  lps: {
    emptyText: "No limited partners yet.",
    defaultType: "lp", addLabel: "Add LP",
    availableCols: ["aum", "location", "last_contact_date", "website", "source", "created_at"],
    defaultCols:   ["aum", "location", "last_contact_date"],
    sortKeys: [
      { key: "name", label: "Name" }, { key: "aum", label: "AUM" },
      { key: "last_contact_date", label: "Last Contact" },
    ],
    filters: [],
  },
  funds: {
    emptyText: "No funds yet.",
    defaultType: "fund", addLabel: "Add Fund",
    availableCols: ["location", "last_contact_date", "website", "source", "created_at"],
    defaultCols:   ["location", "last_contact_date"],
    sortKeys: [
      { key: "name", label: "Name" }, { key: "last_contact_date", label: "Last Contact" },
    ],
    filters: [],
  },
  strategic: {
    emptyText: "No strategic partners yet.",
    defaultType: "ecosystem_partner", addLabel: "Add Company",
    availableCols: ["type", "location", "last_contact_date", "website", "source", "created_at"],
    defaultCols:   ["type", "location", "last_contact_date"],
    sortKeys: [
      { key: "name", label: "Name" }, { key: "last_contact_date", label: "Last Contact" },
    ],
    filters: ["sub_type"],
  },
  other: {
    emptyText: "No other companies yet.",
    defaultType: "government", addLabel: "Add Company",
    availableCols: ["type", "location", "last_contact_date", "website", "source", "created_at"],
    defaultCols:   ["type", "location", "last_contact_date"],
    sortKeys: [
      { key: "name", label: "Name" }, { key: "last_contact_date", label: "Last Contact" },
    ],
    filters: ["type"],
  },
  all: {
    emptyText: "No companies yet.",
    defaultType: "startup", addLabel: "Add Company",
    availableCols: ["type", "deal_status", "sectors", "stage", "aum", "funding_raised", "location", "last_contact_date", "website", "source", "created_at"],
    defaultCols:   ["type", "deal_status", "sectors", "location", "last_contact_date"],
    sortKeys: [
      { key: "name", label: "Name" }, { key: "updated_at", label: "Updated" },
      { key: "last_contact_date", label: "Last Contact" },
    ],
    filters: ["type", "deal_status", "sector"],
  },
};

// ── Filter option lists ────────────────────────────────────────────────────────

const SECTORS_OPTS = [
  "cleantech", "techbio", "advanced materials", "energy storage",
  "carbon capture", "climate tech", "synthetic biology", "agtech", "other",
];
const STAGE_OPTS = [
  { v: "pre-seed", l: "Pre-seed" }, { v: "seed", l: "Seed" },
  { v: "series_a", l: "Series A" }, { v: "series_b", l: "Series B" },
  { v: "series_c", l: "Series C" }, { v: "growth", l: "Growth" },
];
const DEAL_STATUS_OPTS = [
  { v: "sourced", l: "Sourced" }, { v: "active_deal", l: "Active Deal" },
  { v: "portfolio", l: "Portfolio" }, { v: "passed", l: "Passed" },
  { v: "monitoring", l: "Monitoring" },
];
const STRATEGIC_TYPE_OPTS = [
  { v: "ecosystem_partner", l: "Ecosystem Partner" },
  { v: "corporate", l: "Corporate" },
  { v: "government", l: "Government" },
];
const OTHER_TYPE_OPTS = [
  { v: "government", l: "Government" }, { v: "other", l: "Other" },
];
const ALL_TYPE_OPTS = [
  { v: "startup", l: "Startup" }, { v: "lp", l: "LP" },
  { v: "fund", l: "Fund" }, { v: "ecosystem_partner", l: "Eco Partner" },
  { v: "corporate", l: "Corporate" }, { v: "government", l: "Government" },
];
const FORM_SECTORS = [
  "Cleantech", "Techbio", "Advanced Materials", "Energy Storage",
  "Carbon Capture", "Climate Tech", "Synthetic Biology", "Agtech", "Other",
];

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  initialCompanies: Company[];
  view: CrmView;
}

export function CompaniesViewClient({ initialCompanies, view }: Props) {
  const router   = useRouter();
  const supabase = createClient();
  const cfg      = VIEW_CONFIG[view];

  // ── Column visibility (persisted to localStorage) ──────────────────────────
  const storageKey = `crm_cols_${view}`;

  const [visibleCols, setVisibleCols] = useState<ColumnKey[]>(cfg.defaultCols);
  const [colsLoaded, setColsLoaded]   = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed: ColumnKey[] = JSON.parse(saved);
        // Only keep cols that are still available for this view
        const valid = parsed.filter(k => cfg.availableCols.includes(k));
        if (valid.length > 0) { setVisibleCols(valid); }
      }
    } catch { /* ignore */ }
    setColsLoaded(true);
  }, [storageKey, cfg.availableCols]);

  const saveVisibleCols = useCallback((cols: ColumnKey[]) => {
    setVisibleCols(cols);
    try { localStorage.setItem(storageKey, JSON.stringify(cols)); } catch { /* ignore */ }
  }, [storageKey]);

  // ── State ──────────────────────────────────────────────────────────────────
  const [companies, setCompanies]   = useState<Company[]>(initialCompanies);
  const [search, setSearch]         = useState("");
  const [sortKey, setSortKey]       = useState<SortKey>(cfg.sortKeys[1]?.key ?? "name");
  const [sortDir, setSortDir]       = useState<SortDir>("desc");

  const [fStatus, setFStatus]   = useState("");
  const [fSector, setFSector]   = useState("");
  const [fStage, setFStage]     = useState("");
  const [fSubType, setFSubType] = useState("");
  const [fType, setFType]       = useState("");

  const [showModal,     setShowModal]     = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [form, setForm] = useState<Partial<Company>>({ type: cfg.defaultType, sectors: [] });

  // ── Filtered + sorted data ─────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...companies];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.description ?? "").toLowerCase().includes(q) ||
        (c.location_city ?? "").toLowerCase().includes(q) ||
        (c.location_country ?? "").toLowerCase().includes(q)
      );
    }
    if (fStatus)  list = list.filter(c => c.deal_status === fStatus);
    if (fSector)  list = list.filter(c => (c.sectors ?? []).includes(fSector));
    if (fStage)   list = list.filter(c => c.stage === fStage);
    if (fSubType) list = list.filter(c => c.type === fSubType);
    if (fType)    list = list.filter(c => c.type === fType);

    list.sort((a, b) => {
      let av: string | number = "", bv: string | number = "";
      if      (sortKey === "name")              { av = a.name.toLowerCase();       bv = b.name.toLowerCase(); }
      else if (sortKey === "funding_raised")    { av = a.funding_raised ?? -1;     bv = b.funding_raised ?? -1; }
      else if (sortKey === "aum")               { av = a.aum ?? -1;                bv = b.aum ?? -1; }
      else if (sortKey === "last_contact_date") { av = a.last_contact_date ?? "";  bv = b.last_contact_date ?? ""; }
      else if (sortKey === "created_at")        { av = a.created_at ?? "";         bv = b.created_at ?? ""; }
      else                                      { av = a.updated_at ?? "";         bv = b.updated_at ?? ""; }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ?  1 : -1;
      return 0;
    });
    return list;
  }, [companies, search, fStatus, fSector, fStage, fSubType, fType, sortKey, sortDir]);

  const activeFilters = [fStatus, fSector, fStage, fSubType, fType].filter(Boolean).length;

  // ── Sort helpers ───────────────────────────────────────────────────────────
  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  function ThSort({ label, sk, className }: { label: string; sk?: SortKey; className?: string }) {
    if (!sk) return (
      <th className={cn("px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap", className)}>
        {label}
      </th>
    );
    const active = sortKey === sk;
    return (
      <th className={cn("px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap", className)}>
        <button onClick={() => handleSort(sk)} className="flex items-center gap-1 group hover:text-slate-800 transition-colors">
          {label}
          {active
            ? sortDir === "asc" ? <ChevronUp size={12} className="text-blue-500" /> : <ChevronDown size={12} className="text-blue-500" />
            : <ArrowUpDown size={12} className="opacity-0 group-hover:opacity-40 transition-opacity" />}
        </button>
      </th>
    );
  }

  // ── Form helpers ───────────────────────────────────────────────────────────
  function setField(k: keyof Company, v: unknown) { setForm(p => ({ ...p, [k]: v })); }
  function toggleSector(s: string) {
    const lower = s.toLowerCase();
    const cur = (form.sectors ?? []) as string[];
    setField("sectors", cur.includes(lower) ? cur.filter(x => x !== lower) : [...cur, lower]);
  }

  // ── Save new company ───────────────────────────────────────────────────────
  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.type) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("companies")
      .insert({ ...form, created_by: user?.id }).select().single();
    setSaving(false);
    if (!error && data) {
      setCompanies(p => [data as Company, ...p]);
      setShowModal(false);
      setForm({ type: cfg.defaultType, sectors: [] });
    } else {
      alert(error?.message ?? "Failed to save");
    }
  }

  // ── Customize: toggle a column on/off ─────────────────────────────────────
  function toggleCol(key: ColumnKey) {
    saveVisibleCols(
      visibleCols.includes(key)
        ? visibleCols.filter(k => k !== key)
        : [...visibleCols, key]
    );
  }

  // Move column up/down in the order
  function moveCol(key: ColumnKey, dir: -1 | 1) {
    const idx = visibleCols.indexOf(key);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= visibleCols.length) return;
    const copy = [...visibleCols];
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    saveVisibleCols(copy);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!colsLoaded) return null; // avoid hydration mismatch

  return (
    <div className="flex-1 overflow-auto p-6 space-y-4">

      {/* ── Toolbar ── */}
      <div className="flex flex-col gap-3">

        {/* Row 1: search + customize + add */}
        <div className="flex items-center gap-2 justify-between flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-64"
              placeholder="Search by name, location…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setShowCustomize(true)}
              className="flex items-center gap-2 px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-sm font-medium rounded-lg transition-colors"
            >
              <Settings2 size={14} />
              Customize
            </button>
            <button
              onClick={() => { setForm({ type: cfg.defaultType, sectors: [] }); setShowModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={15} />
              {cfg.addLabel}
            </button>
          </div>
        </div>

        {/* Row 2: filters + sort + count */}
        <div className="flex flex-wrap items-center gap-2">

          {/* Pipeline filters */}
          {cfg.filters.includes("deal_status") && (
            <select value={fStatus} onChange={e => setFStatus(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400">
              <option value="">All Statuses</option>
              {DEAL_STATUS_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          )}
          {cfg.filters.includes("sector") && (
            <select value={fSector} onChange={e => setFSector(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400">
              <option value="">All Sectors</option>
              {SECTORS_OPTS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          )}
          {cfg.filters.includes("stage") && (
            <select value={fStage} onChange={e => setFStage(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400">
              <option value="">All Stages</option>
              {STAGE_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          )}
          {cfg.filters.includes("sub_type") && (
            <select value={fSubType} onChange={e => setFSubType(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400">
              <option value="">All Types</option>
              {STRATEGIC_TYPE_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          )}
          {cfg.filters.includes("type") && view !== "strategic" && (
            <select value={fType} onChange={e => setFType(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400">
              <option value="">All Types</option>
              {view === "other" ? OTHER_TYPE_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)
                : ALL_TYPE_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
          )}

          {/* Sort */}
          {(cfg.filters.length > 0) && <div className="h-4 w-px bg-slate-200 mx-0.5" />}
          <span className="text-xs text-slate-400">Sort:</span>
          {cfg.sortKeys.map(({ key, label }) => {
            const active = sortKey === key;
            return (
              <button key={key} onClick={() => handleSort(key)}
                className={cn("flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-all",
                  active ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600")}>
                {label}
                {active ? (sortDir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />) : <ArrowUpDown size={11} className="opacity-40" />}
              </button>
            );
          })}

          {/* Clear filters */}
          {activeFilters > 0 && (
            <button onClick={() => { setFStatus(""); setFSector(""); setFStage(""); setFSubType(""); setFType(""); }}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 ml-1 transition-colors">
              <X size={11} /> Clear ({activeFilters})
            </button>
          )}

          <span className="ml-auto text-xs text-slate-400">{filtered.length} {filtered.length === 1 ? "result" : "results"}</span>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <ThSort label="Company" sk="name" className="min-w-[180px]" />
                {visibleCols.map(key => {
                  const def = ALL_COLUMN_DEFS[key];
                  return <ThSort key={key} label={def.label} sk={def.sortKey} className={`min-w-[${def.minWidth ?? "100px"}]`} />;
                })}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={visibleCols.length + 2} className="text-center py-16 text-slate-400 text-sm">
                    {search || activeFilters > 0 ? "No companies match your filters." : cfg.emptyText}
                  </td>
                </tr>
              ) : filtered.map(c => (
                <tr key={c.id}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => router.push(`/crm/companies/${c.id}`)}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900 text-sm">{c.name}</div>
                    {c.description && (
                      <div className="text-xs text-slate-400 mt-0.5 max-w-xs">{truncate(c.description, 55)}</div>
                    )}
                  </td>
                  {visibleCols.map(key => (
                    <td key={key} className="px-4 py-3" onClick={key === "website" ? e => e.stopPropagation() : undefined}>
                      {ALL_COLUMN_DEFS[key].render(c)}
                    </td>
                  ))}
                  <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                    {c.website && (
                      <a href={c.website} target="_blank" rel="noopener noreferrer"
                        className="text-slate-300 hover:text-blue-500 transition-colors">
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Customize panel (slide-in from right) ── */}
      {showCustomize && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setShowCustomize(false)} />

          {/* Panel */}
          <div className="fixed top-0 right-0 h-full w-80 bg-white shadow-2xl z-50 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Customize Columns</h3>
                <p className="text-xs text-slate-500 mt-0.5">Choose which fields to show</p>
              </div>
              <button onClick={() => setShowCustomize(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {/* Always-on columns note */}
              <div className="bg-slate-50 rounded-lg px-3 py-2.5 text-xs text-slate-500">
                <span className="font-medium text-slate-700">Company Name</span> is always shown.
              </div>

              {/* Column toggles */}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Available Columns</p>

                {cfg.availableCols.map(key => {
                  const def = ALL_COLUMN_DEFS[key];
                  const isOn = visibleCols.includes(key);
                  const idx  = visibleCols.indexOf(key);
                  return (
                    <div key={key}
                      className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all",
                        isOn ? "bg-blue-50 border-blue-200" : "bg-white border-slate-200 hover:border-slate-300")}>
                      {/* Toggle */}
                      <button onClick={() => toggleCol(key)}
                        className={cn("w-9 h-5 rounded-full flex-shrink-0 relative transition-colors",
                          isOn ? "bg-blue-600" : "bg-slate-200")}>
                        <span className={cn("absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all",
                          isOn ? "left-[18px]" : "left-0.5")} />
                      </button>

                      {/* Label */}
                      <span className={cn("flex-1 text-sm font-medium", isOn ? "text-blue-900" : "text-slate-600")}>
                        {def.label}
                      </span>

                      {/* Reorder arrows (only when visible) */}
                      {isOn && (
                        <div className="flex flex-col gap-0.5">
                          <button onClick={() => moveCol(key, -1)} disabled={idx === 0}
                            className="text-slate-300 hover:text-slate-600 disabled:opacity-20 transition-colors">
                            <ChevronUp size={13} />
                          </button>
                          <button onClick={() => moveCol(key, 1)} disabled={idx === visibleCols.length - 1}
                            className="text-slate-300 hover:text-slate-600 disabled:opacity-20 transition-colors">
                            <ChevronDown size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-slate-200 flex gap-3">
              <button
                onClick={() => saveVisibleCols(cfg.defaultCols)}
                className="flex items-center gap-2 flex-1 justify-center py-2 border border-slate-200 text-slate-600 text-sm rounded-lg hover:bg-slate-50 transition-colors"
              >
                <RotateCcw size={13} /> Reset to default
              </button>
              <button
                onClick={() => setShowCustomize(false)}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Add Company Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900">{cfg.addLabel}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Company Name *</label>
                  <input className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. CarbonMind Inc." value={form.name ?? ""} onChange={e => setField("name", e.target.value)} required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Type *</label>
                  <select className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.type} onChange={e => setField("type", e.target.value as CompanyType)} required>
                    <option value="startup">Startup</option>
                    <option value="lp">LP</option>
                    <option value="fund">Fund</option>
                    <option value="ecosystem_partner">Ecosystem Partner</option>
                    <option value="corporate">Corporate</option>
                    <option value="government">Government</option>
                  </select>
                </div>
                {form.type === "startup" && <>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Stage</label>
                    <select className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={form.stage ?? ""} onChange={e => setField("stage", e.target.value || null)}>
                      <option value="">Select stage</option>
                      {STAGE_OPTS.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Deal Status</label>
                    <select className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={form.deal_status ?? ""} onChange={e => setField("deal_status", e.target.value || null)}>
                      <option value="">Not set</option>
                      {DEAL_STATUS_OPTS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Total Funding Raised ($)</label>
                    <input className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      type="number" placeholder="0" value={form.funding_raised ?? ""} onChange={e => setField("funding_raised", parseFloat(e.target.value) || null)} />
                  </div>
                </>}
                {form.type === "lp" && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">AUM ($)</label>
                    <input className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      type="number" placeholder="0" value={form.aum ?? ""} onChange={e => setField("aum", parseFloat(e.target.value) || null)} />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Website</label>
                  <input className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://example.com" type="url" value={form.website ?? ""} onChange={e => setField("website", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">City</label>
                  <input className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Singapore" value={form.location_city ?? ""} onChange={e => setField("location_city", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Country</label>
                  <input className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Singapore" value={form.location_country ?? ""} onChange={e => setField("location_country", e.target.value)} />
                </div>
              </div>
              {form.type === "startup" && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-2">Sectors</label>
                  <div className="flex flex-wrap gap-2">
                    {FORM_SECTORS.map(s => {
                      const lower = s.toLowerCase();
                      const sel = ((form.sectors as string[]) ?? []).includes(lower);
                      return (
                        <button key={s} type="button" onClick={() => toggleSector(s)}
                          className={cn("px-3 py-1 rounded-full text-xs font-medium border transition-all",
                            sel ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-300 hover:border-blue-400")}>
                          {s}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Description</label>
                <textarea className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={3} placeholder="Brief description…" value={form.description ?? ""} onChange={e => setField("description", e.target.value)} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 px-4 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                  {saving ? "Saving…" : cfg.addLabel}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
