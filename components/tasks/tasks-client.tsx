"use client";
// ─── Task Intelligence — Table · Kanban · Timeline ────────────────────────────

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Search, X, AlertCircle, Clock, CheckCircle2, TrendingUp,
  Users, Flag, ChevronRight, AlignLeft, LayoutGrid, GitBranch,
  Minus, ArrowUp, ArrowDown, Circle, Plus, Check, Building2,
  MoreHorizontal, Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Task {
  id: number;
  title: string;
  cat: string;
  init: string;
  prio: string;
  status: string;
  prog: number;
  owner: string;
  cos: string[];
  start: string;
  due: string;
  daysLeft: number;
  notes: string;
  risks: { title: string; detail: string }[];
  deps: string[];
  comments: { by: string; date: string; txt: string }[];
  noteItems?: { id: string; txt: string }[];
  archived?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const OWNERS = ["Andrew", "Gene", "Lance"];

const CATEGORIES = ["Fundraising", "Diligence", "Portfolio", "Ecosystem", "IC Memo"];

const DEFAULT_INITIATIVES = [
  { key: "fundraise",    label: "Fundraise" },
  { key: "ecosystem",   label: "Ecosystem" },
  { key: "diligence",   label: "Active Diligence" },
  { key: "portfolio",   label: "Portfolio Management" },
  { key: "lp-relations",label: "LP Relationship" },
];

const STATUSES = ["Not started", "On track", "At risk", "Overdue", "Blocked", "Completed"];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];

// ── Color helpers ─────────────────────────────────────────────────────────────

const CAT_COLORS: Record<string, string> = {
  "Fundraising": "bg-blue-50 text-blue-700",
  "Diligence":   "bg-violet-50 text-violet-700",
  "Portfolio":   "bg-teal-50 text-teal-700",
  "Ecosystem":   "bg-green-50 text-green-700",
  "IC Memo":     "bg-amber-50 text-amber-700",
};

const PRIO_DOTS: Record<string, string> = {
  "Critical": "bg-red-500",
  "High":     "bg-amber-500",
  "Medium":   "bg-blue-400",
  "Low":      "bg-slate-400",
};

const STATUS_STYLES: Record<string, string> = {
  "On track":    "bg-green-50 text-green-700",
  "At risk":     "bg-amber-50 text-amber-700",
  "Overdue":     "bg-red-50 text-red-700",
  "Blocked":     "bg-violet-50 text-violet-700",
  "Completed":   "bg-slate-100 text-slate-400",
  "Not started": "bg-slate-100 text-slate-500",
};

const OWNER_COLORS: Record<string, string> = {
  "Andrew": "bg-blue-100 text-blue-700",
  "Gene":   "bg-violet-100 text-violet-700",
  "Lance":  "bg-teal-100 text-teal-700",
};

// ── Initial tasks ─────────────────────────────────────────────────────────────

