"use client";
// ─── LP CRM — metrics bar · table · kanban · map · detail panel ───────────────

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Company, Contact, Interaction } from "@/lib/types";
import { cn, formatDate, formatCurrency, getInitials, timeAgo } from "@/lib/utils";
import {
  Search, X, ExternalLink, Mail, Phone, User, MapPin, ChevronRight,
  Download, Plus, Target, TrendingUp, DollarSign,
  BarChart2, AlertCircle, CheckSquare, Video,
  ChevronDown, MoreHorizontal, Loader2, ArrowUpRight, FileText,
  Pencil, Check, LayoutGrid, List, Globe,
} from "lucide-react";

// ── LP Type ────────────────────────────────────────────────────────────────────
const LP_TYPE_OPTIONS = ["Anchor", "Family Office", "Strategic", "Sovereign Wealth", "Other"] as const;
const LP_TYPE_BADGE: Record<string, string> = {
  "Anchor":           "bg-indigo-100 text-indigo-700",
  "Family Office":    "bg-purple-100 text-purple-700",
  "Strategic":        "bg-teal-100 text-teal-700",
  "Sovereign Wealth": "bg-amber-100 text-amber-700",
  "Other":            "bg-slate-100 text-slate-600",
};
function getLpTypeBadge(t: string | null) { return LP_TYPE_BADGE[t ?? ""] ?? "bg-gray-100 text-gray-600"; }

// ── LP Stage ───────────────────────────────────────────────────────────────────
const LP_STAGE_OPTIONS = ["Lead", "Initial Meeting", "Discussion in Process", "Due Diligence", "Committed", "Passed"] as const;
const STAGE_DOT:  Record<string, string> = { Lead: "bg-slate-400", "Initial Meeting": "bg-blue-500", "Discussion in Process": "bg-amber-500", "Due Diligence": "bg-violet-500", Committed: "bg-emerald-500", Passed: "bg-red-400" };
const STAGE_TEXT: Record<string, string> = { Lead: "text-slate-600", "Initial Meeting": "text-blue-700", "Discussion in Process": "text-amber-700", "Due Diligence": "text-violet-700", Committed: "text-emerald-700", Passed: "text-red-600" };
const STAGE_BG:   Record<string, string> = { Lead: "bg-slate-50", "Initial Meeting": "bg-blue-50", "Discussion in Process": "bg-amber-50", "Due Diligence": "bg-violet-50", Committed: "bg-emerald-50", Passed: "bg-red-50" };

// ── Tier options (Tier 1/2/3 stored as High/Medium/Low in priority field) ─────
const TIER_OPTIONS = ["Tier 1", "Tier 2", "Tier 3"] as const;
const TIER_TO_PRIORITY: Record<string, "High" | "Medium" | "Low"> = { "Tier 1": "High", "Tier 2": "Medium", "Tier 3": "Low" };
const PRIORITY_TO_TIER: Record<string, string> = { High: "Tier 1", Medium: "Tier 2", Low: "Tier 3" };

// ── DDQ Status — derived from stage ───────────────────────────────────────────
function getDdqStatus(stage: string | null) {
  if (!stage || stage === "Lead" || stage === "Initial Meeting") return { label: "Not Started", color: "bg-slate-100 text-slate-500" };
  if (stage === "Discussion in Process") return { label: "Requested",   color: "bg-amber-100 text-amber-700" };
  if (stage === "Due Diligence")         return { label: "In Progress",  color: "bg-blue-100 text-blue-700" };
  if (stage === "Committed")             return { label: "Complete",     color: "bg-emerald-100 text-emerald-700" };
  return { label: "N/A", color: "bg-slate-100 text-slate-400" };
}

// ── Probability ────────────────────────────────────────────────────────────────
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

// ── DEFAULT COLUMN WIDTHS ──────────────────────────────────────────────────────
const DEFAULT_COL_WIDTHS: Record<string, number> = {
  Company: 180, "LP Type": 110, Tier: 75, Stage: 150,
  "Commit Goal": 110, Expected: 100, "Prob %": 100,
  "Last Touchpoint": 130, "Next Follow-up": 120,
  "DDQ Status": 110, "Strategic Value": 130, City: 90,
};

// ── SUB-COMPONENTS ─────────────────────────────────────────────────────────────

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

