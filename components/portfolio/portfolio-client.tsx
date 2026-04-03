"use client";
import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Company } from "@/lib/types";
import { formatDate, getInitials, cn } from "@/lib/utils";
import { BarChart3, Plus, Search, X, Loader2 } from "lucide-react";

interface PortfolioCompany extends Company {
  latestKpis: Record<string, { value: number; unit: string | null }>;
}

interface Props { companies: PortfolioCompany[] }

const KPI_PRESETS = [
  { name: "Monthly Recurring Revenue", unit: "$" },
  { name: "Burn Rate", unit: "$" },
  { name: "Runway", unit: "months" },
  { name: "Headcount", unit: "people" },
  { name: "ARR", unit: "$" },
  { name: "Gross Margin", unit: "%" },
  { name: "Active Users", unit: "users" },
  { name: "Customer Count", unit: "customers" },
];

function fmt(value: number, unit: string | null): string {
  if (unit === "$") {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value}`;
  }
  if (unit === "%") return `${value}%`;
  return `${value.toLocaleString()}${unit ? ` ${unit}` : ""}`;
}

const SECTOR_COLORS: Record<string, string> = {
  cleantech: "bg-emerald-100 text-emerald-700",
  biotech:   "bg-violet-100 text-violet-700",
  techbio:   "bg-violet-100 text-violet-700",
  other:     "bg-slate-100 text-slate-600",
};

export function PortfolioClient({ companies: initial }: Props) {
  const supabase = createClient();
  const [companies, setCompanies] = useState(initial);
  const [search, setSearch] = useState("");
  const [kpiModal, setKpiModal] = useState<PortfolioCompany | null>(null);
  const [kpiForm, setKpiForm] = useState({
    name: "Monthly Recurring Revenue",
    customName: "",
    value: "",
    unit: "$",
    period_start: "",
    period_end: "",
  });
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() =>
    !search.trim() ? companies :
    companies.filter(c => c.name.toLowerCase().includes(search.toLowerCase())),
    [companies, search]
  );

  const withKpis = companies.filter(c => Object.keys(c.latestKpis).length > 0).length;
  const thisMonth = companies.filter(c => {
    const d = new Date(c.updated_at);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  function openKpiModal(company: PortfolioCompany) {
    const today = new Date().toISOString().slice(0, 10);
    const firstOfMonth = today.slice(0, 7) + "-01";
    setKpiForm({
      name: "Monthly Recurring Revenue",
      customName: "",
      value: "",
      unit: "$",
      period_start: firstOfMonth,
      period_end: today,
    });
    setKpiModal(company);
  }

  async function handleSaveKpi(e: React.FormEvent) {
    e.preventDefault();
    if (!kpiModal) return;
    setSaving(true);
    const kpiName = kpiForm.name === "Custom" ? kpiForm.customName.trim() : kpiForm.name;
    const preset = KPI_PRESETS.find(p => p.name === kpiForm.name);
    const unit = preset ? preset.unit : kpiForm.unit;
    const { error } = await supabase.from("kpi_entries").insert({
      company_id: kpiModal.id,
      name: kpiName,
      value: parseFloat(kpiForm.value),
      unit,
      period_start: kpiForm.period_start,
      period_end: kpiForm.period_end,
    });
    if (!error) {
      // Optimistically update the latestKpis in the card
      setCompanies(prev => prev.map(c =>
        c.id === kpiModal.id
          ? { ...c, latestKpis: { ...c.latestKpis, [kpiName]: { value: parseFloat(kpiForm.value), unit } } }
          : c
      ));
      setKpiModal(null);
    }
    setSaving(false);
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Portfolio Companies", value: companies.length, color: "text-slate-900" },
          { label: "With KPIs Entered",   value: withKpis,          color: "text-blue-600" },
          { label: "Updated This Month",  value: thisMonth,         color: "text-emerald-600" },
          { label: "Sectors",             value: new Set(companies.flatMap(c => c.sectors ?? [])).size, color: "text-violet-600" },
        ].map(s => (
          <div key={s.label} className="card p-4">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search companies…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </div>
        <span className="text-sm text-slate-400">{filtered.length} companies</span>
      </div>

      {/* Company grid */}
      {filtered.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-12 text-center">
          <BarChart3 size={28} className="text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-500">No portfolio companies yet</p>
          <p className="text-xs text-gray-400 mt-1">Mark companies as &quot;Portfolio&quot; in the Pipeline CRM.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(company => {
            const kpis = company.latestKpis;
            const hasAnyKpi = Object.keys(kpis).length > 0;
            return (
              <div key={company.id} className="card p-5 hover:shadow-md transition-shadow">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-sm font-bold">{getInitials(company.name)}</span>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 leading-tight">{company.name}</h3>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {(company.sectors ?? []).slice(0, 2).map(s => (
                          <span
                            key={s}
                            className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded font-medium",
                              SECTOR_COLORS[s.toLowerCase()] ?? "bg-slate-100 text-slate-600"
                            )}
                          >
                            {s}
                          </span>
                        ))}
                        {company.stage && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-slate-100 text-slate-600">
                            {company.stage}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => openKpiModal(company)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors flex-shrink-0"
                  >
                    <Plus size={12} /> KPI
                  </button>
                </div>

                {/* KPI tiles */}
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100">
                  {[
                    { label: "MRR",    key: "Monthly Recurring Revenue" },
                    { label: "Burn",   key: "Burn Rate" },
                    { label: "Runway", key: "Runway" },
                  ].map(({ label, key }) => (
                    <div key={key} className="text-center">
                      <p className="text-[10px] text-slate-400 mb-0.5">{label}</p>
                      <p className="text-sm font-semibold text-slate-800">
                        {kpis[key]
                          ? fmt(kpis[key].value, kpis[key].unit)
                          : <span className="text-slate-300">—</span>
                        }
                      </p>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-50">
                  {company.last_contact_date ? (
                    <p className="text-[11px] text-slate-400">Last contact: {formatDate(company.last_contact_date)}</p>
                  ) : (
                    <span />
                  )}
                  {!hasAnyKpi && (
                    <span className="text-[11px] text-amber-500 font-medium">No KPIs yet</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* KPI Entry Modal */}
      {kpiModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setKpiModal(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="text-base font-semibold">Add KPI Entry</h2>
                <p className="text-xs text-slate-500 mt-0.5">{kpiModal.name}</p>
              </div>
              <button
                onClick={() => setKpiModal(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveKpi} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">KPI</label>
                <select
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  value={kpiForm.name}
                  onChange={e => {
                    const preset = KPI_PRESETS.find(p => p.name === e.target.value);
                    setKpiForm(p => ({ ...p, name: e.target.value, unit: preset?.unit ?? p.unit }));
                  }}
                >
                  {KPI_PRESETS.map(p => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                  <option value="Custom">Custom…</option>
                </select>
              </div>

              {kpiForm.name === "Custom" && (
                <input
                  required
                  placeholder="Custom KPI name"
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  value={kpiForm.customName}
                  onChange={e => setKpiForm(p => ({ ...p, customName: e.target.value }))}
                />
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Value *</label>
                  <input
                    required
                    type="number"
                    step="any"
                    placeholder="0"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    value={kpiForm.value}
                    onChange={e => setKpiForm(p => ({ ...p, value: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Unit</label>
                  <input
                    placeholder="$, months, users…"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    value={kpiForm.unit}
                    onChange={e => setKpiForm(p => ({ ...p, unit: e.target.value }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Period Start</label>
                  <input
                    type="date"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    value={kpiForm.period_start}
                    onChange={e => setKpiForm(p => ({ ...p, period_start: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Period End</label>
                  <input
                    type="date"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    value={kpiForm.period_end}
                    onChange={e => setKpiForm(p => ({ ...p, period_end: e.target.value }))}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setKpiModal(null)}
                  className="flex-1 py-2.5 border border-slate-200 text-slate-700 text-sm rounded-lg hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !kpiForm.value}
                  className="flex-1 py-2.5 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                  {saving ? "Saving…" : "Save KPI"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