const INITIAL_TASKS: Task[] = [
  // FUNDRAISING
  { id: 1,  title: "Send soft-circle confirmation to Atinum Investment", cat: "Fundraising", init: "fundraise", prio: "Critical", status: "At risk",    prog: 70, owner: "Andrew", cos: ["Atinum Investment"],       start: "Mar 10, 2026", due: "Mar 25, 2026", daysLeft: 1,   notes: "DDQ received. Subscription docs pending. Gene to drive close.",  risks: [{ title: "DDQ not formally signed off", detail: "Legal review delayed" }], deps: ["Legal: subscription agreement"], comments: [{ by: "Andrew", date: "Mar 20", txt: "Called Patrick Kumm — confirmed interest. Waiting on legal team clearance." }] },
  { id: 2,  title: "Follow up Brunei Investment — soft-circle to committed", cat: "Fundraising", init: "fundraise", prio: "Critical", status: "Overdue",   prog: 35, owner: "Andrew", cos: ["Brunei Investment"],       start: "Mar 1, 2026",  due: "Mar 15, 2026", daysLeft: -9,  notes: "$10M anchor opportunity. DDQ sent. No response in 9 days. Escalate to senior contact.", risks: [{ title: "Key contact unresponsive", detail: "9 days since last touchpoint" }, { title: "Competing fund raising simultaneously", detail: "Brunei also reviewing GIC-backed climate fund" }], deps: [], comments: [{ by: "Andrew", date: "Mar 12", txt: "Sent follow-up email. No response. Will call this week." }] },
  { id: 3,  title: "Prepare Fund II fundraising status update for advisory board", cat: "Fundraising", init: "fundraise", prio: "High",     status: "On track",  prog: 55, owner: "Andrew", cos: [],                        start: "Mar 15, 2026", due: "Apr 5, 2026",  daysLeft: 12,  notes: "Quarterly update: committed, soft-circled, pipeline totals by LP type. Include close forecast.", risks: [], deps: ["LP CRM data must be current"], comments: [] },
  { id: 4,  title: "Send Fund II deck to IBK Korea — schedule follow-on call", cat: "Fundraising", init: "fundraise", prio: "High",     status: "On track",  prog: 30, owner: "Gene",   cos: ["IBK Korea"],              start: "Mar 20, 2026", due: "Apr 10, 2026", daysLeft: 17,  notes: "Institutional LP. $3M goal. Post-call next step: DDQ initiation.", risks: [], deps: [], comments: [] },
  { id: 5,  title: "Re-engage Fosun — overdue DDQ follow-up", cat: "Fundraising", init: "lp-relations", prio: "High", status: "Overdue", prog: 50, owner: "Andrew", cos: ["Fosun"], start: "Mar 5, 2026", due: "Mar 24, 2026", daysLeft: 0, notes: "DDQ received. LP stalled at diligence. Need to unlock next step.", risks: [{ title: "LP cooling — 13 days no contact", detail: "Risk of losing position to competing fund" }], deps: [], comments: [{ by: "Andrew", date: "Mar 18", txt: "Sent DDQ receipt confirmation. Waiting on internal review." }] },
  { id: 6,  title: "Draft personalized outreach for Blauwpark Partners", cat: "Fundraising", init: "lp-relations", prio: "Medium", status: "Not started", prog: 0, owner: "Gene", cos: ["Blauwpark Partners"], start: "Mar 23, 2026", due: "Apr 3, 2026", daysLeft: 10, notes: "Cold prospect. FO in Singapore. Overdue since Jan. Needs new angle.", risks: [], deps: [], comments: [] },
  { id: 7,  title: "Prepare close forecast model — Fund II scenarios", cat: "Fundraising", init: "fundraise", prio: "High", status: "On track", prog: 40, owner: "Andrew", cos: [], start: "Mar 18, 2026", due: "Apr 8, 2026", daysLeft: 15, notes: "Base / bear / bull scenarios. Prob-weighted expected close by LP type.", risks: [], deps: [], comments: [] },
  // DILIGENCE
  { id: 8,  title: "Complete IC memo — YPlasma Series A", cat: "Diligence", init: "diligence", prio: "Critical", status: "At risk", prog: 65, owner: "Andrew", cos: ["YPlasma"], start: "Mar 5, 2026", due: "Mar 28, 2026", daysLeft: 4, notes: "DBD plasma actuator cooling. INTA spinout. IC presentation March 30. Sections remaining: market sizing, competition table, risk flags.", risks: [{ title: "Market sizing data incomplete", detail: "Need HAX/SOSV co-investor confirmation" }], deps: ["YPlasma: technical data room access", "JLL: pilot feedback (HVAC section)"], comments: [{ by: "Gene", date: "Mar 21", txt: "Competitive landscape draft complete. Market sizing needs one more pass." }, { by: "Andrew", date: "Mar 19", txt: "Got JLL pilot feedback — very positive. Adding to memo." }] },
  { id: 9,  title: "Technical diligence call — Mater-AI materials platform", cat: "Diligence", init: "diligence", prio: "High", status: "On track", prog: 50, owner: "Gene", cos: ["Mater-AI"], start: "Mar 12, 2026", due: "Apr 10, 2026", daysLeft: 17, notes: "AI-driven thermoelectric materials discovery. UK team. Arrange NVIDIA GPU infrastructure validation call.", risks: [], deps: ["NVIDIA: GPU validation call"], comments: [] },
  { id: 10, title: "Reference check — Giraffe Bio founding team", cat: "Diligence", init: "diligence", prio: "High", status: "On track", prog: 40, owner: "Andrew", cos: ["Giraffe Bio"], start: "Mar 15, 2026", due: "Apr 5, 2026", daysLeft: 12, notes: "SOSV/IndieBio-backed. Cell-free biomolecule reagents. Need 3 refs: 2 investor, 1 customer.", risks: [], deps: [], comments: [] },
  { id: 11, title: "Financial model review — DexMat cap table and SAFEs", cat: "Diligence", init: "diligence", prio: "Medium", status: "On track", prog: 30, owner: "Gene", cos: ["DexMat"], start: "Mar 18, 2026", due: "Apr 15, 2026", daysLeft: 22, notes: "CNT fiber, Rice spinout. Review SAFE notes, pro-forma cap table, dilution analysis.", risks: [], deps: [], comments: [] },
  { id: 12, title: "Arrange expert advisory call — Ferrum hydrogen plasma process", cat: "Diligence", init: "diligence", prio: "High", status: "Overdue", prog: 20, owner: "Andrew", cos: ["Ferrum Technologies"], start: "Mar 10, 2026", due: "Mar 22, 2026", daysLeft: -2, notes: "Need steel industry expert and materials scientist. Reach out via LP network (Hanwha, SK).", risks: [{ title: "No expert contact identified yet", detail: "Blocking IC memo completion" }], deps: ["Hanwha: steel expert intro"], comments: [] },
  // PORTFOLIO
  { id: 13, title: "Q1 portfolio update — all companies", cat: "Portfolio", init: "portfolio", prio: "High", status: "On track", prog: 60, owner: "Andrew", cos: ["Ferrum Technologies", "DexMat", "Giraffe Bio", "YPlasma", "Mater-AI"], start: "Mar 1, 2026", due: "Mar 31, 2026", daysLeft: 7, notes: "Collect Q1 KPIs: revenue, headcount, runway, key milestones. Compile for LP quarterly report.", risks: [], deps: [], comments: [{ by: "Andrew", date: "Mar 20", txt: "Ferrum, DexMat, YPlasma responded. Waiting on Giraffe Bio and Mater-AI." }] },
  { id: 14, title: "Facilitate DexMat intro to SK Innovation", cat: "Portfolio", init: "portfolio", prio: "High", status: "On track", prog: 40, owner: "Andrew", cos: ["DexMat", "SK Group"], start: "Mar 15, 2026", due: "Apr 8, 2026", daysLeft: 15, notes: "CNT fiber for EV battery applications. SK Innovation CVC confirmed interest.", risks: [], deps: ["SK: CVC contact confirmation"], comments: [] },
  { id: 15, title: "YPlasma — JLL pilot Q1 review meeting", cat: "Portfolio", init: "portfolio", prio: "High", status: "At risk", prog: 70, owner: "Gene", cos: ["YPlasma", "JLL"], start: "Mar 20, 2026", due: "Mar 28, 2026", daysLeft: 4, notes: "Q1 pilot performance review. JLL procurement team attending. Outcome: expand or conclude pilot.", risks: [{ title: "JLL procurement lead traveling", detail: "Schedule not confirmed" }], deps: [], comments: [{ by: "Gene", date: "Mar 22", txt: "Sent calendar invite. Awaiting JLL confirmation." }] },
  { id: 16, title: "Giraffe Bio — introduce to IOI Group biomaterials team", cat: "Portfolio", init: "ecosystem", prio: "Medium", status: "Not started", prog: 0, owner: "Andrew", cos: ["Giraffe Bio", "IOI Group"], start: "Mar 25, 2026", due: "Apr 15, 2026", daysLeft: 22, notes: "Bio-based fermentation and processing synergies. IOI Group R&D center newly opened.", risks: [], deps: [], comments: [] },
  { id: 17, title: "Ferrum Technologies — Hanwha co-invest facilitation", cat: "Portfolio", init: "ecosystem", prio: "Critical", status: "Overdue", prog: 25, owner: "Andrew", cos: ["Ferrum Technologies", "Hanwha"], start: "Mar 5, 2026", due: "Mar 20, 2026", daysLeft: -4, notes: "Hanwha CVC term sheet discussion. $10M co-invest potential. Overdue — reconnect urgently.", risks: [{ title: "Hanwha CVC contact unresponsive", detail: "Last contacted Apr 2025" }], deps: [], comments: [] },
  { id: 18, title: "Portfolio board meeting prep — Ferrum Technologies", cat: "Portfolio", init: "portfolio", prio: "Medium", status: "On track", prog: 30, owner: "Andrew", cos: ["Ferrum Technologies"], start: "Mar 20, 2026", due: "Apr 10, 2026", daysLeft: 17, notes: "Board pack: financials, KPIs, fundraising update, strategic priorities Q2.", risks: [], deps: [], comments: [] },
  // ECOSYSTEM
  { id: 19, title: "NVIDIA — schedule Q1 portfolio showcase", cat: "Ecosystem", init: "ecosystem", prio: "High", status: "Overdue", prog: 15, owner: "Andrew", cos: ["NVIDIA", "Mater-AI", "YPlasma"], start: "Feb 20, 2026", due: "Mar 15, 2026", daysLeft: -9, notes: "Present Mater-AI and YPlasma to NVIDIA AI for Science team. Climate tech accelerator alignment.", risks: [{ title: "NVIDIA contact changed — new VP ventures", detail: "Relationship warm but context needs rebuilding" }], deps: [], comments: [{ by: "Andrew", date: "Mar 5", txt: "Emailed new VP Sarah Lin. No response yet." }] },
  { id: 20, title: "SK Group — reconnect via Seoul LP event", cat: "Ecosystem", init: "ecosystem", prio: "High", status: "On track", prog: 20, owner: "Andrew", cos: ["SK Group", "DexMat", "Mater-AI"], start: "Mar 23, 2026", due: "Apr 20, 2026", daysLeft: 27, notes: "Seoul investor summit April. Arrange meeting with SK CVC. Bring DexMat and Mater-AI decks.", risks: [], deps: [], comments: [] },
  { id: 21, title: "ABL Bio — assign relationship owner and initiate outreach", cat: "Ecosystem", init: "ecosystem", prio: "Medium", status: "Not started", prog: 0, owner: "Gene", cos: ["ABL Bio", "Giraffe Bio"], start: "Mar 23, 2026", due: "Apr 10, 2026", daysLeft: 17, notes: "Health score 22 — cold. Assign to Andrew. First step: map to Giraffe Bio and arrange intro.", risks: [], deps: [], comments: [] },
  { id: 22, title: "Brunei Economic Development Board — strategic partnership MOU", cat: "Ecosystem", init: "ecosystem", prio: "High", status: "On track", prog: 35, owner: "Andrew", cos: ["Brunei Investment"], start: "Mar 10, 2026", due: "May 1, 2026", daysLeft: 38, notes: "Non-binding MOU to structure ongoing co-investment and portfolio support relationship.", risks: [], deps: [], comments: [] },
  { id: 23, title: "IOI Group — facilitate DexMat biomaterials technical meeting", cat: "Ecosystem", init: "ecosystem", prio: "Medium", status: "On track", prog: 20, owner: "Andrew", cos: ["IOI Group", "DexMat"], start: "Mar 20, 2026", due: "Apr 15, 2026", daysLeft: 22, notes: "IOI launched sustainable materials R&D center. Strong DexMat bio-feedstock angle.", risks: [], deps: [], comments: [] },
  { id: 24, title: "Orum Therapeutics — engage as Giraffe Bio diligence advisor", cat: "Ecosystem", init: "diligence", prio: "Medium", status: "On track", prog: 30, owner: "Gene", cos: ["Orum Therapeutics", "Giraffe Bio"], start: "Mar 15, 2026", due: "Apr 5, 2026", daysLeft: 12, notes: "Cell-free protein platform convergence. Orum as paid or equity-comp diligence advisor.", risks: [], deps: [], comments: [] },
  // IC MEMO
  { id: 25, title: "IC memo — Ferrum Technologies (final draft)", cat: "IC Memo", init: "diligence", prio: "Critical", status: "Overdue", prog: 80, owner: "Andrew", cos: ["Ferrum Technologies"], start: "Mar 1, 2026", due: "Mar 20, 2026", daysLeft: -4, notes: "Hydrogen plasma iron and GGBS from waste streams. Vienna-based. Breakthrough Energy backed. IC vote pending expert call completion.", risks: [{ title: "Expert call not yet completed", detail: "Blocking final investment risk section" }, { title: "Competitive response from ThyssenKrupp", detail: "Needs updated competitive table" }], deps: ["Task #12: Expert advisory call"], comments: [{ by: "Andrew", date: "Mar 20", txt: "80% complete. Waiting on expert validation before risk section finalized." }] },
  { id: 26, title: "IC memo — YPlasma (presentation ready)", cat: "IC Memo", init: "diligence", prio: "Critical", status: "At risk", prog: 65, owner: "Andrew", cos: ["YPlasma"], start: "Mar 5, 2026", due: "Mar 28, 2026", daysLeft: 4, notes: "IC presentation March 30. Final sections: market sizing, financial model, risk table.", risks: [{ title: "Market sizing methodology contested", detail: "Need external validation" }], deps: ["Task #8: YPlasma IC memo"], comments: [] },
  { id: 27, title: "IC memo — Mater-AI (initial draft)", cat: "IC Memo", init: "diligence", prio: "High", status: "On track", prog: 25, owner: "Gene", cos: ["Mater-AI"], start: "Mar 20, 2026", due: "Apr 25, 2026", daysLeft: 32, notes: "AI-driven materials discovery. UK. Sections: science validation, IP landscape, team, market.", risks: [], deps: ["Task #9: Technical diligence call"], comments: [] },
  // ADDITIONAL
  { id: 28, title: "Prepare LP quarterly report — Fund II Q1", cat: "Fundraising", init: "lp-relations", prio: "High", status: "On track", prog: 30, owner: "Andrew", cos: [], start: "Mar 20, 2026", due: "Apr 15, 2026", daysLeft: 22, notes: "Committed LP update (EDBI primary). Portfolio highlights, fund close progress, pipeline summary.", risks: [], deps: ["Task #13: Q1 portfolio update"], comments: [] },
  { id: 29, title: "Update LP CRM — stage and touchpoint hygiene", cat: "Fundraising", init: "lp-relations", prio: "Medium", status: "On track", prog: 50, owner: "Gene", cos: [], start: "Mar 20, 2026", due: "Mar 28, 2026", daysLeft: 4, notes: "Ensure all 13 LP records have current stage, last touchpoint, DDQ status, and next follow-up dates.", risks: [], deps: [], comments: [] },
  { id: 30, title: "Sourcing: review 12 inbound pitches — cleantech batch", cat: "Diligence", init: "diligence", prio: "Medium", status: "On track", prog: 40, owner: "Gene", cos: [], start: "Mar 15, 2026", due: "Apr 1, 2026", daysLeft: 8, notes: "AI-scored inbound. Pass / hold / request meeting. Feed output to deal flow pipeline.", risks: [], deps: [], comments: [] },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcDaysLeft(dueStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueStr);
  if (isNaN(due.getTime())) return 0;
  return Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function OwnerAvatar({ owner }: { owner: string }) {
  const initials = owner === "Andrew" ? "A" : owner === "Gene" ? "G" : owner === "Lance" ? "L" : owner.slice(0, 2);
  return (
    <span className={cn(
      "inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-semibold flex-shrink-0",
      OWNER_COLORS[owner] ?? "bg-slate-100 text-slate-600"
    )}>
      {initials}
    </span>
  );
}

function ProgressBar({ pct, slim }: { pct: number; slim?: boolean }) {
  const color = pct >= 70 ? "bg-green-500" : pct >= 40 ? "bg-blue-500" : "bg-slate-300";
  return (
    <div className={cn("w-full bg-slate-100 rounded-full overflow-hidden", slim ? "h-1" : "h-1.5")}>
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

function DaysChip({ daysLeft }: { daysLeft: number }) {
  if (daysLeft < 0)  return <span className="text-xs font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">{Math.abs(daysLeft)}d overdue</span>;
  if (daysLeft === 0) return <span className="text-xs font-semibold text-red-500 bg-red-50 px-1.5 py-0.5 rounded">Due today</span>;
  if (daysLeft <= 3) return <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">{daysLeft}d left</span>;
  if (daysLeft <= 7) return <span className="text-xs font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{daysLeft}d left</span>;
  return <span className="text-xs text-slate-500">{daysLeft}d left</span>;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", STATUS_STYLES[status] ?? "bg-slate-100 text-slate-500")}>
      {status}
    </span>
  );
}

function CatBadge({ cat }: { cat: string }) {
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", CAT_COLORS[cat] ?? "bg-slate-100 text-slate-500")}>
      {cat}
    </span>
  );
}

const INIT_COLORS: Record<string, string> = {
  "fundraise":    "bg-blue-50 text-blue-700",
  "ecosystem":    "bg-green-50 text-green-700",
  "diligence":    "bg-violet-50 text-violet-700",
  "portfolio":    "bg-teal-50 text-teal-700",
  "lp-relations": "bg-orange-50 text-orange-700",
};
const INIT_BADGE_LABELS: Record<string, string> = {
  "fundraise":    "Fundraise",
  "ecosystem":    "Ecosystem",
  "diligence":    "Active Diligence",
  "portfolio":    "Portfolio Mgmt",
  "lp-relations": "LP Relationship",
};

function InitBadge({ init }: { init: string }) {
  const label = INIT_BADGE_LABELS[init] ?? init;
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium", INIT_COLORS[init] ?? "bg-slate-100 text-slate-500")}>
      {label}
    </span>
  );
}

