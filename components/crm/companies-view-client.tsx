"use client";
// ─── CRM Companies View ────────────────────────────────────────────────────────
// Unified table for all 6 CRM views with filters, sortable + resizable columns,
// and a "Customize" panel. Column visibility, order, and widths are persisted to
// localStorage per view so each view has an independent configuration.

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Company, CompanyType } from "@/lib/types";
import { cn, formatCurrency, formatDate, truncate } from "@/lib/utils";
import {
  Plus, Search, ExternalLink, ChevronUp, ChevronDown,
  ArrowUpDown, X, Settings2, RotateCcw, Check,
} from "lucide-react";

export type CrmView = "pipeline" | "lps" | "funds" | "strategic" | "other" | "all";

// ── Helpers ────────────────────────────────────────────────────────────────────

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function extractDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    return host.replace(/^www\./, "");
  } catch { return null; }
}

// ── Company Logo ───────────────────────────────────────────────────────────────
function CompanyLogo({ company }: { company: Company }) {
  const [imgError, setImgError] = useState(false);
  const domain = extractDomain(company.website);
  const logoToken = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;
  const logoSrc = company.logo_url
    || (domain && logoToken ? `https://img.logo.dev/${domain}?token=${logoToken}&size=40` : null);

  if (!imgError && logoSrc) {
    return (
      <img
        src={logoSrc}
        alt=""
        className="w-7 h-7 rounded object-contain bg-white flex-shrink-0 border border-slate-100"
        onError={() => setImgError(true)}
      />
    );
  }
  return (
    <div className="w-7 h-7 rounded bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center flex-shrink-0 select-none">
      <span className="text-[10px] font-bold text-slate-500 uppercase">{company.name.slice(0, 2)}</span>
    </div>
  );
}

// ── Inline Type Picker ─────────────────────────────────────────────────────────
const TYPE_EDIT_OPTIONS: CompanyType[] = [
  "startup", "lp", "fund", "ecosystem_partner", "corporate", "government", "other",
];
const TYPE_BADGE: Record<string, string> = {
  startup:           "bg-blue-50 text-blue-700 border border-blue-100",
  lp:                "bg-purple-50 text-purple-700 border border-purple-100",
  fund:              "bg-indigo-50 text-indigo-700 border border-indigo-100",
  investor:          "bg-indigo-50 text-indigo-700 border border-indigo-100",
  ecosystem_partner: "bg-teal-50 text-teal-700 border border-teal-100",
  corporate:         "bg-orange-50 text-orange-700 border border-orange-100",
  government:        "bg-slate-100 text-slate-600 border border-slate-200",
  other:             "bg-gray-50 text-gray-600 border border-gray-200",
};
const TYPE_LABEL: Record<string, string> = {
  startup: "Startup", lp: "LP", fund: "Fund",
  investor: "Investor", ecosystem_partner: "Eco Partner",
  corporate: "Corporate", government: "Government", other: "Other",
};

