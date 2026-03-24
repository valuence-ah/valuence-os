"use client";
// ─── Task Intelligence — Table · Kanban · Timeline ────────────────────────────

import { useState, useMemo } from "react";
import {
  Search, X, AlertCircle, Clock, CheckCircle2, TrendingUp,
  Users, Flag, ChevronRight, AlignLeft, LayoutGrid, GitBranch,
  Minus, ArrowUp, ArrowDown, Circle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Task data ─────────────────────────────────────────────────────────────────

const TASKS = [
  // FUNDRAISING
  {id:1,title:"Send soft-circle confirmation to Atinum Investment",cat:"Fundraising",init:"fund2close",prio:"Critical",status:"At risk",prog:70,owner:"AW",cos:["Atinum Investment"],start:"Mar 10, 2026",due:"Mar 25, 2026",daysLeft:-2,notes:"DDQ received. Subscription docs pending. VV to drive close.",risks:[{title:"DDQ not formally signed off",detail:"Legal review delayed"}],deps:["Legal: subscription agreement"],comments:[{by:"AW",date:"Mar 20",txt:"Called Patrick Kumm — confirmed interest. Waiting on legal team clearance."}]},
  {id:2,title:"Follow up Brunei Investment — soft-circle to committed",cat:"Fundraising",init:"fund2close",prio:"Critical",status:"Overdue",prog:35,owner:"AW",cos:["Brunei Investment"],start:"Mar 1, 2026",due:"Mar 15, 2026",daysLeft:-8,notes:"$10M anchor opportunity. DDQ sent. No response in 9 days. Escalate to senior contact.",risks:[{title:"Key contact unresponsive",detail:"9 days since last touchpoint"},{title:"Competing fund raising simultaneously",detail:"Brunei also reviewing GIC-backed climate fund"}],deps:[],comments:[{by:"AW",date:"Mar 12",txt:"Sent follow-up email. No response. Will call this week."}]},
  {id:3,title:"Prepare Fund II fundraising status update for advisory board",cat:"Fundraising",init:"fund2close",prio:"High",status:"On track",prog:55,owner:"AW",cos:[],start:"Mar 15, 2026",due:"Apr 5, 2026",daysLeft:13,notes:"Quarterly update: committed, soft-circled, pipeline totals by LP type. Include close forecast.",risks:[],deps:["LP CRM data must be current"],comments:[]},
  {id:4,title:"Send Fund II deck to IBK Korea — schedule follow-on call",cat:"Fundraising",init:"fund2close",prio:"High",status:"On track",prog:30,owner:"VV",cos:["IBK Korea"],start:"Mar 20, 2026",due:"Apr 10, 2026",daysLeft:18,notes:"Institutional LP. $3M goal. Post-call next step: DDQ initiation.",risks:[],deps:[],comments:[]},
  {id:5,title:"Re-engage Fosun — overdue DDQ follow-up",cat:"Fundraising",init:"lp-relations",prio:"High",status:"Overdue",prog:50,owner:"AW",cos:["Fosun"],start:"Mar 5, 2026",due:"Mar 24, 2026",daysLeft:-2,notes:"DDQ received. LP stalled at diligence. Need to unlock next step.",risks:[{title:"LP cooling — 13 days no contact",detail:"Risk of losing position to competing fund"}],deps:[],comments:[{by:"AW",date:"Mar 18",txt:"Sent DDQ receipt confirmation. Waiting on internal review."}]},
  {id:6,title:"Draft personalized outreach for Blauwpark Partners",cat:"Fundraising",init:"lp-relations",prio:"Medium",status:"Not started",prog:0,owner:"VV",cos:["Blauwpark Partners"],start:"Mar 23, 2026",due:"Apr 3, 2026",daysLeft:11,notes:"Cold prospect. FO in Singapore. Overdue since Jan. Needs new angle.",risks:[],deps:[],comments:[]},
  {id:7,title:"Prepare close forecast model — Fund II scenarios",cat:"Fundraising",init:"fund2close",prio:"High",status:"On track",prog:40,owner:"AW",cos:[],start:"Mar 18, 2026",due:"Apr 8, 2026",daysLeft:16,notes:"Base / bear / bull scenarios. Prob-weighted expected close by LP type.",risks:[],deps:[],comments:[]},
  // DILIGENCE
  {id:8,title:"Complete IC memo — YPlasma Series A",cat:"Diligence",init:"diligence",prio:"Critical",status:"At risk",prog:65,owner:"AW",cos:["YPlasma"],start:"Mar 5, 2026",due:"Mar 28, 2026",daysLeft:5,notes:"DBD plasma actuator cooling. INTA spinout. IC presentation March 30. Sections remaining: market sizing, competition table, risk flags.",risks:[{title:"Market sizing data incomplete",detail:"Need HAX/SOSV co-investor confirmation"}],deps:["YPlasma: technical data room access","JLL: pilot feedback (HVAC section)"],comments:[{by:"VV",date:"Mar 21",txt:"Competitive landscape draft complete. Market sizing needs one more pass."},{by:"AW",date:"Mar 19",txt:"Got JLL pilot feedback — very positive. Adding to memo."}]},
  {id:9,title:"Technical diligence call — Mater-AI materials platform",cat:"Diligence",init:"diligence",prio:"High",status:"On track",prog:50,owner:"VV",cos:["Mater-AI"],start:"Mar 12, 2026",due:"Apr 10, 2026",daysLeft:18,notes:"AI-driven thermoelectric materials discovery. UK team. Arrange NVIDIA GPU infrastructure validation call.",risks:[],deps:["NVIDIA: GPU validation call"],comments:[]},
  {id:10,title:"Reference check — Giraffe Bio founding team",cat:"Diligence",init:"diligence",prio:"High",status:"On track",prog:40,owner:"AW",cos:["Giraffe Bio"],start:"Mar 15, 2026",due:"Apr 5, 2026",daysLeft:13,notes:"SOSV/IndieBio-backed. Cell-free biomolecule reagents. Need 3 refs: 2 investor, 1 customer.",risks:[],deps:[],comments:[]},
  {id:11,title:"Financial model review — DexMat cap table and SAFEs",cat:"Diligence",init:"diligence",prio:"Medium",status:"On track",prog:30,owner:"VV",cos:["DexMat"],start:"Mar 18, 2026",due:"Apr 15, 2026",daysLeft:23,notes:"CNT fiber, Rice spinout. Review SAFE notes, pro-forma cap table, dilution analysis.",risks:[],deps:[],comments:[]},
  {id:12,title:"Arrange expert advisory call — Ferrum hydrogen plasma process",cat:"Diligence",init:"diligence",prio:"High",status:"Overdue",prog:20,owner:"AW",cos:["Ferrum Technologies"],start:"Mar 10, 2026",due:"Mar 22, 2026",daysLeft:-1,notes:"Need steel industry expert and materials scientist. Reach out via LP network (Hanwha, SK).",risks:[{title:"No expert contact identified yet",detail:"Blocking IC memo completion"}],deps:["Hanwha: steel expert intro"],comments:[]},
  // PORTFOLIO
  {id:13,title:"Q1 portfolio update — all companies",cat:"Portfolio",init:"portfolio",prio:"High",status:"On track",prog:60,owner:"AW",cos:["Ferrum Technologies","DexMat","Giraffe Bio","YPlasma","Mater-AI"],start:"Mar 1, 2026",due:"Mar 31, 2026",daysLeft:8,notes:"Collect Q1 KPIs: revenue, headcount, runway, key milestones. Compile for LP quarterly report.",risks:[],deps:[],comments:[{by:"AW",date:"Mar 20",txt:"Ferrum, DexMat, YPlasma responded. Waiting on Giraffe Bio and Mater-AI."}]},
  {id:14,title:"Facilitate DexMat intro to SK Innovation",cat:"Portfolio",init:"portfolio",prio:"High",status:"On track",prog:40,owner:"AW",cos:["DexMat","SK Group"],start:"Mar 15, 2026",due:"Apr 8, 2026",daysLeft:16,notes:"CNT fiber for EV battery applications. SK Innovation CVC confirmed interest.",risks:[],deps:["SK: CVC contact confirmation"],comments:[]},
  {id:15,title:"YPlasma — JLL pilot Q1 review meeting",cat:"Portfolio",init:"portfolio",prio:"High",status:"At risk",prog:70,owner:"VV",cos:["YPlasma","JLL"],start:"Mar 20, 2026",due:"Mar 28, 2026",daysLeft:5,notes:"Q1 pilot performance review. JLL procurement team attending. Outcome: expand or conclude pilot.",risks:[{title:"JLL procurement lead traveling",detail:"Schedule not confirmed"}],deps:[],comments:[{by:"VV",date:"Mar 22",txt:"Sent calendar invite. Awaiting JLL confirmation."}]},
  {id:16,title:"Giraffe Bio — introduce to IOI Group biomaterials team",cat:"Portfolio",init:"ecosystem",prio:"Medium",status:"Not started",prog:0,owner:"AW",cos:["Giraffe Bio","IOI Group"],start:"Mar 25, 2026",due:"Apr 15, 2026",daysLeft:23,notes:"Bio-based fermentation and processing synergies. IOI Group R&D center newly opened.",risks:[],deps:[],comments:[]},
  {id:17,title:"Ferrum Technologies — Hanwha co-invest facilitation",cat:"Portfolio",init:"ecosystem",prio:"Critical",status:"Overdue",prog:25,owner:"AW",cos:["Ferrum Technologies","Hanwha"],start:"Mar 5, 2026",due:"Mar 20, 2026",daysLeft:-3,notes:"Hanwha CVC term sheet discussion. $10M co-invest potential. Overdue — reconnect urgently.",risks:[{title:"Hanwha CVC contact unresponsive",detail:"Last contacted Apr 2025"}],deps:[],comments:[]},
  {id:18,title:"Portfolio board meeting prep — Ferrum Technologies",cat:"Portfolio",init:"portfolio",prio:"Medium",status:"On track",prog:30,owner:"AW",cos:["Ferrum Technologies"],start:"Mar 20, 2026",due:"Apr 10, 2026",daysLeft:18,notes:"Board pack: financials, KPIs, fundraising update, strategic priorities Q2.",risks:[],deps:[],comments:[]},
  // ECOSYSTEM
  {id:19,title:"NVIDIA — schedule Q1 portfolio showcase",cat:"Ecosystem",init:"ecosystem",prio:"High",status:"Overdue",prog:15,owner:"AW",cos:["NVIDIA","Mater-AI","YPlasma"],start:"Feb 20, 2026",due:"Mar 15, 2026",daysLeft:-8,notes:"Present Mater-AI and YPlasma to NVIDIA AI for Science team. Climate tech accelerator alignment.",risks:[{title:"NVIDIA contact changed — new VP ventures",detail:"Relationship warm but context needs rebuilding"}],deps:[],comments:[{by:"AW",date:"Mar 5",txt:"Emailed new VP Sarah Lin. No response yet."}]},
  {id:20,title:"SK Group — reconnect via Seoul LP event",cat:"Ecosystem",init:"ecosystem",prio:"High",status:"On track",prog:20,owner:"AW",cos:["SK Group","DexMat","Mater-AI"],start:"Mar 23, 2026",due:"Apr 20, 2026",daysLeft:28,notes:"Seoul investor summit April. Arrange meeting with SK CVC. Bring DexMat and Mater-AI decks.",risks:[],deps:[],comments:[]},
  {id:21,title:"ABL Bio — assign relationship owner and initiate outreach",cat:"Ecosystem",init:"ecosystem",prio:"Medium",status:"Not started",prog:0,owner:"VV",cos:["ABL Bio","Giraffe Bio"],start:"Mar 23, 2026",due:"Apr 10, 2026",daysLeft:18,notes:"Health score 22 — cold. Assign to AW. First step: map to Giraffe Bio and arrange intro.",risks:[],deps:[],comments:[]},
  {id:22,title:"Brunei Economic Development Board — strategic partnership MOU",cat:"Ecosystem",init:"ecosystem",prio:"High",status:"On track",prog:35,owner:"AW",cos:["Brunei Investment"],start:"Mar 10, 2026",due:"May 1, 2026",daysLeft:39,notes:"Non-binding MOU to structure ongoing co-investment and portfolio support relationship.",risks:[],deps:[],comments:[]},
  {id:23,title:"IOI Group — facilitate DexMat biomaterials technical meeting",cat:"Ecosystem",init:"ecosystem",prio:"Medium",status:"On track",prog:20,owner:"AW",cos:["IOI Group","DexMat"],start:"Mar 20, 2026",due:"Apr 15, 2026",daysLeft:23,notes:"IOI launched sustainable materials R&D center. Strong DexMat bio-feedstock angle.",risks:[],deps:[],comments:[]},
  {id:24,title:"Orum Therapeutics — engage as Giraffe Bio diligence advisor",cat:"Ecosystem",init:"diligence",prio:"Medium",status:"On track",prog:30,owner:"VV",cos:["Orum Therapeutics","Giraffe Bio"],start:"Mar 15, 2026",due:"Apr 5, 2026",daysLeft:13,notes:"Cell-free protein platform convergence. Orum as paid or equity-comp diligence advisor.",risks:[],deps:[],comments:[]},
  // IC MEMO
  {id:25,title:"IC memo — Ferrum Technologies (final draft)",cat:"IC Memo",init:"diligence",prio:"Critical",status:"Overdue",prog:80,owner:"AW",cos:["Ferrum Technologies"],start:"Mar 1, 2026",due:"Mar 20, 2026",daysLeft:-3,notes:"Hydrogen plasma iron and GGBS from waste streams. Vienna-based. Breakthrough Energy backed. IC vote pending expert call completion.",risks:[{title:"Expert call not yet completed",detail:"Blocking final investment risk section"},{title:"Competitive response from ThyssenKrupp",detail:"Needs updated competitive table"}],deps:["Task #12: Expert advisory call"],comments:[{by:"AW",date:"Mar 20",txt:"80% complete. Waiting on expert validation before risk section finalized."}]},
  {id:26,title:"IC memo — YPlasma (presentation ready)",cat:"IC Memo",init:"diligence",prio:"Critical",status:"At risk",prog:65,owner:"AW",cos:["YPlasma"],start:"Mar 5, 2026",due:"Mar 28, 2026",daysLeft:5,notes:"IC presentation March 30. Final sections: market sizing, financial model, risk table.",risks:[{title:"Market sizing methodology contested",detail:"Need external validation"}],deps:["Task #8: YPlasma IC memo"],comments:[]},
  {id:27,title:"IC memo — Mater-AI (initial draft)",cat:"IC Memo",init:"diligence",prio:"High",status:"On track",prog:25,owner:"VV",cos:["Mater-AI"],start:"Mar 20, 2026",due:"Apr 25, 2026",daysLeft:33,notes:"AI-driven materials discovery. UK. Sections: science validation, IP landscape, team, market.",risks:[],deps:["Task #9: Technical diligence call"],comments:[]},
  // ADDITIONAL
  {id:28,title:"Prepare LP quarterly report — Fund II Q1",cat:"Fundraising",init:"lp-relations",prio:"High",status:"On track",prog:30,owner:"AW",cos:[],start:"Mar 20, 2026",due:"Apr 15, 2026",daysLeft:23,notes:"Committed LP update (EDBI primary). Portfolio highlights, fund close progress, pipeline summary.",risks:[],deps:["Task #13: Q1 portfolio update"],comments:[]},
  {id:29,title:"Update LP CRM — stage and touchpoint hygiene",cat:"Fundraising",init:"lp-relations",prio:"Medium",status:"On track",prog:50,owner:"VV",cos:[],start:"Mar 20, 2026",due:"Mar 28, 2026",daysLeft:5,notes:"Ensure all 13 LP records have current stage, last touchpoint, DDQ status, and next follow-up dates.",risks:[],deps:[],comments:[]},
  {id:30,title:"Sourcing: review 12 inbound pitches — cleantech batch",cat:"Diligence",init:"diligence",prio:"Medium",status:"On track",prog:40,owner:"VV",cos:[],start:"Mar 15, 2026",due:"Apr 1, 2026",daysLeft:9,notes:"AI-scored inbound. Pass / hold / request meeting. Feed output to deal flow pipeline.",risks:[],deps:[],comments:[]},
] as const;

type Task = (typeof TASKS)[number];

// ── Initiatives ───────────────────────────────────────────────────────────────

const INITIATIVES = [
  { key:"all",          label:"All tasks",             meta:"30 tasks · 7 overdue",    pct:34,  color:"bg-blue-500",   due:"34% complete" },
  { key:"fund2close",   label:"Fund II Close",          meta:"9 tasks · $50M target",   pct:22,  color:"bg-blue-500",   due:"Target: Jun 30, 2026" },
  { key:"portfolio",    label:"Portfolio Mgmt Q1",      meta:"7 tasks · 4 companies",   pct:43,  color:"bg-green-500",  due:"Target: Mar 31, 2026" },
  { key:"diligence",    label:"Active Diligence",       meta:"6 tasks · 2 companies",   pct:50,  color:"bg-violet-500", due:"Target: Apr 15, 2026" },
  { key:"ecosystem",    label:"Ecosystem Activation",   meta:"8 tasks · 12 strategics", pct:25,  color:"bg-teal-500",   due:"Ongoing · Q1–Q2 2026" },
  { key:"lp-relations", label:"LP Relationship Mgmt",   meta:"8 tasks · 13 LPs",        pct:38,  color:"bg-amber-500",  due:"Ongoing · close-critical" },
];

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
  "Completed":   "bg-slate-100 text-slate-500 line-through",
  "Not started": "bg-slate-100 text-slate-500",
};

