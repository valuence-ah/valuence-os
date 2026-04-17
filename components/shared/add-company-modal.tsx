"use client";
// ─── Shared Add Company Modal ─────────────────────────────────────────────────
// Used by: Pipeline page, Sourcing page, Feeds page.
// Saves to `companies` table. Calls onSuccess(companyId) after saving.
// Accepts prefill to pre-populate fields from signals/articles.

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { DealStatus } from "@/lib/types";
import {
  COMPANY_TYPE_OPTIONS,
  INVESTOR_TYPE_OPTIONS,
  STRATEGIC_TYPE_OPTIONS,
  LP_TYPE_OPTIONS,
  SECTOR_OPTIONS,
} from "@/lib/constants";

export interface AddCompanyPrefill {
  name?: string;
  website?: string;
  sector?: string;         // single sector string
  deal_status?: string;
  notes?: string;
  location_city?: string;
  location_country?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (companyId: string) => void;
  prefill?: AddCompanyPrefill;
}

const SECTORS = SECTOR_OPTIONS;

const STATUS_OPTIONS: { value: DealStatus; label: string }[] = [
  { value: "sourced",     label: "Sourced" },
  { value: "active_deal", label: "Active Deal" },
  { value: "portfolio",   label: "Portfolio" },
  { value: "passed",      label: "Passed" },
  { value: "monitoring",  label: "Monitoring" },
];

// Map deal_status string to DealStatus, with fallback
function toDealStatus(v: string | undefined): DealStatus | undefined {
  const valid: DealStatus[] = ["sourced", "active_deal", "portfolio", "passed", "monitoring", "exited"];
  return valid.includes(v as DealStatus) ? (v as DealStatus) : undefined;
}

export function AddCompanyModal({ isOpen, onClose, onSuccess, prefill }: Props) {
  const [name,            setName]            = useState(prefill?.name ?? "");
  const [companyType,     setCompanyType]     = useState("startup");
  const [investorType,    setInvestorType]    = useState("");
  const [strategicType,   setStrategicType]   = useState("");
  const [lpType,          setLpType]          = useState("");
  const [website,         setWebsite]         = useState(prefill?.website ?? "");
  const [sector,          setSector]          = useState(prefill?.sector ?? "");
  const [dealStatus,      setDealStatus]      = useState<DealStatus | "">(toDealStatus(prefill?.deal_status) ?? "sourced");
  const [priority,        setPriority]        = useState<"High" | "Medium" | "Low" | "">("");
  const [locationCity,    setLocationCity]    = useState(prefill?.location_city ?? "");
  const [locationCountry, setLocationCountry] = useState(prefill?.location_country ?? "");
  const [notes,           setNotes]           = useState(prefill?.notes ?? "");
  const [saving,          setSaving]          = useState(false);
  const [error,           setError]           = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const sectorArr = sector ? [sector] : [];

    const { data, error: insertError } = await supabase
      .from("companies")
      .insert({
        name: name.trim(),
        type: companyType,
        types: [companyType],
        investor_type: companyType === "fund" ? (investorType || null) : null,
        strategic_type: companyType === "corporate" ? (strategicType || null) : null,
        lp_type: companyType === "lp" ? (lpType || null) : null,
        website: website.trim() || null,
        sectors: sectorArr.length ? sectorArr : null,
        deal_status: (dealStatus as DealStatus) || null,
        priority: priority || null,
        location_city: locationCity.trim() || null,
        location_country: locationCountry.trim() || null,
        notes: notes.trim() || null,
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();

    setSaving(false);

    if (insertError || !data) {
      setError(insertError?.message ?? "Failed to add company");
      return;
    }

    onSuccess?.(data.id);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800">Add to Pipeline</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Company Name */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Company Name *</label>
            <input
              required
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              placeholder="e.g. CarbonMind Inc."
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Type</label>
            <select
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              value={companyType}
              onChange={e => { setCompanyType(e.target.value); setInvestorType(""); setStrategicType(""); setLpType(""); }}
            >
              {COMPANY_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Conditional sub-type */}
          {companyType === "fund" && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Investor Type</label>
              <select
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                value={investorType}
                onChange={e => setInvestorType(e.target.value)}
              >
                <option value="">Select investor type…</option>
                {INVESTOR_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          {companyType === "corporate" && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Strategic Type</label>
              <select
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                value={strategicType}
                onChange={e => setStrategicType(e.target.value)}
              >
                <option value="">Select strategic type…</option>
                {STRATEGIC_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          {companyType === "lp" && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">LP Type</label>
              <select
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                value={lpType}
                onChange={e => setLpType(e.target.value)}
              >
                <option value="">Select LP type…</option>
                {LP_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}

          {/* Website */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Website</label>
            <input
              type="text"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              placeholder="https://…"
              value={website}
              onChange={e => setWebsite(e.target.value)}
            />
          </div>

          {/* Sector */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Sector</label>
            <select
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              value={sector}
              onChange={e => setSector(e.target.value)}
            >
              <option value="">Select sector…</option>
              {SECTORS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Status + Priority */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Status</label>
              <select
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                value={dealStatus}
                onChange={e => setDealStatus(e.target.value as DealStatus | "")}
              >
                <option value="">Not set</option>
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Priority</label>
              <select
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                value={priority}
                onChange={e => setPriority(e.target.value as "High" | "Medium" | "Low" | "")}
              >
                <option value="">Not set</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
          </div>

          {/* Location */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">City</label>
              <input
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                placeholder="e.g. Singapore"
                value={locationCity}
                onChange={e => setLocationCity(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Country</label>
              <input
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                placeholder="e.g. Singapore"
                value={locationCountry}
                onChange={e => setLocationCountry(e.target.value)}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Notes</label>
            <textarea
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none"
              placeholder="Context, source, thesis rationale…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? "Adding…" : "Add to Pipeline"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