function InlineTypePicker({ company, onUpdate }: { company: Company; onUpdate: (t: CompanyType) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false); }
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const typeList = (company.types && company.types.length > 0) ? company.types : [company.type];

  return (
    <div className="relative" ref={ref}>
      <div
        className="flex flex-wrap gap-1 cursor-pointer group"
        title="Click to change type"
        onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
      >
        {typeList.map(t => (
          <span key={t} className={cn(
            "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium transition-opacity group-hover:opacity-75",
            TYPE_BADGE[t] ?? "bg-slate-50 text-slate-600"
          )}>
            {TYPE_LABEL[t] ?? t}
          </span>
        ))}
      </div>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1 min-w-[170px] overflow-hidden">
          {TYPE_EDIT_OPTIONS.map(t => (
            <button
              key={t}
              onClick={e => { e.stopPropagation(); onUpdate(t); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-50 text-left"
            >
              <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium flex-1", TYPE_BADGE[t] ?? "bg-slate-50 text-slate-600")}>
                {TYPE_LABEL[t] ?? t}
              </span>
              {typeList.includes(t) && <Check size={11} className="text-blue-600 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Column definitions ─────────────────────────────────────────────────────────

export type ColumnKey =
  | "contacts" | "type" | "deal_status" | "sectors" | "sub_type" | "stage"
  | "aum" | "funding_raised" | "last_funding_date"
  | "location_city" | "location_country" | "location"
  | "last_contact_date" | "first_contact_date" | "created_at"
  | "website" | "linkedin_url" | "source"
  | "description" | "tags" | "notes" | "lp_type" | "fund_focus";

type SortKey = "name" | "updated_at" | "last_contact_date" | "funding_raised" | "aum" | "created_at";
type SortDir = "asc" | "desc";

interface ColumnDef {
  key: ColumnKey;
  label: string;
  group: "core" | "financial" | "dates" | "links" | "extra";
  sortKey?: SortKey;
  defaultWidth: number;
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

// All possible columns (every view can access all of these).
// Note: "contacts" and "type" are rendered specially in the component body.
const ALL_COLUMN_DEFS: Record<ColumnKey, ColumnDef> = {
  contacts: {
    key: "contacts", label: "Contacts", group: "core", defaultWidth: 90,
    render: () => null, // rendered specially in component
  },
  type: {
    key: "type", label: "Type", group: "core", defaultWidth: 140,
    render: c => {
      const typeList = (c.types && c.types.length > 0) ? c.types : [c.type];
      return (
        <div className="flex flex-wrap gap-1">
          {typeList.map(t => (
            <span key={t} className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium", TYPE_BADGE[t] ?? "bg-slate-50 text-slate-600")}>
              {TYPE_LABEL[t] ?? t}
            </span>
          ))}
        </div>
      );
    },
  },
  deal_status: {
    key: "deal_status", label: "Status", group: "core", defaultWidth: 115,
    render: c => c.deal_status
      ? <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium", DEAL_STATUS_BADGE[c.deal_status] ?? "bg-slate-50 text-slate-600")}>
          {DEAL_STATUS_LABEL[c.deal_status] ?? c.deal_status}
        </span>
      : <span className="text-slate-300 text-xs">—</span>,
  },
  sectors: {
    key: "sectors", label: "Sectors", group: "core", defaultWidth: 160,
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
  sub_type: {
    key: "sub_type", label: "Sub-type", group: "core", defaultWidth: 120,
    render: c => c.sub_type
      ? <span className="text-xs text-slate-500 capitalize">{c.sub_type.replace(/_/g, " ")}</span>
      : <span className="text-slate-300 text-xs">—</span>,
  },
  stage: {
    key: "stage", label: "Stage", group: "core", defaultWidth: 100,
    render: c => c.stage
      ? <span className="bg-slate-100 text-slate-600 text-xs px-1.5 py-0.5 rounded capitalize">{c.stage.replace(/_/g, " ")}</span>
      : <span className="text-slate-300 text-xs">—</span>,
  },
  aum: {
    key: "aum", label: "AUM", group: "financial", sortKey: "aum", defaultWidth: 120,
    render: c => c.aum
      ? <span className="text-sm text-slate-700">{formatCurrency(c.aum)}</span>
      : <span className="text-slate-300 text-xs">—</span>,
  },
  funding_raised: {
    key: "funding_raised", label: "Total Raised", group: "financial", sortKey: "funding_raised", defaultWidth: 130,
    render: c => c.funding_raised
      ? <span className="text-sm text-slate-700">{formatCurrency(c.funding_raised)}</span>
      : <span className="text-slate-300 text-xs">—</span>,
  },
  last_funding_date: {
    key: "last_funding_date", label: "Last Funding", group: "financial", defaultWidth: 115,
    render: c => c.last_funding_date
      ? <span className="text-xs text-slate-400 whitespace-nowrap">{formatDate(c.last_funding_date)}</span>
      : <span className="text-slate-300 text-xs">—</span>,
  },
  // Location as combined column (kept for backward compat with saved prefs)
  location: {
    key: "location", label: "Location", group: "core", defaultWidth: 150,
    render: c => (c.location_city || c.location_country) ? (
      <div>
        {c.location_city && <div className="text-sm text-slate-700 leading-snug">{c.location_city}</div>}
        {c.location_country && <div className="text-xs text-slate-400 leading-snug">{c.location_country}</div>}
      </div>
    ) : <span className="text-slate-300 text-xs">—</span>,
  },
  // Separate city/country columns
  location_city: {
    key: "location_city", label: "City", group: "core", defaultWidth: 120,
    render: c => c.location_city
      ? <span className="text-sm text-slate-700">{c.location_city}</span>
      : <span className="text-slate-300 text-xs">—</span>,
  },
  location_country: {
    key: "location_country", label: "Country", group: "core", defaultWidth: 110,
    render: c => c.location_country
      ? <span className="text-sm text-slate-700">{c.location_country}</span>
      : <span className="text-slate-300 text-xs">—</span>,
  },
  last_contact_date: {
    key: "last_contact_date", label: "Last Contact", group: "dates", sortKey: "last_contact_date", defaultWidth: 120,
    render: c => c.last_contact_date
      ? <span className="text-xs text-slate-400 whitespace-nowrap">{formatDate(c.last_contact_date)}</span>
      : <span className="text-slate-300 text-xs">—</span>,
  },
  first_contact_date: {
    key: "first_contact_date", label: "First Contact", group: "dates", defaultWidth: 120,
    render: c => c.first_contact_date
      ? <span className="text-xs text-slate-400 whitespace-nowrap">{formatDate(c.first_contact_date)}</span>
      : <span className="text-slate-300 text-xs">—</span>,
  },
  created_at: {
    key: "created_at", label: "Date Added", group: "dates", sortKey: "created_at", defaultWidth: 110,
    render: c => <span className="text-xs text-slate-400 whitespace-nowrap">{formatDate(c.created_at)}</span>,
  },
  website: {
    key: "website", label: "Website", group: "links", defaultWidth: 150,
    render: c => c.website
      ? <a href={c.website} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 truncate max-w-[130px]">
          <ExternalLink size={12} />
          {c.website.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
        </a>
      : <span className="text-slate-300 text-xs">—</span>,
  },
  linkedin_url: {
    key: "linkedin_url", label: "LinkedIn", group: "links", defaultWidth: 90,
    render: c => c.linkedin_url
      ? <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700">
          <ExternalLink size={12} /> Profile
        </a>
      : <span className="text-slate-300 text-xs">—</span>,
  },
  source: {
    key: "source", label: "Source", group: "extra", defaultWidth: 110,
    render: c => c.source
      ? <span className="text-xs text-slate-500">{c.source}</span>
      : <span className="text-slate-300 text-xs">—</span>,
  },
  lp_type: {
    key: "lp_type", label: "LP Type", group: "extra", defaultWidth: 120,
    render: c => c.lp_type
      ? <span className="text-xs text-slate-500 capitalize">{c.lp_type.replace(/_/g, " ")}</span>
      : <span className="text-slate-300 text-xs">—</span>,
  },
  fund_focus: {
    key: "fund_focus", label: "Fund Focus", group: "extra", defaultWidth: 140,
    render: c => c.fund_focus
      ? <span className="text-xs text-slate-500">{truncate(c.fund_focus, 40)}</span>
      : <span className="text-slate-300 text-xs">—</span>,
  },
  description: {
    key: "description", label: "Description", group: "extra", defaultWidth: 200,
    render: c => c.description
      ? <span className="text-xs text-slate-500">{truncate(c.description, 60)}</span>
      : <span className="text-slate-300 text-xs">—</span>,
  },
  tags: {
    key: "tags", label: "Tags", group: "extra", defaultWidth: 150,
    render: c => (c.tags ?? []).length > 0
      ? <div className="flex flex-wrap gap-1">
          {(c.tags ?? []).slice(0, 3).map(t => (
            <span key={t} className="bg-violet-50 text-violet-700 text-xs px-1.5 py-0.5 rounded border border-violet-100">{t}</span>
          ))}
          {(c.tags?.length ?? 0) > 3 && <span className="text-slate-400 text-xs">+{(c.tags?.length ?? 0) - 3}</span>}
        </div>
      : <span className="text-slate-300 text-xs">—</span>,
  },
  notes: {
    key: "notes", label: "Notes", group: "extra", defaultWidth: 200,
    render: c => c.notes
      ? <span className="text-xs text-slate-500">{truncate(c.notes, 60)}</span>
      : <span className="text-slate-300 text-xs">—</span>,
  },
};

const ALL_COLS = Object.keys(ALL_COLUMN_DEFS) as ColumnKey[];

// ── Per-view default configuration ────────────────────────────────────────────

interface ViewConfig {
  emptyText: string;
  defaultType: CompanyType;
  addLabel: string;
  defaultCols: ColumnKey[];
  sortKeys: { key: SortKey; label: string }[];
  filters: ("deal_status" | "sector" | "stage" | "sub_type" | "type")[];
}

const VIEW_CONFIG: Record<CrmView, ViewConfig> = {
  pipeline: {
    emptyText: "No startups in the pipeline yet.",
    defaultType: "startup", addLabel: "Add Startup",
    defaultCols: ["deal_status", "contacts", "sectors", "stage", "location", "last_contact_date"],
    sortKeys: [
      { key: "name", label: "Name" }, { key: "updated_at", label: "Updated" },
      { key: "last_contact_date", label: "Last Contact" }, { key: "funding_raised", label: "Funding" },
    ],
    filters: ["deal_status", "sector", "stage"],
  },
  lps: {
    emptyText: "No limited partners yet.",
    defaultType: "lp", addLabel: "Add LP",
    defaultCols: ["contacts", "aum", "lp_type", "location", "last_contact_date"],
    sortKeys: [
      { key: "name", label: "Name" }, { key: "aum", label: "AUM" },
      { key: "last_contact_date", label: "Last Contact" },
    ],
    filters: [],
  },
  funds: {
    emptyText: "No funds yet.",
    defaultType: "fund", addLabel: "Add Fund",
    defaultCols: ["contacts", "fund_focus", "location", "last_contact_date"],
    sortKeys: [
      { key: "name", label: "Name" }, { key: "last_contact_date", label: "Last Contact" },
    ],
    filters: [],
  },
  strategic: {
    emptyText: "No strategic partners yet.",
    defaultType: "ecosystem_partner", addLabel: "Add Company",
    defaultCols: ["type", "contacts", "location", "last_contact_date", "website"],
    sortKeys: [
      { key: "name", label: "Name" }, { key: "last_contact_date", label: "Last Contact" },
    ],
    filters: ["sub_type"],
  },
  other: {
    emptyText: "No other companies yet.",
    defaultType: "government", addLabel: "Add Company",
    defaultCols: ["type", "contacts", "location", "last_contact_date"],
    sortKeys: [
      { key: "name", label: "Name" }, { key: "last_contact_date", label: "Last Contact" },
    ],
    filters: ["type"],
  },
  all: {
    emptyText: "No companies yet.",
    defaultType: "startup", addLabel: "Add Company",
    defaultCols: ["type", "contacts", "sectors", "location", "last_contact_date"],
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

// Column groups for the customize panel
const COL_GROUPS: { key: ColumnDef["group"]; label: string }[] = [
  { key: "core",      label: "Core Fields" },
  { key: "financial", label: "Financial" },
  { key: "dates",     label: "Dates" },
  { key: "links",     label: "Links" },
  { key: "extra",     label: "Extra" },
];

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  initialCompanies: Company[];
  view: CrmView;
  /** Contact counts per company_id — passed from server for the Contacts column */
  contactCountMap?: Record<string, number>;
}

export function CompaniesViewClient({ initialCompanies, view, contactCountMap = {} }: Props) {
  const router   = useRouter();
  const supabase = createClient();
  const cfg      = VIEW_CONFIG[view];

  // ── localStorage keys ──────────────────────────────────────────────────────
  const colsKey   = `crm_cols_${view}`;
  const widthsKey = `crm_widths_${view}`;

  // ── Column visibility (per view, persisted) ────────────────────────────────
  const [visibleCols, setVisibleCols] = useState<ColumnKey[]>(cfg.defaultCols);
  const [colsLoaded,  setColsLoaded]  = useState(false);

  // ── Column widths (per view, persisted) ───────────────────────────────────
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    try {
      const savedCols = localStorage.getItem(colsKey);
      if (savedCols) {
        const parsed: ColumnKey[] = JSON.parse(savedCols);
        const valid = parsed.filter(k => ALL_COLS.includes(k));
        if (valid.length > 0) setVisibleCols(valid);
      }
      const savedWidths = localStorage.getItem(widthsKey);
      if (savedWidths) setColWidths(JSON.parse(savedWidths));
    } catch { /* ignore */ }
    setColsLoaded(true);
  }, [colsKey, widthsKey]);

  const saveVisibleCols = useCallback((cols: ColumnKey[]) => {
    setVisibleCols(cols);
    try { localStorage.setItem(colsKey, JSON.stringify(cols)); } catch { /* ignore */ }
  }, [colsKey]);

  const saveColWidths = useCallback((widths: Record<string, number>) => {
    setColWidths(widths);
    try { localStorage.setItem(widthsKey, JSON.stringify(widths)); } catch { /* ignore */ }
  }, [widthsKey]);

  // ── Column resize via drag ─────────────────────────────────────────────────
  // Stored in a ref so drag callbacks always have fresh values without causing
  // the ThCell to remount (which would interrupt the drag).
  const resizeRef = useRef<{ key: string; startX: number; startW: number } | null>(null);

  function startResize(e: React.MouseEvent<HTMLDivElement>, colKey: string, currentW: number) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    resizeRef.current = { key: colKey, startX: e.clientX, startW: currentW };

    const prevCursor = document.body.style.cursor;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMove(ev: MouseEvent) {
      if (!resizeRef.current) return;
      const delta = ev.clientX - resizeRef.current.startX;
      const newW = Math.max(60, resizeRef.current.startW + delta);
      setColWidths(prev => ({ ...prev, [resizeRef.current!.key]: newW }));
    }
    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = "";
      setIsDragging(false);
      setColWidths(prev => {
        try { localStorage.setItem(widthsKey, JSON.stringify(prev)); } catch { /* ignore */ }
        return prev;
      });
      resizeRef.current = null;
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ── State ──────────────────────────────────────────────────────────────────
  const [companies, setCompanies]     = useState<Company[]>(initialCompanies);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch]           = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const [sortKey, setSortKey] = useState<SortKey>(cfg.sortKeys[1]?.key ?? "name");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

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

  // Company name column width
  const nameColW = colWidths["__name__"] ?? 240;

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

  // ── Inline type update ─────────────────────────────────────────────────────
  async function handleTypeUpdate(companyId: string, newType: CompanyType) {
    setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, type: newType } : c));
    await supabase.from("companies").update({ type: newType }).eq("id", companyId);
  }

  // ── Customize: toggle a column ─────────────────────────────────────────────
  function toggleCol(key: ColumnKey) {
    saveVisibleCols(
      visibleCols.includes(key)
        ? visibleCols.filter(k => k !== key)
        : [...visibleCols, key]
    );
  }

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
  if (!colsLoaded) return null;

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
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
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

          {cfg.filters.length > 0 && <div className="h-4 w-px bg-slate-200 mx-0.5" />}
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
          <table
            className="border-collapse"
            style={{
              tableLayout: "fixed",
              width: "max-content",
              minWidth: "100%",
              userSelect: isDragging ? "none" : undefined,
            }}
          >
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {/* ── Company name column — also resizable ── */}
                <th
                  className="relative group/th px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap select-none"
                  style={{ width: nameColW, minWidth: nameColW }}
                >
                  <button onClick={() => handleSort("name")} className="flex items-center gap-1 hover:text-slate-800 transition-colors">
                    Company
                    {sortKey === "name"
                      ? sortDir === "asc" ? <ChevronUp size={12} className="text-blue-500" /> : <ChevronDown size={12} className="text-blue-500" />
                      : <ArrowUpDown size={12} className="opacity-0 group-hover/th:opacity-40 transition-opacity" />}
                  </button>
                  {/* Resize handle — always present, visible on hover */}
                  <div
                    className="absolute right-0 top-0 h-full w-2 cursor-col-resize bg-transparent hover:bg-blue-400/30 active:bg-blue-400/50 z-10"
                    onMouseDown={e => startResize(e, "__name__", nameColW)}
                  />
                </th>

                {/* ── Dynamic columns ── */}
                {visibleCols.map(key => {
                  const def = ALL_COLUMN_DEFS[key];
                  if (!def) return null;
                  const w = colWidths[key] ?? def.defaultWidth;
                  const active = def.sortKey && sortKey === def.sortKey;
                  return (
                    <th
                      key={key}
                      className="relative group/th px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap select-none"
                      style={{ width: w, minWidth: w }}
                    >
                      {def.sortKey ? (
                        <button onClick={() => handleSort(def.sortKey!)} className="flex items-center gap-1 hover:text-slate-800 transition-colors">
                          {def.label}
                          {active
                            ? sortDir === "asc" ? <ChevronUp size={12} className="text-blue-500" /> : <ChevronDown size={12} className="text-blue-500" />
                            : <ArrowUpDown size={12} className="opacity-0 group-hover/th:opacity-40 transition-opacity" />}
                        </button>
                      ) : (
                        <span>{def.label}</span>
                      )}
                      {/* Resize handle */}
                      <div
                        className="absolute right-0 top-0 h-full w-2 cursor-col-resize bg-transparent hover:bg-blue-400/30 active:bg-blue-400/50 z-10"
                        onMouseDown={e => startResize(e, key, w)}
                      />
                    </th>
                  );
                })}
                <th className="w-8 min-w-8" />
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
                  onClick={() => router.push(`/crm/companies/${toSlug(c.name)}`)}>

                  {/* ── Company name cell with logo ── */}
                  <td className="px-4 py-3" style={{ width: nameColW, minWidth: nameColW }}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CompanyLogo company={c} />
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900 text-sm truncate">{c.name}</div>
                        {c.description && (
                          <div className="text-xs text-slate-400 mt-0.5 truncate">{truncate(c.description, 50)}</div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* ── Dynamic column cells ── */}
                  {visibleCols.map(key => {
                    const def = ALL_COLUMN_DEFS[key];
                    if (!def) return null;
                    const w = colWidths[key] ?? def.defaultWidth;

                    // Contacts — rendered from the contactCountMap prop
                    if (key === "contacts") {
                      const n = contactCountMap[c.id] ?? 0;
                      return (
                        <td key={key} className="px-4 py-3" style={{ width: w, minWidth: w, maxWidth: w }}>
                          {n > 0
                            ? <span className="inline-flex items-center justify-center w-6 h-6 bg-slate-100 text-slate-700 text-xs font-semibold rounded-full">{n}</span>
                            : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                      );
                    }

                    // Type — inline editable picker
                    if (key === "type") {
                      return (
                        <td key={key} className="px-4 py-3" style={{ width: w, minWidth: w, maxWidth: w }}
                          onClick={e => e.stopPropagation()}>
                          <InlineTypePicker
                            company={c}
                            onUpdate={newType => handleTypeUpdate(c.id, newType)}
                          />
                        </td>
                      );
                    }

                    // All other columns — standard render
                    return (
                      <td
                        key={key}
                        className="px-4 py-3 overflow-hidden"
                        style={{ width: w, minWidth: w, maxWidth: w }}
                        onClick={key === "website" || key === "linkedin_url" ? e => e.stopPropagation() : undefined}
                      >
                        {def.render(c)}
                      </td>
                    );
                  })}

                  {/* ── External link ── */}
                  <td className="px-3 py-3 w-8" onClick={e => e.stopPropagation()}>
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
          <div className="fixed inset-0 bg-black/20 z-40" onClick={() => setShowCustomize(false)} />
          <div className="fixed top-0 right-0 h-full w-80 bg-white shadow-2xl z-50 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Customize Columns</h3>
                <p className="text-xs text-slate-500 mt-0.5">Toggle fields · drag right edge of column header to resize</p>
              </div>
              <button onClick={() => setShowCustomize(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div className="bg-slate-50 rounded-lg px-3 py-2.5 text-xs text-slate-500">
                <span className="font-medium text-slate-700">Company Name</span> is always shown.
                Hover a column header edge to reveal the resize handle.
              </div>

              {COL_GROUPS.map(group => {
                const groupCols = ALL_COLS.filter(k => ALL_COLUMN_DEFS[k].group === group.key);
                return (
                  <div key={group.key}>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{group.label}</p>
                    <div className="space-y-1">
                      {groupCols.map(key => {
                        const def = ALL_COLUMN_DEFS[key];
                        const isOn = visibleCols.includes(key);
                        const idx  = visibleCols.indexOf(key);
                        return (
                          <div key={key}
                            className={cn("flex items-center gap-3 px-3 py-2 rounded-lg border transition-all",
                              isOn ? "bg-blue-50 border-blue-200" : "bg-white border-slate-200 hover:border-slate-300")}>
                            <button onClick={() => toggleCol(key)}
                              className={cn("w-9 h-5 rounded-full flex-shrink-0 relative transition-colors",
                                isOn ? "bg-blue-600" : "bg-slate-200")}>
                              <span className={cn("absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all",
                                isOn ? "left-[18px]" : "left-0.5")} />
                            </button>
                            <span className={cn("flex-1 text-sm font-medium", isOn ? "text-blue-900" : "text-slate-600")}>
                              {def.label}
                            </span>
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
                );
              })}
            </div>

            <div className="px-5 py-4 border-t border-slate-200 flex gap-3">
              <button
                onClick={() => { saveVisibleCols(cfg.defaultCols); saveColWidths({}); }}
                className="flex items-center gap-2 flex-1 justify-center py-2 border border-slate-200 text-slate-600 text-sm rounded-lg hover:bg-slate-50 transition-colors"
              >
                <RotateCcw size={13} /> Reset all
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
