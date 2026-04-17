"use client";
// ─── Companies Client Component ───────────────────────────────────────────────
// Client-side interactive table for browsing + managing companies.
// Handles: search filter, type filter, "Add Company" modal, row click.

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Company, CompanyType } from "@/lib/types";
import {
  cn, formatCurrency, formatDate,
  COMPANY_TYPE_COLORS, DEAL_STAGE_COLORS, DEAL_STAGE_LABELS, truncate,
} from "@/lib/utils";
import { Plus, Search, ExternalLink, Globe, Filter } from "lucide-react";

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "all",              label: "All types" },
  { value: "startup",          label: "Startups" },
  { value: "lp",               label: "LPs" },
  { value: "corporate",        label: "Corporates" },
  { value: "ecosystem_partner",label: "Ecosystem Partners" },
  { value: "fund",             label: "Funds" },
  { value: "government",       label: "Government" },
];

const STAGE_OPTIONS = [
  "pre-seed", "seed", "series_a", "series_b", "series_c", "growth",
];

const SECTORS = [
  "Cleantech", "Techbio", "Advanced Materials", "Energy Storage", "Carbon Capture",
  "Climate Tech", "Synthetic Biology", "Industrial Biotech", "Agtech",
  "Water Tech", "Circular Economy", "Deep Tech", "Hardware", "Other",
];

interface Props {
  initialCompanies: Company[];
  initialFilter: string;
}

