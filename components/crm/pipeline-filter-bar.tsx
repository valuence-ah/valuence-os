"use client";
// ─── PipelineFilterBar ────────────────────────────────────────────────────────
// Multi-select checkbox filter panels for Type, Sector, and Round.
// Each label opens a small floating checklist panel.
// Round values from the DB are normalised before display so "pre-a", "pre_a",
// "pre-seed" etc. collapse into single canonical options.

import { useState, useRef, useEffect } from "react";
import { ChevronDown, X } from "lucide-react";
import type { Company } from "@/lib/types";

// ── Round normalisation ───────────────────────────────────────────────────────
// Maps every known raw DB variant to a single clean display string.
const ROUND_NORM: Record<string, string> = {
  "pre-seed": "Pre-Seed",  "pre_seed": "Pre-Seed",  "preseed": "Pre-Seed",
  "pre-a":    "Pre-A",     "pre_a":    "Pre-A",      "prea":    "Pre-A",
  "seed":     "Seed",
  "series-a": "Series A",  "series_a": "Series A",   "seriesa": "Series A",  "series a": "Series A",
  "series-b": "Series B",  "series_b": "Series B",   "seriesb": "Series B",  "series b": "Series B",
  "series-c": "Series C",  "series_c": "Series C",   "seriesc": "Series C",  "series c": "Series C",
  "bridge":   "Bridge",    "bridge-seed": "Bridge",  "bridge_seed": "Bridge",
};

export function normalizeRound(r: string): string {
  return ROUND_NORM[r.toLowerCase().trim()] ?? r.trim();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toggle(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];
}
function titleCase(v: string): string {
  return v.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ── Single group panel (button + floating checklist) ─────────────────────────
interface GroupPanelProps {
  title:      string;
  options:    string[];
  selected:   string[];
  onChange:   (next: string[]) => void;
  formatOpt?: (v: string) => string;
}

function GroupPanel({ title, options, selected, onChange, formatOpt = titleCase }: GroupPanelProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close when clicking outside this panel
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const count = selected.length;

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={[
          "flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border transition-colors select-none",
          count > 0
            ? "bg-blue-50 border-blue-300 text-blue-700 font-semibold"
            : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 font-medium",
        ].join(" ")}
      >
        {title}
        {count > 0 && (
          <span className="bg-blue-600 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0">
            {count}
          </span>
        )}
        <ChevronDown
          size={11}
          className={`transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {/* Floating checklist */}
      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 bg-white rounded-xl border border-slate-200 shadow-lg p-1.5 min-w-[160px] max-h-[220px] overflow-y-auto">
          {options.length === 0 ? (
            <p className="text-xs text-slate-400 px-2 py-1.5">No options available</p>
          ) : (
            options.map(opt => {
              const checked = selected.includes(opt);
              return (
                <label
                  key={opt}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onChange(toggle(selected, opt))}
                    className="w-3.5 h-3.5 accent-blue-600 flex-shrink-0"
                  />
                  <span className={`text-xs leading-tight ${checked ? "text-slate-800 font-semibold" : "text-slate-600"}`}>
                    {formatOpt(opt)}
                  </span>
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────
export interface PipelineFilterBarProps {
  companies:       Company[];
  filterTypes:     string[];
  filterSectors:   string[];
  filterRounds:    string[];
  setFilterTypes:   (v: string[]) => void;
  setFilterSectors: (v: string[]) => void;
  setFilterRounds:  (v: string[]) => void;
  /** Extra className applied to the root wrapper. */
  className?: string;
}

export function PipelineFilterBar({
  companies,
  filterTypes,
  filterSectors,
  filterRounds,
  setFilterTypes,
  setFilterSectors,
  setFilterRounds,
  className = "",
}: PipelineFilterBarProps) {
  // Derive unique options from the live company list
  const allTypes = [...new Set(companies.flatMap(c => c.types ?? []))].filter(Boolean).sort();
  const allSectors = [...new Set(companies.flatMap(c => c.sectors ?? []))].filter(Boolean).sort();

  // Normalise rounds and deduplicate before showing them
  const rawRounds = [...new Set(companies.map(c => c.stage).filter(Boolean) as string[])];
  const allRounds = [...new Set(rawRounds.map(normalizeRound))].sort();

  const hasAny = filterTypes.length > 0 || filterSectors.length > 0 || filterRounds.length > 0;

  return (
    <div className={`flex flex-wrap gap-1.5 items-center ${className}`}>
      <GroupPanel
        title="Type"
        options={allTypes}
        selected={filterTypes}
        onChange={setFilterTypes}
      />
      <GroupPanel
        title="Sector"
        options={allSectors}
        selected={filterSectors}
        onChange={setFilterSectors}
        formatOpt={s => s}
      />
      <GroupPanel
        title="Round"
        options={allRounds}
        selected={filterRounds}
        onChange={setFilterRounds}
        formatOpt={s => s}
      />

      {hasAny && (
        <button
          type="button"
          onClick={() => { setFilterTypes([]); setFilterSectors([]); setFilterRounds([]); }}
          className="text-[10px] text-slate-400 hover:text-red-500 flex items-center gap-0.5 ml-0.5"
          aria-label="Clear all filters"
        >
          <X size={10} aria-hidden="true" /> Clear all
        </button>
      )}
    </div>
  );
}