// Custom stage dropdown (styled pill with dot)
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
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg bg-white hover:border-blue-300 transition-colors text-left"
      >
        {value ? (
          <>
            <span className={cn("w-2 h-2 rounded-full flex-shrink-0", STAGE_DOT[value])} />
            <span className={cn("text-sm flex-1", STAGE_TEXT[value])}>{value}</span>
          </>
        ) : (
          <span className="text-sm text-slate-400 flex-1">Not set</span>
        )}
        <ChevronDown size={13} className="text-slate-400 flex-shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1 overflow-hidden">
          <button onClick={() => { onChange(""); setOpen(false); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 text-left">
            <span className="w-2 h-2 rounded-full bg-slate-200 flex-shrink-0" />
            <span className="text-sm text-slate-400">Not set</span>
            {!value && <Check size={11} className="ml-auto text-blue-600" />}
          </button>
          {LP_STAGE_OPTIONS.map(s => (
            <button key={s} onClick={() => { onChange(s); setOpen(false); }}
              className={cn("w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 text-left", value === s ? STAGE_BG[s] : "")}>
              <span className={cn("w-2 h-2 rounded-full flex-shrink-0", STAGE_DOT[s])} />
              <span className={cn("text-sm", STAGE_TEXT[s])}>{s}</span>
              {value === s && <Check size={11} className="ml-auto text-blue-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Prep Brief modal
function PrepBriefModal({ company, contacts, interactions, onClose }: {
  company: Company; contacts: Contact[]; interactions: Interaction[]; onClose: () => void;
}) {
  const primary = contacts.find(c => c.is_primary_contact) ?? contacts[0];
  const prob = calcProb(company.lp_stage);
  const expected = company.commitment_goal != null ? company.commitment_goal * prob : null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <CompanyLogo company={company} size="md" />
            <div>
              <h2 className="text-base font-bold text-slate-900">{company.name}</h2>
              <p className="text-[11px] text-slate-500">LP Preparation Brief</p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400"><X size={14} /></button>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {[{ label: "Stage", value: company.lp_stage ?? "Not set" }, { label: "Commit Goal", value: fmt(company.commitment_goal) }, { label: "Expected", value: expected != null ? fmt(expected) : "—" }].map(i => (
              <div key={i.label} className="bg-slate-50 rounded-xl p-3 text-center">
                <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">{i.label}</p>
                <p className="text-sm font-bold text-slate-800">{i.value}</p>
              </div>
            ))}
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">LP Profile</h3>
            <div className="space-y-1.5 text-sm text-slate-700">
              {company.lp_type && <p><span className="text-slate-400">Type:</span> {company.lp_type}</p>}
              {company.fund_focus && <p><span className="text-slate-400">Fund focus:</span> {company.fund_focus}</p>}
              {company.aum && <p><span className="text-slate-400">AUM:</span> {fmt(company.aum)}</p>}
              {(company.location_city || company.location_country) && <p><span className="text-slate-400">Location:</span> {[company.location_city, company.location_country].filter(Boolean).join(", ")}</p>}
              {company.description && <p className="text-slate-600 text-sm mt-2">{company.description}</p>}
            </div>
          </div>
          {primary && (
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Key Contact</h3>
              <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0"><User size={13} className="text-violet-600" /></div>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{primary.first_name} {primary.last_name}</p>
                  {primary.title && <p className="text-xs text-slate-500">{primary.title}</p>}
                  {primary.email && <p className="text-xs text-blue-600">{primary.email}</p>}
                  {(primary.location_city || primary.location_country) && <p className="text-xs text-slate-400">{[primary.location_city, primary.location_country].filter(Boolean).join(", ")}</p>}
                </div>
              </div>
            </div>
          )}
          {interactions.length > 0 && (
            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Recent Activity</h3>
              <div className="space-y-2">
                {interactions.slice(0, 3).map(int => (
                  <div key={int.id} className="flex items-start gap-2 text-sm">
                    <InteractionIcon type={int.type} />
                    <div>
                      <span className="text-slate-700 font-medium">{int.subject ?? int.type.charAt(0).toUpperCase() + int.type.slice(1)}</span>
                      <span className="text-slate-400 text-xs ml-2">{formatDate(int.date)}</span>
                      {int.body && <p className="text-xs text-slate-500 mt-0.5">{int.body}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Suggested Talking Points</h3>
            <ul className="space-y-1.5 text-sm text-slate-700">
              <li className="flex items-start gap-2"><span className="text-blue-500 mt-0.5">•</span>Fund strategy and current portfolio highlights</li>
              <li className="flex items-start gap-2"><span className="text-blue-500 mt-0.5">•</span>Historical performance and key metrics</li>
              <li className="flex items-start gap-2"><span className="text-blue-500 mt-0.5">•</span>LP co-investment opportunities and terms</li>
              <li className="flex items-start gap-2"><span className="text-blue-500 mt-0.5">•</span>{company.lp_type === "Sovereign Wealth" ? "Sovereign mandate alignment and geographies" : "LP reporting cadence and transparency"}</li>
            </ul>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">Close</button>
          <button onClick={() => window.print()} className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700">Print / Save PDF</button>
        </div>
      </div>
    </div>
  );
}

// ── Kanban view ────────────────────────────────────────────────────────────────
function KanbanView({ companies, onSelect, selectedId, lastTouchMap }: {
  companies: Company[];
  onSelect: (id: string) => void;
  selectedId: string | null;
  lastTouchMap: Record<string, { date: string; type: string }>;
}) {
  const columns = LP_STAGE_OPTIONS.map(stage => ({
    stage,
    items: companies.filter(c => c.lp_stage === stage),
  }));
  const unassigned = companies.filter(c => !c.lp_stage);

  return (
    <div className="flex gap-3 p-4 overflow-x-auto h-full items-start">
      {columns.map(({ stage, items }) => {
        const total = items.reduce((s, c) => s + (c.commitment_goal ?? 0), 0);
        return (
          <div key={stage} className="flex-shrink-0 w-56 flex flex-col">
            <div className={cn("flex items-center gap-2 px-3 py-2 rounded-t-xl border border-b-0", STAGE_BG[stage] ?? "bg-slate-50", "border-slate-200")}>
              <span className={cn("w-2 h-2 rounded-full flex-shrink-0", STAGE_DOT[stage])} />
              <span className={cn("text-xs font-semibold flex-1", STAGE_TEXT[stage])}>{stage}</span>
              <span className="text-[11px] text-slate-400 font-medium">{items.length}</span>
            </div>
            {total > 0 && (
              <div className="px-3 py-1 bg-white border-x border-slate-200">
                <span className="text-[10px] text-slate-400">{fmt(total)}</span>
              </div>
            )}
            <div className="flex flex-col gap-2 p-2 bg-slate-50 border border-slate-200 rounded-b-xl min-h-[80px] overflow-y-auto max-h-[calc(100vh-320px)]">
              {items.map(co => {
                const touch = lastTouchMap[co.id];
                const overdue = touch ? (Date.now() - new Date(touch.date).getTime()) / 86_400_000 > 30 : false;
                return (
                  <div
                    key={co.id}
                    onClick={() => onSelect(co.id)}
                    className={cn(
                      "bg-white rounded-lg p-2.5 border cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all",
                      selectedId === co.id ? "border-blue-400 shadow-sm" : "border-slate-200"
                    )}
                  >
                    <div className="flex items-start gap-2 mb-2">
                      <CompanyLogo company={co} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-800 leading-tight truncate">{co.name}</p>
                        {co.lp_type && (
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium mt-0.5 inline-block", getLpTypeBadge(co.lp_type))}>
                            {co.lp_type}
                          </span>
                        )}
                      </div>
                    </div>
                    {co.commitment_goal && (
                      <p className="text-[11px] text-slate-600 tabular-nums">{fmt(co.commitment_goal)}</p>
                    )}
                    {touch && (
                      <div className="flex items-center gap-1 mt-1">
                        <InteractionIcon type={touch.type} />
                        <span className={cn("text-[10px]", overdue ? "text-red-500" : "text-slate-400")}>
                          {timeAgo(touch.date)}
                        </span>
                        {overdue && <AlertCircle size={9} className="text-red-400" />}
                      </div>
                    )}
                  </div>
                );
              })}
              {items.length === 0 && (
                <p className="text-[11px] text-slate-300 text-center py-4">Empty</p>
              )}
            </div>
          </div>
        );
      })}
      {/* Unassigned column */}
      {unassigned.length > 0 && (
        <div className="flex-shrink-0 w-56 flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2 rounded-t-xl border border-b-0 bg-slate-50 border-slate-200">
            <span className="w-2 h-2 rounded-full flex-shrink-0 bg-slate-300" />
            <span className="text-xs font-semibold flex-1 text-slate-500">No Stage</span>
            <span className="text-[11px] text-slate-400">{unassigned.length}</span>
          </div>
          <div className="flex flex-col gap-2 p-2 bg-slate-50 border border-slate-200 rounded-b-xl min-h-[80px]">
            {unassigned.map(co => (
              <div key={co.id} onClick={() => onSelect(co.id)}
                className={cn("bg-white rounded-lg p-2.5 border cursor-pointer hover:border-blue-300 transition-all", selectedId === co.id ? "border-blue-400" : "border-slate-200")}>
                <div className="flex items-center gap-2">
                  <CompanyLogo company={co} size="sm" />
                  <p className="text-xs font-semibold text-slate-800 truncate">{co.name}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Map (geographic grouping) view ─────────────────────────────────────────────
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
const REGION_COLOR: Record<string, string> = {
  "Americas": "border-blue-200 bg-blue-50",
  "Europe": "border-emerald-200 bg-emerald-50",
  "Middle East & Africa": "border-amber-200 bg-amber-50",
  "Asia-Pacific": "border-violet-200 bg-violet-50",
  "Other": "border-slate-200 bg-slate-50",
};
const REGION_HEADER: Record<string, string> = {
  "Americas": "text-blue-700 bg-blue-100",
  "Europe": "text-emerald-700 bg-emerald-100",
  "Middle East & Africa": "text-amber-700 bg-amber-100",
  "Asia-Pacific": "text-violet-700 bg-violet-100",
  "Other": "text-slate-600 bg-slate-100",
};

function MapView({ companies, onSelect, selectedId }: {
  companies: Company[];
  onSelect: (id: string) => void;
  selectedId: string | null;
}) {
  const byRegion = useMemo(() => {
    const map: Record<string, Company[]> = {};
    for (const reg of REGIONS) map[reg] = [];
    for (const co of companies) {
      const country = co.location_country ?? "";
      const region = REGION_MAP[country] ?? "Other";
      map[region].push(co);
    }
    return map;
  }, [companies]);

  return (
    <div className="flex-1 overflow-auto p-5">
      {/* Summary stats by region */}
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

      {/* Countries grid */}
      <div className="grid grid-cols-2 gap-4">
        {REGIONS.map(reg => {
          const items = byRegion[reg];
          if (items.length === 0) return null;

          // Group by country within region
          const byCountry: Record<string, Company[]> = {};
          for (const co of items) {
            const country = co.location_country ?? "Unknown";
            if (!byCountry[country]) byCountry[country] = [];
            byCountry[country].push(co);
          }

          return (
            <div key={reg} className={cn("rounded-xl border p-4", REGION_COLOR[reg])}>
              <h3 className={cn("text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-full inline-block mb-3", REGION_HEADER[reg])}>{reg}</h3>
              <div className="space-y-3">
                {Object.entries(byCountry).sort((a, b) => b[1].length - a[1].length).map(([country, cos]) => (
                  <div key={country}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <MapPin size={11} className="text-slate-400 flex-shrink-0" />
                      <span className="text-xs font-semibold text-slate-700">{country}</span>
                      <span className="text-[10px] text-slate-400 ml-auto">{cos.length} LP{cos.length !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {cos.map(co => (
                        <button
                          key={co.id}
                          onClick={() => onSelect(co.id)}
                          className={cn(
                            "flex items-center gap-1.5 px-2 py-1 rounded-lg border text-xs font-medium transition-all",
                            selectedId === co.id
                              ? "bg-blue-600 text-white border-blue-600"
                              : "bg-white text-slate-700 border-slate-200 hover:border-blue-300 hover:text-blue-700"
                          )}
                        >
                          <CompanyLogo company={co} size="sm" />
                          {co.name}
                          {co.lp_stage && (
                            <span className={cn("w-1.5 h-1.5 rounded-full", STAGE_DOT[co.lp_stage])} />
                          )}
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

// ── FILTER PILLS ───────────────────────────────────────────────────────────────
const FILTER_PILLS = [
  { id: "all",      label: "All stages" },
  { id: "anchor",   label: "Anchor" },
  { id: "family",   label: "Family Office" },
  { id: "overdue",  label: "Overdue follow-ups" },
  { id: "coinvest", label: "Co-invest interest" },
] as const;
type FilterId = typeof FILTER_PILLS[number]["id"];

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────
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

  // Panel edit state
  const [editStage, setEditStage]     = useState("");
  const [editGoal, setEditGoal]       = useState("");
  const [editLpType, setEditLpType]   = useState("");

  // Fund target (localStorage)
  const [fundTarget, setFundTarget]           = useState(0);
  const [editingFundTarget, setEditingFundTarget] = useState(false);
  const [fundTargetInput, setFundTargetInput] = useState("");
  const fundTargetRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem("lp_fund_target");
    if (stored) setFundTarget(parseFloat(stored) || 0);
  }, []);

  useEffect(() => {
    if (editingFundTarget) {
      setFundTargetInput(fundTarget > 0 ? String(fundTarget) : "");
      setTimeout(() => fundTargetRef.current?.focus(), 50);
    }
  }, [editingFundTarget, fundTarget]);

  function saveFundTarget() {
    const val = parseFloat(fundTargetInput.replace(/[^0-9.]/g, "")) || 0;
    setFundTarget(val);
    localStorage.setItem("lp_fund_target", String(val));
    setEditingFundTarget(false);
  }

  // Contacts manage
  const [contactsManaging, setContactsManaging]     = useState(false);
  const [showAddContactForm, setShowAddContactForm] = useState(false);
  const [newContact, setNewContact]                 = useState({ first_name: "", last_name: "", email: "", title: "", location_city: "", location_country: "" });
  const [addingContact, setAddingContact]           = useState(false);

  // Activity
  const [addingActivity, setAddingActivity] = useState(false);
  const [activityDate, setActivityDate]     = useState(() => new Date().toISOString().slice(0, 10));
  const [activityType, setActivityType]     = useState<"call" | "meeting" | "email">("call");
  const [activityNote, setActivityNote]     = useState("");
  const [savingActivity, setSavingActivity] = useState(false);

  // Prep brief
  const [showPrepBrief, setShowPrepBrief] = useState(false);

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

  // Remote data
  const [lastTouchMap, setLastTouchMap]       = useState<Record<string, { date: string; type: string }>>({});
  const [contactCountMap, setContactCountMap] = useState<Record<string, number>>({});
  const [contactNamesMap, setContactNamesMap] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase.from("interactions").select("company_id, date, type")
      .in("type", ["email", "call", "meeting"]).order("date", { ascending: false })
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, { date: string; type: string }> = {};
        for (const r of data) if (r.company_id && !map[r.company_id]) map[r.company_id] = { date: r.date, type: r.type };
        setLastTouchMap(map);
      });
  }, [supabase]);

  useEffect(() => {
    if (!companies.length) return;
    supabase.from("contacts").select("id, first_name, last_name, company_id").in("company_id", companies.map(c => c.id))
      .then(({ data }) => {
        if (!data) return;
        const counts: Record<string, number> = {}, names: Record<string, string> = {};
        for (const c of data) {
          if (!c.company_id) continue;
          counts[c.company_id] = (counts[c.company_id] ?? 0) + 1;
          if (!names[c.company_id]) names[c.company_id] = `${c.first_name} ${c.last_name}`;
        }
        setContactCountMap(counts); setContactNamesMap(names);
      });
  }, [companies, supabase]);

  // Metrics
  const metrics = useMemo(() => {
    const committed   = companies.filter(c => c.lp_stage === "Committed");
    // Soft-circled = Discussion in Process + Due Diligence (actively engaged but not yet committed)
    const softCircled = companies.filter(c => c.lp_stage === "Discussion in Process" || c.lp_stage === "Due Diligence");
    const pipeline    = companies.filter(c => c.lp_stage && !["Passed", "Committed"].includes(c.lp_stage));
    const active      = companies.filter(c => c.lp_stage && c.lp_stage !== "Passed");
    const committedAmt = committed.reduce((s, c) => s + (c.commitment_goal ?? 0), 0);
    const softAmt      = softCircled.reduce((s, c) => s + (c.commitment_goal ?? 0), 0);
    const pipelineAmt  = pipeline.reduce((s, c) => s + (c.commitment_goal ?? 0), 0);
    const withGoal     = companies.filter(c => c.commitment_goal != null);
    const avgCheck     = withGoal.length ? withGoal.reduce((s, c) => s + (c.commitment_goal ?? 0), 0) / withGoal.length : 0;
    const convRate     = companies.length ? Math.round((committed.length / companies.length) * 100) : 0;
    return {
      committedAmt, softAmt, pipelineAmt, avgCheck, convRate, activeCount: active.length,
      committedPct: fundTarget > 0 ? (committedAmt / fundTarget) * 100 : 0,
      softPct:      fundTarget > 0 ? (softAmt / fundTarget) * 100 : 0,
      pipelinePct:  fundTarget > 0 ? (pipelineAmt / fundTarget) * 100 : 0,
    };
  }, [companies, fundTarget]);

  // Filtered
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return companies.filter(c => {
      if (q && !c.name.toLowerCase().includes(q) && !(c.location_city ?? "").toLowerCase().includes(q) && !(c.lp_type ?? "").toLowerCase().includes(q)) return false;
      if (activeFilter === "anchor")   return c.lp_type === "Anchor";
      if (activeFilter === "family")   return c.lp_type === "Family Office";
      if (activeFilter === "overdue") { const last = lastTouchMap[c.id]?.date; return !last || (Date.now() - new Date(last).getTime()) / 86_400_000 > 30; }
      if (activeFilter === "coinvest") return (c.tags ?? []).some(t => t.toLowerCase().includes("co-invest"));
      return true;
    });
  }, [companies, search, activeFilter, lastTouchMap]);

  // Load detail
  const loadDetail = useCallback(async (id: string) => {
    setLoadingDetail(true);
    const [{ data: ctcts }, { data: ints }] = await Promise.all([
      supabase.from("contacts").select("*").eq("company_id", id).order("is_primary_contact", { ascending: false }),
      supabase.from("interactions").select("*").eq("company_id", id).order("date", { ascending: false }).limit(20),
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
    setContactsManaging(false);
    setShowAddContactForm(false);
    setAddingActivity(false);
    loadDetail(id);
  }

  const selected = companies.find(c => c.id === selectedId) ?? null;

  // Save
  async function saveField(id: string, patch: Partial<Company>) {
    const { data, error } = await supabase.from("companies").update(patch).eq("id", id).select().single();
    if (!error && data) {
      setCompanies(prev => prev.map(c => c.id === data.id ? (data as Company) : c));
      if ("lp_stage" in patch) setEditStage((data as Company).lp_stage ?? "");
      if ("commitment_goal" in patch) setEditGoal((data as Company).commitment_goal != null ? String((data as Company).commitment_goal) : "");
      if ("lp_type" in patch) setEditLpType((data as Company).lp_type ?? "");
    }
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
    if (newC) {
      setContacts(prev => [...prev, newC as Contact]);
      setShowAddContactForm(false);
      setNewContact({ first_name: "", last_name: "", email: "", title: "", location_city: "", location_country: "" });
    }
  }

  const prob = selected ? calcProb(selected.lp_stage) : 0;
  const expectedCommitment = (selected?.commitment_goal != null) ? selected.commitment_goal * prob : null;
  const primaryContact = contacts.find(c => c.is_primary_contact) ?? contacts[0] ?? null;

  const mandateScores = useMemo(() => {
    if (!selected) return null;
    return {
      stageScore: ({ Lead: 20, "Initial Meeting": 35, "Discussion in Process": 55, "Due Diligence": 75, Committed: 95, Passed: 10 }[selected.lp_stage ?? ""] ?? 20),
      ticketScore: selected.commitment_goal ? Math.min(100, Math.round((selected.commitment_goal / 5_000_000) * 100)) : 30,
      geoScore: selected.location_country ? 70 : 40,
      sectorScore: selected.fund_focus ? 75 : 50,
    };
  }, [selected]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 overflow-hidden bg-slate-50">

      {/* ── Fund target edit modal ─────────────────────────────────────────── */}
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

      {/* ── Metrics bar ───────────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-slate-200 bg-white">
        <div className="flex gap-3 mb-4">
          {/* Fund Target — manually set */}
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-blue-500">
              <Target size={14} className="text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">Fund Target</p>
                <button onClick={() => setEditingFundTarget(true)} className="text-slate-300 hover:text-slate-500 transition-colors"><Pencil size={9} /></button>
              </div>
              <p className="text-lg font-bold text-slate-900 leading-tight truncate">{fundTarget > 0 ? fmt(fundTarget) : <span className="text-slate-300 text-sm">Click ✏ to set</span>}</p>
              <p className="text-[11px] text-slate-400">{companies.length} LPs</p>
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
          {/* Soft-circled */}
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-amber-500"><TrendingUp size={14} className="text-white" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">Soft-circled</p>
              <p className="text-lg font-bold text-slate-900 leading-tight">{fmt(metrics.softAmt || null)}</p>
              {fundTarget > 0 && <p className="text-[11px] text-slate-400">{pct(metrics.softPct / 100)} of target</p>}
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
          {/* Avg Check */}
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-indigo-500"><DollarSign size={14} className="text-white" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">Avg Check Size</p>
              <p className="text-lg font-bold text-slate-900 leading-tight">{fmt(metrics.avgCheck || null)}</p>
            </div>
          </div>
          {/* Conversion */}
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-rose-500"><ArrowUpRight size={14} className="text-white" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">Conversion Rate</p>
              <p className="text-lg font-bold text-slate-900 leading-tight">{metrics.convRate}%</p>
              <p className="text-[11px] text-slate-400">committed / total</p>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {fundTarget > 0 && (
          <div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.min(metrics.committedPct, 100)}%` }} />
              <div className="h-full bg-amber-400 transition-all" style={{ width: `${Math.min(metrics.softPct, Math.max(0, 100 - metrics.committedPct))}%` }} />
              <div className="h-full bg-blue-300 transition-all" style={{ width: `${Math.min(metrics.pipelinePct, Math.max(0, 100 - metrics.committedPct - metrics.softPct))}%` }} />
            </div>
            <div className="flex gap-4 mt-1.5">
              {[{ color: "bg-emerald-500", label: "Committed", p: metrics.committedPct }, { color: "bg-amber-400", label: "Soft-circled", p: metrics.softPct }, { color: "bg-blue-300", label: "Pipeline", p: metrics.pipelinePct }].map(i => (
                <span key={i.label} className="flex items-center gap-1 text-[10px] text-slate-500">
                  <span className={`w-2 h-2 rounded-full ${i.color} inline-block`} />{i.label} {pct(i.p / 100)}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Toolbar ───────────────────────────────────────────────────────── */}
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
                activeFilter === pill.id ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600"
              )}>{pill.label}</button>
          ))}
        </div>
        <div className="flex-1" />
        {/* View toggle */}
        <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
          {([["table", List], ["kanban", LayoutGrid], ["map", Globe]] as const).map(([mode, Icon]) => (
            <button key={mode} onClick={() => setViewMode(mode)}
              className={cn("px-2.5 py-1.5 text-xs flex items-center gap-1.5 transition-colors",
                viewMode === mode ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-50"
              )}>
              <Icon size={13} />
              <span className="capitalize">{mode}</span>
            </button>
          ))}
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
          <Download size={12} /> Export CSV
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          <Plus size={12} /> Add LP
        </button>
        <span className="text-xs text-slate-400">{filtered.length} LP{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* ─ Table view ──────────────────────────────────────────────────── */}
        {viewMode === "table" && (
          <div className={cn("flex-1 overflow-auto transition-all", selected ? "mr-[460px]" : "")}>
            <table className="w-full text-sm border-collapse" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: 40 }} />
                {Object.keys(DEFAULT_COL_WIDTHS).map(col => (
                  <col key={col} style={{ width: colWidths[col] }} />
                ))}
                <col style={{ width: 40 }} />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5"><input type="checkbox" className="rounded border-slate-300" /></th>
                  {Object.keys(DEFAULT_COL_WIDTHS).map(col => (
                    <th key={col} className="text-left px-3 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider relative select-none">
                      <span className="truncate block">{col}</span>
                      {/* Resize handle */}
                      <div
                        className="absolute right-0 top-0 h-full w-2 cursor-col-resize group flex items-center justify-center"
                        onMouseDown={e => onResizeStart(col, e)}
                      >
                        <div className="w-px h-4 bg-slate-300 group-hover:bg-blue-400 transition-colors" />
                      </div>
                    </th>
                  ))}
                  <th className="w-10 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={15} className="px-4 py-16 text-center text-slate-400 text-sm">{search ? `No results for "${search}"` : "No LPs found"}</td></tr>
                ) : filtered.map(co => {
                  const isActive = co.id === selectedId;
                  const p = calcProb(co.lp_stage);
                  const expected = co.commitment_goal != null ? co.commitment_goal * p : null;
                  const ddq = getDdqStatus(co.lp_stage);
                  const touch = lastTouchMap[co.id];
                  const overdue = touch ? (Date.now() - new Date(touch.date).getTime()) / 86_400_000 > 30 : false;
                  const tags = (co.tags ?? []).slice(0, 2);
                  return (
                    <tr key={co.id} onClick={() => selectCompany(co.id)}
                      className={cn("border-b border-slate-100 cursor-pointer transition-colors group", isActive ? "bg-blue-50" : "hover:bg-slate-50 bg-white")}>
                      <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}><input type="checkbox" className="rounded border-slate-300" /></td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <CompanyLogo company={co} size="sm" />
                          <span className={cn("font-medium text-sm truncate", isActive ? "text-blue-700" : "text-slate-800")}>{co.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {co.lp_type ? <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap", getLpTypeBadge(co.lp_type))}>{co.lp_type}</span>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">{PRIORITY_TO_TIER[co.priority ?? ""] ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        {co.lp_stage ? (
                          <div className="flex items-center gap-1.5">
                            <span className={cn("w-2 h-2 rounded-full flex-shrink-0", STAGE_DOT[co.lp_stage])} />
                            <span className={cn("text-xs font-medium truncate", STAGE_TEXT[co.lp_stage])}>{co.lp_stage}</span>
                          </div>
                        ) : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-slate-700 tabular-nums">{fmt(co.commitment_goal)}</td>
                      <td className="px-3 py-2.5 text-right text-xs font-medium text-slate-800 tabular-nums">
                        {expected != null ? fmt(expected) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-10 h-1.5 bg-slate-100 rounded-full overflow-hidden flex-shrink-0">
                            <div className={cn("h-full rounded-full", p > 0 ? "bg-emerald-500" : "bg-slate-200")} style={{ width: `${p * 100}%` }} />
                          </div>
                          <span className={cn("text-xs tabular-nums", p > 0 ? "text-emerald-600 font-medium" : "text-slate-400")}>{pct(p)}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        {touch ? (
                          <div className="flex items-center gap-1.5">
                            <InteractionIcon type={touch.type} />
                            <span className={cn("text-xs", overdue ? "text-red-500 font-medium" : "text-slate-500")}>{timeAgo(touch.date)}</span>
                            {overdue && <AlertCircle size={10} className="text-red-400" />}
                          </div>
                        ) : <span className="text-slate-300 text-xs">Never</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">{co.last_contact_date ? formatDate(co.last_contact_date) : <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2.5"><span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", ddq.color)}>{ddq.label}</span></td>
                      <td className="px-3 py-2.5">
                        <div className="flex gap-1 flex-wrap">
                          {tags.length > 0 ? tags.map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">{t}</span>)
                            : <span className="text-slate-300 text-xs">—</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">{co.location_city ?? <span className="text-slate-300">—</span>}</td>
                      <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                        <button className="opacity-0 group-hover:opacity-100 w-6 h-6 flex items-center justify-center rounded hover:bg-slate-200 text-slate-400 transition-all"><MoreHorizontal size={13} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ─ Kanban view ─────────────────────────────────────────────────── */}
        {viewMode === "kanban" && (
          <div className={cn("flex-1 overflow-hidden flex flex-col", selected ? "mr-[460px]" : "")}>
            <KanbanView companies={filtered} onSelect={selectCompany} selectedId={selectedId} lastTouchMap={lastTouchMap} />
          </div>
        )}

        {/* ─ Map view ────────────────────────────────────────────────────── */}
        {viewMode === "map" && (
          <div className={cn("flex-1 overflow-hidden flex flex-col", selected ? "mr-[460px]" : "")}>
            <MapView companies={filtered} onSelect={selectCompany} selectedId={selectedId} />
          </div>
        )}

        {/* ── Detail panel ──────────────────────────────────────────────── */}
        <div
          className={cn("fixed right-0 top-0 h-full bg-white border-l border-slate-200 shadow-2xl z-30 flex flex-col transition-transform duration-300 ease-in-out",
            selected ? "translate-x-0" : "translate-x-full")}
          style={{ width: 460 }}
        >
          {selected && (<>
            {/* Header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <CompanyLogo company={selected} size="lg" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-bold text-slate-900 truncate">{selected.name}</h2>
                  {selected.lp_type && <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium", getLpTypeBadge(selected.lp_type))}>{selected.lp_type}</span>}
                  <div className="flex items-center gap-3 mt-1.5">
                    {selected.location_city && <span className="flex items-center gap-1 text-[11px] text-slate-400"><MapPin size={9} />{[selected.location_city, selected.location_country].filter(Boolean).join(", ")}</span>}
                    {selected.website && <a href={selected.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-blue-500 hover:underline"><ExternalLink size={9} />Website</a>}
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedId(null)} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 flex-shrink-0"><X size={14} /></button>
            </div>

            {/* Action buttons — Email + Prep Brief only */}
            <div className="flex gap-2 px-5 py-3 border-b border-slate-100">
              <a href={`mailto:${primaryContact?.email ?? ""}`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex-1 justify-center">
                <Mail size={11} /> Email
              </a>
              <button onClick={() => setShowPrepBrief(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 flex-1 justify-center">
                <FileText size={11} /> Prep Brief
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

              {/* LP Status */}
              <div>
                <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">LP Status</h3>
                <div className="grid grid-cols-2 gap-3">
                  {/* LP Type */}
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">LP Type</p>
                    <select
                      className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-700"
                      value={editLpType}
                      onChange={async e => {
                        const val = e.target.value;
                        setEditLpType(val);
                        await saveField(selected.id, { lp_type: val || null });
                      }}
                    >
                      <option value="">Not set</option>
                      {LP_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  {/* Stage — custom picker */}
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Stage</p>
                    <StagePicker value={editStage} onChange={async s => {
                      setEditStage(s);
                      await saveField(selected.id, { lp_stage: s || null });
                    }} />
                  </div>
                  {/* Commitment goal */}
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Commitment Goal</p>
                    <input type="number" placeholder="e.g. 5000000" value={editGoal}
                      onChange={e => setEditGoal(e.target.value)}
                      onBlur={async () => {
                        const num = parseFloat(editGoal);
                        await saveField(selected.id, { commitment_goal: isNaN(num) ? null : num });
                      }}
                      className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-700" />
                  </div>
                  {/* Expected */}
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Expected</p>
                    <div className="flex items-center gap-2 py-1">
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${prob * 100}%` }} />
                      </div>
                      <span className={cn("text-xs font-bold", prob > 0 ? "text-emerald-600" : "text-slate-400")}>{pct(prob)}</span>
                    </div>
                    <span className="text-sm font-bold text-slate-800">{expectedCommitment != null ? fmt(expectedCommitment) : "—"}</span>
                  </div>
                  {/* DDQ Status — read-only */}
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">DDQ Status</p>
                    <span className={cn("text-[11px] px-2 py-1 rounded-full font-medium inline-block", getDdqStatus(selected.lp_stage).color)}>
                      {getDdqStatus(selected.lp_stage).label}
                    </span>
                  </div>
                  {/* Tier — manually inputted (stored as priority) */}
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Tier</p>
                    <select
                      className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-700"
                      value={PRIORITY_TO_TIER[selected.priority ?? ""] ?? ""}
                      onChange={async e => {
                        const tier = e.target.value;
                        const priority = TIER_TO_PRIORITY[tier] ?? null;
                        await saveField(selected.id, { priority });
                      }}
                    >
                      <option value="">Not set</option>
                      {TIER_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
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

              {/* Contacts */}
              <div className="pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Contacts</h3>
                  <button onClick={() => { setContactsManaging(v => !v); setShowAddContactForm(false); }}
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    {contactsManaging ? "Done" : <>Manage <ChevronRight size={11} /></>}
                  </button>
                </div>

                {loadingDetail ? (
                  <div className="space-y-2">{[1, 2].map(i => <div key={i} className="h-14 bg-slate-50 rounded-lg animate-pulse" />)}</div>
                ) : contactsManaging ? (
                  <div className="space-y-2">
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
                        <button onClick={async () => { if (!confirm(`Remove ${c.first_name} ${c.last_name}?`)) return; await supabase.from("contacts").delete().eq("id", c.id); setContacts(prev => prev.filter(x => x.id !== c.id)); }}
                          className="w-6 h-6 flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:border-red-200 hover:text-red-400 flex-shrink-0"><X size={11} /></button>
                      </div>
                    ))}
                    {showAddContactForm ? (
                      <div className="border border-blue-200 rounded-xl bg-blue-50 p-3 space-y-2">
                        <p className="text-[11px] font-semibold text-slate-700">New Contact</p>
                        <div className="grid grid-cols-2 gap-2">
                          <input className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="First name" value={newContact.first_name} onChange={e => setNewContact(p => ({ ...p, first_name: e.target.value }))} />
                          <input className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Last name" value={newContact.last_name} onChange={e => setNewContact(p => ({ ...p, last_name: e.target.value }))} />
                        </div>
                        <input className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" type="email" placeholder="Email" value={newContact.email} onChange={e => setNewContact(p => ({ ...p, email: e.target.value }))} />
                        <input className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Title / Role" value={newContact.title} onChange={e => setNewContact(p => ({ ...p, title: e.target.value }))} />
                        <div className="grid grid-cols-2 gap-2">
                          <input className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="City" value={newContact.location_city} onChange={e => setNewContact(p => ({ ...p, location_city: e.target.value }))} />
                          <input className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400" placeholder="Country" value={newContact.location_country} onChange={e => setNewContact(p => ({ ...p, location_country: e.target.value }))} />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => { setShowAddContactForm(false); setNewContact({ first_name: "", last_name: "", email: "", title: "", location_city: "", location_country: "" }); }} className="flex-1 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-white">Cancel</button>
                          <button disabled={addingContact || !newContact.first_name.trim()} onClick={handleAddContact}
                            className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg flex items-center justify-center gap-1">
                            {addingContact ? <><Loader2 size={11} className="animate-spin" />Adding…</> : <><Check size={11} />Add Contact</>}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setShowAddContactForm(true)}
                        className="w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-slate-200 rounded-xl text-xs text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors">
                        <Plus size={12} /> Add Contact
                      </button>
                    )}
                  </div>
                ) : contacts.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No contacts linked yet</p>
                ) : (
                  <div className="space-y-2">
                    {contacts.map(c => (
                      <div key={c.id} className="flex items-start gap-2.5 p-2.5 bg-slate-50 rounded-lg">
                        <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0 mt-0.5"><User size={11} className="text-violet-600" /></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-800 truncate">{c.first_name} {c.last_name}{c.is_primary_contact && <span className="ml-1.5 text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">Primary</span>}</p>
                          {c.title && <p className="text-[11px] text-slate-500 truncate">{c.title}</p>}
                          {c.email && <p className="text-[11px] text-blue-600 truncate">{c.email}</p>}
                          {(c.location_city || c.location_country) && (
                            <p className="text-[11px] text-slate-400 flex items-center gap-0.5"><MapPin size={9} />{[c.location_city, c.location_country].filter(Boolean).join(", ")}</p>
                          )}
                        </div>
                        <div className="flex gap-1.5 text-slate-400 flex-shrink-0">
                          {c.email && <a href={`mailto:${c.email}`} className="hover:text-blue-500"><Mail size={11} /></a>}
                          {c.phone && <a href={`tel:${c.phone}`} className="hover:text-green-500"><Phone size={11} /></a>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
                      <button onClick={handleAddActivity} disabled={savingActivity}
                        className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 flex items-center gap-1">
                        {savingActivity ? <><Loader2 size={10} className="animate-spin" />Saving…</> : <><Check size={10} />Save</>}
                      </button>
                    </div>
                  </div>
                )}
                {loadingDetail ? (
                  <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-10 bg-slate-50 rounded-lg animate-pulse" />)}</div>
                ) : interactions.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No interactions recorded</p>
                ) : (
                  <div className="relative pl-4">
                    <div className="absolute left-1.5 top-0 bottom-0 w-px bg-slate-100" />
                    <div className="space-y-3">
                      {interactions.slice(0, 10).map(int => (
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
                      <div>
                        <p className="text-xs text-slate-700">{task.label}</p>
                        <p className={cn("text-[10px]", task.overdue ? "text-red-500" : "text-slate-400")}>{task.due}</p>
                      </div>
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

        {selected && <div className="fixed inset-0 bg-black/5 z-20" onClick={() => setSelectedId(null)} />}
      </div>

      {/* Prep Brief modal */}
      {showPrepBrief && selected && (
        <PrepBriefModal company={selected} contacts={contacts} interactions={interactions} onClose={() => setShowPrepBrief(false)} />
      )}
    </div>
  );
}
