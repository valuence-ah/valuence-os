"use client";
// ─── New Contacts Client ───────────────────────────────────────────────────────
// Displays contacts missing Contact Type OR Location (Country).
// Smart company dropdown: searchable, domain-based top matches, inline expand.

import { useState, useRef, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Contact, ContactType, CompanyType, Company } from "@/lib/types";
import { getInitials, formatDate, formatCurrency, cn } from "@/lib/utils";
import {
  Check, X, Mail, Phone, ExternalLink, Building2, UserPlus,
  ChevronRight, MapPin, Globe, Linkedin, Users, Tag,
  Maximize2, Loader2, Calendar, Search, ChevronDown, Sparkles,
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

// ── Domain-based top-match scoring ─────────────────────────────────────────────
// Extracts the root domain from an email or website, then scores companies.

function extractDomain(emailOrUrl: string): string {
  return emailOrUrl
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#@]/)[0]   // handles both email (after @) and url
    .toLowerCase();
}

function getEmailDomain(email: string | null): string | null {
  if (!email || !email.includes("@")) return null;
  return extractDomain(email.split("@")[1]);
}

// ── Smart Company Dropdown ──────────────────────────────────────────────────────

interface CompanyDropdownProps {
  contactEmail: string | null;
  allCompanies: CompanyStub[];
  value: string;              // selected company id
  placeholder: string;
  onChange: (id: string) => void;
  onExpand: (id: string) => void;
}

function CompanyDropdown({
  contactEmail, allCompanies, value, placeholder, onChange, onExpand,
}: CompanyDropdownProps) {
  const [open, setOpen]           = useState(false);
  const [search, setSearch]       = useState("");
  const wrapRef   = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close when clicking outside
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Focus search input when opening
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50);
  }, [open]);

  const emailDomain = getEmailDomain(contactEmail);
  const selected    = allCompanies.find(c => c.id === value);

  // Score companies: 2 = domain match on website, 1 = name similarity, 0 = normal
  const scored = allCompanies.map(co => {
    let score = 0;
    if (emailDomain) {
      // Check if company website domain matches email domain
      // We don't have website here (stub only has id/name/type) so score on name
      const nameLower = co.name.toLowerCase();
      const domainParts = emailDomain.split(".")[0]; // e.g. "yacapital" from "yacapital.com"
      if (nameLower.includes(domainParts) || domainParts.includes(nameLower.replace(/\s/g, ""))) {
        score = 2;
      }
    }
    return { ...co, score };
  });

  const topMatches = scored.filter(c => c.score >= 2);

  // Filter by search query
  const q = search.toLowerCase();
  const filteredAll = scored
    .filter(c => !q || c.name.toLowerCase().includes(q))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const showTopMatches = topMatches.length > 0 && !q;

  function select(id: string) {
    onChange(id);
    setOpen(false);
    setSearch("");
  }

  return (
    <div ref={wrapRef} className="relative">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs rounded-lg border bg-white transition-colors text-left",
          open ? "border-blue-400 ring-1 ring-blue-400" : "border-slate-300 hover:border-slate-400"
        )}
      >
        <span className={cn("flex-1 truncate", selected ? "text-slate-800 font-medium" : "text-slate-400")}>
          {selected ? selected.name : placeholder}
        </span>
        {selected && (
          <span className={cn("text-[9px] px-1 py-0.5 rounded border font-medium flex-shrink-0", TYPE_BADGE[selected.type] ?? "bg-slate-50 text-slate-500 border-slate-200")}>
            {TYPE_LABEL[selected.type] ?? selected.type}
          </span>
        )}
        <ChevronDown size={12} className={cn("text-slate-400 flex-shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 w-72 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-slate-100">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                type="text"
                className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-slate-50"
                placeholder="Search companies…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {/* Clear selection */}
            {value && (
              <button
                type="button"
                onClick={() => select("")}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:bg-slate-50 border-b border-slate-100"
              >
                <X size={11} /> Clear selection
              </button>
            )}

            {/* Top matches section */}
            {showTopMatches && (
              <>
                <div className="px-3 py-1.5 flex items-center gap-1.5">
                  <Sparkles size={10} className="text-amber-500" />
                  <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Top matches</span>
                </div>
                {topMatches.map(co => (
                  <CompanyRow
                    key={co.id}
                    company={co}
                    selected={value === co.id}
                    onSelect={() => select(co.id)}
                    onExpand={() => { onExpand(co.id); setOpen(false); }}
                  />
                ))}
                {filteredAll.filter(c => c.score < 2).length > 0 && (
                  <div className="mx-3 my-1 border-t border-slate-100" />
                )}
              </>
            )}

            {/* All / filtered results */}
            {filteredAll
              .filter(c => showTopMatches ? c.score < 2 : true)
              .map(co => (
                <CompanyRow
                  key={co.id}
                  company={co}
                  selected={value === co.id}
                  onSelect={() => select(co.id)}
                  onExpand={() => { onExpand(co.id); setOpen(false); }}
                />
              ))}

            {filteredAll.length === 0 && (
              <p className="px-3 py-4 text-xs text-slate-400 text-center">No companies found</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Single row in the dropdown
function CompanyRow({
  company, selected, onSelect, onExpand,
}: {
  company: CompanyStub;
  selected: boolean;
  onSelect: () => void;
  onExpand: () => void;
}) {
  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-2 hover:bg-slate-50 group/row",
      selected && "bg-blue-50"
    )}>
      {/* Checkbox */}
      <div
        className={cn(
          "w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center cursor-pointer transition-colors",
          selected ? "bg-blue-600 border-blue-600" : "border-slate-300 hover:border-blue-400"
        )}
        onClick={onSelect}
      >
        {selected && <Check size={10} className="text-white" />}
      </div>

      {/* Name + type badge */}
      <button type="button" onClick={onSelect} className="flex-1 flex items-center gap-2 text-left min-w-0">
        <span className={cn("text-xs truncate flex-1", selected ? "text-blue-800 font-semibold" : "text-slate-700")}>
          {company.name}
        </span>
        <span className={cn("text-[9px] px-1 py-0.5 rounded border font-medium flex-shrink-0 opacity-60 group-hover/row:opacity-100",
          TYPE_BADGE[company.type] ?? "bg-slate-50 text-slate-500 border-slate-200")}>
          {TYPE_LABEL[company.type] ?? company.type}
        </span>
      </button>

      {/* Expand button */}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onExpand(); }}
        title="Expand company info"
        className="opacity-0 group-hover/row:opacity-100 flex items-center gap-0.5 text-[10px] text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded px-1.5 py-0.5 font-medium transition-all flex-shrink-0"
      >
        <Maximize2 size={9} /> Expand
      </button>
    </div>
  );
}

