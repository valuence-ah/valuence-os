"use client";
// ─── PipelineFilterBar ────────────────────────────────────────────────────────
// Extracted from pipeline-client.tsx.
// Renders three <select> dropdowns (Type / Sector / Round) derived from the
// live company list.  All state lives in the parent — this is a pure UI leaf.

import { X } from "lucide-react";
import type { Company } from "@/lib/types";

interface PipelineFilterBarProps {
  companies:     Company[];
  filterType:    string | null;
  filterSector:  string | null;
  filterRound:   string | null;
  setFilterType:   (v: string | null) => void;
  setFilterSector: (v: string | null) => void;
  setFilterRound:  (v: string | null) => void;
  /** Optional extra class on the wrapper <div>. Defaults to no extra class. */
  className?: string;
}

const SEL_CLS =
  "text-xs border border-slate-200 rounded-md px-2 py-1.5 bg-white text-slate-600 " +
  "focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer";

export function PipelineFilterBar({
  companies,
  filterType,
  filterSector,
  filterRound,
  setFilterType,
  setFilterSector,
  setFilterRound,
  className = "",
}: PipelineFilterBarProps) {
  const allTypes   = [...new Set(companies.flatMap(c => c.types ?? []))].filter(Boolean).sort();
  const allSectors = [...new Set(companies.flatMap(c => c.sectors ?? []))].filter(Boolean).sort();
  const allRounds  = [...new Set(companies.map(c => c.stage).filter(Boolean) as string[])].sort();
  const hasAnyFilter = filterType || filterSector || filterRound;

  return (
    <div className={`flex flex-wrap gap-2 items-center ${className}`}>
      <select
        value={filterType ?? ""}
        onChange={e => setFilterType(e.target.value || null)}
        className={SEL_CLS}
        aria-label="Filter by investor type"
      >
        <option value="">All Types</option>
        {allTypes.map(t => (
          <option key={t} value={t}>
            {t.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
          </option>
        ))}
      </select>

      <select
        value={filterSector ?? ""}
        onChange={e => setFilterSector(e.target.value || null)}
        className={SEL_CLS}
        aria-label="Filter by sector"
      >
        <option value="">All Sectors</option>
        {allSectors.map(s => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>

      <select
        value={filterRound ?? ""}
        onChange={e => setFilterRound(e.target.value || null)}
        className={SEL_CLS}
        aria-label="Filter by funding round"
      >
        <option value="">All Rounds</option>
        {allRounds.map(r => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>

      {hasAnyFilter && (
        <button
          onClick={() => { setFilterType(null); setFilterSector(null); setFilterRound(null); }}
          className="text-[10px] text-slate-400 hover:text-red-500 flex items-center gap-0.5"
          aria-label="Clear all filters"
        >
          <X size={10} aria-hidden="true" /> Clear
        </button>
      )}
    </div>
  );
}