const INIT_LABELS: Record<string, string> = {
  "fund2close":   "Fund II Close",
  "portfolio":    "Portfolio Mgmt",
  "diligence":    "Active Diligence",
  "ecosystem":    "Ecosystem",
  "lp-relations": "LP Relations",
};

// ── Filter pills ──────────────────────────────────────────────────────────────

type FilterId = "all" | "fund" | "dd" | "port" | "eco" | "ic" | "overdue" | "risk" | "aw" | "vv";

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all",     label: "All" },
  { id: "fund",    label: "Fundraising" },
  { id: "dd",      label: "Diligence" },
  { id: "port",    label: "Portfolio" },
  { id: "eco",     label: "Ecosystem" },
  { id: "ic",      label: "IC Memo" },
  { id: "overdue", label: "Overdue" },
  { id: "risk",    label: "At risk" },
  { id: "aw",      label: "AW" },
  { id: "vv",      label: "VV" },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function OwnerAvatar({ owner }: { owner: string }) {
  return (
    <span className={cn(
      "inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-semibold",
      owner === "AW" ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"
    )}>
      {owner}
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
  if (daysLeft < 0) return <span className="text-red-600 font-medium">{Math.abs(daysLeft)}d overdue</span>;
  if (daysLeft === 0) return <span className="text-red-500 font-medium">Due today</span>;
  if (daysLeft <= 5) return <span className="text-amber-600 font-medium">{daysLeft}d left</span>;
  return <span className="text-slate-500">{daysLeft}d left</span>;
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

// ── Table view ─────────────────────────────────────────────────────────────────

function TableView({ tasks, onSelect }: { tasks: readonly Task[]; onSelect: (t: Task) => void }) {
  const sorted = [...tasks].sort((a, b) => {
    const order = { Overdue: 0, "At risk": 1, "Not started": 2, "On track": 3, Completed: 4, Blocked: 2 };
    const oa = (order as Record<string, number>)[a.status] ?? 3;
    const ob = (order as Record<string, number>)[b.status] ?? 3;
    if (oa !== ob) return oa - ob;
    return a.daysLeft - b.daysLeft;
  });

  return (
    <div className="flex-1 overflow-auto">
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
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map(t => (
            <tr
              key={t.id}
              onClick={() => onSelect(t)}
              className={cn(
                "hover:bg-slate-50 cursor-pointer transition-colors",
                t.status === "Overdue" && "border-l-2 border-red-400",
                t.status === "At risk" && "border-l-2 border-amber-400",
              )}
            >
              <td className="px-3 py-2 text-slate-300">
                <div className="w-3.5 h-3.5 border border-slate-300 rounded-sm" />
              </td>
              <td className="px-3 py-2 max-w-[280px]">
                <span className="font-medium text-slate-800 leading-snug line-clamp-2">{t.title}</span>
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <CatBadge cat={t.cat} />
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                {INIT_LABELS[t.init] ?? t.init}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", PRIO_DOTS[t.prio])} />
                  <span className="text-slate-600">{t.prio}</span>
                </div>
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <StatusBadge status={t.status} />
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
            </tr>
          ))}
        </tbody>
      </table>
      {sorted.length === 0 && (
        <div className="flex items-center justify-center h-40 text-slate-400 text-xs">No tasks match your filters.</div>
      )}
    </div>
  );
}

// ── Kanban view ────────────────────────────────────────────────────────────────

const KANBAN_COLS: { id: string; label: string; color: string }[] = [
  { id: "Not started", label: "Not started", color: "border-t-slate-300" },
  { id: "On track",    label: "On track",    color: "border-t-green-400" },
  { id: "At risk",     label: "At risk",     color: "border-t-amber-400" },
  { id: "Overdue",     label: "Overdue",     color: "border-t-red-400" },
  { id: "Completed",   label: "Completed",   color: "border-t-slate-200" },
];

function KanbanView({ tasks, onSelect }: { tasks: readonly Task[]; onSelect: (t: Task) => void }) {
  return (
    <div className="flex-1 overflow-x-auto overflow-y-hidden">
      <div className="flex gap-3 h-full p-3 min-w-[900px]">
        {KANBAN_COLS.map(col => {
          const colTasks = tasks.filter(t => t.status === col.id);
          return (
            <div key={col.id} className="flex flex-col flex-1 min-w-[180px] max-w-[240px]">
              <div className={cn("bg-white rounded-t border-t-2 border-x border-slate-200 px-3 py-2", col.color)}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">{col.label}</span>
                  <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{colTasks.length}</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto bg-slate-50 border border-t-0 border-slate-200 rounded-b p-2 space-y-2">
                {colTasks.map(t => (
                  <div
                    key={t.id}
                    onClick={() => onSelect(t)}
                    className="bg-white border border-slate-200 rounded-lg p-2.5 cursor-pointer hover:border-slate-300 hover:shadow-sm transition-all space-y-2"
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
                  <div className="text-[11px] text-slate-400 text-center py-4">Empty</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Timeline view ──────────────────────────────────────────────────────────────

const MONTHS = ["Mar 2026", "Apr 2026", "May 2026"];
// Mar=0–30, Apr=31–60, May=61–91 (days from Mar 1)
const MONTH_DAYS = [31, 30, 31];
const TOTAL_DAYS = MONTH_DAYS.reduce((a, b) => a + b, 0); // 92

function taskToBar(t: Task): { left: number; width: number } {
  // daysLeft = due - today. Today ≈ Mar 23 (day 22 from Mar 1, 0-indexed)
  const TODAY_OFFSET = 22;
  const dueDayOffset = TODAY_OFFSET + t.daysLeft; // days from Mar 1
  // Estimate start offset from start date string (rough heuristic)
  const startMonthMap: Record<string, number> = { "Feb": -1, "Mar": 0, "Apr": 31, "May": 61 };
  const startMatch = t.start.match(/(\w+)\s+(\d+)/);
  let startOffset = 0;
  if (startMatch) {
    const mo = startMonthMap[startMatch[1]] ?? 0;
    startOffset = mo + parseInt(startMatch[2], 10) - 1;
  }
  const clamped_start = Math.max(0, Math.min(startOffset, TOTAL_DAYS - 1));
  const clamped_end   = Math.max(clamped_start + 2, Math.min(dueDayOffset, TOTAL_DAYS));
  const left  = (clamped_start / TOTAL_DAYS) * 100;
  const width = Math.max(2, ((clamped_end - clamped_start) / TOTAL_DAYS) * 100);
  return { left, width };
}

function barColor(status: string) {
  if (status === "Overdue")  return "bg-red-400";
  if (status === "At risk")  return "bg-amber-400";
  if (status === "On track") return "bg-blue-400";
  return "bg-slate-300";
}

function TimelineView({ tasks, onSelect }: { tasks: readonly Task[]; onSelect: (t: Task) => void }) {
  const groups = [
    { owner: "AW", tasks: tasks.filter(t => t.owner === "AW") },
    { owner: "VV", tasks: tasks.filter(t => t.owner === "VV") },
  ];

  return (
    <div className="flex-1 overflow-auto">
      <div className="min-w-[700px]">
        {/* Month headers */}
        <div className="flex sticky top-0 bg-white z-10 border-b border-slate-200">
          <div className="w-56 flex-shrink-0 px-3 py-2 text-xs font-semibold text-slate-500 border-r border-slate-200">Task</div>
          <div className="flex-1 flex">
            {MONTHS.map((m, i) => (
              <div
                key={m}
                className="border-r border-slate-200 py-2 px-2 text-xs font-semibold text-slate-500 bg-slate-50"
                style={{ width: `${(MONTH_DAYS[i] / TOTAL_DAYS) * 100}%` }}
              >
                {m}
              </div>
            ))}
          </div>
        </div>

        {/* Today line overlay helper — rendered per row as absolute */}
        {groups.map(g => (
          <div key={g.owner}>
            {/* Owner header */}
            <div className="flex items-center border-b border-slate-200 bg-slate-50 px-3 py-1.5">
              <OwnerAvatar owner={g.owner} />
              <span className="ml-2 text-xs font-semibold text-slate-600">{g.owner}</span>
              <span className="ml-2 text-[10px] text-slate-400">{g.tasks.length} tasks</span>
            </div>
            {g.tasks.map(t => {
              const { left, width } = taskToBar(t);
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
                    {/* Today marker */}
                    <div
                      className="absolute top-0 bottom-0 w-px bg-red-300 z-10 opacity-60"
                      style={{ left: `${(22 / TOTAL_DAYS) * 100}%` }}
                    />
                    {/* Task bar */}
                    <div
                      className={cn(
                        "absolute h-4 rounded-full opacity-80 group-hover:opacity-100 transition-opacity flex items-center px-1.5",
                        barColor(t.status)
                      )}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`${t.title} · ${t.status}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Side panel ─────────────────────────────────────────────────────────────────

function SidePanel({ task, onClose }: { task: Task; onClose: () => void }) {
  return (
    <div className="w-80 flex-shrink-0 border-l border-slate-200 bg-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-2 px-4 py-3 border-b border-slate-200">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", PRIO_DOTS[task.prio])} />
            <CatBadge cat={task.cat} />
          </div>
          <p className="text-xs font-semibold text-slate-800 leading-snug">{task.title}</p>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 flex-shrink-0 mt-0.5">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* Overview */}
        <section className="px-4 py-3 border-b border-slate-100 space-y-2">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Overview</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div>
              <span className="text-slate-400">Status</span>
              <div className="mt-0.5"><StatusBadge status={task.status} /></div>
            </div>
            <div>
              <span className="text-slate-400">Priority</span>
              <div className="mt-0.5 flex items-center gap-1">
                <span className={cn("w-1.5 h-1.5 rounded-full", PRIO_DOTS[task.prio])} />
                <span className="text-slate-700">{task.prio}</span>
              </div>
            </div>
            <div>
              <span className="text-slate-400">Owner</span>
              <div className="mt-0.5"><OwnerAvatar owner={task.owner} /></div>
            </div>
            <div>
              <span className="text-slate-400">Days</span>
              <div className="mt-0.5"><DaysChip daysLeft={task.daysLeft} /></div>
            </div>
            <div>
              <span className="text-slate-400">Start</span>
              <div className="mt-0.5 text-slate-700">{task.start}</div>
            </div>
            <div>
              <span className="text-slate-400">Target</span>
              <div className="mt-0.5 text-slate-700">{task.due}</div>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-400">Progress</span>
              <span className="font-medium text-slate-700">{task.prog}%</span>
            </div>
            <ProgressBar pct={task.prog} />
          </div>
        </section>

        {/* Notes */}
        <section className="px-4 py-3 border-b border-slate-100">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Notes</p>
          <p className="text-xs text-slate-600 leading-relaxed">{task.notes}</p>
        </section>

        {/* Linked companies */}
        {task.cos.length > 0 && (
          <section className="px-4 py-3 border-b border-slate-100">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Linked Companies</p>
            <div className="flex flex-wrap gap-1">
              {task.cos.map(c => (
                <span key={c} className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full text-[10px] font-medium">{c}</span>
              ))}
            </div>
          </section>
        )}

        {/* Risk flags */}
        {task.risks.length > 0 && (
          <section className="px-4 py-3 border-b border-slate-100">
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
          <section className="px-4 py-3 border-b border-slate-100">
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

        {/* Comments */}
        {task.comments.length > 0 && (
          <section className="px-4 py-3 border-b border-slate-100">
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
            </div>
          </section>
        )}

        {/* Workload context */}
        <section className="px-4 py-3">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">Workload Context</p>
          <div className="space-y-2">
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <div className="flex items-center gap-1.5">
                  <OwnerAvatar owner="AW" />
                  <span className="text-slate-600">AW</span>
                </div>
                <span className="text-slate-500">22 tasks · 73%</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: "73%" }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <div className="flex items-center gap-1.5">
                  <OwnerAvatar owner="VV" />
                  <span className="text-slate-600">VV</span>
                </div>
                <span className="text-slate-500">16 tasks · 50%</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full" style={{ width: "50%" }} />
              </div>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1.5 leading-snug">
            AW is at high workload — consider rebalancing critical tasks.
          </p>
        </section>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function TasksClient() {
  const [activeFilter, setActiveFilter] = useState<FilterId>("all");
  const [activeInitiative, setActiveInitiative] = useState("all");
  const [view, setView] = useState<"table" | "kanban" | "timeline">("table");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [search, setSearch] = useState("");

  const filteredTasks = useMemo(() => {
    let tasks: readonly Task[] = TASKS;

    // Initiative filter
    if (activeInitiative !== "all") {
      tasks = tasks.filter(t => t.init === activeInitiative);
    }

    // Active filter
    switch (activeFilter) {
      case "fund":    tasks = tasks.filter(t => t.cat === "Fundraising"); break;
      case "dd":      tasks = tasks.filter(t => t.cat === "Diligence"); break;
      case "port":    tasks = tasks.filter(t => t.cat === "Portfolio"); break;
      case "eco":     tasks = tasks.filter(t => t.cat === "Ecosystem"); break;
      case "ic":      tasks = tasks.filter(t => t.cat === "IC Memo"); break;
      case "overdue": tasks = tasks.filter(t => t.status === "Overdue"); break;
      case "risk":    tasks = tasks.filter(t => t.status === "At risk"); break;
      case "aw":      tasks = tasks.filter(t => t.owner === "AW"); break;
      case "vv":      tasks = tasks.filter(t => t.owner === "VV"); break;
    }

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      tasks = tasks.filter(t =>
        t.title.toLowerCase().includes(q) ||
        t.cos.some(c => c.toLowerCase().includes(q))
      );
    }

    return tasks;
  }, [activeFilter, activeInitiative, search]);

  // Stats
  const total     = TASKS.length;
  const overdue   = TASKS.filter(t => t.status === "Overdue").length;
  const atRisk    = TASKS.filter(t => t.status === "At risk").length;
  const onTrack   = TASKS.filter(t => t.status === "On track").length;
  const notStarted = TASKS.filter(t => t.status === "Not started").length;
  const critical  = TASKS.filter(t => t.prio === "Critical").length;
  const avgProg   = Math.round(TASKS.reduce((s, t) => s + t.prog, 0) / TASKS.length);

  const STAT_CARDS = [
    { label: "Total Tasks",   value: total,      icon: AlignLeft,      color: "text-slate-700",   bg: "bg-slate-50" },
    { label: "Overdue",       value: overdue,    icon: AlertCircle,    color: "text-red-600",     bg: "bg-red-50" },
    { label: "At Risk",       value: atRisk,     icon: Clock,          color: "text-amber-600",   bg: "bg-amber-50" },
    { label: "On Track",      value: onTrack,    icon: CheckCircle2,   color: "text-green-600",   bg: "bg-green-50" },
    { label: "Not Started",   value: notStarted, icon: Circle,         color: "text-slate-500",   bg: "bg-slate-50" },
    { label: "Critical",      value: critical,   icon: Flag,           color: "text-red-500",     bg: "bg-red-50" },
    { label: "Avg. Progress", value: `${avgProg}%`, icon: TrendingUp,  color: "text-blue-600",    bg: "bg-blue-50" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Top bar */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-5 pt-4 pb-3 space-y-3">
        {/* Title row */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-sm font-semibold text-slate-900">Task Intelligence</h1>
            <p className="text-xs text-slate-500 mt-0.5">Fund II close · portfolio · diligence · ecosystem — Mar 2026</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search tasks or companies…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-7 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md w-52 focus:outline-none focus:ring-1 focus:ring-blue-300"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {STAT_CARDS.map(s => {
            const Icon = s.icon;
            return (
              <div key={s.label} className={cn("flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 flex-shrink-0", s.bg)}>
                <Icon className={cn("w-3.5 h-3.5", s.color)} />
                <div>
                  <p className="text-[11px] text-slate-500 leading-none">{s.label}</p>
                  <p className={cn("text-sm font-bold leading-tight mt-0.5", s.color)}>{s.value}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Initiatives horizontal scroll */}
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {INITIATIVES.map(init => (
            <button
              key={init.key}
              onClick={() => setActiveInitiative(init.key)}
              className={cn(
                "flex-shrink-0 px-3 py-2 rounded-lg border text-left transition-colors",
                activeInitiative === init.key
                  ? "border-blue-200 bg-blue-50"
                  : "border-slate-200 bg-white hover:bg-slate-50"
              )}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", init.color)} />
                <span className={cn("text-xs font-medium", activeInitiative === init.key ? "text-blue-700" : "text-slate-700")}>
                  {init.label}
                </span>
              </div>
              <p className="text-[10px] text-slate-500">{init.meta}</p>
              <div className="mt-1.5 h-1 bg-slate-100 rounded-full overflow-hidden w-28">
                <div className={cn("h-full rounded-full", init.color)} style={{ width: `${init.pct}%` }} />
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">{init.due}</p>
            </button>
          ))}
        </div>

        {/* Filters + view toggle */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1 overflow-x-auto pb-0.5">
            {FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => setActiveFilter(f.id)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors",
                  activeFilter === f.id
                    ? "bg-slate-900 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 flex-shrink-0 ml-3">
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
        </div>
      </div>

      {/* Content area */}
      <div className="flex flex-1 overflow-hidden">
        {view === "table" && (
          <TableView tasks={filteredTasks} onSelect={setSelectedTask} />
        )}
        {view === "kanban" && (
          <KanbanView tasks={filteredTasks} onSelect={setSelectedTask} />
        )}
        {view === "timeline" && (
          <TimelineView tasks={filteredTasks} onSelect={setSelectedTask} />
        )}

        {selectedTask && (
          <SidePanel task={selectedTask} onClose={() => setSelectedTask(null)} />
        )}
      </div>
    </div>
  );
}
