"use client";
import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import type { Company } from "@/lib/types";
import { PortfolioCompanyCard } from "./portfolio-company-card";

type SortKey = "runway" | "name" | "last_contact";

interface Props {
  companies: Company[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function PortfolioCompanyList({ companies, selectedId, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("runway");

  const filtered = useMemo(() => {
    let list = search.trim()
      ? companies.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
      : [...companies];

    if (sortKey === "runway") {
      // Sort by runway ascending, nulls last
      list.sort((a, b) => {
        if (a.runway_months === null && b.runway_months === null) return 0;
        if (a.runway_months === null) return 1;
        if (b.runway_months === null) return -1;
        return a.runway_months - b.runway_months;
      });
    } else if (sortKey === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortKey === "last_contact") {
      list.sort((a, b) => {
        if (!a.last_contact_date && !b.last_contact_date) return 0;
        if (!a.last_contact_date) return 1;
        if (!b.last_contact_date) return -1;
        return new Date(a.last_contact_date).getTime() - new Date(b.last_contact_date).getTime();
      });
    }

    return list;
  }, [companies, search, sortKey]);

  return (
    <div className="flex flex-col h-full border-r border-slate-200 bg-white w-full md:w-[270px] md:min-w-[220px]">
      {/* Search */}
      <div className="p-2.5 border-b border-slate-100">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-7 pr-2.5 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500/30"
          />
        </div>
        <select
          value={sortKey}
          onChange={e => setSortKey(e.target.value as SortKey)}
          className="w-full mt-2 text-xs border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-600 focus:outline-none"
        >
          <option value="runway">Sort: Runway (shortest first)</option>
          <option value="name">Sort: Name A–Z</option>
          <option value="last_contact">Sort: Last contact (oldest)</option>
        </select>
      </div>

      {/* Company list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">No companies found</p>
        ) : (
          filtered.map(c => (
            <PortfolioCompanyCard
              key={c.id}
              company={c}
              selected={c.id === selectedId}
              onClick={() => onSelect(c.id)}
            />
          ))
        )}
      </div>

      <div className="px-3 py-2 border-t border-slate-100 text-[11px] text-slate-400">
        {filtered.length} companies
      </div>
    </div>
  );
}
