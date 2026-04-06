"use client";
import { useState } from "react";
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

const SECTOR_LABEL: Record<string, string> = {
  cleantech:            "Cleantech",
  climate:              "Climate",
  energy:               "Energy",
  biotech:              "Biotech",
  techbio:              "TechBio",
  "advanced materials": "Adv. Materials",
  advanced_materials:   "Adv. Materials",
  "deep tech":          "DeepTech",
  deeptech:             "DeepTech",
  sustainability:       "Sustainability",
  robotics:             "Robotics",
  ai:                   "AI",
  "agri tech":          "AgriTech",
  agritech:             "AgriTech",
  other:                "Other",
};

const SECTOR_BADGE: Record<string, string> = {
  cleantech:            "bg-emerald-100 text-emerald-700",
  climate:              "bg-emerald-100 text-emerald-700",
  energy:               "bg-emerald-100 text-emerald-700",
  sustainability:       "bg-emerald-100 text-emerald-700",
  biotech:              "bg-purple-100 text-purple-700",
  techbio:              "bg-purple-100 text-purple-700",
  "advanced materials": "bg-blue-100 text-blue-700",
  advanced_materials:   "bg-blue-100 text-blue-700",
  "deep tech":          "bg-indigo-100 text-indigo-700",
  deeptech:             "bg-indigo-100 text-indigo-700",
  robotics:             "bg-sky-100 text-sky-700",
  ai:                   "bg-violet-100 text-violet-700",
  agritech:             "bg-lime-100 text-lime-700",
  "agri tech":          "bg-lime-100 text-lime-700",
};

const STAGE_LABEL: Record<string, string> = {
  pre_seed:  "Pre-seed",
  preseed:   "Pre-seed",
  seed:      "Seed",
  pre_a:     "Pre-A",
  series_a:  "Series A",
  series_b:  "Series B",
  series_c:  "Series C",
  growth:    "Growth",
};

function formatStage(stage: string): string {
  return STAGE_LABEL[stage.toLowerCase().replace(/[\s-]/g, "_")] ?? stage;
}

function formatSector(s: string): string {
  const key = s.toLowerCase();
  return SECTOR_LABEL[key] ?? s;
}

function sectorBadgeClass(s: string): string {
  const key = s.toLowerCase();
  return SECTOR_BADGE[key] ?? "bg-slate-100 text-slate-500";
}

function extractDomain(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    return website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
  } catch {
    return null;
  }
}

function CompanyLogo({ company }: { company: Company }) {
  const [imgErr, setImgErr] = useState(false);
  const domain = extractDomain(company.website);
  const logoSrc = company.logo_url
    ? company.logo_url
    : domain
    ? `https://logo.clearbit.com/${domain}`
    : null;

  if (logoSrc && !imgErr) {
    return (
      <img
        src={logoSrc}
        alt={company.name}
        onError={() => setImgErr(true)}
        className="w-7 h-7 rounded-md object-contain bg-white border border-slate-100 p-0.5 flex-shrink-0"
      />
    );
  }
  return (
    <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center flex-shrink-0">
      <span className="text-white text-[9px] font-bold">{getInitials(company.name)}</span>
    </div>
  );
}

export function PortfolioCompanyCard({ company, selected, onClick }: Props) {
  const health = company.health_status ?? "unknown";
  const borderClass = HEALTH_BORDER[health] ?? "border-l-slate-200";
  const runwayClass = HEALTH_RUNWAY[health] ?? "text-slate-400";
  const primarySector = (company.sectors ?? [])[0] ?? "";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 border-l-[3px] transition-colors ${borderClass} ${
        selected ? "bg-slate-100" : "hover:bg-slate-50"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <CompanyLogo company={company} />
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
            {primarySector && (
              <span className={`text-[10px] px-1.5 py-px rounded font-medium ${sectorBadgeClass(primarySector)}`}>
                {formatSector(primarySector)}
              </span>
            )}
            {company.stage && (
              <span className="text-[10px] px-1.5 py-px rounded bg-slate-100 text-slate-500 font-medium">
                {formatStage(company.stage)}
              </span>
            )}
            {(company.current_raise_status === "actively_raising" || company.current_raise_status === "closing") && (
              <span className="text-[10px] px-1.5 py-px rounded bg-emerald-100 text-emerald-700 font-medium">
                Raising
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