export function CompaniesClient({ initialCompanies, initialFilter }: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [companies, setCompanies] = useState<Company[]>(initialCompanies);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState(initialFilter);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Company>>({
    type: "startup",
    sectors: [],
  });

  // Client-side search + filter
  const filtered = useMemo(() => {
    return companies.filter(c => {
      const matchType = typeFilter === "all" || c.type === typeFilter;
      const q = search.toLowerCase();
      const matchSearch = !q ||
        c.name.toLowerCase().includes(q) ||
        (c.description ?? "").toLowerCase().includes(q) ||
        (c.location_city ?? "").toLowerCase().includes(q) ||
        (c.sectors ?? []).some(s => s.toLowerCase().includes(q));
      return matchType && matchSearch;
    });
  }, [companies, search, typeFilter]);

  function setField(key: keyof Company, value: unknown) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function toggleSector(sector: string) {
    const lower = sector.toLowerCase();
    const current = (form.sectors ?? []) as string[];
    const updated = current.includes(lower)
      ? current.filter(s => s !== lower)
      : [...current, lower];
    setField("sectors", updated);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.type) return;
    setSaving(true);

    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("companies")
      .insert({ ...form, created_by: user?.id })
      .select()
      .single();

    setSaving(false);
    if (!error && data) {
      setCompanies(prev => [data, ...prev]);
      setShowModal(false);
      setForm({ type: "startup", sectors: [] });
    } else {
      alert(error?.message ?? "Failed to save company");
    }
  }

  return (
    <div className="flex-1 overflow-auto p-6 space-y-4">

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-8 w-56 h-9"
              placeholder="Search companies…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {/* Type filter */}
          <div className="relative">
            <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              className="select pl-8 h-9 w-44"
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
            >
              {TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus size={16} />
          Add Company
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>Company</th>
                <th>Type</th>
                <th>Sectors</th>
                <th>Stage / Status</th>
                <th>Location</th>
                <th>Last Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-400">
                    {search ? `No companies matching "${search}"` : "No companies yet. Click + Add Company to get started."}
                  </td>
                </tr>
              ) : (
                filtered.map(c => (
                  <tr
                    key={c.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/crm/companies/${c.id}`)}
                  >
                    <td>
                      <div className="font-medium text-slate-900">{c.name}</div>
                      {c.description && (
                        <div className="text-xs text-slate-400 mt-0.5">{truncate(c.description, 50)}</div>
                      )}
                    </td>
                    <td>
                      <span className={cn("badge capitalize", COMPANY_TYPE_COLORS[c.type] ?? "bg-slate-100 text-slate-600")}>
                        {c.type.replace("_", " ")}
                      </span>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {c.sectors?.slice(0, 2).map(s => (
                          <span key={s} className="badge bg-slate-100 text-slate-600 capitalize">{s}</span>
                        ))}
                        {(c.sectors?.length ?? 0) > 2 && (
                          <span className="badge bg-slate-100 text-slate-400">+{(c.sectors?.length ?? 0) - 2}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {c.deal_status ? (
                        <span className={cn("badge", DEAL_STAGE_COLORS[c.deal_status] ?? "bg-slate-100 text-slate-600")}>
                          {DEAL_STAGE_LABELS[c.deal_status] ?? c.deal_status.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                        </span>
                      ) : c.stage ? (
                        <span className="badge bg-slate-100 text-slate-600">{c.stage}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="text-slate-500">
                      {[c.location_city, c.location_country].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="text-slate-400 text-xs">{formatDate(c.updated_at)}</td>
                    <td>
                      {c.website && (
                        <a
                          href={c.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-slate-400 hover:text-blue-600"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add Company Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>

            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h2 className="text-base font-semibold text-slate-900">Add Company</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>

            <form onSubmit={handleSave} className="px-6 py-5 space-y-4">

              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Company Name *</label>
                  <input className="input" placeholder="e.g. CarbonMind Inc." value={form.name ?? ""} onChange={e => setField("name", e.target.value)} required />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Type *</label>
                  <select className="select" value={form.type} onChange={e => setField("type", e.target.value as CompanyType)} required>
                    <option value="startup">Startup</option>
                    <option value="lp">LP</option>
                    <option value="corporate">Corporate</option>
                    <option value="ecosystem_partner">Ecosystem Partner</option>
                    <option value="fund">Fund</option>
                    <option value="government">Government</option>
                  </select>
                </div>

                {form.type === "startup" && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Stage</label>
                    <select className="select" value={form.stage ?? ""} onChange={e => setField("stage", e.target.value)}>
                      <option value="">Select stage</option>
                      {STAGE_OPTIONS.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                    </select>
                  </div>
                )}

                {form.type === "startup" && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Deal Status</label>
                    <select className="select" value={form.deal_status ?? ""} onChange={e => setField("deal_status", e.target.value || null)}>
                      <option value="">Not set</option>
                      <option value="sourced">Sourced</option>
                      <option value="active_deal">Active Deal</option>
                      <option value="portfolio">Portfolio</option>
                      <option value="passed">Passed</option>
                      <option value="monitoring">Monitoring</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Website</label>
                  <input className="input" placeholder="https://example.com" type="url" value={form.website ?? ""} onChange={e => setField("website", e.target.value)} />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">LinkedIn URL</label>
                  <input className="input" placeholder="https://linkedin.com/company/…" value={form.linkedin_url ?? ""} onChange={e => setField("linkedin_url", e.target.value)} />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">City</label>
                  <input className="input" placeholder="San Francisco" value={form.location_city ?? ""} onChange={e => setField("location_city", e.target.value)} />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Country</label>
                  <input className="input" placeholder="USA" value={form.location_country ?? ""} onChange={e => setField("location_country", e.target.value)} />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Source</label>
                  <input className="input" placeholder="e.g. AngelList, referral, event" value={form.source ?? ""} onChange={e => setField("source", e.target.value)} />
                </div>

                {form.type === "startup" && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Total Funding Raised ($)</label>
                    <input className="input" type="number" placeholder="0" value={form.funding_raised ?? ""} onChange={e => setField("funding_raised", parseFloat(e.target.value) || null)} />
                  </div>
                )}

                {form.type === "lp" && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">AUM ($)</label>
                    <input className="input" type="number" placeholder="0" value={form.aum ?? ""} onChange={e => setField("aum", parseFloat(e.target.value) || null)} />
                  </div>
                )}
              </div>

              {/* Sectors */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">Sectors</label>
                <div className="flex flex-wrap gap-2">
                  {SECTORS.map(s => {
                    const lower = s.toLowerCase();
                    const selected = (form.sectors as string[] ?? []).includes(lower);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleSector(s)}
                        className={cn(
                          "px-3 py-1 rounded-full text-xs font-medium border transition-all",
                          selected
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-slate-600 border-slate-300 hover:border-blue-400"
                        )}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Description</label>
                <textarea className="textarea" rows={3} placeholder="Brief description of the company…" value={form.description ?? ""} onChange={e => setField("description", e.target.value)} />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Internal Notes</label>
                <textarea className="textarea" rows={2} placeholder="Any private notes…" value={form.notes ?? ""} onChange={e => setField("notes", e.target.value)} />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 px-4 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
                  {saving ? "Saving…" : "Add Company"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
