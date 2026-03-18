"use client";
// ─── New Contacts Client ───────────────────────────────────────────────────────
// Displays contacts missing Contact Type OR Location (Country).
// User fills in type, title, city, country, then confirms → active + auto-routes.
// Company badge has an "Expand" button that opens a slide-in company detail panel.

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Contact, ContactType, CompanyType, Company } from "@/lib/types";
import { getInitials, formatDate, formatCurrency, cn } from "@/lib/utils";
import {
  Check, X, Mail, Phone, ExternalLink, Building2, UserPlus,
  ChevronRight, MapPin, Globe, Linkedin, Users, Tag,
  FileText, Maximize2, Loader2, Calendar, DollarSign,
} from "lucide-react";

type CompanyStub = { id: string; name: string; type: string };
type PendingContact = Contact & { company?: CompanyStub | null };

interface Props {
  initialContacts: PendingContact[];
  companies: CompanyStub[];
}

const CONTACT_TYPE_OPTIONS: { value: ContactType; label: string }[] = [
  { value: "founder",           label: "Founder / Management" },
  { value: "lp",                label: "Limited Partner" },
  { value: "fund_manager",      label: "Fund Manager / VC" },
  { value: "corporate",         label: "Corporate / Strategic" },
  { value: "ecosystem_partner", label: "Ecosystem Partner" },
  { value: "government",        label: "Government / Academic" },
  { value: "advisor",           label: "Advisor / KOL" },
  { value: "other",             label: "Other" },
];

const CONTACT_TO_COMPANY_TYPE: Partial<Record<ContactType, CompanyType>> = {
  founder:           "startup",
  lp:                "lp",
  fund_manager:      "fund",
  corporate:         "corporate",
  ecosystem_partner: "ecosystem_partner",
  government:        "government",
};

const TYPE_BADGE: Record<string, string> = {
  startup:           "bg-blue-50 text-blue-700 border-blue-200",
  lp:                "bg-purple-50 text-purple-700 border-purple-200",
  fund:              "bg-indigo-50 text-indigo-700 border-indigo-200",
  ecosystem_partner: "bg-teal-50 text-teal-700 border-teal-200",
  corporate:         "bg-orange-50 text-orange-700 border-orange-200",
  government:        "bg-slate-100 text-slate-600 border-slate-200",
  other:             "bg-gray-50 text-gray-500 border-gray-200",
};
const TYPE_LABEL: Record<string, string> = {
  startup: "Startup", lp: "LP", fund: "Fund",
  ecosystem_partner: "Eco Partner", corporate: "Corporate",
  government: "Government", other: "Other",
};

interface EditState {
  type: ContactType;
  title: string;
  location_city: string;
  location_country: string;
  company_id: string;
}

// ── Company Expand Panel ────────────────────────────────────────────────────────

interface CompanyPanelProps {
  companyId: string;
  onClose: () => void;
  onOpenFull: (id: string) => void;
}

