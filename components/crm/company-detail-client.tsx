"use client";
// ─── Company Detail Client ────────────────────────────────────────────────────
// Type-aware company detail page with inline editing.
// Startup · Fund · LP · Corporate · Ecosystem Partner · Government
// Tabs: Overview | Contacts | Interactions | Deals | Memos | Intelligence

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Company, Contact, Interaction, Deal, CompanyType } from "@/lib/types";
import {
  formatCurrency, formatDate, timeAgo,
  COMPANY_TYPE_COLORS, DEAL_STAGE_COLORS, DEAL_STAGE_LABELS,
  LP_STAGE_LABELS, LP_STAGE_COLORS,
  cn, getInitials,
} from "@/lib/utils";
import {
  Globe, Linkedin, ExternalLink, MapPin,
  Phone, Mail, Plus, ChevronDown, FileText, Mic, CheckSquare,
  Sparkles, Loader2, AlertCircle, Calendar, Link as LinkIcon,
  Edit2, Folder, X, Upload,
} from "lucide-react";
import Link from "next/link";
import type { IcMemo } from "@/lib/types";

// ── Constants ─────────────────────────────────────────────────────────────────
const TABS = ["Overview", "Contacts", "Interactions", "Deals", "Memos", "Intelligence"] as const;
type Tab = typeof TABS[number];

type MemoSummary = Pick<IcMemo, "id" | "title" | "recommendation" | "status" | "created_at">;

const REC_COLORS: Record<string, string> = {
  invest:         "bg-green-100 text-green-700",
  pass:           "bg-red-100 text-red-600",
  more_diligence: "bg-yellow-100 text-yellow-700",
  pending:        "bg-slate-100 text-slate-500",
};

const PRIORITY_COLORS: Record<string, string> = {
  High:   "bg-red-100 text-red-700",
  Medium: "bg-amber-100 text-amber-700",
  Low:    "bg-slate-100 text-slate-600",
};

const RAISE_STATUS_COLORS: Record<string, string> = {
  not_raising:      "bg-slate-100 text-slate-500",
  preparing:        "bg-blue-50 text-blue-600",
  actively_raising: "bg-emerald-100 text-emerald-700",
  closing:          "bg-violet-100 text-violet-700",
};

const RAISE_STATUS_LABELS: Record<string, string> = {
  not_raising:      "Not Raising",
  preparing:        "Preparing Raise",
  actively_raising: "Actively Raising",
  closing:          "Closing Round",
};

const SECTORS = [
  "Cleantech", "Techbio", "Advanced Materials", "Energy Storage", "Carbon Capture",
  "Climate Tech", "Synthetic Biology", "Industrial Biotech", "Agtech",
  "Water Tech", "Circular Economy", "Deep Tech", "Hardware", "Other",
];

const STAGE_OPTIONS = ["pre-seed", "seed", "series_a", "series_b", "series_c", "growth"];

const DEAL_STATUS_OPTIONS = [
  { value: "",             label: "Not set" },
  { value: "sourced",      label: "Sourced" },
  { value: "active_deal",  label: "Active Deal" },
  { value: "portfolio",    label: "Portfolio" },
  { value: "passed",       label: "Passed" },
  { value: "monitoring",   label: "Monitoring" },
  { value: "exited",       label: "Exited" },
];

const LP_STAGE_OPTION_LIST = [
  "target", "intro_made", "meeting_scheduled", "meeting_done",
  "materials_sent", "soft_commit", "committed", "closed", "passed",
];

interface Props {
  company: Company;
  contacts: Contact[];
  interactions: Interaction[];
  deals: Deal[];
  memos: MemoSummary[];
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide mb-0.5">{children}</p>;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "" || value === false) return null;
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="text-sm text-slate-700">{value}</div>
    </div>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{children}</p>;
}

