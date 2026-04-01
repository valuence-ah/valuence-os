"use client";
// ─── Sourcing Intelligence Client v2 ─────────────────────────────────────────

import { useState, useMemo, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { SourcingSignal } from "@/lib/types";
import { formatDate, timeAgo, cn } from "@/lib/utils";
import {
  ExternalLink, Search, Plus, ChevronDown, ChevronUp,
  Bookmark, BookmarkCheck, X, Star, Eye, Phone, Archive,
  Building2, MapPin, Tag, Zap, ArrowRight,
} from "lucide-react";

// ── Scoring engine ────────────────────────────────────────────────────────────

const PRIMARY_KW = [
  "synthetic biology", "biomanufacturing", "enzyme engineering", "cleantech",
  "carbon capture", "energy transition", "techbio", "single-cell sequencing",
  "precision fermentation", "green chemistry",
];
const SECONDARY_KW = [
  "apac deeptech", "singapore deeptech", "korea deeptech", "japan deeptech",
  "advanced materials", "nanotechnology", "factory automation",
  "ai drug discovery", "gene sequencing", "quantum",
];

function computeScore(signal: SourcingSignal): number {
  const text = [
    signal.title ?? "", signal.summary ?? "", signal.content ?? "",
    ...(signal.sector_tags ?? []), signal.geography ?? "", signal.technology_category ?? "",
  ].join(" ").toLowerCase();

  let score = 0;
  for (const kw of PRIMARY_KW) if (text.includes(kw)) score += 3;
  for (const kw of SECONDARY_KW) if (text.includes(kw)) score += 2;

  // Geography
  if (text.includes("north america") || text.includes("united states") || text.includes(" usa ") || text.includes("canada")) score += 1;
  if (text.includes("singapore")) score += 1;
  if (text.includes("korea") || text.includes("korean")) score += 1;
  if (text.includes("japan") || text.includes("japanese")) score += 1;

  // Signal type premium
  if (signal.signal_type === "patent") score += 1;
  else if (signal.signal_type === "grant") score += 1;
  else if (signal.signal_type === "funding") score += 2;

  // Recency
  const dateStr = signal.published_date ?? signal.created_at;
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
  if (days < 7) score += 1;
  else if (days > 30) score -= 1;

  return Math.max(0, Math.min(10, score));
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SCORE_CFG = {
  high:   { label: "High",   bg: "bg-green-100", text: "text-green-700", border: "border-green-200" },
  medium: { label: "Medium", bg: "bg-amber-100",  text: "text-amber-700",  border: "border-amber-200" },
  low:    { label: "Low",    bg: "bg-slate-100",  text: "text-slate-500",  border: "border-slate-200" },
} as const;

function scoreCfg(score: number) {
  if (score >= 8) return SCORE_CFG.high;
  if (score >= 5) return SCORE_CFG.medium;
  return SCORE_CFG.low;
}

const SOURCE_COLORS: Record<string, string> = {
  arxiv: "bg-red-100 text-red-700", sbir: "bg-blue-100 text-blue-700",
  nsf: "bg-indigo-100 text-indigo-700", uspto: "bg-yellow-100 text-yellow-700",
  crunchbase: "bg-orange-100 text-orange-700", news: "bg-green-100 text-green-700",
  linkedin: "bg-sky-100 text-sky-700", exa: "bg-violet-100 text-violet-700",
  semantic_scholar: "bg-teal-100 text-teal-700", nih: "bg-pink-100 text-pink-700",
  nrel: "bg-lime-100 text-lime-700", manual: "bg-slate-100 text-slate-700",
  other: "bg-slate-100 text-slate-500",
};

const TECH_FILTERS = [
  { key: "all",          label: "All" },
  { key: "Synthetic Bio", label: "Synthetic Bio" },
  { key: "Advanced Materials", label: "Adv. Materials" },
  { key: "Cleantech",    label: "Cleantech" },
  { key: "Factory Automation", label: "Automation" },
  { key: "AI / Compute", label: "AI" },
  { key: "Quantum",      label: "Quantum" },
  { key: "Green Chemistry", label: "Green Chem" },
];

const GEO_FILTERS = [
  { key: "all",           label: "All" },
  { key: "North America", label: "North America" },
  { key: "Singapore",     label: "Singapore" },
  { key: "Korea",         label: "Korea" },
  { key: "Japan",         label: "Japan" },
  { key: "Other",         label: "Other Asia" },
];

const PIPELINE_STAGES = [
  { value: "sourced",             label: "Sourced" },
  { value: "first_meeting",       label: "First Meeting" },
  { value: "deep_dive",           label: "Deep Dive" },
  { value: "ic_memo",             label: "IC Memo" },
  { value: "term_sheet",          label: "Term Sheet" },
  { value: "due_diligence",       label: "Due Diligence" },
];

// ── Types ────────────────────────────────────────────────────────────────────

interface Props { initialSignals: SourcingSignal[]; }

type SortKey = "score" | "date" | "status";

// ── Component ─────────────────────────────────────────────────────────────────

export function SourcingClient({ initialSignals }: Props) {
  const supabase = createClient();

  // ── State ──────────────────────────────────────────────────────────────────
  const [signals, setSignals] = useState(initialSignals);
  const [search, setSearch] = useState("");
  const [techFilter, setTechFilter] = useState("all");
  const [geoFilter, setGeoFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("new");
  const [sortBy, setSortBy] = useState<SortKey>("score");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showWatchlist, setShowWatchlist] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<Partial<SourcingSignal>>({ source: "manual", signal_type: "other", status: "new" });
  const [saving, setSaving] = useState(false);
  const [pipelineTarget, setPipelineTarget] = useState<SourcingSignal | null>(null);
  const [pipelineStage, setPipelineStage] = useState("sourced");
  const [pipelineName, setPipelineName] = useState("");
  const [pipelineSaving, setPipelineSaving] = useState(false);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [addingPipeline, setAddingPipeline] = useState<string | null>(null);

  // ── Computed scores ───────────────────────────────────────────────────────
  const scored = useMemo(() =>
    signals.map(s => ({ ...s, _score: computeScore(s) })),
  [signals]);

  // ── Month start for "this month" tile ─────────────────────────────────────
  const monthStart = useMemo(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
  }, []);

  // ── Summary stats ────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: signals.length,
    newCount: signals.filter(s => s.status === "new").length,
    highRelevance: scored.filter(s => s._score >= 7).length,
    addedPipeline: signals.filter(s => s.company_id && new Date(s.created_at) >= monthStart).length,
    contactedMonth: signals.filter(s => s.status === "contacted" && new Date(s.created_at) >= monthStart).length,
  }), [scored, signals, monthStart]);

  // ── Watchlisted ───────────────────────────────────────────────────────────
  const watchlisted = useMemo(() => scored.filter(s => s.is_watchlisted), [scored]);

  // ── Filtered + sorted list ────────────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = scored;

    if (statusFilter !== "all") list = list.filter(s => s.status === statusFilter);

    if (techFilter !== "all") {
      list = list.filter(s => {
        const cat = s.technology_category ?? "";
        return cat.toLowerCase().includes(techFilter.toLowerCase()) ||
          (s.sector_tags ?? []).some(t => t.toLowerCase().includes(techFilter.toLowerCase()));
      });
    }

    if (geoFilter !== "all" && geoFilter !== "Other") {
      list = list.filter(s => s.geography === geoFilter);
    } else if (geoFilter === "Other") {
      const known = ["North America", "Singapore", "Korea", "Japan"];
      list = list.filter(s => s.geography && !known.includes(s.geography));
    }

    const q = search.toLowerCase();
    if (q) {
      list = list.filter(s =>
        (s.title ?? "").toLowerCase().includes(q) ||
        (s.summary ?? "").toLowerCase().includes(q) ||
        (s.company_name ?? "").toLowerCase().includes(q) ||
        (s.sector_tags ?? []).some(t => t.toLowerCase().includes(q))
      );
    }

    if (sortBy === "score") list = [...list].sort((a, b) => b._score - a._score);
    else if (sortBy === "date") list = [...list].sort((a, b) =>
      new Date(b.published_date ?? b.created_at).getTime() -
      new Date(a.published_date ?? a.created_at).getTime()
    );

    return list;
  }, [scored, statusFilter, techFilter, geoFilter, search, sortBy]);

  // ── Best signals (top 5 by score) ────────────────────────────────────────
  const bestSignals = useMemo(() =>
    [...scored].sort((a, b) => b._score - a._score).slice(0, 5),
  [scored]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function loadCompanies() {
    if (companies.length > 0) return;
    const { data } = await supabase.from("companies").select("id, name").order("name").limit(500);
    setCompanies(data ?? []);
  }

  async function updateStatus(id: string, status: SourcingSignal["status"]) {
    await supabase.from("sourcing_signals").update({ status }).eq("id", id);
    setSignals(prev => prev.map(s => s.id === id ? { ...s, status } : s));
  }

  async function toggleWatchlist(signal: SourcingSignal) {
    const next = !signal.is_watchlisted;
    await supabase.from("sourcing_signals").update({ is_watchlisted: next }).eq("id", signal.id);
    setSignals(prev => prev.map(s => s.id === signal.id ? { ...s, is_watchlisted: next } : s));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const { data, error } = await supabase.from("sourcing_signals").insert({
      ...form,
      source_count: 1,
      is_watchlisted: false,
      extra_urls: [],
    }).select().single();
    setSaving(false);
    if (!error && data) {
      setSignals(p => [data as SourcingSignal, ...p]);
      setShowAdd(false);
      setForm({ source: "manual", signal_type: "other", status: "new" });
    } else alert(error?.message ?? "Failed to save");
  }

  async function openPipelineModal(signal: SourcingSignal) {
    await loadCompanies();
    setPipelineTarget(signal);
    setPipelineName(signal.company_name ?? signal.title ?? "");
    setPipelineStage("sourced");
  }

  async function submitAddToPipeline(e: React.FormEvent) {
    e.preventDefault();
    if (!pipelineTarget) return;
    setPipelineSaving(true);
    setAddingPipeline(pipelineTarget.id);

    const { data: company, error } = await supabase
      .from("companies")
      .insert({
        name: pipelineName.trim() || (pipelineTarget.title ?? "Untitled"),
        type: "startup",
        types: ["startup"],
        deal_status: pipelineStage,
        source: pipelineTarget.source,
        notes: pipelineTarget.summary ?? null,
      })
      .select()
      .single();

    if (error || !company) {
      alert("Failed: " + error?.message);
      setPipelineSaving(false);
      setAddingPipeline(null);
      return;
    }

    await supabase
      .from("sourcing_signals")
      .update({ company_id: company.id, status: "reviewed" })
      .eq("id", pipelineTarget.id);

    setSignals(prev => prev.map(s =>
      s.id === pipelineTarget.id ? { ...s, company_id: company.id, status: "reviewed" } : s
    ));

    setPipelineTarget(null);
    setPipelineSaving(false);
    setAddingPipeline(null);
  }

  // ── Pill filter button helper ─────────────────────────────────────────────
  function PillFilter({ value, current, onChange, label }: { value: string; current: string; onChange: (v: string) => void; label: string }) {
    const active = current === value;
    return (
      <button
        onClick={() => onChange(value)}
        className={cn(
          "px-3 py-1 text-xs font-medium rounded-full border transition-colors whitespace-nowrap",
          active
            ? "bg-blue-600 text-white border-blue-600"
            : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600"
        )}
      >
        {label}
      </button>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-auto p-6 space-y-5">

      {/* ── Summary Tiles ── */}
      <div className="grid grid-cols-5 gap-4">
        {[
          { label: "Total Signals",       value: stats.total,          color: "text-slate-900",   sub: "all time" },
          { label: "New / Unreviewed",     value: stats.newCount,       color: "text-blue-600",    sub: "pending review" },
          { label: "High Relevance",       value: stats.highRelevance,  color: "text-green-600",   sub: "score ≥ 7" },
          { label: "Added to Pipeline",    value: stats.addedPipeline,  color: "text-violet-600",  sub: "this month" },
          { label: "Contacted This Month", value: stats.contactedMonth, color: "text-amber-600",   sub: "this month" },
        ].map(tile => (
          <div key={tile.label} className="card p-4">
            <div className={`text-2xl font-bold ${tile.color}`}>{tile.value}</div>
            <div className="text-xs font-medium text-slate-700 mt-0.5">{tile.label}</div>
            <div className="text-[10px] text-slate-400">{tile.sub}</div>
          </div>
        ))}
      </div>

      {/* ── This Week's Best Signals ── */}
      {bestSignals.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Star size={14} className="text-amber-500" />
              <h3 className="text-sm font-semibold text-slate-800">This Week's Best Signals</h3>
            </div>
            <span className="text-[10px] text-slate-400">Top 5 by relevance</span>
          </div>
          <div className="space-y-1.5">
            {bestSignals.map((s, i) => {
              const cfg = scoreCfg(s._score);
              return (
                <div key={s.id} className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                  onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}>
                  <span className="text-xs font-bold text-slate-400 w-4">{i + 1}</span>
                  <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border", cfg.bg, cfg.text, cfg.border)}>
                    {s._score}
                  </span>
                  <span className="flex-1 text-xs text-slate-700 truncate">{s.title}</span>
                  {s.technology_category && (
                    <span className="text-[10px] text-slate-400 hidden sm:block">{s.technology_category}</span>
                  )}
                  <span className="text-[10px] text-slate-400">{timeAgo(s.published_date ?? s.created_at)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Filter Tabs ── */}
      <div className="card p-3 space-y-2">
        {/* Row 1: Technology */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide w-16">Tech</span>
          {TECH_FILTERS.map(f => (
            <PillFilter key={f.key} value={f.key} current={techFilter} onChange={setTechFilter} label={f.label} />
          ))}
        </div>
        {/* Row 2: Geography */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide w-16">Geo</span>
          {GEO_FILTERS.map(f => (
            <PillFilter key={f.key} value={f.key} current={geoFilter} onChange={setGeoFilter} label={f.label} />
          ))}
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-8 w-56 h-9" placeholder="Search signals…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className="select h-9 w-36" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">All status</option>
            <option value="new">New</option>
            <option value="reviewed">Reviewed</option>
            <option value="contacted">Contacted</option>
            <option value="archived">Archived</option>
          </select>
          <select className="select h-9 w-32" value={sortBy} onChange={e => setSortBy(e.target.value as SortKey)}>
            <option value="score">By Score</option>
            <option value="date">By Date</option>
            <option value="status">By Status</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowWatchlist(v => !v)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors",
              showWatchlist ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            )}
          >
            <Bookmark size={13} />
            Watchlist {watchlisted.length > 0 && <span className="bg-amber-500 text-white rounded-full text-[9px] w-4 h-4 flex items-center justify-center font-bold">{watchlisted.length}</span>}
          </button>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg">
            <Plus size={14} /> Add Signal
          </button>
        </div>
      </div>

      <div className="flex gap-5">
        {/* ── Signal List ── */}
        <div className="flex-1 card divide-y divide-slate-100">
          <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-4 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
            <span className="flex-1">Signal</span>
            <span className="w-16 text-right">Score</span>
            <span className="w-24 hidden md:block">Tech</span>
            <span className="w-20 hidden lg:block">Geography</span>
            <span className="w-24">Status</span>
            <span className="w-20">Actions</span>
          </div>

          {filtered.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-slate-400 text-sm">No signals found.</p>
              <p className="text-slate-300 text-xs mt-1">Try adjusting your filters or run the sourcing agents.</p>
            </div>
          ) : (
            filtered.map(signal => {
              const cfg = scoreCfg(signal._score);
              const isExpanded = expandedId === signal.id;

              return (
                <div key={signal.id} className={cn("transition-colors", signal.status === "archived" && "opacity-50")}>
                  {/* ── Signal Row ── */}
                  <div
                    className="px-5 py-3.5 hover:bg-slate-50/60 cursor-pointer flex items-center gap-4"
                    onClick={() => setExpandedId(isExpanded ? null : signal.id)}
                  >
                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <span className={cn("badge uppercase text-[10px] font-semibold", SOURCE_COLORS[signal.source] ?? "bg-slate-100 text-slate-600")}>
                          {signal.source.replace("_", " ")}
                        </span>
                        {signal.signal_type && (
                          <span className="badge bg-slate-100 text-slate-500 capitalize text-[10px]">{signal.signal_type.replace("_", " ")}</span>
                        )}
                        {(signal.source_count ?? 1) > 1 && (
                          <span className="badge bg-purple-50 text-purple-600 text-[10px]">{signal.source_count} sources</span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-slate-800 leading-snug truncate">{signal.title ?? "Untitled signal"}</p>
                      {signal.company_name && (
                        <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                          <Building2 size={10} />{signal.company_name}
                        </p>
                      )}
                    </div>

                    {/* Score */}
                    <div className="w-16 flex justify-end">
                      <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full border", cfg.bg, cfg.text, cfg.border)}>
                        {signal._score}/10
                      </span>
                    </div>

                    {/* Tech category */}
                    <div className="w-24 hidden md:block">
                      {signal.technology_category ? (
                        <span className="text-[10px] text-slate-500 truncate block">{signal.technology_category}</span>
                      ) : (
                        <span className="text-[10px] text-slate-300">—</span>
                      )}
                    </div>

                    {/* Geography */}
                    <div className="w-20 hidden lg:block">
                      {signal.geography ? (
                        <span className="text-[10px] text-slate-500 truncate flex items-center gap-1">
                          <MapPin size={9} />{signal.geography}
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-300">—</span>
                      )}
                    </div>

                    {/* Status */}
                    <div className="w-24" onClick={e => e.stopPropagation()}>
                      <select
                        className="text-[10px] border border-slate-200 rounded px-1.5 py-1 bg-white w-full"
                        value={signal.status}
                        onChange={e => updateStatus(signal.id, e.target.value as SourcingSignal["status"])}
                      >
                        <option value="new">New</option>
                        <option value="reviewed">Reviewed</option>
                        <option value="contacted">Contacted</option>
                        <option value="archived">Archived</option>
                      </select>
                    </div>

                    {/* Actions */}
                    <div className="w-20 flex items-center gap-1 justify-end" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => toggleWatchlist(signal)}
                        className={cn("p-1 rounded hover:bg-slate-100 transition-colors", signal.is_watchlisted ? "text-amber-500" : "text-slate-300 hover:text-amber-400")}
                        title={signal.is_watchlisted ? "Remove from watchlist" : "Add to watchlist"}
                      >
                        {signal.is_watchlisted ? <BookmarkCheck size={13} /> : <Bookmark size={13} />}
                      </button>
                      {signal.url && (
                        <a href={signal.url} target="_blank" rel="noopener noreferrer" className="p-1 text-slate-300 hover:text-blue-600 rounded hover:bg-slate-100 transition-colors">
                          <ExternalLink size={13} />
                        </a>
                      )}
                      <button onClick={() => setExpandedId(isExpanded ? null : signal.id)} className="p-1 text-slate-300 hover:text-slate-600 rounded hover:bg-slate-100">
                        {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                    </div>
                  </div>

                  {/* ── Expanded Detail Panel ── */}
                  {isExpanded && (
                    <div className="px-5 pb-5 pt-2 bg-slate-50 border-t border-slate-100 space-y-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div>
                          <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Company</div>
                          <div className="text-slate-700 font-medium">{signal.company_name ?? "—"}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Technology</div>
                          <div className="text-slate-700">{signal.technology_category ?? "—"}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Geography</div>
                          <div className="text-slate-700">{signal.geography ?? "—"}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Published</div>
                          <div className="text-slate-700">{signal.published_date ? formatDate(signal.published_date) : timeAgo(signal.created_at)}</div>
                        </div>
                      </div>

                      {/* Relevance breakdown */}
                      <div>
                        <div className="text-[10px] text-slate-400 uppercase font-semibold mb-2 flex items-center gap-1.5">
                          <Zap size={10} /> Relevance Score: {signal._score}/10
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-200 rounded-full max-w-xs">
                            <div
                              className={cn("h-full rounded-full transition-all", signal._score >= 8 ? "bg-green-500" : signal._score >= 5 ? "bg-amber-400" : "bg-slate-400")}
                              style={{ width: `${signal._score * 10}%` }}
                            />
                          </div>
                          <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full border", scoreCfg(signal._score).bg, scoreCfg(signal._score).text, scoreCfg(signal._score).border)}>
                            {scoreCfg(signal._score).label}
                          </span>
                        </div>
                      </div>

                      {/* Summary */}
                      {signal.summary && (
                        <div>
                          <div className="text-[10px] text-slate-400 uppercase font-semibold mb-1">Summary</div>
                          <p className="text-xs text-slate-600 leading-relaxed">{signal.summary}</p>
                        </div>
                      )}

                      {/* Sector tags */}
                      {signal.sector_tags && signal.sector_tags.length > 0 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Tag size={10} className="text-slate-400" />
                          {signal.sector_tags.map(tag => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-teal-50 text-teal-700 border border-teal-100 rounded font-medium">{tag}</span>
                          ))}
                        </div>
                      )}

                      {/* Source links */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {signal.url && (
                          <a href={signal.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                            <ExternalLink size={11} /> Primary Source
                          </a>
                        )}
                        {(signal.extra_urls ?? []).map((u, i) => (
                          <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                            <ExternalLink size={11} /> Source {i + 2}
                          </a>
                        ))}
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-slate-200">
                        <button
                          onClick={() => openPipelineModal(signal)}
                          disabled={!!signal.company_id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <ArrowRight size={12} />
                          {signal.company_id ? "In Pipeline" : "Add to Pipeline"}
                        </button>
                        <button
                          onClick={() => updateStatus(signal.id, "contacted")}
                          disabled={signal.status === "contacted"}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 text-xs font-medium rounded-lg disabled:opacity-50 transition-colors"
                        >
                          <Phone size={12} /> Mark Contacted
                        </button>
                        <button
                          onClick={() => toggleWatchlist(signal)}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors",
                            signal.is_watchlisted
                              ? "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                          )}
                        >
                          {signal.is_watchlisted ? <BookmarkCheck size={12} /> : <Bookmark size={12} />}
                          {signal.is_watchlisted ? "Watchlisted" : "Save to Watchlist"}
                        </button>
                        <button
                          onClick={() => updateStatus(signal.id, "archived")}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200 text-xs font-medium rounded-lg transition-colors"
                        >
                          <Archive size={12} /> Dismiss
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ── Watchlist Panel ── */}
        {showWatchlist && (
          <div className="w-72 flex-shrink-0 card p-4 h-fit sticky top-6 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookmarkCheck size={14} className="text-amber-500" />
                <h3 className="text-sm font-semibold text-slate-800">Watchlist</h3>
              </div>
              <button onClick={() => setShowWatchlist(false)} className="text-slate-400 hover:text-slate-600">
                <X size={14} />
              </button>
            </div>

            {watchlisted.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">No watchlisted companies yet.<br />Click <Bookmark size={10} className="inline" /> on any signal to add.</p>
            ) : (
              <div className="space-y-2">
                {watchlisted.map(s => {
                  const cfg = scoreCfg(s._score);
                  return (
                    <div key={s.id} className="p-2.5 bg-slate-50 rounded-lg border border-slate-100 hover:border-slate-200 cursor-pointer transition-colors"
                      onClick={() => { setExpandedId(s.id); setShowWatchlist(false); }}>
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <p className="text-xs font-medium text-slate-700 leading-snug line-clamp-2">{s.title}</p>
                        <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full border flex-shrink-0", cfg.bg, cfg.text, cfg.border)}>
                          {s._score}
                        </span>
                      </div>
                      {s.company_name && (
                        <p className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Building2 size={9} />{s.company_name}
                        </p>
                      )}
                      <div className="flex items-center justify-between mt-1.5">
                        <span className={cn("text-[9px] uppercase font-semibold", SOURCE_COLORS[s.source]?.split(" ")[1] ?? "text-slate-400")}>
                          {s.source.replace("_", " ")}
                        </span>
                        <span className="text-[9px] text-slate-400">{timeAgo(s.published_date ?? s.created_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Add Signal Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-base font-semibold">Add Signal Manually</h2>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 text-xl">×</button>
            </div>
            <form onSubmit={handleSave} className="px-6 py-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Source</label>
                  <select className="select" value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value as SourcingSignal["source"] }))}>
                    {["arxiv","sbir","nsf","uspto","semantic_scholar","nih","nrel","crunchbase","news","linkedin","exa","manual","other"].map(s => (
                      <option key={s} value={s}>{s.replace("_"," ").toUpperCase()}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Type</label>
                  <select className="select" value={form.signal_type ?? "other"} onChange={e => setForm(p => ({ ...p, signal_type: e.target.value as SourcingSignal["signal_type"] }))}>
                    {["paper","grant","patent","funding","news","job_posting","other"].map(s => (
                      <option key={s} value={s}>{s.replace("_"," ")}</option>
                    ))}
                  </select>
                </div>
              </div>
              <input required className="input" placeholder="Title *" value={form.title ?? ""} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
              <input className="input" placeholder="Company name (optional)" value={form.company_name ?? ""} onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))} />
              <input className="input" placeholder="URL" value={form.url ?? ""} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} />
              <textarea className="textarea" rows={3} placeholder="Summary / notes" value={form.summary ?? ""} onChange={e => setForm(p => ({ ...p, summary: e.target.value }))} />
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAdd(false)} className="flex-1 py-2.5 border border-slate-300 text-slate-700 text-sm rounded-lg">Cancel</button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50">{saving ? "Saving…" : "Add Signal"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add to Pipeline Modal ── */}
      {pipelineTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setPipelineTarget(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-base font-semibold">Add to Pipeline</h2>
              <button onClick={() => setPipelineTarget(null)} className="text-slate-400 text-xl">×</button>
            </div>
            <form onSubmit={submitAddToPipeline} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Company / Organization Name</label>
                <input required className="input" value={pipelineName} onChange={e => setPipelineName(e.target.value)} placeholder="Company name" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Pipeline Stage</label>
                <select className="select" value={pipelineStage} onChange={e => setPipelineStage(e.target.value)}>
                  {PIPELINE_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-600">
                <p className="font-medium mb-1">Source signal:</p>
                <p className="text-slate-500 line-clamp-2">{pipelineTarget.title}</p>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setPipelineTarget(null)} className="flex-1 py-2.5 border border-slate-300 text-slate-700 text-sm rounded-lg">Cancel</button>
                <button type="submit" disabled={pipelineSaving} className="flex-1 py-2.5 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50">
                  {pipelineSaving ? "Adding…" : "Add to Pipeline"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