// ── Company Expand Panel ────────────────────────────────────────────────────────

interface CompanyPanelProps {
  companyId: string;
  onClose: () => void;
}

function CompanyExpandPanel({ companyId, onClose }: CompanyPanelProps) {
  const supabase = createClient();
  const [company, setCompany]   = useState<Company | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading]   = useState(true);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setImgError(false);
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
  }, [companyId]);

  const domain = company?.website
    ? company.website.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
    : null;
  const clearbitUrl = domain ? `https://logo.clearbit.com/${domain}` : null;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-[420px] bg-white shadow-2xl z-50 flex flex-col">

        {/* Header */}
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
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <Maximize2 size={12} /> Full profile
              </a>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Body */}
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

            {/* General Info */}
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

            {/* Type-specific info */}
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

            {/* Description */}
            {company.description && (
              <div className="px-5 py-4 border-b border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Description</p>
                <p className="text-sm text-slate-600 leading-relaxed">{company.description}</p>
              </div>
            )}

            {/* Tags */}
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

            {/* Linked Contacts */}
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

// ── Edit state per contact ─────────────────────────────────────────────────────

interface EditState {
  type: ContactType;
  title: string;
  location_city: string;
  location_country: string;
  company_id: string;
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
  const [processing, setProcessing]       = useState<Set<string>>(new Set());
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

    // Auto-route: update company type if still 'other'
    const targetCompanyType = CONTACT_TO_COMPANY_TYPE[edit.type];
    if (resolvedCompanyId && targetCompanyType) {
      const linkedCompany = companies.find(co => co.id === resolvedCompanyId) ?? contact.company;
      if (linkedCompany && linkedCompany.type === "other") {
        await supabase.from("companies").update({ type: targetCompanyType }).eq("id", resolvedCompanyId);
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

          return (
            <div key={c.id} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className="flex items-start gap-4">

                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-violet-600 text-xs font-bold">
                    {getInitials(`${c.first_name} ${c.last_name}`)}
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap mb-2">
                    <p className="font-semibold text-slate-900">{c.first_name} {c.last_name}</p>
                    <span className="text-xs text-slate-400">Added {formatDate(c.created_at)}</span>
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

                    {/* Type */}
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

                    {/* Job Title */}
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Job Title</label>
                      <input
                        className="input text-xs"
                        placeholder={c.title || "e.g. CEO"}
                        value={edit.title}
                        onChange={e => setEdit(c.id, "title", e.target.value)}
                      />
                    </div>

                    {/* Company — smart dropdown */}
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Company</label>
                      <CompanyDropdown
                        contactEmail={c.email}
                        allCompanies={companies}
                        value={edit.company_id}
                        placeholder={c.company?.name || "— Select —"}
                        onChange={id => setEdit(c.id, "company_id", id)}
                        onExpand={id => setExpandedCompanyId(id)}
                      />
                    </div>

                    {/* City */}
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">City</label>
                      <input
                        className="input text-xs"
                        placeholder="e.g. Singapore"
                        value={edit.location_city}
                        onChange={e => setEdit(c.id, "location_city", e.target.value)}
                      />
                    </div>

                    {/* Country */}
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
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
                  >
                    <Check size={13} /> Confirm
                  </button>
                  <button
                    onClick={() => discard(c.id)}
                    disabled={busy}
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
        />
      )}
    </div>
  );
}
