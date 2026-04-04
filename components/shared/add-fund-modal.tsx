"use client";
// ─── Shared Add Fund Modal ────────────────────────────────────────────────────
// Used by: Funds CRM page, Feeds page.
// Saves to `companies` table (type: "investor"). Calls onSuccess(fundId) after saving.

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export interface AddFundPrefill {
  name?: string;
  investor_type?: string;
  location_city?: string;
  location_country?: string;
  notes?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (fundId: string) => void;
  prefill?: AddFundPrefill;
}

const INVESTOR_TYPES = [
  "Venture Capital",
  "Corporate VC",
  "Family Office",
  "Fund of Funds",
  "Angel",
  "Accelerator",
  "Government",
  "Other",
];

const STAGE_OPTIONS = [
  "Pre-Seed", "Seed", "Series A", "Series B", "Growth", "Multi-Stage",
];

export function AddFundModal({ isOpen, onClose, onSuccess, prefill }: Props) {
  const [name,            setName]            = useState(prefill?.name ?? "");
  const [investorType,    setInvestorType]    = useState(prefill?.investor_type ?? "");
  const [locationCity,    setLocationCity]    = useState(prefill?.location_city ?? "");
  const [locationCountry, setLocationCountry] = useState(prefill?.location_country ?? "");
  const [stageFocus,      setStageFocus]      = useState("");
  const [owner,           setOwner]           = useState("");
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

    const { data, error: insertError } = await supabase
      .from("companies")
      .insert({
        name: name.trim(),
        type: "investor",
        types: ["investor"],
        investor_type: investorType || null,
        location_city: locationCity.trim() || null,
        location_country: locationCountry.trim() || null,
        fund_focus: stageFocus || null,
        source: owner.trim() || null,
        notes: notes.trim() || null,
        created_by: user?.id ?? null,
      })
      .select("id")
      .single();

    setSaving(false);

    if (insertError || !data) {
      setError(insertError?.message ?? "Failed to add fund");
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
        className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-800">Add Fund</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Fund Name */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Fund Name *</label>
            <input
              required
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
              placeholder="e.g. Lowercarbon Capital"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          {/* Investor Type */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Investor Type</label>
            <select
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
              value={investorType}
              onChange={e => setInvestorType(e.target.value)}
            >
              <option value="">Select type…</option>
              {INVESTOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* City + Country */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">City</label>
              <input
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
                placeholder="e.g. San Francisco"
                value={locationCity}
                onChange={e => setLocationCity(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1.5">Country</label>
              <input
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
                placeholder="e.g. USA"
                value={locationCountry}
                onChange={e => setLocationCountry(e.target.value)}
              />
            </div>
          </div>

          {/* Stage Focus */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Stage Focus</label>
            <select
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
              value={stageFocus}
              onChange={e => setStageFocus(e.target.value)}
            >
              <option value="">Select stage…</option>
              {STAGE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {/* Owner */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Owner / Relationship Lead</label>
            <input
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
              placeholder="e.g. Andrew"
              value={owner}
              onChange={e => setOwner(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Notes</label>
            <textarea
              rows={3}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 resize-none"
              placeholder="Thesis fit, context, source article…"
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
              className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? "Adding…" : "Add Fund"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
