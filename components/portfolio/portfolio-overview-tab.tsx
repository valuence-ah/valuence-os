"use client";
import { useState } from "react";
import { Loader2, RefreshCw, FileText } from "lucide-react";
import type { Company, PortfolioKpi, PortfolioMilestone, PortfolioInitiative, PortfolioIntelligence, Interaction, FeedArticle } from "@/lib/types";

interface Props {
  company: Company;
  kpis: PortfolioKpi[];
  milestones: PortfolioMilestone[];
  initiatives: PortfolioInitiative[];
  intelligence: PortfolioIntelligence[];
  interactions: Interaction[];
  signals: FeedArticle[];
  onIntelligenceRefresh: (type: "ma_acquirer" | "pilot_partner") => Promise<void>;
}

function fmtMoney(v: number | null): string {
  if (v === null) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
}

function timeAgo(date: string): string {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const INITIATIVE_STATUS_DOT: Record<string, string> = {
  complete:    "bg-emerald-500",
  in_progress: "bg-amber-500",
  planned:     "bg-slate-300",
  paused:      "bg-slate-300",
};

const INITIATIVE_STATUS_BADGE: Record<string, string> = {
  complete:    "bg-emerald-50 text-emerald-700",
  in_progress: "bg-amber-50 text-amber-700",
  planned:     "bg-slate-100 text-slate-500",
  paused:      "bg-slate-100 text-slate-400",
};

const FIT_BADGE: Record<string, string> = {
  high:   "bg-emerald-100 text-emerald-700",
  medium: "bg-amber-100 text-amber-700",
  low:    "bg-slate-100 text-slate-500",
};

const WARMTH_BADGE: Record<string, string> = {
  warm:           "bg-orange-100 text-orange-700",
  lp_connection:  "bg-violet-100 text-violet-700",
  cold:           "bg-slate-100 text-slate-500",
};

export function PortfolioOverviewTab({ company, kpis, milestones, initiatives, intelligence, interactions, signals, onIntelligenceRefresh }: Props) {
  const [refreshing, setRefreshing] = useState<"ma_acquirer" | "pilot_partner" | null>(null);

  const latestKpi = kpis[0] ?? null;
  const prevKpi = kpis[1] ?? null;

  const mrrGrowth = latestKpi?.mrr_growth;
  const burnChange = latestKpi && prevKpi
    ? ((latestKpi.monthly_burn ?? 0) - (prevKpi.monthly_burn ?? 0))
    : null;

  async function handleRefresh(type: "ma_acquirer" | "pilot_partner") {
    setRefreshing(type);
    await onIntelligenceRefresh(type);
    setRefreshing(null);
  }

  const acquirers = intelligence.filter(i => i.type === "ma_acquirer");
  const pilots = intelligence.filter(i => i.type === "pilot_partner");

  return (
    <div className="p-5 space-y-5 overflow-y-auto h-full">
      {/* Latest report banner */}
      {company.latest_report_summary && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3">
          <p className="text-[11px] font-semibold text-blue-700 mb-0.5">
            Latest report{company.latest_report_date ? ` — uploaded ${timeAgo(company.latest_report_date)}` : ""}
          </p>
          <p className="text-xs text-blue-800">{company.latest_report_summary}</p>
        </div>
      )}

      {/* KPI tiles */}
      <div>
        <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">KPIs</h3>
        <div className="grid grid-cols-4 gap-3">
          {[
            {
              label: "MRR",
              value: fmtMoney(latestKpi?.mrr ?? null),
              sub: mrrGrowth !== null && mrrGrowth !== undefined ? `${mrrGrowth > 0 ? "+" : ""}${mrrGrowth.toFixed(1)}% MoM` : null,
              subColor: (mrrGrowth ?? 0) >= 0 ? "text-emerald-600" : "text-red-500",
            },
            {
              label: "Monthly burn",
              value: fmtMoney(latestKpi?.monthly_burn ?? null),
              sub: burnChange !== null ? `${burnChange > 0 ? "+" : ""}${fmtMoney(burnChange)} vs prev` : null,
              subColor: (burnChange ?? 0) <= 0 ? "text-emerald-600" : "text-red-500",
            },
            {
              label: "Runway",
              value: latestKpi?.runway_months !== null && latestKpi?.runway_months !== undefined
                ? `${Math.round(latestKpi.runway_months)}mo`
                : "—",
              sub: null,
              subColor: "",
            },
            {
              label: "Headcount",
              value: latestKpi?.headcount !== null && latestKpi?.headcount !== undefined
                ? `${latestKpi.headcount}`
                : "—",
              sub: latestKpi?.headcount_change !== null && latestKpi?.headcount_change !== undefined
                ? `${latestKpi.headcount_change > 0 ? "+" : ""}${latestKpi.headcount_change} vs prev`
                : null,
              subColor: "text-slate-500",
            },
          ].map(tile => (
            <div key={tile.label} className="bg-slate-50 rounded-lg p-3">
              <p className="text-[10px] text-slate-400 mb-1">{tile.label}</p>
              <p className="text-sm font-bold text-slate-800">{tile.value}</p>
              {tile.sub && <p className={`text-[10px] mt-0.5 ${tile.subColor}`}>{tile.sub}</p>}
            </div>
          ))}
        </div>
        {latestKpi && (
          <p className="text-[10px] text-slate-400 mt-1">Period: {latestKpi.period}</p>
        )}
      </div>

      {/* Strategic initiatives */}
      {initiatives.length > 0 && (
        <div>
          <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Strategic initiatives</h3>
          <div className="space-y-1.5">
            {initiatives.map(init => (
              <div key={init.id} className="flex items-start gap-2.5 p-2.5 bg-slate-50 rounded-lg">
                <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${INITIATIVE_STATUS_DOT[init.status] ?? "bg-slate-300"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13px] font-medium text-slate-800 leading-tight">{init.title}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${INITIATIVE_STATUS_BADGE[init.status] ?? "bg-slate-100 text-slate-500"}`}>
                      {init.status.replace("_", " ")}
                    </span>
                  </div>
                  {init.description && (
                    <p className="text-[11px] text-slate-500 mt-0.5">{init.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent interactions + signals */}
      <div className="grid grid-cols-2 gap-4">
        {/* Interactions */}
        <div>
          <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Recent interactions</h3>
          {interactions.length === 0 ? (
            <p className="text-xs text-slate-400">No interactions yet</p>
          ) : (
            <div className="space-y-2">
              {interactions.slice(0, 5).map(i => (
                <div key={i.id} className="flex items-start gap-2">
                  <FileText size={12} className="text-slate-300 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-slate-700 truncate">{i.subject ?? "Meeting"}</p>
                    <p className="text-[11px] text-slate-400">{timeAgo(i.date)}</p>
                    {i.summary && (
                      <p className="text-[11px] text-slate-500 line-clamp-1">{i.summary}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Industry signals */}
        <div>
          <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Industry signals</h3>
          {signals.length === 0 ? (
            <p className="text-xs text-slate-400">No matched signals</p>
          ) : (
            <div className="space-y-2">
              {signals.slice(0, 5).map(s => (
                <div key={s.id} className="flex items-start gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${s.relevance_score && s.relevance_score >= 3 ? "bg-emerald-500" : "bg-amber-400"}`} />
                  <div className="min-w-0">
                    <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[12px] font-medium text-slate-700 hover:text-blue-600 line-clamp-2 leading-tight">
                      {s.title}
                    </a>
                    {s.ai_why_relevant && (
                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{s.ai_why_relevant}</p>
                    )}
                    {s.published_at && (
                      <p className="text-[10px] text-slate-400">{timeAgo(s.published_at)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* M&A + pilot intelligence panels */}
      <div className="grid grid-cols-2 gap-4">
        {/* M&A acquirers */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">M&A acquirers</h3>
            <button
              onClick={() => handleRefresh("ma_acquirer")}
              disabled={refreshing !== null}
              className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-700 disabled:opacity-50"
            >
              <RefreshCw size={10} className={refreshing === "ma_acquirer" ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
          {acquirers.length === 0 ? (
            <p className="text-xs text-slate-400">Click Refresh to generate candidates</p>
          ) : (
            <div className="space-y-2">
              {acquirers.slice(0, 3).map(a => (
                <div key={a.id} className="bg-slate-50 rounded-lg p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <p className="text-[12px] font-semibold text-slate-800">{a.entity_name}</p>
                    <span className={`text-[9px] px-1 py-px rounded font-medium ${FIT_BADGE[a.fit_level] ?? "bg-slate-100 text-slate-500"}`}>
                      {a.fit_level}
                    </span>
                    <span className={`text-[9px] px-1 py-px rounded font-medium ${WARMTH_BADGE[a.warmth] ?? "bg-slate-100 text-slate-500"}`}>
                      {a.warmth.replace("_", " ")}
                    </span>
                  </div>
                  {a.description && (
                    <p className="text-[11px] text-slate-500 line-clamp-2">{a.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pilot partners */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Pilot partners</h3>
            <button
              onClick={() => handleRefresh("pilot_partner")}
              disabled={refreshing !== null}
              className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-700 disabled:opacity-50"
            >
              <RefreshCw size={10} className={refreshing === "pilot_partner" ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
          {pilots.length === 0 ? (
            <p className="text-xs text-slate-400">Click Refresh to generate candidates</p>
          ) : (
            <div className="space-y-2">
              {pilots.slice(0, 3).map(p => (
                <div key={p.id} className="bg-slate-50 rounded-lg p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <p className="text-[12px] font-semibold text-slate-800">{p.entity_name}</p>
                    <span className={`text-[9px] px-1 py-px rounded font-medium ${FIT_BADGE[p.fit_level] ?? "bg-slate-100 text-slate-500"}`}>
                      {p.fit_level}
                    </span>
                    <span className={`text-[9px] px-1 py-px rounded font-medium ${WARMTH_BADGE[p.warmth] ?? "bg-slate-100 text-slate-500"}`}>
                      {p.warmth.replace("_", " ")}
                    </span>
                  </div>
                  {p.description && (
                    <p className="text-[11px] text-slate-500 line-clamp-2">{p.description}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Milestones */}
      {milestones.length > 0 && (
        <div>
          <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Milestones</h3>
          <div className="space-y-1.5">
            {milestones.slice(0, 6).map(ms => {
              const statusColor: Record<string, string> = {
                done: "text-emerald-500", in_progress: "text-amber-500",
                blocked: "text-red-500", upcoming: "text-slate-400",
              };
              return (
                <div key={ms.id} className="flex items-center gap-2.5">
                  <div className={`text-[11px] font-medium w-16 flex-shrink-0 ${statusColor[ms.status] ?? "text-slate-400"}`}>
                    {ms.status.replace("_", " ")}
                  </div>
                  <p className="text-[12px] text-slate-700">{ms.title}</p>
                  {ms.target_date && (
                    <span className="text-[10px] text-slate-400 flex-shrink-0 ml-auto">{ms.target_date}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
