"use client";
import type { Company } from "@/lib/types";
import { getInitials } from "@/lib/utils";

interface Props {
  company: Company;
  selected: boolean;
  onClick: () => void;
}

const HEALTH_BORDER: Record<string, string> = {
  healthy:   "border-l-emerald-500",
  watch:     "border-l-amber-500",
  attention: "border-l-red-500",
  unknown:   "border-l-slate-200",
};

const HEALTH_RUNWAY: Record<string, string> = {
  healthy:   "text-emerald-600",
  watch:     "text-amber-600",
  attention: "text-red-600",
  unknown:   "text-slate-400",
};

const SECTOR_ABBREV: Record<string, string> = {
  cleantech: "CT",
  biotech:   "Bio",
  techbio:   "Bio",
  "advanced materials": "AM",
  "advanced_materials": "AM",
  other:     "—",
};

export function PortfolioCompanyCard({ company, selected, onClick }: Props) {
  const health = company.health_status ?? "unknown";
  const borderClass = HEALTH_BORDER[health] ?? "border-l-slate-200";
  const runwayClass = HEALTH_RUNWAY[health] ?? "text-slate-400";
  const primarySector = (company.sectors ?? [])[0]?.toLowerCase() ?? "";
  const sectorAbbrev = SECTOR_ABBREV[primarySector] ?? primarySector.substring(0, 3);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 border-l-[3px] transition-colors ${borderClass} ${
        selected ? "bg-slate-100" : "hover:bg-slate-50"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white text-[9px] font-bold">{getInitials(company.name)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <p className="text-[13px] font-medium text-slate-800 truncate leading-tight">{company.name}</p>
            {company.runway_months !== null ? (
              <span className={`text-[11px] font-semibold flex-shrink-0 ${runwayClass}`}>
                {Math.round(company.runway_months)}m
              </span>
            ) : (
              <span className="text-[11px] text-slate-300 flex-shrink-0">—</span>
            )}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            {sectorAbbrev && (
              <span className="text-[10px] px-1 py-px rounded bg-slate-100 text-slate-500 font-medium">
                {sectorAbbrev}
              </span>
            )}
            {company.stage && (
              <span className="text-[10px] px-1 py-px rounded bg-slate-100 text-slate-500 font-medium">
                {company.stage}
              </span>
            )}
            {(company.current_raise_status === "actively_raising" || company.current_raise_status === "closing") && (
              <span className="text-[10px] px-1 py-px rounded bg-emerald-100 text-emerald-700 font-medium">
                Raising
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
