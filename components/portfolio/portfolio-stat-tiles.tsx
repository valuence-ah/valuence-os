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
      <div className={`rounded-xl p-4 ${attentionCompanies.length > 0 ? "bg-red-50" : "bg-slate-50"}`}>
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={14} className={attentionCompanies.length > 0 ? "text-red-500" : "text-slate-400"} />
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Needs attention</span>
        </div>
        {attentionCompanies.length > 0 ? (
          <>
            <div className="text-2xl font-bold text-red-700">{attentionCompanies.length}</div>
            <div className="mt-1 space-y-0.5">
              {attentionCompanies.slice(0, 2).map(c => (
                <p key={c.id} className="text-[11px] text-red-600">
                  {c.name}{c.runway_months !== null ? ` — ${c.runway_months}mo runway` : ""}
                </p>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="text-2xl font-bold text-slate-400">0</div>
            <p className="text-[11px] text-slate-400 mt-1">All healthy</p>
          </>
        )}
      </div>

      {/* Tile 2: Actively raising */}
      <div className="bg-slate-50 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp size={14} className="text-emerald-500" />
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Actively raising</span>
        </div>
        {raisingCompanies.length > 0 ? (
          <>
            <div className="text-2xl font-bold text-emerald-700">{raisingCompanies.length}</div>
            <div className="mt-1 space-y-0.5">
              {raisingCompanies.slice(0, 2).map(c => (
                <p key={c.id} className="text-[11px] text-emerald-700">
                  {c.name}{c.current_raise_target ? ` — ${c.current_raise_target}` : ""}
                </p>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="text-2xl font-bold text-slate-400">0</div>
            <p className="text-[11px] text-slate-400 mt-1">No active raises</p>
          </>
        )}
      </div>

      {/* Tile 3: Stale contact */}
      <div className="bg-slate-50 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Clock size={14} className="text-slate-400" />
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Stale contact</span>
        </div>
        {stalest ? (
          <>
            <div className={`text-2xl font-bold ${staleDays! > 60 ? "text-red-600" : staleDays! > 30 ? "text-amber-600" : "text-slate-700"}`}>
              {staleDays}d
            </div>
            <p className="text-[11px] text-slate-500 mt-1">{stalest.name}</p>
          </>
        ) : (
          <>
            <div className="text-2xl font-bold text-slate-400">—</div>
            <p className="text-[11px] text-slate-400 mt-1">No contact data</p>
          </>
        )}
      </div>

      {/* Tile 4: Next board meeting */}
      <div className="bg-slate-50 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Calendar size={14} className="text-blue-400" />
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Next board</span>
        </div>
        {nextBoard ? (
          <>
            <div className="text-2xl font-bold text-blue-700">{nextBoard.days}d</div>
            <p className="text-[11px] text-slate-500 mt-1">{nextBoard.c.name}</p>
          </>
        ) : (
          <>
            <div className="text-2xl font-bold text-slate-400">—</div>
            <p className="text-[11px] text-slate-400 mt-1">No board dates set</p>
          </>
        )}
      </div>
    </div>
  );
}