// ── Edit Company Modal ─────────────────────────────────────────────────────────
function EditCompanyModal({
  company,
  onSave,
  onClose,
}: {
  company: Company;
  onSave: (updated: Company) => void;
  onClose: () => void;
}) {
  const supabase = createClient();
  const [form, setForm] = useState<Partial<Company>>({ ...company });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setF(key: keyof Company, value: unknown) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function toggleSector(sector: string) {
    const lower = sector.toLowerCase();
    const current = (form.sectors ?? []) as string[];
    const updated = current.includes(lower)
      ? current.filter(s => s !== lower)
      : [...current, lower];
    setF("sectors", updated);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, created_at, updated_at, created_by, ...rest } = form as Company;
    const { data, error: err } = await supabase
      .from("companies")
      .update(rest)
      .eq("id", company.id)
      .select()
      .single();
    setSaving(false);
    if (err || !data) { setError(err?.message ?? "Failed to save"); return; }
    onSave(data as Company);
    onClose();
  }

  const t = form.type ?? "startup";

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <h2 className="text-base font-semibold text-slate-900">Edit {company.name}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="px-6 py-5 space-y-6">

          {/* ── Basic Info ── */}
          <section className="space-y-3">
            <SectionHeading>Basic Info</SectionHeading>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-600 mb-1">Company Name *</label>
                <input className="input" required value={form.name ?? ""} onChange={e => setF("name", e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Type *</label>
                <select className="select" value={form.type} onChange={e => setF("type", e.target.value as CompanyType)} required>
                  <option value="startup">Startup</option>
                  <option value="fund">Fund / VC</option>
                  <option value="lp">LP</option>
                  <option value="corporate">Corporate</option>
                  <option value="ecosystem_partner">Ecosystem Partner</option>
                  <option value="government">Government</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Priority</label>
                <select className="select" value={form.priority ?? ""} onChange={e => setF("priority", e.target.value || null)}>
                  <option value="">Not set</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Website</label>
                <input className="input" type="url" placeholder="https://…" value={form.website ?? ""} onChange={e => setF("website", e.target.value || null)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">LinkedIn</label>
                <input className="input" placeholder="https://linkedin.com/company/…" value={form.linkedin_url ?? ""} onChange={e => setF("linkedin_url", e.target.value || null)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Crunchbase URL</label>
                <input className="input" placeholder="https://crunchbase.com/organization/…" value={form.crunchbase_url ?? ""} onChange={e => setF("crunchbase_url", e.target.value || null)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Google Drive Folder</label>
                <input className="input" placeholder="https://drive.google.com/…" value={form.drive_folder_url ?? ""} onChange={e => setF("drive_folder_url", e.target.value || null)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
                <input className="input" placeholder="San Francisco" value={form.location_city ?? ""} onChange={e => setF("location_city", e.target.value || null)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Country</label>
                <input className="input" placeholder="USA" value={form.location_country ?? ""} onChange={e => setF("location_country", e.target.value || null)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Founded Year</label>
                <input className="input" type="number" placeholder="2020" value={form.founded_year ?? ""} onChange={e => setF("founded_year", parseInt(e.target.value) || null)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Employees</label>
                <input className="input" placeholder="e.g. 10–50" value={form.employee_count ?? ""} onChange={e => setF("employee_count", e.target.value || null)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Source</label>
                <input className="input" placeholder="e.g. referral, AngelList, conference" value={form.source ?? ""} onChange={e => setF("source", e.target.value || null)} />
              </div>
            </div>
          </section>

          {/* ── Startup ── */}
          {t === "startup" && (
            <section className="space-y-3">
              <SectionHeading>Deal Information</SectionHeading>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Deal Status</label>
                  <select className="select" value={form.deal_status ?? ""} onChange={e => setF("deal_status", e.target.value || null)}>
                    {DEAL_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Stage</label>
                  <select className="select" value={form.stage ?? ""} onChange={e => setF("stage", e.target.value || null)}>
                    <option value="">Select stage</option>
                    {STAGE_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Total Raised ($)</label>
                  <input className="input" type="number" placeholder="0" value={form.funding_raised ?? ""} onChange={e => setF("funding_raised", parseFloat(e.target.value) || null)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Last Funding Date</label>
                  <input className="input" type="date" value={form.last_funding_date?.slice(0, 10) ?? ""} onChange={e => setF("last_funding_date", e.target.value || null)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Last Funding Stage</label>
                  <input className="input" placeholder="e.g. Seed, Series A" value={form.last_funding_stage ?? ""} onChange={e => setF("last_funding_stage", e.target.value || null)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Pitch Deck URL</label>
                  <input className="input" type="url" placeholder="https://…" value={form.pitch_deck_url ?? ""} onChange={e => setF("pitch_deck_url", e.target.value || null)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Raise Status</label>
                  <select className="select" value={form.current_raise_status ?? ""} onChange={e => setF("current_raise_status", e.target.value || null)}>
                    <option value="">Not set</option>
                    <option value="not_raising">Not Raising</option>
                    <option value="preparing">Preparing Raise</option>
                    <option value="actively_raising">Actively Raising</option>
                    <option value="closing">Closing Round</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Runway (months)</label>
                  <input className="input" type="number" placeholder="18" value={form.runway_months ?? ""} onChange={e => setF("runway_months", parseInt(e.target.value) || null)} />
                </div>
              </div>

              <SectionHeading>Current Raise</SectionHeading>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Round</label>
                  <input className="input" placeholder="e.g. Seed, Series A" value={form.raise_round ?? ""} onChange={e => setF("raise_round", e.target.value || null)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Target Amount</label>
                  <input className="input" placeholder="e.g. $3M" value={form.current_raise_target ?? ""} onChange={e => setF("current_raise_target", e.target.value || null)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Target Close Date</label>
                  <input className="input" type="date" value={form.raise_target_close?.slice(0, 10) ?? ""} onChange={e => setF("raise_target_close", e.target.value || null)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Investors Approached</label>
                  <input className="input" type="number" placeholder="0" value={form.investors_approached ?? ""} onChange={e => setF("investors_approached", parseInt(e.target.value) || null)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Term Sheets Received</label>
                  <input className="input" type="number" placeholder="0" value={form.term_sheets ?? ""} onChange={e => setF("term_sheets", parseInt(e.target.value) || null)} />
                </div>
              </div>
            </section>
          )}

          {/* ── Fund ── */}
          {t === "fund" && (
            <section className="space-y-3">
              <SectionHeading>Fund Information</SectionHeading>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">AUM ($)</label>
                  <input className="input" type="number" placeholder="0" value={form.aum ?? ""} onChange={e => setF("aum", parseFloat(e.target.value) || null)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Investor Type</label>
                  <input className="input" placeholder="e.g. VC, PE, CVC, Family Office" value={form.investor_type ?? ""} onChange={e => setF("investor_type", e.target.value || null)} />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Fund Focus / Strategy</label>
                  <input className="input" placeholder="e.g. Early-stage deeptech, Series A–B climate" value={form.fund_focus ?? ""} onChange={e => setF("fund_focus", e.target.value || null)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Deal Status</label>
                  <select className="select" value={form.deal_status ?? ""} onChange={e => setF("deal_status", e.target.value || null)}>
                    {DEAL_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            </section>
          )}

          {/* ── LP ── */}
          {t === "lp" && (
            <section className="space-y-3">
              <SectionHeading>LP Information</SectionHeading>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">AUM ($)</label>
                  <input className="input" type="number" placeholder="0" value={form.aum ?? ""} onChange={e => setF("aum", parseFloat(e.target.value) || null)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">LP Type</label>
                  <select className="select" value={form.lp_type ?? ""} onChange={e => setF("lp_type", e.target.value || null)}>
                    <option value="">Select type</option>
                    <option value="pension_fund">Pension Fund</option>
                    <option value="endowment">Endowment</option>
                    <option value="family_office">Family Office</option>
                    <option value="hnwi">HNWI</option>
                    <option value="sovereign_wealth">Sovereign Wealth</option>
                    <option value="corporate_pension">Corporate Pension</option>
                    <option value="insurance">Insurance</option>
                    <option value="fund_of_funds">Fund of Funds</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">LP Stage</label>
                  <select className="select" value={form.lp_stage ?? ""} onChange={e => setF("lp_stage", e.target.value || null)}>
                    <option value="">Not set</option>
                    {LP_STAGE_OPTION_LIST.map(s => (
                      <option key={s} value={s}>{LP_STAGE_LABELS[s] ?? s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Commitment Goal ($)</label>
                  <input className="input" type="number" placeholder="0" value={form.commitment_goal ?? ""} onChange={e => setF("commitment_goal", parseFloat(e.target.value) || null)} />
                </div>
              </div>
            </section>
          )}

          {/* ── Corporate ── */}
          {t === "corporate" && (
            <section className="space-y-3">
              <SectionHeading>Corporate Information</SectionHeading>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Strategic Type</label>
                  <input className="input" placeholder="e.g. Strategic Partner, Customer, Acquirer" value={form.strategic_type ?? ""} onChange={e => setF("strategic_type", e.target.value || null)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Deal Status</label>
                  <select className="select" value={form.deal_status ?? ""} onChange={e => setF("deal_status", e.target.value || null)}>
                    {DEAL_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            </section>
          )}

          {/* ── Ecosystem Partner ── */}
          {t === "ecosystem_partner" && (
            <section className="space-y-3">
              <SectionHeading>Partner Information</SectionHeading>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Partner Type</label>
                  <input className="input" placeholder="e.g. Accelerator, University, National Lab, Industry Body" value={form.strategic_type ?? ""} onChange={e => setF("strategic_type", e.target.value || null)} />
                </div>
              </div>
            </section>
          )}

          {/* ── Sectors ── */}
          {["startup", "fund", "corporate", "ecosystem_partner", "government"].includes(t) && (
            <section className="space-y-2">
              <SectionHeading>Sectors</SectionHeading>
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
            </section>
          )}

          {/* ── Description + Notes ── */}
          <section className="space-y-3">
            <SectionHeading>Description &amp; Notes</SectionHeading>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Description</label>
              <textarea className="textarea" rows={3} placeholder="Brief description of the company…" value={form.description ?? ""} onChange={e => setF("description", e.target.value || null)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Internal Notes</label>
              <textarea className="textarea" rows={2} placeholder="Private notes…" value={form.notes ?? ""} onChange={e => setF("notes", e.target.value || null)} />
            </div>
          </section>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 px-4 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors">
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Company Profile Card (Overview right column) ──────────────────────────────
function CompanyProfileCard({
  company,
  onEdit,
  onDeckChange,
}: {
  company: Company;
  onEdit: () => void;
  onDeckChange: (url: string) => void;
}) {
  const supabase = createClient();
  const deckRef = useRef<HTMLInputElement>(null);
  const [deckUploading, setDeckUploading] = useState(false);

  async function handleDeckUpload(file: File) {
    setDeckUploading(true);
    const ext = file.name.split(".").pop() ?? "pdf";
    const path = `${company.id}/deck-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("decks")
      .upload(path, file, { upsert: true });
    if (upErr) {
      alert("Upload failed: " + upErr.message);
      setDeckUploading(false);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from("decks").getPublicUrl(path);
    await supabase.from("companies").update({ pitch_deck_url: publicUrl }).eq("id", company.id);
    onDeckChange(publicUrl);
    setDeckUploading(false);
  }

  const t = company.type;

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">Company Profile</h3>
        <button
          onClick={onEdit}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
        >
          <Edit2 size={11} /> Edit
        </button>
      </div>

      {/* ── Startup ── */}
      {t === "startup" && (
        <>
          <Field label="Deal Status" value={company.deal_status && (
            <span className={cn("badge", DEAL_STAGE_COLORS[company.deal_status] ?? "bg-slate-100 text-slate-600")}>
              {DEAL_STAGE_LABELS[company.deal_status] ?? company.deal_status.replace(/_/g, " ")}
            </span>
          )} />
          <Field label="Stage" value={company.stage && (
            <span className="capitalize">{company.stage.replace(/_/g, " ")}</span>
          )} />
          <Field label="Raise Status" value={company.current_raise_status && (
            <span className={cn("badge", RAISE_STATUS_COLORS[company.current_raise_status] ?? "bg-slate-100 text-slate-500")}>
              {RAISE_STATUS_LABELS[company.current_raise_status] ?? company.current_raise_status}
            </span>
          )} />
          <Field label="Total Raised" value={company.funding_raised ? formatCurrency(company.funding_raised, true) : null} />
          <Field label="Last Funding" value={
            company.last_funding_date
              ? [formatDate(company.last_funding_date), company.last_funding_stage].filter(Boolean).join(" · ")
              : null
          } />
          <Field label="Priority" value={company.priority && (
            <span className={cn("badge", PRIORITY_COLORS[company.priority] ?? "bg-slate-100 text-slate-600")}>
              {company.priority}
            </span>
          )} />
          <Field label="Runway" value={company.runway_months != null ? `${company.runway_months} months` : null} />
          {(company.raise_round || company.current_raise_target) && (
            <Field
              label="Current Raise"
              value={[company.raise_round, company.current_raise_target].filter(Boolean).join(" · ")}
            />
          )}
          <Field label="Target Close" value={company.raise_target_close ? formatDate(company.raise_target_close) : null} />
          {company.investors_approached != null && (
            <Field
              label="Investors Approached / TSs"
              value={`${company.investors_approached} approached · ${company.term_sheets ?? 0} TS`}
            />
          )}
          <Field label="Employees" value={company.employee_count} />
          <Field label="Founded" value={company.founded_year} />
        </>
      )}

      {/* ── LP ── */}
      {t === "lp" && (
        <>
          <Field label="AUM" value={company.aum ? formatCurrency(company.aum, true) : null} />
          <Field label="LP Type" value={
            company.lp_type
              ? company.lp_type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())
              : null
          } />
          <Field label="LP Stage" value={company.lp_stage && (
            <span className={cn("badge", LP_STAGE_COLORS[company.lp_stage] ?? "bg-slate-100 text-slate-600")}>
              {LP_STAGE_LABELS[company.lp_stage] ?? company.lp_stage}
            </span>
          )} />
          <Field label="Commitment Goal" value={company.commitment_goal ? formatCurrency(company.commitment_goal, true) : null} />
        </>
      )}

      {/* ── Fund ── */}
      {t === "fund" && (
        <>
          <Field label="AUM" value={company.aum ? formatCurrency(company.aum, true) : null} />
          <Field label="Investor Type" value={company.investor_type} />
          <Field label="Fund Focus" value={company.fund_focus} />
          <Field label="Deal Status" value={company.deal_status && (
            <span className={cn("badge", DEAL_STAGE_COLORS[company.deal_status] ?? "bg-slate-100 text-slate-600")}>
              {DEAL_STAGE_LABELS[company.deal_status] ?? company.deal_status.replace(/_/g, " ")}
            </span>
          )} />
        </>
      )}

      {/* ── Corporate ── */}
      {t === "corporate" && (
        <>
          <Field label="Strategic Type" value={company.strategic_type} />
          <Field label="Deal Status" value={company.deal_status && (
            <span className={cn("badge", DEAL_STAGE_COLORS[company.deal_status] ?? "bg-slate-100 text-slate-600")}>
              {DEAL_STAGE_LABELS[company.deal_status] ?? company.deal_status.replace(/_/g, " ")}
            </span>
          )} />
          <Field label="Employees" value={company.employee_count} />
          <Field label="Founded" value={company.founded_year} />
        </>
      )}

      {/* ── Ecosystem Partner ── */}
      {t === "ecosystem_partner" && (
        <>
          <Field label="Partner Type" value={company.strategic_type} />
          <Field label="Employees" value={company.employee_count} />
          <Field label="Founded" value={company.founded_year} />
        </>
      )}

      {/* ── Government ── */}
      {t === "government" && (
        <>
          <Field label="Employees" value={company.employee_count} />
          <Field label="Founded" value={company.founded_year} />
        </>
      )}

      {/* Sectors (all types) */}
      {(company.sectors?.length ?? 0) > 0 && (
        <div>
          <FieldLabel>Sectors</FieldLabel>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {company.sectors!.map(s => (
              <span key={s} className="badge bg-slate-100 text-slate-600 capitalize">{s}</span>
            ))}
          </div>
        </div>
      )}

      {/* Pitch deck – startups only */}
      {t === "startup" && (
        <div>
          <FieldLabel>Pitch Deck</FieldLabel>
          <div className="flex items-center gap-2 mt-0.5">
            {company.pitch_deck_url ? (
              <a
                href={company.pitch_deck_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                <FileText size={12} /> View Deck
              </a>
            ) : (
              <span className="text-xs text-slate-400 italic">No deck uploaded</span>
            )}
            <button
              type="button"
              onClick={() => deckRef.current?.click()}
              disabled={deckUploading}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 border border-slate-200 rounded px-2 py-0.5 hover:border-blue-300 transition-colors disabled:opacity-50"
            >
              {deckUploading
                ? <Loader2 size={10} className="animate-spin" />
                : <Upload size={10} />
              }
              {deckUploading ? "Uploading…" : company.pitch_deck_url ? "Replace" : "Upload"}
            </button>
            <input
              ref={deckRef}
              type="file"
              accept=".pdf,.ppt,.pptx,.key"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleDeckUpload(f); e.target.value = ""; }}
            />
          </div>
        </div>
      )}

      {/* Common fields for all types */}
      <div className="border-t border-slate-100 pt-3 mt-1 space-y-2.5">
        <Field label="Source" value={company.source} />
        <Field label="First Contact" value={formatDate(company.first_contact_date)} />
        <Field label="Last Contact" value={formatDate(company.last_contact_date)} />
        <Field label="Added" value={formatDate(company.created_at)} />
        {company.drive_folder_url && (
          <div>
            <FieldLabel>Drive Folder</FieldLabel>
            <a
              href={company.drive_folder_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mt-0.5"
            >
              <Folder size={11} /> Open in Drive
            </a>
          </div>
        )}
        {company.crunchbase_url && (
          <div>
            <FieldLabel>Crunchbase</FieldLabel>
            <a
              href={company.crunchbase_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 mt-0.5"
            >
              <ExternalLink size={11} /> View profile
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Interactions tab ───────────────────────────────────────────────────────────
function InteractionsTab({ interactions }: { interactions: Interaction[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const meetings    = interactions.filter(i => i.type === "meeting");
  const otherEvents = interactions.filter(i => i.type !== "meeting");

  function InteractionRow({ i }: { i: Interaction }) {
    const isMeeting     = i.type === "meeting";
    const hasTranscript = !!(i.transcript_text);
    const isExpanded    = expandedId === i.id;

    return (
      <div className="border-b border-slate-100 last:border-0">
        <button
          className="w-full text-left px-5 py-3 hover:bg-slate-50 transition-colors"
          onClick={() => isMeeting ? setExpandedId(isExpanded ? null : i.id) : undefined}
          style={{ cursor: isMeeting ? "pointer" : "default" }}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              {isMeeting
                ? <span className="inline-flex items-center gap-1 badge bg-violet-100 text-violet-700"><Mic size={10} /> Meeting</span>
                : <span className="badge bg-slate-100 text-slate-600 capitalize">{i.type}</span>
              }
              {hasTranscript && (
                <span className="badge bg-blue-50 text-blue-600 text-[10px]">Transcript</span>
              )}
              {i.fireflies_id && (
                <span className="badge bg-orange-50 text-orange-600 text-[10px]">Fireflies</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">{timeAgo(i.date)}</span>
              {isMeeting && <ChevronDown size={13} className={cn("text-slate-400 transition-transform", isExpanded && "rotate-180")} />}
            </div>
          </div>
          {i.subject && <p className="text-sm font-medium text-slate-800">{i.subject}</p>}
          {i.summary && !isExpanded && (
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{i.summary}</p>
          )}
          {!isMeeting && i.body && (
            <p className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap">{i.body}</p>
          )}
        </button>

        {isMeeting && isExpanded && (
          <div className="px-5 pb-4 space-y-3 bg-slate-50/60">
            {i.summary && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Summary</p>
                <p className="text-sm text-slate-700 leading-relaxed">{i.summary}</p>
              </div>
            )}
            {(i.action_items?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Action Items</p>
                <ul className="space-y-1">
                  {i.action_items!.map((a, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                      <CheckSquare size={12} className="mt-0.5 text-amber-500 flex-shrink-0" />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {i.transcript_text && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Full Transcript</p>
                <pre className="max-h-64 overflow-y-auto text-xs text-slate-600 leading-relaxed whitespace-pre-wrap bg-white border border-slate-200 rounded-lg p-3 font-mono">
                  {i.transcript_text}
                </pre>
              </div>
            )}
            {i.transcript_url && (
              <a
                href={i.transcript_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700"
              >
                <ExternalLink size={11} /> Open transcript file
              </a>
            )}
          </div>
        )}
      </div>
    );
  }

  if (interactions.length === 0) {
    return (
      <div className="card">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800">Interaction History</h3>
        </div>
        <p className="px-5 py-8 text-sm text-slate-400 text-center">No interactions logged yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {meetings.length > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Mic size={14} className="text-violet-600" />
            <h3 className="text-sm font-semibold text-slate-800">Meeting Transcripts</h3>
            <span className="ml-auto badge bg-slate-100 text-slate-500">{meetings.length}</span>
          </div>
          <div>
            {meetings.map(i => <InteractionRow key={i.id} i={i} />)}
          </div>
        </div>
      )}
      {otherEvents.length > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Other Interactions</h3>
          </div>
          <div>
            {otherEvents.map(i => <InteractionRow key={i.id} i={i} />)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Intelligence tab ───────────────────────────────────────────────────────────
interface IntelItem {
  headline: string;
  source: string;
  date: string;
  summary: string;
  url: string | null;
}

function IntelligenceTab({ companyId }: { companyId: string }) {
  const supabase = createClient();
  const [items, setItems]         = useState<IntelItem[]>([]);
  const [signals, setSignals]     = useState<{ id: string; title: string; summary: string | null; source: string | null; url: string | null; relevance_score: number | null; created_at: string }[]>([]);
  const [status, setStatus]       = useState<"idle" | "loading" | "done" | "error">("idle");
  const [exaStatus, setExaStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [exaMsg, setExaMsg]       = useState<string | null>(null);
  const [loadingSignals, setLoadingSignals] = useState(true);

  useEffect(() => {
    supabase
      .from("sourcing_signals")
      .select("id, title, summary, source, url, relevance_score, created_at")
      .eq("company_id", companyId)
      .order("relevance_score", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setSignals((data ?? []) as typeof signals);
        setLoadingSignals(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  async function runIntelligence() {
    setStatus("loading");
    setItems([]);
    try {
      const res = await fetch(`/api/companies/${companyId}/intelligence`, { method: "POST" });
      const data = await res.json() as { items?: IntelItem[]; error?: string };
      if (!res.ok || data.error) { setStatus("error"); return; }
      setItems(data.items ?? []);
      setStatus("done");
    } catch { setStatus("error"); }
  }

  async function runExa() {
    setExaStatus("loading");
    setExaMsg(null);
    try {
      const res  = await fetch("/api/agents/exa-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId }),
      });
      const data = await res.json() as { success?: boolean; signals_saved?: number; error?: string };
      if (!data.success) { setExaStatus("error"); setExaMsg(data.error ?? "Research failed"); return; }
      const saved = data.signals_saved ?? 0;
      setExaMsg(`${saved} signal${saved !== 1 ? "s" : ""} saved`);
      setExaStatus("done");
      const { data: fresh } = await supabase
        .from("sourcing_signals")
        .select("id, title, summary, source, url, relevance_score, created_at")
        .eq("company_id", companyId)
        .order("relevance_score", { ascending: false })
        .limit(20);
      setSignals((fresh ?? []) as typeof signals);
    } catch {
      setExaStatus("error");
      setExaMsg("Research failed");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={runIntelligence}
          disabled={status === "loading"}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
        >
          {status === "loading" ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {status === "loading" ? "Generating…" : "Get AI Intelligence"}
        </button>
        <button
          onClick={runExa}
          disabled={exaStatus === "loading"}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 disabled:opacity-50 transition-colors"
        >
          {exaStatus === "loading" ? <Loader2 size={12} className="animate-spin" /> : <LinkIcon size={12} />}
          {exaStatus === "loading" ? "Searching Exa…" : "Research with Exa"}
        </button>
        {exaMsg && (
          <span className={`text-xs ${exaStatus === "error" ? "text-red-500" : "text-slate-500"}`}>{exaMsg}</span>
        )}
      </div>

      {status === "error" && (
        <div className="flex items-center gap-2 text-sm text-red-500 bg-red-50 rounded-lg px-4 py-3">
          <AlertCircle size={14} /> Failed to generate intelligence. Try again.
        </div>
      )}

      {items.length > 0 && (
        <div className="card">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Sparkles size={14} className="text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-800">AI Intelligence</h3>
            <span className="ml-auto text-[10px] text-slate-400">Generated by Claude · may contain inaccuracies</span>
          </div>
          <div className="divide-y divide-slate-100">
            {items.map((item, i) => (
              <div key={i} className="px-5 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-slate-800 leading-snug">{item.headline}</p>
                  <div className="flex items-center gap-1.5 flex-shrink-0 text-[10px] text-slate-400">
                    <Calendar size={10} />
                    {item.date}
                  </div>
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">{item.summary}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{item.source}</span>
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-0.5">
                      <ExternalLink size={9} /> Source
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <LinkIcon size={14} className="text-teal-600" />
          <h3 className="text-sm font-semibold text-slate-800">Saved Signals</h3>
          {signals.length > 0 && <span className="ml-auto badge bg-slate-100 text-slate-500">{signals.length}</span>}
        </div>
        {loadingSignals ? (
          <div className="px-5 py-8 flex justify-center">
            <Loader2 size={16} className="animate-spin text-slate-300" />
          </div>
        ) : signals.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-400 text-center">
            No signals yet. Click &quot;Research with Exa&quot; to pull signals for this company.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {signals.map(s => (
              <div key={s.id} className="px-5 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium text-slate-800 leading-snug">{s.title}</p>
                  {s.relevance_score != null && (
                    <span className={cn(
                      "text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0",
                      s.relevance_score >= 0.7 ? "bg-green-100 text-green-700" :
                      s.relevance_score >= 0.5 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"
                    )}>
                      {Math.round(s.relevance_score * 100)}%
                    </span>
                  )}
                </div>
                {s.summary && <p className="text-xs text-slate-500 mt-1 leading-relaxed line-clamp-2">{s.summary}</p>}
                <div className="flex items-center gap-2 mt-1.5">
                  {s.source && <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{s.source}</span>}
                  {s.url && (
                    <a href={s.url} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] text-blue-500 hover:text-blue-700 flex items-center gap-0.5">
                      <ExternalLink size={9} /> Source
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function CompanyDetailClient({
  company: initialCompany,
  contacts: initContacts,
  interactions: initInteractions,
  deals,
  memos,
}: Props) {
  const supabase = createClient();

  // Company state — updated after Edit saves
  const [company, setCompany] = useState(initialCompany);
  const [tab, setTab]         = useState<Tab>("Overview");
  const [contacts, setContacts]             = useState(initContacts);
  const [interactions, setInteractions]     = useState(initInteractions);
  const [showEditModal, setShowEditModal]   = useState(false);
  const [showNoteForm, setShowNoteForm]     = useState(false);
  const [noteText, setNoteText]             = useState("");
  const [savingNote, setSavingNote]         = useState(false);
  const [showContactForm, setShowContactForm]   = useState(false);
  const [contactForm, setContactForm]           = useState<Partial<Contact>>({ type: "Founder / Mgmt" as Contact["type"] });
  const [savingContact, setSavingContact]       = useState(false);
  const [showInteractionForm, setShowInteractionForm] = useState(false);
  const [interactionForm, setInteractionForm] = useState({
    type: "meeting" as "meeting" | "call" | "email" | "note",
    subject: "",
    date: new Date().toISOString().slice(0, 10),
    body: "",
    sentiment: "" as "" | "positive" | "neutral" | "negative",
  });
  const [savingInteraction, setSavingInteraction]     = useState(false);
  const [loadingMoreInteractions, setLoadingMoreInteractions] = useState(false);

  async function saveNote() {
    if (!noteText.trim()) return;
    setSavingNote(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase
      .from("interactions")
      .insert({ type: "note", body: noteText, company_id: company.id, date: new Date().toISOString(), created_by: user?.id })
      .select().single();
    setSavingNote(false);
    if (data) { setInteractions(p => [data, ...p]); setNoteText(""); setShowNoteForm(false); }
  }

  async function saveContact(e: React.FormEvent) {
    e.preventDefault();
    setSavingContact(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase
      .from("contacts")
      .insert({ ...contactForm, company_id: company.id, created_by: user?.id })
      .select().single();
    setSavingContact(false);
    if (data) {
      setContacts(p => [data, ...p]);
      setShowContactForm(false);
      setContactForm({ type: "Founder / Mgmt" as Contact["type"] });
    }
  }

  async function saveInteraction(e: React.FormEvent) {
    e.preventDefault();
    setSavingInteraction(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data } = await supabase
      .from("interactions")
      .insert({
        type: interactionForm.type,
        subject: interactionForm.subject || null,
        body: interactionForm.body || null,
        date: new Date(interactionForm.date).toISOString(),
        company_id: company.id,
        sentiment: interactionForm.sentiment || null,
        created_by: user?.id,
      })
      .select().single();
    setSavingInteraction(false);
    if (data) {
      setInteractions(p => [data, ...p]);
      setShowInteractionForm(false);
      setInteractionForm({ type: "meeting", subject: "", date: new Date().toISOString().slice(0, 10), body: "", sentiment: "" });
    }
  }

  const deals_sorted = deals.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // ── Header quick-stats per type ────────────────────────────────────────────
  type Stat = { label: string; value: React.ReactNode };

  const headerStats: Stat[] = (() => {
    if (company.type === "startup") return [
      { label: "Total Raised",  value: company.funding_raised ? formatCurrency(company.funding_raised, true) : "—" },
      { label: "Stage",         value: company.stage ? <span className="capitalize">{company.stage.replace(/_/g, " ")}</span> : "—" },
      { label: "Deal Status",   value: company.deal_status
          ? <span className={cn("badge text-xs", DEAL_STAGE_COLORS[company.deal_status] ?? "bg-slate-100")}>{DEAL_STAGE_LABELS[company.deal_status] ?? company.deal_status}</span>
          : "—" },
      { label: "Priority",      value: company.priority
          ? <span className={cn("badge text-xs", PRIORITY_COLORS[company.priority] ?? "bg-slate-100")}>{company.priority}</span>
          : "—" },
      { label: "Runway",        value: company.runway_months != null ? `${company.runway_months}mo` : "—" },
      { label: "Last Contact",  value: formatDate(company.last_contact_date) },
    ];
    if (company.type === "lp") return [
      { label: "AUM",            value: company.aum ? formatCurrency(company.aum, true) : "—" },
      { label: "LP Type",        value: company.lp_type ? company.lp_type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()) : "—" },
      { label: "LP Stage",       value: company.lp_stage
          ? <span className={cn("badge text-xs", LP_STAGE_COLORS[company.lp_stage] ?? "bg-slate-100")}>{LP_STAGE_LABELS[company.lp_stage] ?? company.lp_stage}</span>
          : "—" },
      { label: "Commitment Goal", value: company.commitment_goal ? formatCurrency(company.commitment_goal, true) : "—" },
      { label: "Last Contact",   value: formatDate(company.last_contact_date) },
    ];
    if (company.type === "fund") return [
      { label: "AUM",          value: company.aum ? formatCurrency(company.aum, true) : "—" },
      { label: "Investor Type", value: company.investor_type ?? "—" },
      { label: "Fund Focus",   value: company.fund_focus ? <span className="truncate max-w-[120px] block">{company.fund_focus}</span> : "—" },
      { label: "Deal Status",  value: company.deal_status
          ? <span className={cn("badge text-xs", DEAL_STAGE_COLORS[company.deal_status] ?? "bg-slate-100")}>{DEAL_STAGE_LABELS[company.deal_status] ?? company.deal_status}</span>
          : "—" },
      { label: "Last Contact", value: formatDate(company.last_contact_date) },
    ];
    if (company.type === "corporate") return [
      { label: "Strategic Type", value: company.strategic_type ?? "—" },
      { label: "Employees",      value: company.employee_count ?? "—" },
      { label: "Founded",        value: company.founded_year ?? "—" },
      { label: "Deal Status",    value: company.deal_status
          ? <span className={cn("badge text-xs", DEAL_STAGE_COLORS[company.deal_status] ?? "bg-slate-100")}>{DEAL_STAGE_LABELS[company.deal_status] ?? company.deal_status}</span>
          : "—" },
      { label: "Last Contact",   value: formatDate(company.last_contact_date) },
    ];
    // ecosystem_partner / government / other
    return [
      { label: "Employees",    value: company.employee_count ?? "—" },
      { label: "Founded",      value: company.founded_year ?? "—" },
      { label: "Last Contact", value: formatDate(company.last_contact_date) },
    ];
  })();

  return (
    <div className="flex-1 overflow-auto p-6 space-y-4">

      {/* ── Header card ── */}
      <div className="card p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Avatar / logo */}
            {company.logo_url ? (
              <img
                src={company.logo_url}
                alt={company.name}
                className="w-14 h-14 rounded-xl object-contain border border-slate-100 bg-white flex-shrink-0"
              />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white font-bold text-xl flex-shrink-0">
                {getInitials(company.name)}
              </div>
            )}

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-slate-900">{company.name}</h1>
                <span className={cn("badge capitalize", COMPANY_TYPE_COLORS[company.type] ?? "bg-slate-100 text-slate-600")}>
                  {company.type.replace(/_/g, " ")}
                </span>
                {company.current_raise_status && company.current_raise_status !== "not_raising" && (
                  <span className={cn("badge", RAISE_STATUS_COLORS[company.current_raise_status] ?? "bg-slate-100 text-slate-500")}>
                    {RAISE_STATUS_LABELS[company.current_raise_status]}
                  </span>
                )}
              </div>
              {company.description && (
                <p className="text-sm text-slate-500 mt-1 max-w-lg leading-relaxed">{company.description}</p>
              )}
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                {company.location_city && (
                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <MapPin size={12} /> {[company.location_city, company.location_country].filter(Boolean).join(", ")}
                  </span>
                )}
                {company.founded_year && (
                  <span className="text-xs text-slate-500">Founded {company.founded_year}</span>
                )}
              </div>
            </div>
          </div>

          {/* Links + Edit */}
          <div className="flex gap-2 flex-shrink-0 items-start">
            {company.website && (
              <a href={company.website} target="_blank" rel="noopener noreferrer"
                className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-blue-600 transition-colors" title="Website">
                <Globe size={16} />
              </a>
            )}
            {company.linkedin_url && (
              <a href={company.linkedin_url} target="_blank" rel="noopener noreferrer"
                className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-blue-600 transition-colors" title="LinkedIn">
                <Linkedin size={16} />
              </a>
            )}
            {company.crunchbase_url && (
              <a href={company.crunchbase_url} target="_blank" rel="noopener noreferrer"
                className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-blue-600 transition-colors" title="Crunchbase">
                <ExternalLink size={16} />
              </a>
            )}
            <button
              onClick={() => setShowEditModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-blue-600 text-xs font-medium transition-colors"
            >
              <Edit2 size={13} /> Edit
            </button>
          </div>
        </div>

        {/* Quick stats row */}
        <div className={cn(
          "grid gap-4 mt-4 pt-4 border-t border-slate-100",
          headerStats.length <= 3 ? "grid-cols-3" :
          headerStats.length <= 4 ? "grid-cols-4" :
          headerStats.length <= 5 ? "grid-cols-5" : "grid-cols-6"
        )}>
          {headerStats.map(({ label, value }) => (
            <div key={label}>
              <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">{label}</p>
              <div className="text-sm font-semibold text-slate-800 mt-0.5">{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              tab === t
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            {t}
            {t === "Contacts" && contacts.length > 0 && <span className="ml-1.5 badge bg-slate-100 text-slate-500">{contacts.length}</span>}
            {t === "Interactions" && interactions.length > 0 && <span className="ml-1.5 badge bg-slate-100 text-slate-500">{interactions.length}</span>}
            {t === "Memos" && memos.length > 0 && <span className="ml-1.5 badge bg-slate-100 text-slate-500">{memos.length}</span>}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === "Overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Left: Notes + (Startup) Fundraise status card */}
          <div className="lg:col-span-2 space-y-4">

            {/* Notes */}
            <div className="card p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-slate-800">Notes</h3>
                <button onClick={() => setShowNoteForm(!showNoteForm)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
                  <Plus size={12} /> Add note
                </button>
              </div>
              {showNoteForm && (
                <div className="mb-4 space-y-2">
                  <textarea
                    className="textarea"
                    rows={3}
                    placeholder="Add a note…"
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button onClick={() => setShowNoteForm(false)} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                    <button onClick={saveNote} disabled={savingNote || !noteText.trim()} className="px-3 py-1 bg-blue-600 text-white text-xs rounded-lg disabled:opacity-50">
                      {savingNote ? "Saving…" : "Save note"}
                    </button>
                  </div>
                </div>
              )}
              <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                {company.notes || <span className="text-slate-400 italic">No notes yet. Click + Add note to get started.</span>}
              </p>
            </div>

            {/* Startup: Fundraise status card */}
            {company.type === "startup" && (company.current_raise_status || company.raise_round || company.current_raise_target || company.raise_target_close || company.investors_approached != null || company.term_sheets != null) && (
              <div className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-slate-800">Fundraise Status</h3>
                  {company.current_raise_status && (
                    <span className={cn("badge", RAISE_STATUS_COLORS[company.current_raise_status] ?? "bg-slate-100 text-slate-500")}>
                      {RAISE_STATUS_LABELS[company.current_raise_status] ?? company.current_raise_status}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {company.raise_round && (
                    <div>
                      <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">Round</p>
                      <p className="text-sm font-semibold text-slate-800 mt-0.5">{company.raise_round}</p>
                    </div>
                  )}
                  {company.current_raise_target && (
                    <div>
                      <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">Target</p>
                      <p className="text-sm font-semibold text-slate-800 mt-0.5">{company.current_raise_target}</p>
                    </div>
                  )}
                  {company.raise_target_close && (
                    <div>
                      <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">Target Close</p>
                      <p className="text-sm font-semibold text-slate-800 mt-0.5">{formatDate(company.raise_target_close)}</p>
                    </div>
                  )}
                  {company.investors_approached != null && (
                    <div>
                      <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">Investors Approached</p>
                      <p className="text-sm font-semibold text-slate-800 mt-0.5">{company.investors_approached}</p>
                    </div>
                  )}
                  {company.term_sheets != null && (
                    <div>
                      <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">Term Sheets</p>
                      <p className="text-sm font-semibold text-slate-800 mt-0.5">{company.term_sheets}</p>
                    </div>
                  )}
                  {company.runway_months != null && (
                    <div>
                      <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">Runway</p>
                      <p className="text-sm font-semibold text-slate-800 mt-0.5">{company.runway_months} months</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right: Company Profile card */}
          <div>
            <CompanyProfileCard
              company={company}
              onEdit={() => setShowEditModal(true)}
              onDeckChange={url => setCompany(prev => ({ ...prev, pitch_deck_url: url }))}
            />
          </div>
        </div>
      )}

      {/* ── CONTACTS TAB ── */}
      {tab === "Contacts" && (
        <div className="card">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Contacts at {company.name}</h3>
            <button onClick={() => setShowContactForm(!showContactForm)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium">
              <Plus size={12} /> Add contact
            </button>
          </div>

          {showContactForm && (
            <form onSubmit={saveContact} className="p-5 bg-slate-50 border-b border-slate-200 grid grid-cols-2 gap-3">
              <input required className="input" placeholder="First name *" value={contactForm.first_name ?? ""} onChange={e => setContactForm(p => ({ ...p, first_name: e.target.value }))} />
              <input required className="input" placeholder="Last name *" value={contactForm.last_name ?? ""} onChange={e => setContactForm(p => ({ ...p, last_name: e.target.value }))} />
              <input className="input" placeholder="Email" type="email" value={contactForm.email ?? ""} onChange={e => setContactForm(p => ({ ...p, email: e.target.value }))} />
              <input className="input" placeholder="Title / Role" value={contactForm.title ?? ""} onChange={e => setContactForm(p => ({ ...p, title: e.target.value }))} />
              <select className="select" value={contactForm.type} onChange={e => setContactForm(p => ({ ...p, type: e.target.value as Contact["type"] }))}>
                <option value="Founder / Mgmt">Founder / Mgmt</option>
                <option value="Investor">Investor</option>
                <option value="Limited Partner">Limited Partner</option>
                <option value="Strategic">Strategic</option>
                <option value="Ecosystem">Ecosystem</option>
                <option value="Advisor / KOL">Advisor / KOL</option>
                <option value="Employee">Employee</option>
                <option value="Lawyer">Lawyer</option>
                <option value="Government/Academic">Government/Academic</option>
                <option value="Other">Other</option>
              </select>
              <select className="select" value={contactForm.relationship_strength ?? ""} onChange={e => setContactForm(p => ({ ...p, relationship_strength: e.target.value as Contact["relationship_strength"] }))}>
                <option value="">Relationship strength</option>
                <option value="strong">Strong</option>
                <option value="medium">Medium</option>
                <option value="weak">Weak</option>
                <option value="new">New</option>
              </select>
              <div className="col-span-2 flex gap-2">
                <button type="button" onClick={() => setShowContactForm(false)} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
                <button type="submit" disabled={savingContact} className="px-3 py-1 bg-blue-600 text-white text-xs rounded-lg disabled:opacity-50">
                  {savingContact ? "Saving…" : "Add contact"}
                </button>
              </div>
            </form>
          )}

          <div className="divide-y divide-slate-100">
            {contacts.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-400 text-center">No contacts yet.</p>
            ) : (
              contacts.map(c => (
                <div key={c.id} className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-600">
                      {getInitials(`${c.first_name} ${c.last_name}`)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{c.first_name} {c.last_name}</p>
                      <p className="text-xs text-slate-400">{c.title ?? c.type}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {c.email && <a href={`mailto:${c.email}`} className="text-slate-400 hover:text-blue-600"><Mail size={14} /></a>}
                    {c.phone && <a href={`tel:${c.phone}`} className="text-slate-400 hover:text-blue-600"><Phone size={14} /></a>}
                    {c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-blue-600"><Linkedin size={14} /></a>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── INTERACTIONS TAB ── */}
      {tab === "Interactions" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowInteractionForm(!showInteractionForm)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={13} /> Log Interaction
            </button>
          </div>

          {showInteractionForm && (
            <div className="card p-5 border-blue-100 bg-blue-50/30">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">Log New Interaction</h3>
              <form onSubmit={saveInteraction} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Type</label>
                    <select
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      value={interactionForm.type}
                      onChange={e => setInteractionForm(p => ({ ...p, type: e.target.value as typeof p.type }))}
                    >
                      <option value="meeting">Meeting</option>
                      <option value="call">Call</option>
                      <option value="email">Email</option>
                      <option value="note">Note</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1.5">Date</label>
                    <input
                      type="date"
                      className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      value={interactionForm.date}
                      onChange={e => setInteractionForm(p => ({ ...p, date: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Subject / Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Intro call with CEO"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    value={interactionForm.subject}
                    onChange={e => setInteractionForm(p => ({ ...p, subject: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Notes / Summary</label>
                  <textarea
                    rows={3}
                    placeholder="Key points, next steps, context…"
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 resize-none"
                    value={interactionForm.body}
                    onChange={e => setInteractionForm(p => ({ ...p, body: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5">Sentiment</label>
                  <div className="flex gap-2">
                    {(["positive", "neutral", "negative"] as const).map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setInteractionForm(p => ({ ...p, sentiment: p.sentiment === s ? "" : s }))}
                        className={cn(
                          "px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors capitalize",
                          interactionForm.sentiment === s
                            ? s === "positive" ? "bg-green-100 text-green-700 border-green-300"
                              : s === "negative" ? "bg-red-100 text-red-600 border-red-300"
                              : "bg-slate-100 text-slate-700 border-slate-300"
                            : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                        )}
                      >
                        {s === "positive" ? "😊 Positive" : s === "negative" ? "😟 Negative" : "😐 Neutral"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button type="button" onClick={() => setShowInteractionForm(false)} className="px-3 py-2 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">
                    Cancel
                  </button>
                  <button type="submit" disabled={savingInteraction} className="px-4 py-2 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
                    {savingInteraction ? "Saving…" : "Log Interaction"}
                  </button>
                </div>
              </form>
            </div>
          )}

          <InteractionsTab interactions={interactions} />

          {interactions.length >= 50 && (
            <div className="flex justify-center pt-2">
              <button
                onClick={async () => {
                  setLoadingMoreInteractions(true);
                  const { data } = await supabase
                    .from("interactions")
                    .select("*")
                    .eq("company_id", company.id)
                    .order("date", { ascending: false })
                    .range(interactions.length, interactions.length + 49);
                  if (data && data.length > 0) {
                    setInteractions(prev => [...prev, ...(data as typeof interactions)]);
                  }
                  setLoadingMoreInteractions(false);
                }}
                disabled={loadingMoreInteractions}
                className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                {loadingMoreInteractions ? "Loading…" : "Load more interactions"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── MEMOS TAB ── */}
      {tab === "Memos" && (
        <div className="card">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">IC Memos</h3>
            <Link href="/memos" className="text-xs text-blue-600 hover:text-blue-700 font-medium">
              View all memos →
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {memos.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <FileText className="mx-auto text-slate-300 mb-2" size={28} />
                <p className="text-sm text-slate-400">No memos yet.</p>
                <p className="text-xs text-slate-400 mt-1">Click <strong>Generate IC Memo</strong> in the header to create one.</p>
              </div>
            ) : (
              memos.map(memo => (
                <Link
                  key={memo.id}
                  href={`/memos/${memo.id}`}
                  className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">{memo.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5" suppressHydrationWarning>
                      {new Date(memo.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {memo.recommendation && (
                      <span className={cn("badge capitalize", REC_COLORS[memo.recommendation] ?? "bg-slate-100 text-slate-500")}>
                        {memo.recommendation.replace("_", " ")}
                      </span>
                    )}
                    <span className="badge bg-slate-100 text-slate-500 capitalize">
                      {memo.status.replace("_", " ")}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── DEALS TAB ── */}
      {tab === "Deals" && (
        <div className="card">
          <div className="px-5 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-800">Deals</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {deals_sorted.length === 0 ? (
              <p className="px-5 py-8 text-sm text-slate-400 text-center">No deals yet.</p>
            ) : (
              deals_sorted.map(d => (
                <div key={d.id} className="px-5 py-3 flex items-center justify-between">
                  <div>
                    <span className={cn("badge capitalize", DEAL_STAGE_COLORS[d.stage] ?? "bg-slate-100")}>
                      {DEAL_STAGE_LABELS[d.stage] ?? d.stage}
                    </span>
                    {d.investment_amount && (
                      <p className="text-sm font-semibold text-slate-800 mt-1">{formatCurrency(d.investment_amount, true)}</p>
                    )}
                    {d.instrument && <p className="text-xs text-slate-500 capitalize">{d.instrument.replace("_", " ")}</p>}
                  </div>
                  <div className="text-right text-xs text-slate-400">
                    {d.valuation_cap && <p>Cap: {formatCurrency(d.valuation_cap, true)}</p>}
                    {d.ic_date && <p>IC: {formatDate(d.ic_date)}</p>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── INTELLIGENCE TAB ── */}
      {tab === "Intelligence" && (
        <IntelligenceTab companyId={company.id} />
      )}

      {/* ── Edit Modal ── */}
      {showEditModal && (
        <EditCompanyModal
          company={company}
          onSave={updated => setCompany(updated)}
          onClose={() => setShowEditModal(false)}
        />
      )}

    </div>
  );
}