function CompanyExpandPanel({ companyId, onClose, onOpenFull }: CompanyPanelProps) {
  const supabase = createClient();
  const [company, setCompany]   = useState<Company | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading]   = useState(true);
  const [imgError, setImgError] = useState(false);

  // Fetch on mount
  useState(() => {
    async function load() {
      setLoading(true);
      const [{ data: co }, { data: ctcts }] = await Promise.all([
        supabase.from("companies").select("*").eq("id", companyId).single(),
        supabase.from("contacts").select("*").eq("company_id", companyId)
          .order("is_primary_contact", { ascending: false }).limit(5),
      ]);
      setCompany(co as Company | null);
      setContacts((ctcts as Contact[]) ?? []);
      setLoading(false);
    }
    load();
  });

  const domain = company?.website
    ? company.website.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
    : null;
  const clearbitUrl = domain ? `https://logo.clearbit.com/${domain}` : null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-[420px] bg-white shadow-2xl z-50 flex flex-col">

        {/* Panel header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            {clearbitUrl && !imgError ? (
              <img
                src={clearbitUrl}
                alt={company?.name ?? ""}
                onError={() => setImgError(true)}
                className="w-8 h-8 rounded-lg object-contain bg-white border border-slate-200 p-0.5"
              />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">
                  {company ? getInitials(company.name) : "…"}
                </span>
              </div>
            )}
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                {loading ? "Loading…" : company?.name ?? "Company"}
              </h3>
              {company && (
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium", TYPE_BADGE[company.type] ?? "bg-slate-50 text-slate-500 border-slate-200")}>
                  {TYPE_LABEL[company.type] ?? company.type}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {company && (
              <a
                href={`/crm/companies/${company.id}`}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Maximize2 size={12} /> Open
              </a>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Panel body */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={24} className="text-slate-300 animate-spin" />
          </div>
        ) : !company ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
            Company not found.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">

            {/* ── General Information ── */}
            <div className="px-5 py-4 border-b border-slate-100 space-y-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">General Information</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Company</p>
                  <p className="text-sm text-slate-800 font-medium">{company.name}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Type</p>
                  <span className={cn("inline-flex text-xs px-1.5 py-0.5 rounded border font-medium", TYPE_BADGE[company.type] ?? "bg-slate-50 text-slate-500 border-slate-200")}>
                    {TYPE_LABEL[company.type] ?? company.type}
                  </span>
                </div>
                {company.website && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Domain</p>
                    <a href={company.website} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                      <Globe size={11} />
                      {company.website.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
                    </a>
                  </div>
                )}
                {company.linkedin_url && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 mb-0.5">LinkedIn</p>
                    <a href={company.linkedin_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                      <Linkedin size={11} /> Profile
                    </a>
                  </div>
                )}
                {(company.location_city || company.location_country) && (
                  <div className="col-span-2">
                    <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Location</p>
                    <p className="text-sm text-slate-700 flex items-center gap-1">
                      <MapPin size={11} className="text-slate-400" />
                      {[company.location_city, company.location_country].filter(Boolean).join(", ")}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Startup / LP Information ── */}
            {(company.type === "startup" || company.type === "lp" || company.type === "fund") && (
              <div className="px-5 py-4 border-b border-slate-100 space-y-3">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {company.type === "startup" ? "Startup Information" : company.type === "lp" ? "LP Information" : "Fund Information"}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {company.type === "startup" && <>
                    {company.sectors && company.sectors.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Sector</p>
                        <p className="text-sm text-slate-700 capitalize">{company.sectors[0]}</p>
                      </div>
                    )}
                    {company.sub_type && (
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Sub-sector</p>
                        <p className="text-sm text-slate-700">{company.sub_type}</p>
                      </div>
                    )}
                    {company.stage && (
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Stage</p>
                        <p className="text-sm text-slate-700 capitalize">{company.stage.replace(/_/g, " ")}</p>
                      </div>
                    )}
                    {company.deal_status && (
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Deal Status</p>
                        <p className="text-sm text-slate-700 capitalize">{company.deal_status.replace(/_/g, " ")}</p>
                      </div>
                    )}
                    {company.funding_raised != null && (
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Total Raised</p>
                        <p className="text-sm text-slate-700">{formatCurrency(company.funding_raised)}</p>
                      </div>
                    )}
                  </>}
                  {(company.type === "lp" || company.type === "fund") && <>
                    {company.aum != null && (
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 mb-0.5">AUM</p>
                        <p className="text-sm text-slate-700">{formatCurrency(company.aum)}</p>
                      </div>
                    )}
                    {company.lp_type && (
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 mb-0.5">LP Type</p>
                        <p className="text-sm text-slate-700 capitalize">{company.lp_type.replace(/_/g, " ")}</p>
                      </div>
                    )}
                    {company.fund_focus && (
                      <div className="col-span-2">
                        <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Fund Focus</p>
                        <p className="text-sm text-slate-700">{company.fund_focus}</p>
                      </div>
                    )}
                  </>}
                  {company.source && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Source</p>
                      <p className="text-sm text-slate-700">{company.source}</p>
                    </div>
                  )}
                  {company.last_contact_date && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Last Contact</p>
                      <p className="text-sm text-slate-700 flex items-center gap-1">
                        <Calendar size={11} className="text-slate-400" />
                        {formatDate(company.last_contact_date)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Description ── */}
            {company.description && (
              <div className="px-5 py-4 border-b border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Description</p>
                <p className="text-sm text-slate-600 leading-relaxed">{company.description}</p>
              </div>
            )}

            {/* ── Tags ── */}
            {company.tags && company.tags.length > 0 && (
              <div className="px-5 py-4 border-b border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                  <Tag size={10} /> Tags
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {company.tags.map(t => (
                    <span key={t} className="text-xs px-2 py-0.5 bg-violet-50 text-violet-700 rounded-full border border-violet-200">{t}</span>
                  ))}
                </div>
              </div>
            )}

            {/* ── Linked Contacts ── */}
            <div className="px-5 py-4">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-1">
                <Users size={10} /> Contacts ({contacts.length})
              </p>
              {contacts.length === 0 ? (
                <p className="text-xs text-slate-300 italic">No contacts linked yet</p>
              ) : (
                <div className="space-y-2">
                  {contacts.map(c => (
                    <div key={c.id} className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-lg">
                      <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-violet-600 text-[10px] font-bold">
                          {getInitials(`${c.first_name} ${c.last_name}`)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate">
                          {c.first_name} {c.last_name}
                          {c.is_primary_contact && (
                            <span className="ml-1.5 text-[9px] text-blue-600 bg-blue-50 px-1 py-0.5 rounded">Primary</span>
                          )}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">{c.title ?? c.type}</p>
                      </div>
                      <div className="flex gap-1.5 text-slate-300">
                        {c.email && (
                          <a href={`mailto:${c.email}`} className="hover:text-blue-600 transition-colors">
                            <Mail size={12} />
                          </a>
                        )}
                        {c.linkedin_url && (
                          <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 transition-colors">
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                  {contacts.length >= 5 && (
                    <a href={`/crm/companies/${company.id}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1">
                      View all contacts <ChevronRight size={11} />
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        {company && (
          <div className="px-5 py-4 border-t border-slate-200">
            <a
              href={`/crm/companies/${company.id}`}
              className="flex items-center justify-center gap-2 w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Open Full Profile <ChevronRight size={14} />
            </a>
          </div>
        )}
      </div>
    </>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function PendingContactsClient({ initialContacts, companies }: Props) {
  const supabase = createClient();
  const [contacts, setContacts] = useState<PendingContact[]>(initialContacts);
  const [edits, setEdits]       = useState<Record<string, EditState>>(() => {
    const init: Record<string, EditState> = {};
    initialContacts.forEach(c => {
      init[c.id] = {
        type:             c.type as ContactType,
        title:            c.title ?? "",
        location_city:    c.location_city ?? "",
        location_country: c.location_country ?? "",
        company_id:       c.company_id ?? "",
      };
    });
    return init;
  });
  const [processing, setProcessing] = useState<Set<string>>(new Set());

  // Expanded company panel
  const [expandedCompanyId, setExpandedCompanyId] = useState<string | null>(null);

  function setEdit(id: string, field: keyof EditState, value: string) {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  async function confirm(contact: PendingContact) {
    setProcessing(prev => new Set(prev).add(contact.id));
    const edit = edits[contact.id];
    const resolvedCompanyId = edit.company_id || contact.company_id || null;

    const { error: contactErr } = await supabase
      .from("contacts")
      .update({
        status:           "active",
        type:             edit.type,
        title:            edit.title || contact.title || null,
        company_id:       resolvedCompanyId,
        location_city:    edit.location_city    || null,
        location_country: edit.location_country || null,
      })
      .eq("id", contact.id);

    if (contactErr) {
      setProcessing(prev => { const s = new Set(prev); s.delete(contact.id); return s; });
      alert(contactErr.message);
      return;
    }

    // Auto-route: update company type if it's still 'other'
    const targetCompanyType = CONTACT_TO_COMPANY_TYPE[edit.type];
    if (resolvedCompanyId && targetCompanyType) {
      const linkedCompany = companies.find(co => co.id === resolvedCompanyId) ?? contact.company;
      if (linkedCompany && linkedCompany.type === "other") {
        await supabase
          .from("companies")
          .update({ type: targetCompanyType })
          .eq("id", resolvedCompanyId);
      }
    }

    setProcessing(prev => { const s = new Set(prev); s.delete(contact.id); return s; });
    setContacts(prev => prev.filter(c => c.id !== contact.id));
  }

  async function discard(id: string) {
    setProcessing(prev => new Set(prev).add(id));
    const { error } = await supabase.from("contacts").delete().eq("id", id);
    setProcessing(prev => { const s = new Set(prev); s.delete(id); return s; });
    if (!error) setContacts(prev => prev.filter(c => c.id !== id));
    else alert(error.message);
  }

  if (contacts.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-slate-400">
          <UserPlus size={40} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No new contacts</p>
          <p className="text-xs mt-1">Contacts missing a type or country will appear here for review.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-700">
        <strong>{contacts.length} contact{contacts.length !== 1 ? "s" : ""}</strong> need enrichment.
        Fill in the type, title, and location, then click <strong>Confirm</strong> to add to your CRM.
        The linked company will be auto-routed to the correct section.
      </div>

      <div className="space-y-3">
        {contacts.map(c => {
          const edit = edits[c.id] ?? { type: "other" as ContactType, title: "", location_city: "", location_country: "", company_id: "" };
          const busy = processing.has(c.id);
          // Resolve the displayed company (might be overridden by the dropdown)
          const resolvedCompanyId = edit.company_id || c.company_id;
          const displayCompany = edit.company_id
            ? companies.find(co => co.id === edit.company_id) ?? c.company
            : c.company;

          return (
            <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-start gap-4">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-violet-600 text-xs font-bold">
                    {getInitials(`${c.first_name} ${c.last_name}`)}
                  </span>
                </div>

                {/* Contact info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap mb-2">
                    <p className="font-semibold text-slate-900">{c.first_name} {c.last_name}</p>
                    <span className="text-xs text-slate-400">Added {formatDate(c.created_at)}</span>

                    {/* Company badge with Expand button */}
                    {displayCompany && (
                      <div className="flex items-center gap-1 bg-slate-100 rounded-full pl-2 pr-1 py-0.5">
                        <Building2 size={11} className="text-slate-500" />
                        <span className="text-xs text-slate-600 font-medium">{displayCompany.name}</span>
                        <button
                          onClick={() => setExpandedCompanyId(displayCompany.id)}
                          title="Expand company info"
                          className="flex items-center gap-0.5 text-[10px] text-blue-600 hover:text-blue-700 bg-white border border-blue-200 rounded-full px-1.5 py-0.5 ml-0.5 font-medium transition-colors hover:bg-blue-50"
                        >
                          <Maximize2 size={9} /> Expand
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Links */}
                  <div className="flex gap-3 text-xs text-slate-500 mb-4">
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="flex items-center gap-1 hover:text-blue-600">
                        <Mail size={12} /> {c.email}
                      </a>
                    )}
                    {c.phone && (
                      <a href={`tel:${c.phone}`} className="flex items-center gap-1 hover:text-blue-600">
                        <Phone size={12} /> {c.phone}
                      </a>
                    )}
                    {c.linkedin_url && (
                      <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-blue-600">
                        <ExternalLink size={12} /> LinkedIn
                      </a>
                    )}
                  </div>

                  {/* Editable fields */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Type *</label>
                      <select
                        className="select text-xs"
                        value={edit.type}
                        onChange={e => setEdit(c.id, "type", e.target.value)}
                      >
                        {CONTACT_TYPE_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Job Title</label>
                      <input
                        className="input text-xs"
                        placeholder={c.title || "e.g. CEO"}
                        value={edit.title}
                        onChange={e => setEdit(c.id, "title", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Company</label>
                      <select
                        className="select text-xs"
                        value={edit.company_id}
                        onChange={e => setEdit(c.id, "company_id", e.target.value)}
                      >
                        <option value="">{c.company?.name || "— Select —"}</option>
                        {companies.map(co => (
                          <option key={co.id} value={co.id}>{co.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">City</label>
                      <input
                        className="input text-xs"
                        placeholder="e.g. Singapore"
                        value={edit.location_city}
                        onChange={e => setEdit(c.id, "location_city", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Country *</label>
                      <input
                        className="input text-xs"
                        placeholder="e.g. Singapore"
                        value={edit.location_country}
                        onChange={e => setEdit(c.id, "location_country", e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => confirm(c)}
                    disabled={busy}
                    title="Confirm — add to contacts"
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    <Check size={13} /> Confirm
                  </button>
                  <button
                    onClick={() => discard(c.id)}
                    disabled={busy}
                    title="Discard — delete this contact"
                    className="flex items-center gap-1.5 px-3 py-2 border border-red-200 hover:bg-red-50 disabled:opacity-50 text-red-500 text-xs font-medium rounded-lg transition-colors"
                  >
                    <X size={13} /> Discard
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Company expand panel */}
      {expandedCompanyId && (
        <CompanyExpandPanel
          companyId={expandedCompanyId}
          onClose={() => setExpandedCompanyId(null)}
          onOpenFull={id => { window.open(`/crm/companies/${id}`, "_blank"); }}
        />
      )}
    </div>
  );
}