// ── Company Search Hook ───────────────────────────────────────────────────────

function useCompanySearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    setQuery(q);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q.trim()) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const sb = createClient();
        const { data } = await sb.from("companies").select("id, name").ilike("name", `%${q}%`).limit(10);
        setResults((data as { id: string; name: string }[]) ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  return { query, setQuery: search, results, loading, clearResults: () => setResults([]) };
}

// ── Company Picker ────────────────────────────────────────────────────────────

function CompanyPicker({ cos, onChange }: { cos: string[]; onChange: (cos: string[]) => void }) {
  const { query, setQuery, results, loading, clearResults } = useCompanySearch();
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function add(name: string) {
    if (!cos.includes(name)) onChange([...cos, name]);
    setQuery("");
    clearResults();
    setOpen(false);
  }

  function remove(name: string) {
    onChange(cos.filter(c => c !== name));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && query.trim()) {
      e.preventDefault();
      add(query.trim());
    }
    if (e.key === "Escape") { setOpen(false); setQuery(""); clearResults(); }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-1.5">
        {cos.map(c => (
          <span key={c} className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px]">
            {c}
            <button onClick={() => remove(c)} className="text-slate-400 hover:text-slate-600">
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
      </div>
      <div className="relative">
        <Building2 className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search or add company…"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          className="w-full pl-6 pr-3 py-1 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-300"
        />
        {open && (query.trim()) && (
          <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-md shadow-lg max-h-40 overflow-y-auto">
            {loading && <div className="px-3 py-2 text-xs text-slate-400">Searching…</div>}
            {!loading && results.length === 0 && query.trim() && (
              <button
                className="w-full text-left px-3 py-2 text-xs text-slate-600 hover:bg-slate-50"
                onClick={() => add(query.trim())}
              >
                Add &ldquo;{query.trim()}&rdquo;
              </button>
            )}
            {results.map(r => (
              <button
                key={r.id}
                className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                onClick={() => add(r.name)}
              >
                {r.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── MoreMenu (3-dot action menu for table rows) ───────────────────────────────

function MoreMenu({ task, onEdit, onDuplicate, onDelete }: {
  task: Task;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(o => !o)}
        className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 min-w-[120px]">
          <button onClick={() => { onEdit(); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
            Edit
          </button>
          <button onClick={() => { onDuplicate(); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50">
            Duplicate
          </button>
          <div className="border-t border-slate-100 my-1" />
          <button onClick={() => { onDelete(); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50">
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// ── Table view ────────────────────────────────────────────────────────────────

function TableView({ tasks, onSelect, onToggleComplete, onDelete, onDuplicate, onStatusChange, onArchive }: { tasks: Task[]; onSelect: (t: Task) => void; onToggleComplete: (t: Task) => void; onDelete: (t: Task) => void; onDuplicate: (t: Task) => void; onStatusChange: (t: Task, newStatus: string) => void; onArchive: (t: Task) => void }) {
  const sorted = [...tasks].sort((a, b) => {
    const order: Record<string, number> = { Overdue: 0, "At risk": 1, Blocked: 2, "Not started": 2, "On track": 3, Completed: 4 };
    const oa = order[a.status] ?? 3;
    const ob = order[b.status] ?? 3;
    if (oa !== ob) return oa - ob;
    return a.daysLeft - b.daysLeft;
  });

  const INIT_LABELS: Record<string, string> = {
    "fundraise":   "Fundraise",
    "portfolio":   "Portfolio Mgmt",
    "diligence":   "Active Diligence",
    "ecosystem":   "Ecosystem",
    "lp-relations":"LP Relations",
  };

  return (
    <div className="flex-1 overflow-auto">
      <div className="overflow-x-auto">
      <table className="w-full text-xs min-w-[900px]">
        <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10">
          <tr>
            <th className="w-6 px-3 py-2 text-left font-medium text-slate-500"></th>
            <th className="px-3 py-2 text-left font-medium text-slate-500">Task</th>
            <th className="px-3 py-2 text-left font-medium text-slate-500 whitespace-nowrap">Category</th>
            <th className="px-3 py-2 text-left font-medium text-slate-500 whitespace-nowrap">Initiative</th>
            <th className="px-3 py-2 text-left font-medium text-slate-500">Priority</th>
            <th className="px-3 py-2 text-left font-medium text-slate-500">Status</th>
            <th className="px-3 py-2 text-left font-medium text-slate-500 w-20">Progress</th>
            <th className="px-3 py-2 text-left font-medium text-slate-500">Owner</th>
            <th className="px-3 py-2 text-left font-medium text-slate-500">Companies</th>
            <th className="px-3 py-2 text-left font-medium text-slate-500 whitespace-nowrap">Start</th>
            <th className="px-3 py-2 text-left font-medium text-slate-500 whitespace-nowrap">Target</th>
            <th className="px-3 py-2 text-left font-medium text-slate-500">Days</th>
            <th className="w-6"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map(t => (
            <tr
              key={t.id}
              onClick={() => onSelect(t)}
              className={cn(
                "group hover:bg-slate-50 cursor-pointer transition-colors",
                t.status === "Overdue" && "border-l-2 border-red-400",
                t.status === "At risk" && "border-l-2 border-amber-400",
              )}
            >
              <td className="px-3 py-2" onClick={e => { e.stopPropagation(); onToggleComplete(t); }}>
                <div className={cn(
                  "w-3.5 h-3.5 border rounded-sm flex items-center justify-center cursor-pointer transition-colors",
                  t.status === "Completed"
                    ? "bg-emerald-500 border-emerald-500"
                    : "border-slate-300 hover:border-blue-400"
                )}>
                  {t.status === "Completed" && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                </div>
              </td>
              <td className={cn("px-3 py-2 max-w-[280px]", t.status === "Completed" && "line-through text-slate-400")}>
                <span className="font-medium leading-snug line-clamp-2">{t.title}</span>
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <CatBadge cat={t.cat} />
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <InitBadge init={t.init} />
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", PRIO_DOTS[t.prio])} />
                  <span className="text-slate-600">{t.prio}</span>
                </div>
              </td>
              <td className="px-3 py-2 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => {
                    const idx = STATUSES.indexOf(t.status);
                    const next = STATUSES[(idx + 1) % STATUSES.length];
                    onStatusChange(t, next);
                  }}
                  className={cn("px-1.5 py-0.5 rounded text-[10px] font-medium cursor-pointer hover:opacity-80 transition-opacity", STATUS_STYLES[t.status] ?? "bg-slate-100 text-slate-500")}
                  title="Click to change status"
                >
                  {t.status}
                </button>
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5 min-w-[60px]">
                  <ProgressBar pct={t.prog} />
                  <span className="text-slate-500 text-[10px] w-6 flex-shrink-0">{t.prog}%</span>
                </div>
              </td>
              <td className="px-3 py-2">
                <OwnerAvatar owner={t.owner} />
              </td>
              <td className="px-3 py-2 max-w-[160px]">
                <div className="flex flex-wrap gap-1">
                  {t.cos.slice(0, 2).map(c => (
                    <span key={c} className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px]">{c}</span>
                  ))}
                  {t.cos.length > 2 && (
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px]">+{t.cos.length - 2}</span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-slate-500">{t.start}</td>
              <td className="px-3 py-2 whitespace-nowrap text-slate-500">{t.due}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                <DaysChip daysLeft={t.daysLeft} />
              </td>
              <td className="px-3 py-2 w-8" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-1">
                  {t.status === "Completed" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onArchive(t); }}
                      className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1 rounded hover:bg-slate-100 flex items-center gap-1"
                      title="Archive"
                    >
                      <Archive size={12} /> Archive
                    </button>
                  )}
                  <MoreMenu
                    task={t}
                    onEdit={() => onSelect(t)}
                    onDuplicate={() => onDuplicate(t)}
                    onDelete={() => onDelete(t)}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {sorted.length === 0 && (
        <div className="flex items-center justify-center h-40 text-slate-400 text-xs">No tasks match your filters.</div>
      )}
    </div>
  );
}

// ── Kanban view ───────────────────────────────────────────────────────────────

const KANBAN_COLS: { id: string; label: string; color: string }[] = [
  { id: "Not started", label: "Not started", color: "border-t-slate-300" },
  { id: "On track",    label: "On track",    color: "border-t-green-400" },
  { id: "At risk",     label: "At risk",     color: "border-t-amber-400" },
  { id: "Overdue",     label: "Overdue",     color: "border-t-red-400" },
  { id: "Blocked",     label: "Blocked",     color: "border-t-violet-400" },
  { id: "Completed",   label: "Completed",   color: "border-t-slate-200" },
];

function KanbanView({ tasks, allTasks, onSelect, onStatusChange }: {
  tasks: Task[];
  allTasks: Task[];
  onSelect: (t: Task) => void;
  onStatusChange: (taskId: string, newStatus: string) => void;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);

  return (
    <div className="flex-1 overflow-x-auto overflow-y-hidden">
      <div className="flex gap-3 h-full p-3 min-w-[900px]">
        {KANBAN_COLS.map(col => {
          // Completed column always shows all completed tasks (just respects search/initiative, not status filter)
          const colTasks = col.id === "Completed"
            ? allTasks.filter(t => t.status === "Completed")
            : tasks.filter(t => t.status === col.id);
          return (
            <div
              key={col.id}
              className="flex flex-col flex-1 min-w-[180px] max-w-[240px]"
              onDragOver={e => { e.preventDefault(); setDragOver(col.id); }}
              onDragLeave={e => {
                // Only clear if leaving the column entirely (not entering a child)
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOver(null);
                }
              }}
              onDrop={e => {
                e.preventDefault();
                if (dragId) {
                  onStatusChange(dragId, col.id);
                }
                setDragId(null);
                setDragOver(null);
              }}
            >
              <div className={cn("bg-white rounded-t border-t-2 border-x border-slate-200 px-3 py-2", col.color)}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">{col.label}</span>
                  <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{colTasks.length}</span>
                </div>
              </div>
              <div
                className={cn(
                  "flex-1 overflow-y-auto border border-t-0 border-slate-200 rounded-b p-2 space-y-2 transition-colors",
                  dragOver === col.id ? "bg-blue-50 ring-2 ring-inset ring-blue-300" : "bg-slate-50"
                )}
              >
                {colTasks.map(t => (
                  <div
                    key={t.id}
                    draggable
                    onDragStart={e => { e.stopPropagation(); setDragId(String(t.id)); }}
                    onDragEnd={() => { setDragId(null); setDragOver(null); }}
                    onClick={() => onSelect(t)}
                    style={{ opacity: dragId === String(t.id) ? 0.45 : 1 }}
                    className="bg-white border border-slate-200 rounded-lg p-2.5 cursor-grab active:cursor-grabbing hover:border-slate-300 hover:shadow-sm transition-all space-y-2 select-none"
                  >
                    <div className="flex items-start gap-1.5">
                      <span className={cn("mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0", PRIO_DOTS[t.prio])} />
                      <span className="text-xs font-medium text-slate-800 leading-snug line-clamp-3">{t.title}</span>
                    </div>
                    <CatBadge cat={t.cat} />
                    <ProgressBar pct={t.prog} slim />
                    <div className="flex items-center justify-between pt-0.5">
                      <OwnerAvatar owner={t.owner} />
                      <DaysChip daysLeft={t.daysLeft} />
                    </div>
                  </div>
                ))}
                {colTasks.length === 0 && (
                  <div className="text-[11px] text-slate-400 text-center py-4">
                    {dragOver === col.id ? "Drop here" : "Empty"}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Timeline / Gantt view ──────────────────────────────────────────────────────

const GANTT_DAYS = 60;          // total window width in days
const GANTT_PAST = 7;           // days before today shown on the left

function ganttBarColor(status: string): string {
  if (status === "Overdue")    return "bg-red-400";
  if (status === "At risk")    return "bg-amber-400";
  if (status === "On track")   return "bg-blue-500";
  if (status === "Completed")  return "bg-emerald-500";
  if (status === "Blocked")    return "bg-violet-400";
  return "bg-slate-400";
}

/** Build month header labels dynamically from the window start date */
function buildMonthHeaders(windowStart: Date, totalDays: number): { label: string; widthPct: number }[] {
  const headers: { label: string; widthPct: number }[] = [];
  let cursor = new Date(windowStart);
  cursor.setDate(1); // start of the first month

  // Skip forward if the first-of-month is before windowStart
  if (cursor < windowStart) cursor.setMonth(cursor.getMonth() + 1);

  // Always add the partial first month
  const windowEnd = new Date(windowStart);
  windowEnd.setDate(windowStart.getDate() + totalDays);

  let prev = new Date(windowStart);
  while (cursor < windowEnd) {
    const days = Math.round((cursor.getTime() - prev.getTime()) / 86400000);
    const label = prev.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    headers.push({ label, widthPct: (days / totalDays) * 100 });
    prev = new Date(cursor);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  // Last segment
  const days = Math.round((windowEnd.getTime() - prev.getTime()) / 86400000);
  if (days > 0) {
    const label = prev.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    headers.push({ label, widthPct: (days / totalDays) * 100 });
  }
  return headers;
}

function TimelineView({ tasks, onSelect }: { tasks: Task[]; onSelect: (t: Task) => void }) {
  const TODAY = new Date();
  TODAY.setHours(0, 0, 0, 0);

  const windowStart = new Date(TODAY);
  windowStart.setDate(TODAY.getDate() - GANTT_PAST);

  const windowEnd = new Date(windowStart);
  windowEnd.setDate(windowStart.getDate() + GANTT_DAYS);

  const todayPct = (GANTT_PAST / GANTT_DAYS) * 100;
  const monthHeaders = buildMonthHeaders(windowStart, GANTT_DAYS);

  // Sort tasks by due date ascending
  const sorted = [...tasks].sort((a, b) => a.daysLeft - b.daysLeft);

  // Group by owner
  const groups = OWNERS.map(owner => ({
    owner,
    tasks: sorted.filter(t => t.owner === owner),
  })).filter(g => g.tasks.length > 0);

  function calcBar(t: Task): { leftPct: number; widthPct: number } | null {
    // Bar end = today + daysLeft
    const barEnd = new Date(TODAY);
    barEnd.setDate(TODAY.getDate() + t.daysLeft);

    // Parse start date string e.g. "Mar 15" or full date
    let barStart = new Date(t.start);
    if (isNaN(barStart.getTime())) {
      // Fallback: use windowStart so bar is visible
      barStart = new Date(windowStart);
    }
    barStart.setHours(0, 0, 0, 0);

    // Clamp to window
    const clampedStart = barStart < windowStart ? windowStart : barStart;
    const clampedEnd   = barEnd   > windowEnd   ? windowEnd   : barEnd;

    if (clampedEnd <= clampedStart) return null; // entirely outside window

    const msPerDay = 86400000;
    const leftPct  = ((clampedStart.getTime() - windowStart.getTime()) / msPerDay / GANTT_DAYS) * 100;
    const widthPct = Math.max(1.5, ((clampedEnd.getTime() - clampedStart.getTime()) / msPerDay / GANTT_DAYS) * 100);
    return { leftPct, widthPct };
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="min-w-[700px]">
        {/* Month header */}
        <div className="flex sticky top-0 bg-white z-10 border-b border-slate-200">
          <div className="w-56 flex-shrink-0 px-3 py-2 text-xs font-semibold text-slate-500 border-r border-slate-200">Task</div>
          <div className="flex-1 flex relative">
            {monthHeaders.map((h, i) => (
              <div
                key={i}
                className="border-r border-slate-200 py-2 px-2 text-xs font-semibold text-slate-500 bg-slate-50 overflow-hidden whitespace-nowrap"
                style={{ width: `${h.widthPct}%` }}
              >
                {h.label}
              </div>
            ))}
            {/* Today marker in header */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-blue-400 z-10 opacity-70"
              style={{ left: `${todayPct}%` }}
            />
          </div>
        </div>

        {groups.map(g => (
          <div key={g.owner}>
            <div className="flex items-center border-b border-slate-200 bg-slate-50 px-3 py-1.5">
              <OwnerAvatar owner={g.owner} />
              <span className="ml-2 text-xs font-semibold text-slate-600">{g.owner}</span>
              <span className="ml-2 text-[10px] text-slate-400">{g.tasks.length} tasks</span>
            </div>
            {g.tasks.map(t => {
              const bar = calcBar(t);
              return (
                <div
                  key={t.id}
                  onClick={() => onSelect(t)}
                  className="flex items-center border-b border-slate-100 hover:bg-slate-50 cursor-pointer group"
                >
                  <div className="w-56 flex-shrink-0 px-3 py-2 flex items-center gap-1.5 border-r border-slate-100">
                    <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", PRIO_DOTS[t.prio])} />
                    <span className="text-xs text-slate-700 leading-snug line-clamp-2">{t.title}</span>
                  </div>
                  <div className="flex-1 relative h-8 flex items-center">
                    {/* Today vertical marker */}
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-blue-400 z-10 opacity-40"
                      style={{ left: `${todayPct}%` }}
                    />
                    {bar && (
                      <div
                        className={cn(
                          "absolute h-4 rounded-full opacity-80 group-hover:opacity-100 transition-opacity",
                          ganttBarColor(t.status)
                        )}
                        style={{ left: `${bar.leftPct}%`, width: `${bar.widthPct}%` }}
                        title={`${t.title} · ${t.status} · due in ${t.daysLeft}d`}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        {sorted.length === 0 && (
          <div className="text-xs text-slate-400 text-center py-10">No tasks to display</div>
        )}
      </div>
    </div>
  );
}

// ── Side Panel ────────────────────────────────────────────────────────────────

interface SidePanelProps {
  task: Task;
  onClose: () => void;
  onUpdate: (updated: Task) => void;
  onDelete: (t: Task) => void;
  initiatives: { key: string; label: string }[];
}

function SidePanel({ task, onClose, onUpdate, onDelete, initiatives }: SidePanelProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editFields, setEditFields] = useState({
    cat: task.cat,
    init: task.init,
    status: task.status,
    prio: task.prio,
    owner: task.owner,
    start: task.start,
    due: task.due,
  });
  const [addingComment, setAddingComment] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [confirmDeleteNote, setConfirmDeleteNote] = useState<string | null>(null); // "main" or note id

  // Sync when task changes externally
  useEffect(() => {
    setEditFields({
      cat: task.cat,
      init: task.init,
      status: task.status,
      prio: task.prio,
      owner: task.owner,
      start: task.start,
      due: task.due,
    });
    setEditingField(null);
  }, [task.id]);

  function handleMarkComplete() {
    onUpdate({ ...task, status: "Completed" });
    onClose();
  }

  function handleAddComment() {
    if (!commentText.trim()) return;
    const updated: Task = {
      ...task,
      comments: [...task.comments, { by: "Andrew", date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }), txt: commentText.trim() }],
    };
    onUpdate(updated);
    setCommentText("");
    setAddingComment(false);
  }

  const selectCls = "text-xs border border-slate-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300 w-full";

  // Convert display date to yyyy-mm-dd for input
  function toInputDate(s: string): string {
    const d = new Date(s);
    if (isNaN(d.getTime())) return "";
    return d.toISOString().slice(0, 10);
  }

  const [visible, setVisible] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); return () => setVisible(false); }, []);

  return (
    <div
      className={cn("fixed right-0 top-0 h-full bg-white border-l border-slate-200 shadow-2xl z-50 flex flex-col transition-transform duration-300", visible ? "translate-x-0" : "translate-x-full")}
      style={{ width: "min(480px, 100vw)" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex-1 min-w-0 pr-3">
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            <span className={cn("w-2 h-2 rounded-full flex-shrink-0", PRIO_DOTS[task.prio])} />
            <CatBadge cat={task.cat} />
            <StatusBadge status={task.status} />
          </div>
          <p className="text-base font-bold text-slate-900 leading-snug">{task.title}</p>
        </div>
        <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 flex-shrink-0">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 px-5 py-3 border-b border-slate-100">
        <button
          onClick={handleMarkComplete}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 flex-1 justify-center"
        >
          <CheckCircle2 className="w-3.5 h-3.5" /> Mark Complete
        </button>
        <button
          onClick={() => setAddingComment(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 flex-1 justify-center"
        >
          <Plus className="w-3.5 h-3.5" /> Add Update
        </button>
        <button
          onClick={() => onDelete(task)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-red-200 text-red-500 rounded-lg hover:bg-red-50 justify-center"
        >
          <X className="w-3.5 h-3.5" /> Delete
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100">

        {/* Overview — click any field to edit it */}
        <section className="px-4 py-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Overview</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">

            {/* Category */}
            <div>
              <span className="text-slate-400 block mb-0.5">Category</span>
              {editingField === "cat" ? (
                <select autoFocus className={selectCls} value={editFields.cat}
                  onChange={e => setEditFields(f => ({ ...f, cat: e.target.value }))}
                  onBlur={() => { onUpdate({ ...task, cat: editFields.cat }); setEditingField(null); }}>
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              ) : (
                <div className="cursor-pointer" onDoubleClick={() => setEditingField("cat")}>
                  <CatBadge cat={task.cat} />
                </div>
              )}
            </div>

            {/* Initiative */}
            <div>
              <span className="text-slate-400 block mb-0.5">Initiative</span>
              {editingField === "init" ? (
                <select autoFocus className={selectCls} value={editFields.init}
                  onChange={e => setEditFields(f => ({ ...f, init: e.target.value }))}
                  onBlur={() => { onUpdate({ ...task, init: editFields.init }); setEditingField(null); }}>
                  {initiatives.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
                </select>
              ) : (
                <div className="cursor-pointer" onDoubleClick={() => setEditingField("init")}>
                  <InitBadge init={task.init} />
                </div>
              )}
            </div>

            {/* Status */}
            <div>
              <span className="text-slate-400 block mb-0.5">Status</span>
              {editingField === "status" ? (
                <select autoFocus className={selectCls} value={editFields.status}
                  onChange={e => setEditFields(f => ({ ...f, status: e.target.value }))}
                  onBlur={() => { onUpdate({ ...task, status: editFields.status }); setEditingField(null); }}>
                  {STATUSES.map(s => <option key={s}>{s}</option>)}
                </select>
              ) : (
                <div className="cursor-pointer" onDoubleClick={() => setEditingField("status")}>
                  <StatusBadge status={task.status} />
                </div>
              )}
            </div>

            {/* Priority */}
            <div>
              <span className="text-slate-400 block mb-0.5">Priority</span>
              {editingField === "prio" ? (
                <select autoFocus className={selectCls} value={editFields.prio}
                  onChange={e => setEditFields(f => ({ ...f, prio: e.target.value }))}
                  onBlur={() => { onUpdate({ ...task, prio: editFields.prio }); setEditingField(null); }}>
                  {PRIORITIES.map(p => <option key={p}>{p}</option>)}
                </select>
              ) : (
                <div className="flex items-center gap-1 cursor-pointer" onDoubleClick={() => setEditingField("prio")}>
                  <span className={cn("w-1.5 h-1.5 rounded-full", PRIO_DOTS[task.prio])} />
                  <span className="text-slate-700">{task.prio}</span>
                </div>
              )}
            </div>

            {/* Owner */}
            <div>
              <span className="text-slate-400 block mb-0.5">Owner</span>
              {editingField === "owner" ? (
                <select autoFocus className={selectCls} value={editFields.owner}
                  onChange={e => setEditFields(f => ({ ...f, owner: e.target.value }))}
                  onBlur={() => { onUpdate({ ...task, owner: editFields.owner }); setEditingField(null); }}>
                  {OWNERS.map(o => <option key={o}>{o}</option>)}
                </select>
              ) : (
                <div className="flex items-center gap-1.5 cursor-pointer" onDoubleClick={() => setEditingField("owner")}>
                  <OwnerAvatar owner={task.owner} />
                  <span className="text-slate-700">{task.owner}</span>
                </div>
              )}
            </div>

            {/* Days left */}
            <div>
              <span className="text-slate-400 block mb-0.5">Days left</span>
              <DaysChip daysLeft={task.daysLeft} />
            </div>

            {/* Start date */}
            <div>
              <span className="text-slate-400 block mb-0.5">Start</span>
              {editingField === "start" ? (
                <input autoFocus type="date" className={selectCls} value={toInputDate(editFields.start)}
                  onChange={e => setEditFields(f => ({ ...f, start: e.target.value }))}
                  onBlur={() => {
                    function fmtDate(s: string) { const d = new Date(s); return isNaN(d.getTime()) ? s : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
                    const ns = editFields.start.includes("-") ? fmtDate(editFields.start) : editFields.start;
                    onUpdate({ ...task, start: ns }); setEditingField(null);
                  }}
                  onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingField(null); }}
                />
              ) : (
                <span className="text-slate-700 cursor-pointer" onDoubleClick={() => setEditingField("start")}>{task.start || "—"}</span>
              )}
            </div>

            {/* Target date */}
            <div>
              <span className="text-slate-400 block mb-0.5">Target</span>
              {editingField === "due" ? (
                <input autoFocus type="date" className={selectCls} value={toInputDate(editFields.due)}
                  onChange={e => setEditFields(f => ({ ...f, due: e.target.value }))}
                  onBlur={() => {
                    function fmtDate(s: string) { const d = new Date(s); return isNaN(d.getTime()) ? s : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
                    const nd = editFields.due.includes("-") ? fmtDate(editFields.due) : editFields.due;
                    onUpdate({ ...task, due: nd, daysLeft: calcDaysLeft(nd) }); setEditingField(null);
                  }}
                  onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingField(null); }}
                />
              ) : (
                <span className="text-slate-700 cursor-pointer" onDoubleClick={() => setEditingField("due")}>{task.due || "—"}</span>
              )}
            </div>

            {/* Progress */}
            <div className="col-span-2 mt-0.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-slate-400">Progress</span>
                <span className="font-medium text-slate-700">{task.prog}%</span>
              </div>
              <ProgressBar pct={task.prog} />
            </div>
          </div>
        </section>

        {/* Notes */}
        <section className="px-4 py-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Notes</p>
            <button
              onClick={() => setAddingNote(true)}
              className="text-blue-600 hover:text-blue-700"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-1.5">
            {task.notes && (
              <div className="group flex items-start gap-1.5">
                <p className="text-xs text-slate-600 leading-relaxed flex-1">{task.notes}</p>
                {confirmDeleteNote === "main" ? (
                  <span className="flex items-center gap-1 flex-shrink-0">
                    <button onMouseDown={() => { onUpdate({ ...task, notes: "" }); setConfirmDeleteNote(null); }} className="text-xs text-red-600 hover:underline font-medium">Yes</button>
                    <button onMouseDown={() => setConfirmDeleteNote(null)} className="text-xs text-slate-400 hover:underline">No</button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteNote("main")}
                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 flex-shrink-0 mt-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
            {(task.noteItems ?? []).map((n: { id: string; txt: string }) => (
              <div key={n.id} className="group flex items-start gap-1.5">
                <p className="text-xs text-slate-600 leading-relaxed flex-1">{n.txt}</p>
                {confirmDeleteNote === n.id ? (
                  <span className="flex items-center gap-1 flex-shrink-0">
                    <button onMouseDown={() => { onUpdate({ ...task, noteItems: (task.noteItems ?? []).filter((x: { id: string; txt: string }) => x.id !== n.id) }); setConfirmDeleteNote(null); }} className="text-xs text-red-600 hover:underline font-medium">Yes</button>
                    <button onMouseDown={() => setConfirmDeleteNote(null)} className="text-xs text-slate-400 hover:underline">No</button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteNote(n.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 flex-shrink-0 mt-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
          {addingNote && (
            <div className="mt-2 space-y-1.5">
              <textarea
                autoFocus
                rows={2}
                placeholder="Add a note…"
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-300"
              />
              <div className="flex gap-1.5">
                <button
                  onClick={() => {
                    if (!noteText.trim()) return;
                    const newItem = { id: Date.now().toString(), txt: noteText.trim() };
                    onUpdate({ ...task, noteItems: [...(task.noteItems ?? []), newItem] });
                    setNoteText("");
                    setAddingNote(false);
                  }}
                  className="px-2.5 py-1 bg-slate-900 text-white text-xs rounded-md hover:bg-slate-700"
                >Save</button>
                <button
                  onClick={() => { setAddingNote(false); setNoteText(""); }}
                  className="px-2.5 py-1 border border-slate-200 text-xs rounded-md text-slate-600"
                >Cancel</button>
              </div>
            </div>
          )}
        </section>

        {/* Linked Companies */}
        <section className="px-4 py-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Linked Companies</p>
          <CompanyPicker
            cos={task.cos}
            onChange={cos => onUpdate({ ...task, cos })}
          />
        </section>

        {/* Risk Flags */}
        {task.risks.length > 0 && (
          <section className="px-4 py-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Risk Flags</p>
            <div className="space-y-2">
              {task.risks.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-slate-700">{r.title}</p>
                    <p className="text-[11px] text-slate-500">{r.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Dependencies */}
        {task.deps.length > 0 && (
          <section className="px-4 py-3">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Dependencies</p>
            <div className="space-y-1">
              {task.deps.map((d, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs text-slate-600">
                  <ChevronRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
                  {d}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Updates & Comments */}
        <section className="px-4 py-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Updates &amp; Comments</p>
          <div className="space-y-2.5">
            {task.comments.map((c, i) => (
              <div key={i} className="flex gap-2">
                <OwnerAvatar owner={c.by} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[11px] font-medium text-slate-700">{c.by}</span>
                    <span className="text-[10px] text-slate-400">{c.date}</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{c.txt}</p>
                </div>
              </div>
            ))}
            {addingComment && (
              <div className="space-y-1.5">
                <textarea
                  autoFocus
                  rows={3}
                  placeholder="Add an update…"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-md px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-blue-300"
                />
                <div className="flex gap-1.5">
                  <button onClick={handleAddComment} className="px-2.5 py-1 bg-slate-900 text-white text-xs rounded-md hover:bg-slate-700">Post</button>
                  <button onClick={() => { setAddingComment(false); setCommentText(""); }} className="px-2.5 py-1 border border-slate-200 text-xs rounded-md text-slate-600">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </section>

      </div>

    </div>
  );
}

// ── Add Task Modal ────────────────────────────────────────────────────────────

interface AddTaskModalProps {
  onClose: () => void;
  onAdd: (t: Task) => void;
  initiatives: { key: string; label: string }[];
}

function AddTaskModal({ onClose, onAdd, initiatives }: AddTaskModalProps) {
  const [form, setForm] = useState({
    title: "",
    cat: CATEGORIES[0],
    init: initiatives[0]?.key ?? "fundraise",
    prio: "Medium",
    status: "Not started",
    owner: OWNERS[0],
    start: "2026-03-24",
    due: "",
    notes: "",
    cos: [] as string[],
  });
  const [error, setError] = useState("");

  const selectCls = "text-xs border border-slate-200 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300 w-full";
  const inputCls = "text-xs border border-slate-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300 w-full";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError("Title is required."); return; }

    function fmtDate(s: string): string {
      const d = new Date(s);
      if (isNaN(d.getTime())) return s;
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }

    const startStr = form.start ? fmtDate(form.start) : "Mar 24, 2026";
    const dueStr = form.due ? fmtDate(form.due) : "";
    const daysLeft = dueStr ? calcDaysLeft(dueStr) : 0;

    const newTask: Task = {
      id: Date.now(),
      title: form.title.trim(),
      cat: form.cat,
      init: form.init,
      prio: form.prio,
      status: form.status,
      prog: 0,
      owner: form.owner,
      cos: form.cos,
      start: startStr,
      due: dueStr,
      daysLeft,
      notes: form.notes,
      risks: [],
      deps: [],
      comments: [],
    };
    onAdd(newTask);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-[520px] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-sm font-semibold text-slate-800">Add Task</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3">
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div>
            <label className="text-[10px] text-slate-400 uppercase block mb-1">Title *</label>
            <input
              type="text"
              className={inputCls}
              placeholder="Task title…"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-400 uppercase block mb-1">Category</label>
              <select className={selectCls} value={form.cat} onChange={e => setForm(f => ({ ...f, cat: e.target.value }))}>
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 uppercase block mb-1">Initiative</label>
              <select className={selectCls} value={form.init} onChange={e => setForm(f => ({ ...f, init: e.target.value }))}>
                {initiatives.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 uppercase block mb-1">Priority</label>
              <select className={selectCls} value={form.prio} onChange={e => setForm(f => ({ ...f, prio: e.target.value }))}>
                {PRIORITIES.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 uppercase block mb-1">Status</label>
              <select className={selectCls} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                {STATUSES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 uppercase block mb-1">Owner</label>
              <select className={selectCls} value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))}>
                {OWNERS.map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-slate-400 uppercase block mb-1">Start Date</label>
              <input type="date" className={inputCls} value={form.start} onChange={e => setForm(f => ({ ...f, start: e.target.value }))} />
            </div>
            <div className="col-span-2">
              <label className="text-[10px] text-slate-400 uppercase block mb-1">Target Date</label>
              <input type="date" className={inputCls} value={form.due} onChange={e => setForm(f => ({ ...f, due: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="text-[10px] text-slate-400 uppercase block mb-1">Notes</label>
            <textarea
              rows={3}
              className={cn(inputCls, "resize-none")}
              placeholder="Notes…"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-[10px] text-slate-400 uppercase block mb-1">Linked Companies</label>
            <CompanyPicker cos={form.cos} onChange={cos => setForm(f => ({ ...f, cos }))} />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" className="px-3 py-1.5 bg-slate-900 text-white text-xs rounded-md hover:bg-slate-700">
              Add Task
            </button>
            <button type="button" onClick={onClose} className="px-3 py-1.5 border border-slate-200 text-xs rounded-md text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function TasksClient() {
  const [tasks, setTasks] = useState<Task[]>(() =>
    INITIAL_TASKS.map(t => ({ ...t, daysLeft: calcDaysLeft(t.due) }))
  );
  const [initiatives, setInitiatives] = useState(DEFAULT_INITIATIVES);
  const [newInitLabel, setNewInitLabel] = useState("");
  const [showNewInit, setShowNewInit] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [activeInitiative, setActiveInitiative] = useState("all");
  const [view, setView] = useState<"table" | "kanban" | "timeline">("table");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState<number | null>(null);

  // ── localStorage bridge ──────────────────────────────────────────────────────

  useEffect(() => {
    function loadFromStorage() {
      try {
        // Load strategic tasks map
        const rawMap = localStorage.getItem("strategic_tasks_map");
        if (rawMap) {
          const map = JSON.parse(rawMap) as Record<string, Task>;
          setTasks(prev => {
            const existingIds = new Set(prev.map(t => t.id));
            const newTasks = Object.values(map).filter(t => !existingIds.has(t.id));
            return newTasks.length > 0 ? [...prev, ...newTasks] : prev;
          });
        }
        // Load user-added tasks
        const rawCrm = localStorage.getItem("crm_tasks");
        if (rawCrm) {
          const crmTasks = JSON.parse(rawCrm) as Task[];
          if (Array.isArray(crmTasks)) {
            setTasks(prev => {
              const existingIds = new Set(prev.map(t => t.id));
              const newTasks = crmTasks.filter(t => !existingIds.has(t.id));
              return newTasks.length > 0 ? [...prev, ...newTasks] : prev;
            });
          }
        }
      } catch {
        // ignore parse errors
      }
    }

    loadFromStorage();

    function handleStorage(e: StorageEvent) {
      if (e.key === "strategic_tasks_map" || e.key === "crm_tasks") {
        loadFromStorage();
      }
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Persist ALL tasks to crm_tasks for cross-page linking
  useEffect(() => {
    try {
      localStorage.setItem("crm_tasks", JSON.stringify(tasks));
    } catch {
      // ignore
    }
  }, [tasks]);

  // ── Task update handler ──────────────────────────────────────────────────────

  function handleUpdateTask(updated: Task) {
    setTasks(prev => prev.map(t => t.id === updated.id ? updated : t));
    setSelectedTask(updated);
  }

  function handleAddTask(t: Task) {
    setTasks(prev => [...prev, t]);
  }

  function handleToggleComplete(t: Task) {
    const updated = { ...t, status: t.status === "Completed" ? "On track" as const : "Completed" as const };
    setTasks(prev => prev.map(x => x.id === t.id ? updated : x));
    if (selectedTask?.id === t.id) setSelectedTask(updated);
  }

  function handleDeleteTask(t: Task) {
    setConfirmDeleteTaskId(t.id);
  }

  function handleArchiveTask(t: Task) {
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, archived: true } : x));
    if (selectedTask?.id === t.id) setSelectedTask(null);
  }

  function confirmDeleteTask() {
    if (confirmDeleteTaskId === null) return;
    setTasks(prev => prev.filter(t => t.id !== confirmDeleteTaskId));
    if (selectedTask?.id === confirmDeleteTaskId) setSelectedTask(null);
    setConfirmDeleteTaskId(null);
  }

  // ── Filtering ────────────────────────────────────────────────────────────────

  const showCompleted = activeFilter === "completed";
  const showArchived = activeFilter === "archived";

  const filteredTasks = useMemo(() => {
    let list = tasks;

    // Initiative filter
    if (activeInitiative !== "all") {
      list = list.filter(t => t.init === activeInitiative);
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.cos.some(c => c.toLowerCase().includes(q))
      );
    }

    if (showArchived) {
      return list.filter(t => t.archived);
    }

    if (showCompleted) {
      return list.filter(t => t.status === "Completed");
    }

    // Exclude archived and completed unless pill active
    list = list.filter(t => !t.archived);
    list = list.filter(t => t.status !== "Completed");

    switch (activeFilter) {
      case "Fundraising": list = list.filter(t => t.cat === "Fundraising"); break;
      case "Diligence":   list = list.filter(t => t.cat === "Diligence"); break;
      case "Portfolio":   list = list.filter(t => t.cat === "Portfolio"); break;
      case "Ecosystem":   list = list.filter(t => t.cat === "Ecosystem"); break;
      case "IC Memo":     list = list.filter(t => t.cat === "IC Memo"); break;
      case "Overdue":     list = list.filter(t => t.status === "Overdue"); break;
      case "At Risk":     list = list.filter(t => t.status === "At risk"); break;
      case "Andrew":      list = list.filter(t => t.owner === "Andrew"); break;
      case "Gene":        list = list.filter(t => t.owner === "Gene"); break;
      case "Lance":       list = list.filter(t => t.owner === "Lance"); break;
    }

    return list;
  }, [tasks, activeFilter, activeInitiative, search, showCompleted, showArchived]);

  // All tasks respecting only search + initiative (for kanban completed column)
  const allSearchedTasks = useMemo(() => {
    let list = tasks;
    if (activeInitiative !== "all") list = list.filter(t => t.init === activeInitiative);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t => t.title.toLowerCase().includes(q) || t.cos.some(c => c.toLowerCase().includes(q)));
    }
    return list;
  }, [tasks, activeInitiative, search]);

  // ── Stats ────────────────────────────────────────────────────────────────────

  const nonCompleted = tasks.filter(t => t.status !== "Completed" && !t.archived);
  const totalDisplay = showCompleted ? tasks.filter(t => t.status === "Completed").length : nonCompleted.length;
  const overdueCnt   = nonCompleted.filter(t => t.status === "Overdue").length;
  const atRiskCnt    = nonCompleted.filter(t => t.status === "At risk").length;
  const onTrackCnt   = nonCompleted.filter(t => t.status === "On track").length;
  const notStartedCnt = nonCompleted.filter(t => t.status === "Not started").length;

  // ── Initiative helpers ────────────────────────────────────────────────────────

  function taskCountForInit(key: string) {
    return tasks.filter(t => t.init === key && t.status !== "Completed" && !t.archived).length;
  }

  function addInitiative() {
    const label = newInitLabel.trim();
    if (!label) return;
    const key = label.toLowerCase().replace(/\s+/g, "-");
    if (initiatives.some(i => i.key === key)) return;
    setInitiatives(prev => [...prev, { key, label }]);
    setNewInitLabel("");
    setShowNewInit(false);
  }

  // ── Filter pills ─────────────────────────────────────────────────────────────

  const FILTER_PILLS = [
    "all", "Fundraising", "Diligence", "Portfolio", "Ecosystem", "IC Memo",
    "Overdue", "At Risk", "Andrew", "Gene", "Lance", "completed", "archived",
  ];

  const pillLabel = (f: string) => {
    if (f === "all") return "All";
    if (f === "completed") return "Completed";
    if (f === "archived") return "Archived";
    return f;
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-5 pt-4 pb-3 space-y-3">
        {/* Stat cards — full width */}
        <div className="flex gap-3">
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0 h-24">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-500"><AlignLeft size={14} className="text-white" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">Total Tasks</p>
              <p className="text-lg font-bold text-slate-900 leading-tight">{totalDisplay}</p>
              <p className="text-xs text-slate-400">non-completed</p>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0 h-24">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-red-500"><AlertCircle size={14} className="text-white" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">Overdue</p>
              <p className="text-lg font-bold text-slate-900 leading-tight">{overdueCnt}</p>
              <p className="text-xs text-slate-400">need attention</p>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0 h-24">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-amber-500"><Flag size={14} className="text-white" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">At Risk</p>
              <p className="text-lg font-bold text-slate-900 leading-tight">{atRiskCnt}</p>
              <p className="text-xs text-slate-400">watch closely</p>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0 h-24">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-green-500"><CheckCircle2 size={14} className="text-white" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">On Track</p>
              <p className="text-lg font-bold text-slate-900 leading-tight">{onTrackCnt}</p>
              <p className="text-xs text-slate-400">progressing</p>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 flex-1 min-w-0 h-24">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 bg-slate-400"><Circle size={14} className="text-white" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider leading-tight">Not Started</p>
              <p className="text-lg font-bold text-slate-900 leading-tight">{notStartedCnt}</p>
              <p className="text-xs text-slate-400">pending</p>
            </div>
          </div>
        </div>

        {/* Initiatives bar */}
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {/* All card */}
          <button
            onClick={() => setActiveInitiative("all")}
            className={cn(
              "flex-shrink-0 px-3 py-2 rounded-lg border text-left transition-colors",
              activeInitiative === "all" ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"
            )}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0" />
              <span className={cn("text-xs font-medium", activeInitiative === "all" ? "text-blue-700" : "text-slate-700")}>All</span>
            </div>
            <p className="text-[10px] text-slate-500">{nonCompleted.length} tasks</p>
          </button>
          {initiatives.map(init => {
            const cnt = taskCountForInit(init.key);
            return (
              <button
                key={init.key}
                onClick={() => setActiveInitiative(init.key)}
                className={cn(
                  "flex-shrink-0 px-3 py-2 rounded-lg border text-left transition-colors",
                  activeInitiative === init.key ? "border-blue-200 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"
                )}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" />
                  <span className={cn("text-xs font-medium", activeInitiative === init.key ? "text-blue-700" : "text-slate-700")}>
                    {init.label}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500">{cnt} tasks</p>
                <div className="mt-1.5 h-1 bg-slate-100 rounded-full overflow-hidden w-28">
                  <div className="h-full rounded-full bg-blue-400" style={{ width: cnt > 0 ? `${Math.min(100, (cnt / nonCompleted.length) * 100 * 3)}%` : "0%" }} />
                </div>
              </button>
            );
          })}
          {/* + New initiative */}
          {showNewInit ? (
            <div className="flex-shrink-0 flex items-center gap-1 px-2 py-1.5 border border-blue-200 rounded-lg bg-blue-50">
              <input
                autoFocus
                type="text"
                placeholder="Initiative name…"
                value={newInitLabel}
                onChange={e => setNewInitLabel(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addInitiative(); if (e.key === "Escape") { setShowNewInit(false); setNewInitLabel(""); } }}
                className="text-xs border border-slate-200 rounded px-2 py-0.5 w-28 focus:outline-none focus:ring-1 focus:ring-blue-300"
              />
              <button onClick={addInitiative} className="text-blue-600 hover:text-blue-800">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => { setShowNewInit(false); setNewInitLabel(""); }} className="text-slate-400 hover:text-slate-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowNewInit(true)}
              className="flex-shrink-0 flex items-center gap-1 px-3 py-2 border border-dashed border-slate-300 rounded-lg text-slate-400 hover:text-slate-600 hover:border-slate-400 text-xs"
            >
              <Plus className="w-3 h-3" /> New
            </button>
          )}
        </div>

        {/* Filters + search + add task + view toggle */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative flex-shrink-0">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
            <input
              type="text"
              placeholder="Search tasks or companies…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-7 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md w-48 focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          {/* Filter pills */}
          <div className="flex gap-1 overflow-x-auto pb-0.5 flex-1">
            {FILTER_PILLS.map(f => (
              <button
                key={f}
                onClick={() => setActiveFilter(f)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0",
                  activeFilter === f
                    ? "bg-slate-900 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                )}
              >
                {pillLabel(f)}
              </button>
            ))}
          </div>
          {/* View toggle */}
          <div className="flex gap-1 flex-shrink-0">
            {(["table", "kanban", "timeline"] as const).map(v => {
              const Icon = v === "table" ? AlignLeft : v === "kanban" ? LayoutGrid : GitBranch;
              return (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  title={v.charAt(0).toUpperCase() + v.slice(1)}
                  className={cn(
                    "p-1.5 rounded-md border transition-colors",
                    view === v
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                </button>
              );
            })}
          </div>
          {/* Add task — far right, blue */}
          <button
            onClick={() => setShowAddModal(true)}
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-3 h-3" /> Add task
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className={cn("flex flex-1 overflow-hidden transition-all duration-300", selectedTask ? "md:mr-[480px]" : "")}>
        {view === "table" && (
          <TableView
            tasks={filteredTasks}
            onSelect={setSelectedTask}
            onToggleComplete={handleToggleComplete}
            onDelete={handleDeleteTask}
            onDuplicate={(t) => { const dup = { ...t, id: Date.now(), title: `${t.title} (copy)` }; setTasks(prev => [...prev, dup]); }}
            onStatusChange={(t, newStatus) => setTasks(prev => prev.map(task => task.id === t.id ? { ...task, status: newStatus } : task))}
            onArchive={handleArchiveTask}
          />
        )}
        {view === "kanban" && (
          <KanbanView
            tasks={filteredTasks}
            allTasks={allSearchedTasks}
            onSelect={setSelectedTask}
            onStatusChange={(taskId, newStatus) =>
              setTasks(prev => prev.map(t => String(t.id) === taskId ? { ...t, status: newStatus as Task["status"] } : t))
            }
          />
        )}
        {view === "timeline" && (
          <TimelineView tasks={filteredTasks} onSelect={setSelectedTask} />
        )}
      </div>

      {selectedTask && (
        <SidePanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleUpdateTask}
          onDelete={handleDeleteTask}
          initiatives={initiatives}
        />
      )}

      {/* Confirm delete task overlay */}
      {confirmDeleteTaskId !== null && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-80">
            <p className="text-sm font-semibold text-slate-800 mb-1">Delete task?</p>
            <p className="text-xs text-slate-500 mb-4">This action cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={confirmDeleteTask} className="flex-1 py-1.5 bg-red-500 text-white text-xs font-medium rounded-lg hover:bg-red-600 transition-colors">Delete</button>
              <button onClick={() => setConfirmDeleteTaskId(null)} className="flex-1 py-1.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-lg hover:bg-slate-200 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Task Modal */}
      {showAddModal && (
        <AddTaskModal
          onClose={() => setShowAddModal(false)}
          onAdd={handleAddTask}
          initiatives={initiatives}
        />
      )}
    </div>
  );
}
