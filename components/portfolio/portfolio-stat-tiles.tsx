"use client";
import type { Company } from "@/lib/types";
import { AlertTriangle, TrendingUp, Clock, Calendar } from "lucide-react";

interface Props {
  companies: Company[];
}

function daysSince(date: string | null): number {
  if (!date) return 999;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

function daysUntil(date: string | null): number | null {
  if (!date) return null;
  const diff = Math.floor((new Date(date).getTime() - Date.now()) / 86400000);
  return diff >= 0 ? diff : null;
}

export function PortfolioStatTiles({ companies }: Props) {
  // Tile 1: Needs attention
  const attentionCompanies = companies.filter(c => c.health_status === "attention");

  // Tile 2: Actively raising
  const raisingCompanies = companies.filter(c =>
    c.current_raise_status === "actively_raising" ||
    c.current_raise_status === "preparing" ||
    c.current_raise_status === "closing"
  );

  // Tile 3: Stale contact (oldest last_contact_date)
  const withContact = companies.filter(c => c.last_contact_date);
  const stalest = withContact.sort((a, b) =>
    new Date(a.last_contact_date!).getTime() - new Date(b.last_contact_date!).getTime()
  )[0] ?? null;
  const staleDays = stalest ? daysSince(stalest.last_contact_date) : null;

  // Tile 4: Next board meeting
  const withBoard = companies
    .map(c => ({ c, days: daysUntil(c.next_board_date) }))
    .filter(({ days }) => days !== null)
    .sort((a, b) => a.days! - b.days!);
  const nextBoard = withBoard[0] ?? null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
      {/* Tile 1: Needs attention */}
      <div className={`rounded-lg px-4 py-3 ${attentionCompanies.length > 0 ? "bg-red-50" : "bg-slate-50"}`}>
        <div className="flex items-center gap-1.5 mb-1">
          <AlertTriangle size={12} className={attentionCompanies.length > 0 ? "text-red-500" : "text-slate-400"} />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em]">Needs attention</p>
        </div>
        <p className={`text-lg font-semibold ${attentionCompanies.length > 0 ? "text-red-700" : "text-slate-400"}`}>
          {attentionCompanies.length}
        </p>
        <p className="text-[11px] mt-0.5 line-clamp-1">
          {attentionCompanies.length > 0
            ? <span className="text-red-600">{attentionCompanies.map(c => c.name).join(", ")}</span>
            : <span className="text-slate-400">All healthy</span>
          }
        </p>
      </div>

      {/* Tile 2: Actively raising */}
      <div className="bg-slate-50 rounded-lg px-4 py-3">
        <div className="flex items-center gap-1.5 mb-1">
          <TrendingUp size={12} className="text-emerald-500" />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em]">Actively raising</p>
        </div>
        <p className={`text-lg font-semibold ${raisingCompanies.length > 0 ? "text-emerald-700" : "text-slate-400"}`}>
          {raisingCompanies.length}
        </p>
        <p className="text-[11px] mt-0.5 line-clamp-1">
          {raisingCompanies.length > 0
            ? <span className="text-emerald-700">{raisingCompanies.slice(0, 2).map(c => c.name).join(", ")}</span>
            : <span className="text-slate-400">No active raises</span>
          }
        </p>
      </div>

      {/* Tile 3: Stale contact */}
      <div className="bg-slate-50 rounded-lg px-4 py-3">
        <div className="flex items-center gap-1.5 mb-1">
          <Clock size={12} className="text-slate-400" />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em]">Stale contact</p>
        </div>
        <p className={`text-lg font-semibold ${staleDays !== null && staleDays > 60 ? "text-red-600" : staleDays !== null && staleDays > 30 ? "text-amber-600" : "text-slate-700"}`}>
          {staleDays !== null ? `${staleDays}d` : "—"}
        </p>
        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{stalest?.name ?? "No contact data"}</p>
      </div>

      {/* Tile 4: Next board meeting */}
      <div className="bg-slate-50 rounded-lg px-4 py-3">
        <div className="flex items-center gap-1.5 mb-1">
          <Calendar size={12} className="text-blue-400" />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em]">Next board</p>
        </div>
        <p className={`text-lg font-semibold ${nextBoard ? "text-blue-700" : "text-slate-400"}`}>
          {nextBoard ? `${nextBoard.days}d` : "—"}
        </p>
        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{nextBoard?.c.name ?? "No board dates set"}</p>
      </div>
    </div>
  );
}
