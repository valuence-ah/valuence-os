"use client";
// ─── Company Detail Client ────────────────────────────────────────────────────
// Type-aware company detail page with inline editing.
// Startup · Fund · LP · Corporate · Ecosystem Partner · Government
// Tabs: Overview | Contacts | Interactions | Deals | Memos | Intelligence

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Company, Contact, Interaction, Deal, CompanyType } from "@/lib/types";
import type { CompanyDocument } from "@/app/(dashboard)/crm/companies/[id]/page";
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
  Edit2, Folder, X, Upload, ImageIcon, Trash2, Merge, Search,
} from "lucide-react";
import Link from "next/link";
import type { IcMemo } from "@/lib/types";

// ── Type grouping ─────────────────────────────────────────────────────────────
type TypeGroup = "startup" | "investor" | "strategic" | "lp" | "other";

function getTypeGroup(type: string): TypeGroup {
  const t = (type ?? "").toLowerCase();
  if (t === "startup") return "startup";
  if (t === "investor" || t === "fund" || t === "fund / vc" || t === "fund/vc") return "investor";
  if (t === "strategic partner" || t === "corporate" || t === "government" || t === "ecosystem_partner") return "strategic";
  if (t === "lp" || t === "limited partner") return "lp";
  return "other";
}

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

const STAGE_LABELS: Record<string, string> = {
  "pre-seed": "Pre-Seed",
  "seed":     "Seed",
  "series_a": "Series A",
  "series_b": "Series B",
  "series_c": "Series C",
  "growth":   "Growth",
};

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
  documents: CompanyDocument[];
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
                  <label className="block text-xs font-medium text-slate-600 mb-1">Runway (months)</label>
                  <input className="input" type="number" placeholder="18" value={form.runway_months ?? ""} onChange={e => setF("runway_months", parseInt(e.target.value) || null)} />
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
  documents,
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

  const router = useRouter();
  const deals_sorted = deals.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // ── Type group + overdue banner ───────────────────────────────────────────
  const typeGroup = getTypeGroup(company.type);
  const isLp = typeGroup === "lp";
  const daysSinceContact = company.last_contact_date
    ? Math.floor((Date.now() - new Date(company.last_contact_date).getTime()) / 86400000)
    : null;
  const showOverdueBanner = isLp && daysSinceContact !== null && daysSinceContact > 30;

  // ── Action strip state ────────────────────────────────────────────────────
  const [memoGenerating, setMemoGenerating] = useState(false);
  const [exaActionLoading, setExaActionLoading] = useState(false);
  const [showLogoPicker, setShowLogoPicker] = useState(false);
  const [logoUrlInput, setLogoUrlInput]     = useState("");
  const [logoFinding, setLogoFinding]       = useState(false);
  const [logoMsg, setLogoMsg]               = useState<string | null>(null);

  // ── Merge state ───────────────────────────────────────────────────────────
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeSearch, setMergeSearch]       = useState("");
  const [mergeCandidates, setMergeCandidates] = useState<{ id: string; name: string; type: string }[]>([]);
  const [mergeTargetId, setMergeTargetId]   = useState<string | null>(null);
  const [mergeSaving, setMergeSaving]       = useState(false);
  const mergeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Delete state ──────────────────────────────────────────────────────────
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting]                   = useState(false);

  const [showTypePicker, setShowTypePicker] = useState(false);
  const typePickerRef = useRef<HTMLDivElement>(null);

  const TYPE_OPTIONS: { value: CompanyType; label: string }[] = [
    { value: "startup",          label: "Startup" },
    { value: "fund",             label: "Fund / VC" },
    { value: "lp",               label: "LP" },
    { value: "corporate",        label: "Corporate" },
    { value: "ecosystem_partner",label: "Ecosystem Partner" },
    { value: "government",       label: "Government" },
    { value: "other",            label: "Other" },
  ];

  async function updateType(newType: CompanyType) {
    setShowTypePicker(false);
    const prev = company;
    setCompany(c => ({ ...c, type: newType }));
    await supabase.from("companies").update({ type: newType }).eq("id", company.id);
    // Refresh to get updated typeGroup
    setCompany(c => ({ ...c, type: newType }));
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    void prev;
  }

  // Close type picker on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (typePickerRef.current && !typePickerRef.current.contains(e.target as Node)) {
        setShowTypePicker(false);
      }
    }
    if (showTypePicker) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showTypePicker]);

  // ── Sector / Sub-sector / Stage inline pickers ───────────────────────────
  const [showSectorPicker, setShowSectorPicker]       = useState(false);
  const [showSubSectorPicker, setShowSubSectorPicker] = useState(false);
  const [showStagePicker, setShowStagePicker]         = useState(false);
  const sectorPickerRef    = useRef<HTMLDivElement>(null);
  const subSectorPickerRef = useRef<HTMLDivElement>(null);
  const stagePickerRef     = useRef<HTMLDivElement>(null);

  async function updateSector(newSector: string) {
    setShowSectorPicker(false);
    const updated = [newSector, (company.sectors ?? [])[1] ?? null].filter(Boolean) as string[];
    setCompany(c => ({ ...c, sectors: updated }));
    await supabase.from("companies").update({ sectors: updated }).eq("id", company.id);
  }
  async function updateSubSector(newSector: string) {
    setShowSubSectorPicker(false);
    const updated = [(company.sectors ?? [])[0] ?? null, newSector].filter(Boolean) as string[];
    setCompany(c => ({ ...c, sectors: updated }));
    await supabase.from("companies").update({ sectors: updated }).eq("id", company.id);
  }
  async function updateStage(newStage: string) {
    setShowStagePicker(false);
    setCompany(c => ({ ...c, stage: newStage || null }));
    await supabase.from("companies").update({ stage: newStage || null }).eq("id", company.id);
  }

  useEffect(() => {
    function h(e: MouseEvent) { if (sectorPickerRef.current && !sectorPickerRef.current.contains(e.target as Node)) setShowSectorPicker(false); }
    if (showSectorPicker) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showSectorPicker]);
  useEffect(() => {
    function h(e: MouseEvent) { if (subSectorPickerRef.current && !subSectorPickerRef.current.contains(e.target as Node)) setShowSubSectorPicker(false); }
    if (showSubSectorPicker) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showSubSectorPicker]);
  useEffect(() => {
    function h(e: MouseEvent) { if (stagePickerRef.current && !stagePickerRef.current.contains(e.target as Node)) setShowStagePicker(false); }
    if (showStagePicker) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showStagePicker]);

  // Auto-load logo via logo.dev if not set
  useEffect(() => {
    if (company.logo_url || !company.website) return;
    const token = process.env.NEXT_PUBLIC_LOGO_DEV_TOKEN;
    if (!token) return;
    try {
      const url = new URL(company.website);
      const domain = url.hostname.replace(/^www\./, "");
      const logoUrl = `https://img.logo.dev/${domain}?token=${token}&size=80&format=png`;
      // Probe if it loads — set an img to check
      const img = new Image();
      img.onload = async () => {
        setCompany(c => ({ ...c, logo_url: logoUrl }));
        await supabase.from("companies").update({ logo_url: logoUrl }).eq("id", company.id);
      };
      img.onerror = () => { /* silently ignore */ };
      img.src = logoUrl;
    } catch { /* invalid URL, skip */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company.id]);

  async function generateMemo() {
    setMemoGenerating(true);
    try {
      const res = await fetch("/api/memos/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: company.id }),
      });
      const json = await res.json();
      if (json.data?.id) router.push(`/memos/${json.data.id}`);
    } catch { /* ignore */ } finally { setMemoGenerating(false); }
  }

  async function runExaAction() {
    setExaActionLoading(true);
    try {
      await fetch("/api/agents/exa-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: company.id }),
      });
    } catch { /* ignore */ } finally { setExaActionLoading(false); }
  }

  async function handleManualLogo() {
    if (!logoUrlInput.trim()) return;
    const url = logoUrlInput.trim();
    await supabase.from("companies").update({ logo_url: url }).eq("id", company.id);
    setCompany(c => ({ ...c, logo_url: url }));
    setShowLogoPicker(false);
    setLogoUrlInput("");
    setLogoMsg(null);
  }

  async function handleAutoFindLogo() {
    setLogoFinding(true);
    setLogoMsg(null);
    try {
      const res  = await fetch("/api/logo-finder/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id }),
      });
      const data = await res.json();
      if (data.success && data.logo_url) {
        setCompany(c => ({ ...c, logo_url: data.logo_url }));
        setShowLogoPicker(false);
        setLogoMsg(null);
      } else {
        setLogoMsg("Logo not found — try entering a URL manually.");
      }
    } catch {
      setLogoMsg("Error finding logo.");
    }
    setLogoFinding(false);
  }

  // ── Merge search ──────────────────────────────────────────────────────────
  function handleMergeSearchChange(q: string) {
    setMergeSearch(q);
    setMergeTargetId(null);
    if (mergeTimer.current) clearTimeout(mergeTimer.current);
    if (!q.trim()) { setMergeCandidates([]); return; }
    mergeTimer.current = setTimeout(async () => {
      const { data } = await supabase.from("companies").select("id, name, type")
        .ilike("name", `%${q}%`).neq("id", company.id).limit(8);
      setMergeCandidates((data ?? []) as { id: string; name: string; type: string }[]);
    }, 300);
  }

  async function executeMerge() {
    if (!mergeTargetId) return;
    setMergeSaving(true);
    // Move all related records to target company
    await Promise.all([
      supabase.from("contacts").update({ company_id: mergeTargetId }).eq("company_id", company.id),
      supabase.from("interactions").update({ company_id: mergeTargetId }).eq("company_id", company.id),
      supabase.from("deals").update({ company_id: mergeTargetId }).eq("company_id", company.id),
      supabase.from("documents").update({ company_id: mergeTargetId }).eq("company_id", company.id),
      supabase.from("ic_memos").update({ company_id: mergeTargetId }).eq("company_id", company.id),
    ]);
    // Delete the source (current) company
    await supabase.from("companies").delete().eq("id", company.id);
    // Navigate to the target company
    router.push(`/crm/companies/${mergeTargetId}`);
  }

  // ── Delete company ────────────────────────────────────────────────────────
  async function executeDelete() {
    setDeleting(true);
    await supabase.from("companies").delete().eq("id", company.id);
    router.push("/crm/companies");
  }

  // ── 4-cell stat bar (always 4 cells, last = Last Contact) ─────────────────
  type StatCell = { label: string; value: React.ReactNode };
  const lastContactCell: StatCell = { label: "Last Contact", value: company.last_contact_date ? <span className="text-xs font-medium text-slate-600">{formatDate(company.last_contact_date)}</span> : "—" };

  const statBar: StatCell[] = (() => {
    const pickerDropdownCls = "absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1 min-w-[170px] max-h-[220px] overflow-y-auto";
    const pickerItemCls = (active: boolean) => cn("w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors capitalize", active ? "font-semibold text-blue-600" : "text-slate-700");
    const pickerBtnCls = "inline-flex items-center gap-1 badge text-xs bg-slate-100 text-slate-700 capitalize cursor-pointer hover:bg-slate-200 transition-colors select-none";

    if (typeGroup === "startup") return [
      { label: "Sector", value: (
        <div className="relative" ref={sectorPickerRef}>
          <button onClick={() => setShowSectorPicker(v => !v)} className={pickerBtnCls}>
            {company.sectors?.[0] ?? <span className="italic text-slate-400">Set sector</span>}
            <ChevronDown size={9} />
          </button>
          {showSectorPicker && (
            <div className={pickerDropdownCls}>
              {SECTORS.map(s => (
                <button key={s} onClick={() => updateSector(s.toLowerCase())} className={pickerItemCls((company.sectors?.[0] ?? "") === s.toLowerCase())}>{s}</button>
              ))}
            </div>
          )}
        </div>
      )},
      { label: "Sub-sector", value: (
        <div className="relative" ref={subSectorPickerRef}>
          <button onClick={() => setShowSubSectorPicker(v => !v)} className={pickerBtnCls}>
            {company.sectors?.[1] ?? <span className="italic text-slate-400">Set sub-sector</span>}
            <ChevronDown size={9} />
          </button>
          {showSubSectorPicker && (
            <div className={pickerDropdownCls}>
              {SECTORS.map(s => (
                <button key={s} onClick={() => updateSubSector(s.toLowerCase())} className={pickerItemCls((company.sectors?.[1] ?? "") === s.toLowerCase())}>{s}</button>
              ))}
            </div>
          )}
        </div>
      )},
      { label: "Status", value: company.deal_status
          ? <span className={cn("badge text-xs", DEAL_STAGE_COLORS[company.deal_status] ?? "bg-slate-100 text-slate-600")}>{DEAL_STAGE_LABELS[company.deal_status] ?? company.deal_status.replace(/_/g, " ")}</span>
          : "—" },
      { label: "Stage", value: (
        <div className="relative" ref={stagePickerRef}>
          <button onClick={() => setShowStagePicker(v => !v)} className={pickerBtnCls}>
            {company.stage ? STAGE_LABELS[company.stage] ?? company.stage : <span className="italic text-slate-400">Set stage</span>}
            <ChevronDown size={9} />
          </button>
          {showStagePicker && (
            <div className={pickerDropdownCls}>
              {STAGE_OPTIONS.map(s => (
                <button key={s} onClick={() => updateStage(s)} className={pickerItemCls(company.stage === s)}>{STAGE_LABELS[s] ?? s}</button>
              ))}
            </div>
          )}
        </div>
      )},
      lastContactCell,
    ];
    if (typeGroup === "investor") return [
      { label: "AUM",          value: company.aum ? formatCurrency(company.aum, true) : "—" },
      { label: "Investor Type",value: company.investor_type ?? "—" },
      { label: "Stage Focus",  value: company.fund_focus ? company.fund_focus.slice(0, 30) + (company.fund_focus.length > 30 ? "…" : "") : "—" },
      lastContactCell,
    ];
    if (typeGroup === "strategic") return [
      { label: "Employees", value: company.employee_count ?? "—" },
      { label: "Founded",   value: company.founded_year ?? "—" },
      { label: "Sectors",   value: company.sectors?.slice(0, 2).join(", ") || "—" },
      lastContactCell,
    ];
    if (typeGroup === "lp") return [
      { label: "LP Stage", value: company.lp_stage
          ? <span className={cn("badge text-xs", LP_STAGE_COLORS[company.lp_stage] ?? "bg-slate-100 text-slate-500")}>{LP_STAGE_LABELS[company.lp_stage] ?? company.lp_stage}</span>
          : "—" },
      { label: "LP Type", value: company.lp_type
          ? <span className="capitalize">{company.lp_type.replace(/_/g, " ")}</span>
          : "—" },
      { label: "Commitment Goal", value: company.commitment_goal ? formatCurrency(company.commitment_goal, true) : "—" },
      lastContactCell,
    ];
    return [
      { label: "Type",    value: company.type },
      { label: "Founded", value: company.founded_year ?? "—" },
      { label: "Sectors", value: company.sectors?.slice(0, 2).join(", ") || "—" },
      lastContactCell,
    ];
  })();

  // Button style helpers
  const primaryBtn = "inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors font-medium";
  const secondaryBtn = "inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors";

  return (
    <div className="flex-1 overflow-auto p-6 space-y-4">

      {/* ── Header card ── */}
      <div className="card p-5">
        <div className="flex items-start gap-4">
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

          {/* Name + meta */}
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-slate-900 leading-tight">{company.name}</h1>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {/* Type picker button */}
              <div className="relative" ref={typePickerRef}>
                <button
                  onClick={() => setShowTypePicker(v => !v)}
                  className={cn("badge capitalize cursor-pointer hover:opacity-80 transition-opacity flex items-center gap-1", COMPANY_TYPE_COLORS[company.type] ?? "bg-slate-100 text-slate-600")}
                >
                  {company.type.replace(/_/g, " ")}
                  <ChevronDown size={10} />
                </button>
                {showTypePicker && (
                  <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1 min-w-[160px]">
                    {TYPE_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => updateType(opt.value)}
                        className={cn(
                          "w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors",
                          company.type === opt.value ? "font-semibold text-blue-600" : "text-slate-700"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {company.description && (
              <p className="text-sm text-slate-500 mt-2 leading-relaxed">{company.description}</p>
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

          {/* Links + Edit + Logo + Merge + Delete */}
          <div className="flex gap-2 flex-shrink-0 items-start flex-wrap">
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
            {/* Logo button + popup — identical to pipeline */}
            <div className="relative">
              <button
                onClick={() => { setShowLogoPicker(p => !p); setLogoMsg(null); setLogoUrlInput(""); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-medium transition-colors"
                title="Set company logo"
              >
                <ImageIcon size={13} /> Logo
              </button>
              {showLogoPicker && (
                <div className="absolute right-0 top-9 z-30 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-4 space-y-3">
                  <p className="text-xs font-semibold text-slate-700">Update Logo</p>
                  <div className="flex gap-2">
                    <input
                      autoFocus
                      className="flex-1 text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
                      placeholder="Paste logo URL…"
                      value={logoUrlInput}
                      onChange={e => setLogoUrlInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleManualLogo()}
                    />
                    <button
                      onClick={handleManualLogo}
                      disabled={!logoUrlInput.trim()}
                      className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-40"
                    >
                      Save
                    </button>
                  </div>
                  <button
                    onClick={handleAutoFindLogo}
                    disabled={logoFinding}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-100 disabled:opacity-50 transition-colors"
                  >
                    {logoFinding ? <><Loader2 size={12} className="animate-spin" /> Finding…</> : <><Sparkles size={12} /> Auto-find logo</>}
                  </button>
                  {logoMsg && <p className="text-xs text-slate-500">{logoMsg}</p>}
                  <button onClick={() => setShowLogoPicker(false)} className="text-xs text-slate-400 hover:text-slate-600 w-full text-center">Cancel</button>
                </div>
              )}
            </div>
            <button
              onClick={() => setShowEditModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-blue-600 text-xs font-medium transition-colors"
            >
              <Edit2 size={13} /> Edit
            </button>
            <button
              onClick={() => setShowMergeModal(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-violet-600 text-xs font-medium transition-colors"
              title="Merge this company into another"
            >
              <Merge size={13} /> Merge
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-100 text-red-500 hover:bg-red-50 text-xs font-medium transition-colors"
              title="Delete this company"
            >
              <Trash2 size={13} /> Delete
            </button>
          </div>
        </div>

        {/* Stat bar */}
        <div className={cn("grid gap-4 mt-4 pt-4 border-t border-slate-100", typeGroup === "startup" ? "grid-cols-5" : "grid-cols-4")}>
          {statBar.map(({ label, value }) => (
            <div key={label}>
              <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide">{label}</p>
              <div className="text-sm font-semibold text-slate-800 mt-0.5">{value}</div>
            </div>
          ))}
        </div>

        {/* Action strip */}
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100 flex-wrap">
          {typeGroup === "startup" && (
            <button onClick={generateMemo} disabled={memoGenerating} className={primaryBtn}>
              {memoGenerating ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
              {memoGenerating ? "Generating…" : "Generate IC Memo"}
            </button>
          )}
          {typeGroup === "investor" && (
            <Link href="/crm/funds" className={primaryBtn}>View in Funds ↗</Link>
          )}
          {typeGroup === "lp" && (<>
            <Link href="/crm/lps" className={primaryBtn}>View in Fundraising ↗</Link>
            <a href={`mailto:${contacts[0]?.email ?? ""}?subject=Following up — Valuence Ventures`} className={primaryBtn}>
              ✉ Draft Outreach
            </a>
            <button onClick={() => { setShowInteractionForm(true); setTab("Interactions"); }} className={secondaryBtn}>
              Log Touchpoint
            </button>
          </>)}
        </div>
      </div>

      {/* ── LP overdue banner ── */}
      {showOverdueBanner && (
        <div className="flex items-center justify-between px-5 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-center gap-2 text-sm text-amber-800">
            <AlertCircle size={14} className="text-amber-500" />
            Touchpoint overdue — last contact {daysSinceContact}d ago
          </div>
          <span className="badge bg-amber-100 text-amber-700">Follow up needed</span>
        </div>
      )}

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
        <>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* LEFT — shared: contacts · activity · notes */}
          <div className="card p-5 space-y-5">

            {/* Key contacts */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Contacts</h3>
                <button onClick={() => setTab("Contacts")} className="text-xs text-blue-600 hover:text-blue-700">
                  {contacts.length > 0 ? `All ${contacts.length} →` : "+ Add"}
                </button>
              </div>
              {contacts.length === 0 ? (
                <p className="text-sm text-slate-400 italic">No contacts yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {contacts.slice(0, 3).map(c => (
                    <div key={c.id} className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-semibold text-slate-600 flex-shrink-0">
                        {getInitials(`${c.first_name ?? ""} ${c.last_name ?? ""}`)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-800 truncate">{c.first_name} {c.last_name}</p>
                        <p className="text-xs text-slate-400 truncate">{c.title ?? c.type}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {c.email && <a href={`mailto:${c.email}`} className="text-slate-400 hover:text-blue-600"><Mail size={13} /></a>}
                        {c.last_contact_date && <span className="text-xs text-slate-400">{timeAgo(c.last_contact_date)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-slate-100" />

            {/* Recent activity */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Recent Activity</h3>
                <button onClick={() => setTab("Interactions")} className="text-xs text-blue-600 hover:text-blue-700">
                  {interactions.length > 0 ? `All ${interactions.length} →` : "+ Log"}
                </button>
              </div>
              {interactions.length === 0 ? (
                <p className="text-sm text-slate-400 italic">No interactions logged yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {interactions.slice(0, 3).map(i => (
                    <div key={i.id} className="flex items-start gap-2.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-slate-700 truncate">{i.subject ?? i.type}</p>
                        <p className="text-xs text-slate-400">{timeAgo(i.date)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>


          </div>

          {/* RIGHT — type-specific */}
          <div className="card p-5">

            {/* STARTUP */}
            {typeGroup === "startup" && (
              <div className="space-y-4">
                {/* Documents */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Documents</h3>
                  </div>
                  {/* Pitch deck — from documents table (type="deck") */}
                  <div className="mb-3">
                    <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide mb-1.5">Pitch Deck</p>
                    {(() => {
                      const decks = documents.filter(d => d.type === "deck");
                      if (decks.length === 0) return <p className="text-xs text-slate-400 italic">No deck linked</p>;
                      return (
                        <div className="space-y-1">
                          {decks.map(d => {
                            const url = d.file_url ?? d.google_drive_url ?? d.storage_path;
                            if (!url) return null;
                            return (
                              <a
                                key={d.id}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg font-medium mr-1"
                              >
                                <FileText size={12} /> {d.name || "Open Deck"}
                              </a>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                  {/* Meeting transcripts */}
                  <div>
                    <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide mb-1.5">Meeting Transcripts</p>
                    {interactions.filter(i => i.type === "meeting").length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No transcripts yet</p>
                    ) : (
                      <div className="space-y-1 max-h-[120px] overflow-y-auto">
                        {interactions.filter(i => i.type === "meeting").slice(0, 5).map(i => (
                          <div key={i.id} className="flex items-center gap-2 bg-slate-50 rounded-lg px-2.5 py-1.5">
                            <Mic size={11} className="text-violet-500 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs text-slate-700 truncate font-medium">{i.subject ?? "Meeting"}</p>
                              <p className="text-[10px] text-slate-400">{formatDate(i.date)}</p>
                            </div>
                            {i.transcript_url && (
                              <a href={i.transcript_url} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 flex-shrink-0">
                                <ExternalLink size={10} />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="border-t border-slate-100" />
                {/* Company Intelligence */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Company Intelligence</h3>
                    <button onClick={() => setTab("Intelligence")} className="text-xs text-blue-600 hover:text-blue-700">Full view →</button>
                  </div>
                  <button
                    onClick={() => setTab("Intelligence")}
                    className="w-full flex items-center gap-2 text-left bg-blue-50 hover:bg-blue-100 transition-colors rounded-lg px-3 py-2.5"
                  >
                    <Sparkles size={13} className="text-blue-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-blue-800">AI Intelligence &amp; Signals</p>
                      <p className="text-[11px] text-blue-600 mt-0.5">View news, research signals &amp; AI insights</p>
                    </div>
                  </button>
                  {/* IC Memos link */}
                  {memos.length > 0 && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wide">IC Memos</p>
                        <button onClick={() => setTab("Memos")} className="text-[10px] text-blue-600 hover:text-blue-700">All {memos.length} →</button>
                      </div>
                      <div className="space-y-0.5">
                        {memos.slice(0, 2).map(m => (
                          <Link key={m.id} href={`/memos/${m.id}`} className="block text-xs text-blue-600 hover:text-blue-700 truncate">
                            {m.title}
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* INVESTOR / FUND */}
            {typeGroup === "investor" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Fund Details</h3>
                  {company.fund_focus && (
                    <p className="text-sm text-slate-700 mb-3 leading-relaxed">{company.fund_focus}</p>
                  )}
                  <Link href="/crm/funds" className="text-xs text-blue-600 hover:text-blue-700 inline-block">
                    Full profile in Funds →
                  </Link>
                </div>
                <div className="border-t border-slate-100" />
                {/* Sectors */}
                {(company.sectors ?? []).length > 0 && (
                  <>
                    <div>
                      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Sectors</h3>
                      <div className="flex flex-wrap gap-1.5">
                        {company.sectors!.map(s => <span key={s} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded capitalize">{s}</span>)}
                      </div>
                    </div>
                    <div className="border-t border-slate-100" />
                  </>
                )}
                {/* Intelligence */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Intelligence</h3>
                    <button onClick={() => setTab("Intelligence")} className="text-xs text-blue-600 hover:text-blue-700">Full view →</button>
                  </div>
                  <button
                    onClick={() => setTab("Intelligence")}
                    className="w-full flex items-center gap-2 text-left bg-blue-50 hover:bg-blue-100 transition-colors rounded-lg px-3 py-2.5"
                  >
                    <Sparkles size={13} className="text-blue-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-blue-800">AI Intelligence &amp; Signals</p>
                      <p className="text-[11px] text-blue-600 mt-0.5">View news, research signals &amp; AI insights</p>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* STRATEGIC / CORPORATE / ECOSYSTEM / GOV */}
            {typeGroup === "strategic" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Portfolio connections</h3>
                  <p className="text-xs text-slate-400 italic">Link portfolio companies to this strategic partner via the Deals tab.</p>
                </div>
                <div className="border-t border-slate-100" />
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Sectors</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {(company.sectors ?? []).length > 0
                      ? company.sectors!.map(s => <span key={s} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded capitalize">{s}</span>)
                      : <span className="text-xs text-slate-400">None tagged</span>
                    }
                  </div>
                </div>
                <div className="border-t border-slate-100" />
                <p className="text-xs text-slate-400 leading-relaxed">
                  Source: {company.source ?? "—"}<br />
                  First contact: {formatDate(company.first_contact_date)}<br />
                  Added: {formatDate(company.created_at)}
                </p>
              </div>
            )}

            {/* LP */}
            {typeGroup === "lp" && (() => {
              const LP_STAGES = ["target", "intro_made", "meeting_done", "materials_sent", "soft_commit", "committed"];
              const currentIdx = LP_STAGES.indexOf(company.lp_stage ?? "");
              return (
                <div className="space-y-4">
                  {/* Pipeline progress */}
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">Pipeline</h3>
                    <div className="flex items-center gap-1.5 mb-2">
                      {LP_STAGES.map((s, i) => (
                        <div key={s} className={cn("h-2 flex-1 rounded-full", i <= currentIdx ? "bg-blue-500" : "bg-slate-100")} />
                      ))}
                    </div>
                    <p className="text-xs text-slate-500">{LP_STAGE_LABELS[company.lp_stage ?? ""] ?? company.lp_stage ?? "No stage set"}</p>
                    {company.commitment_goal && (
                      <p className="text-xs text-slate-500 mt-1">Goal: {formatCurrency(company.commitment_goal, true)}</p>
                    )}
                    <Link href="/crm/lps" className="text-xs text-blue-600 hover:text-blue-700 mt-2 inline-block">
                      Full LP record →
                    </Link>
                  </div>
                  <div className="border-t border-slate-100" />
                  {/* Intelligence */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Intelligence</h3>
                      <button onClick={() => setTab("Intelligence")} className="text-xs text-blue-600 hover:text-blue-700">Full view →</button>
                    </div>
                    <button
                      onClick={() => setTab("Intelligence")}
                      className="w-full flex items-center gap-2 text-left bg-blue-50 hover:bg-blue-100 transition-colors rounded-lg px-3 py-2.5"
                    >
                      <Sparkles size={13} className="text-blue-600 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-blue-800">AI Intelligence &amp; Signals</p>
                        <p className="text-[11px] text-blue-600 mt-0.5">View news, signals &amp; AI insights</p>
                      </div>
                    </button>
                  </div>
                </div>
              );
            })()}

            {/* OTHER / DEFAULT */}
            {typeGroup === "other" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Details</h3>
                  <div className="space-y-2">
                    {[
                      { label: "Source",        value: company.source },
                      { label: "Sectors",       value: company.sectors?.join(", ") },
                      { label: "Founded",       value: company.founded_year },
                      { label: "Employees",     value: company.employee_count },
                      { label: "First contact", value: formatDate(company.first_contact_date) },
                      { label: "Added",         value: formatDate(company.created_at) },
                    ].filter(f => f.value).map(({ label, value }) => (
                      <div key={label}>
                        <p className="text-xs text-slate-400">{label}</p>
                        <p className="text-sm text-slate-700">{String(value)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>

        {/* ── Full-width IC Memos section (startups only) ── */}
        {typeGroup === "startup" && (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Investment Memos</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={generateMemo}
                  disabled={memoGenerating}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors font-medium"
                >
                  {memoGenerating ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                  {memoGenerating ? "Generating…" : "Generate Memo"}
                </button>
                {memos.length > 0 && (
                  <button onClick={() => setTab("Memos")} className="text-xs text-blue-600 hover:text-blue-700">
                    All {memos.length} →
                  </button>
                )}
              </div>
            </div>
            {memos.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No investment memos yet. Generate one using the button above.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {memos.map(m => (
                  <Link
                    key={m.id}
                    href={`/memos/${m.id}`}
                    className="flex flex-col gap-2 p-3 rounded-xl border border-slate-200 hover:border-blue-200 hover:bg-blue-50/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800 leading-tight line-clamp-2">{m.title}</p>
                      {m.recommendation && (
                        <span className={cn("badge text-xs flex-shrink-0", REC_COLORS[m.recommendation] ?? "bg-slate-100 text-slate-500")}>
                          {m.recommendation.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400">{formatDate(m.created_at)}</p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
        </>
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

      {/* ── Merge Modal ── */}
      {showMergeModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Merge company</h2>
                <p className="text-xs text-slate-500 mt-0.5">All contacts, interactions, deals & documents will move to the target. This company will be deleted.</p>
              </div>
              <button onClick={() => { setShowMergeModal(false); setMergeSearch(""); setMergeCandidates([]); setMergeTargetId(null); }} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Merging: <span className="text-slate-900 normal-case font-bold">{company.name}</span> →</p>
              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  autoFocus
                  className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-violet-400"
                  placeholder="Search target company…"
                  value={mergeSearch}
                  onChange={e => handleMergeSearchChange(e.target.value)}
                />
              </div>
              {/* Candidates */}
              {mergeCandidates.length > 0 && (
                <div className="border border-slate-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                  {mergeCandidates.map(c => (
                    <button key={c.id} onClick={() => { setMergeTargetId(c.id); setMergeSearch(c.name); setMergeCandidates([]); }}
                      className={cn("w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0 flex items-center justify-between",
                        mergeTargetId === c.id ? "bg-violet-50" : "")}>
                      <span className="font-medium text-slate-800">{c.name}</span>
                      <span className="text-xs text-slate-400 capitalize">{c.type?.replace(/_/g, " ")}</span>
                    </button>
                  ))}
                </div>
              )}
              {mergeTargetId && (
                <div className="bg-violet-50 border border-violet-200 rounded-lg px-3 py-2.5 text-xs text-violet-800">
                  <strong>Target:</strong> {mergeSearch} — all data from <strong>{company.name}</strong> will be moved here and <strong>{company.name}</strong> will be permanently deleted.
                </div>
              )}
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => { setShowMergeModal(false); setMergeSearch(""); setMergeCandidates([]); setMergeTargetId(null); }}
                className="flex-1 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={executeMerge} disabled={!mergeTargetId || mergeSaving}
                className="flex-1 py-2 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                {mergeSaving ? <><Loader2 size={13} className="animate-spin" /> Merging…</> : <><Merge size={13} /> Merge & Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="px-6 py-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <Trash2 size={18} className="text-red-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Delete company?</h2>
                  <p className="text-xs text-slate-500 mt-0.5">This will permanently delete <strong>{company.name}</strong> and cannot be undone.</p>
                </div>
              </div>
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
                ⚠ Contacts, interactions, and documents linked to this company will be orphaned. Use <strong>Merge</strong> instead if you want to preserve them.
              </p>
            </div>
            <div className="flex gap-3 px-6 pb-5">
              <button onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={executeDelete} disabled={deleting}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
                {deleting ? <><Loader2 size={13} className="animate-spin" /> Deleting…</> : <><Trash2 size={13} /> Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
