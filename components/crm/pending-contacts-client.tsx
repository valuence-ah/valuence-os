"use client";
// ─── New Contacts — compact single-row review queue ───────────────────────────
// One row per contact. Domain-matched company suggestions + inline create.
// Each row is its own memo'd component to prevent cross-row re-renders.

import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Contact, CompanyType, Company } from "@/lib/types";
import { getInitials, formatDate, cn } from "@/lib/utils";
import {
  Check, X, Mail, ExternalLink, UserPlus, Maximize2, Loader2,
  Search, ChevronDown, Sparkles, Plus, MapPin, Globe, Users,
  Tag, Phone, ChevronRight, Calendar, Linkedin,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type CompanyStub = { id: string; name: string; type: string; website?: string | null };
type PendingContact = Contact & { company?: CompanyStub | null };

interface Props {
  initialContacts: PendingContact[];
  companies: CompanyStub[];
}

// ── Constants — matching Admin → Contacts → Type exactly ──────────────────────

const CONTACT_TYPE_OPTIONS = [
  "Advisor / KOL",
  "Ecosystem",
  "Employee",
  "Founder / Mgmt",
  "Government/Academic",
  "Investor",
  "Lawyer",
  "Limited Partner",
  "Other",
  "Strategic",
] as const;

type ContactTypeStr = (typeof CONTACT_TYPE_OPTIONS)[number];

/** Country options — same list as Admin → Contacts → Country makeComboEditor. Free text always allowed. */
const COUNTRY_OPTIONS = [
  "USA", "UK", "Canada", "Singapore", "South Korea", "Japan",
  "Germany", "France", "Australia", "Israel", "India", "China",
  "Thailand", "Malaysia", "Brunei", "Other",
] as const;

/** Title suggestions — mirrors common VC/startup titles; free text still allowed. */
const TITLE_SUGGESTIONS = [
  "CEO", "CTO", "CFO", "COO", "Founder", "Co-Founder",
  "General Partner", "Managing Partner", "Partner", "Venture Partner", "Operating Partner",
  "Principal", "Associate", "Analyst", "Senior Associate",
  "Managing Director", "Director", "Vice President", "Senior Vice President",
  "President", "Head of Investments", "Head of Portfolio", "Investment Manager",
  "Portfolio Manager", "Chief of Staff", "Advisor", "Board Member",
] as const;

const CONTACT_TO_COMPANY_TYPE: Partial<Record<ContactTypeStr, CompanyType>> = {
  "Founder / Mgmt":      "startup",
  "Limited Partner":     "lp",
  "Investor":            "fund",
  "Strategic":           "corporate",
  "Ecosystem":           "ecosystem_partner",
  "Government/Academic": "government",
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
  ecosystem_partner: "Eco", corporate: "Corp",
  government: "Gov", other: "Other",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractRootDomain(s: string): string {
  return s
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#@]/)[0]
    .toLowerCase();
}

function getEmailDomain(email: string | null): string | null {
  if (!email?.includes("@")) return null;
  return extractRootDomain(email.split("@")[1]);
}

/** Score companies against email domain. Cached outside component tree. */
function scoreCompanies(
  companies: CompanyStub[],
  emailDomain: string | null
): (CompanyStub & { score: number })[] {
  if (!emailDomain) return companies.map(co => ({ ...co, score: 0 }));
  const domainRoot = emailDomain.split(".")[0]; // e.g. "yacapital"
  return companies.map(co => {
    // Best: website domain matches email domain exactly
    if (co.website != null) {
      const siteDomain = extractRootDomain(co.website);
      if (
        siteDomain === emailDomain ||
        siteDomain.endsWith("." + emailDomain) ||
        emailDomain.endsWith("." + siteDomain)
      ) return { ...co, score: 3 };
    }
    // Good: email domain root appears in company name (or vice-versa)
    const nameLower = co.name.toLowerCase().replace(/\s+/g, "");
    if (nameLower.includes(domainRoot) || domainRoot.includes(nameLower.slice(0, 5))) {
      return { ...co, score: 2 };
    }
    return { ...co, score: 0 };
  });
}

/** Map legacy ContactType enum values → Admin display strings */
function mapTypeToAdmin(raw: string | null): string {
  const map: Record<string, string> = {
    founder:           "Founder / Mgmt",
    lp:                "Limited Partner",
    fund_manager:      "Investor",
    corporate:         "Strategic",
    ecosystem_partner: "Ecosystem",
    government:        "Government/Academic",
    advisor:           "Advisor / KOL",
    other:             "Other",
  };
  if (!raw) return "Other";
  // If already one of the admin values, return as-is
  if ((CONTACT_TYPE_OPTIONS as readonly string[]).includes(raw)) return raw;
  return map[raw] ?? "Other";
}

// ── CompanyRow — memoized dropdown item ───────────────────────────────────────

const CompanyRow = memo(function CompanyRow({
  company, selected, onSelect, onExpand,
}: {
  company: CompanyStub & { score: number };
  selected: boolean;
  onSelect: () => void;
  onExpand: () => void;
}) {
  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer",
      selected && "bg-blue-50"
    )}>
      <div
        className={cn(
          "w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center",
          selected ? "bg-blue-600 border-blue-600" : "border-slate-300 hover:border-blue-400"
        )}
        onClick={onSelect}
      >
        {selected && <Check size={9} className="text-white" />}
      </div>
      <button type="button" onClick={onSelect} className="flex-1 flex items-center gap-1.5 text-left min-w-0">
        <span className={cn("text-xs truncate flex-1",
          selected ? "text-blue-800 font-semibold" : "text-slate-700")}>
          {company.name}
        </span>
        <span className={cn("text-[9px] px-1 py-0.5 rounded border font-medium flex-shrink-0",
          TYPE_BADGE[company.type] ?? "bg-slate-50 text-slate-500 border-slate-200")}>
          {TYPE_LABEL[company.type] ?? company.type}
        </span>
      </button>
      {/* Expand always visible (not hidden behind hover) */}
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onExpand(); }}
        title="Expand company"
        className="flex items-center gap-0.5 text-[9px] text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded px-1 py-0.5 font-medium flex-shrink-0"
      >
        <Maximize2 size={8} />
      </button>
    </div>
  );
});

// ── CompanyDropdown ───────────────────────────────────────────────────────────

interface CompanyDropdownProps {
  contactEmail: string | null;
  allCompanies: CompanyStub[];
  value: string;
  placeholder: string;
  onChange: (id: string) => void;
  onExpand: (id: string) => void;
  onCreateNew: (name: string, type: string) => Promise<string | null>;
}

function CompanyDropdown({
  contactEmail, allCompanies, value, placeholder,
  onChange, onExpand, onCreateNew,
}: CompanyDropdownProps) {
  const [open, setOpen]         = useState(false);
  const [search, setSearch]     = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName]   = useState("");
  const [newType, setNewType]   = useState("startup");
  const [saving, setSaving]     = useState(false);
  const wrapRef   = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  // Auto-focus search
  useEffect(() => {
    if (open && !creating) setTimeout(() => searchRef.current?.focus(), 40);
  }, [open, creating]);

  const emailDomain = useMemo(() => getEmailDomain(contactEmail), [contactEmail]);
  const selected    = useMemo(() => allCompanies.find(c => c.id === value), [allCompanies, value]);

  // Score all companies once per email-domain change
  const scored = useMemo(
    () => scoreCompanies(allCompanies, emailDomain),
    [allCompanies, emailDomain]
  );

  // Filter + sort by search query (re-runs only when scored list or query changes)
  const q = search.toLowerCase();
  const filtered = useMemo(() =>
    scored
      .filter(c => !q || c.name.toLowerCase().includes(q))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
    [scored, q]
  );

  const topMatches = useMemo(() => filtered.filter(c => c.score >= 2), [filtered]);
  const showTop    = topMatches.length > 0 && !q;

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setSearch("");
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setSaving(true);
    const id = await onCreateNew(newName.trim(), newType);
    if (id) {
      pick(id);
      setCreating(false);
      setNewName("");
    }
    setSaving(false);
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          "w-full flex items-center justify-between gap-1 px-2 py-1 text-xs rounded border bg-white text-left transition-colors",
          open ? "border-blue-400 ring-1 ring-blue-100" : "border-slate-300 hover:border-slate-400"
        )}
      >
        <span className={cn("flex-1 truncate min-w-0",
          selected ? "text-slate-800 font-medium" : "text-slate-400 italic text-[11px]")}>
          {selected ? selected.name : placeholder}
        </span>
        {selected && (
          <span className={cn("text-[9px] px-1 py-0.5 rounded border font-medium flex-shrink-0",
            TYPE_BADGE[selected.type] ?? "bg-slate-50 text-slate-500 border-slate-200")}>
            {TYPE_LABEL[selected.type] ?? selected.type}
          </span>
        )}
        <ChevronDown size={10} className={cn("text-slate-400 flex-shrink-0 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-[200] top-full mt-0.5 left-0 w-72 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
          {!creating ? (
            <>
              {/* Search */}
              <div className="p-1.5 border-b border-slate-100">
                <div className="relative">
                  <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    ref={searchRef}
                    type="text"
                    className="w-full pl-6 pr-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400 bg-slate-50"
                    placeholder="Search companies…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="max-h-52 overflow-y-auto">
                {/* Clear */}
                {value && (
                  <button type="button" onClick={() => pick("")}
                    className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-50 border-b border-slate-100">
                    <X size={10} /> Clear selection
                  </button>
                )}

                {/* Suggested (domain-matched) */}
                {showTop && (
                  <>
                    <div className="px-3 py-1 flex items-center gap-1">
                      <Sparkles size={9} className="text-amber-500" />
                      <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">Suggested</span>
                    </div>
                    {topMatches.map(co => (
                      <CompanyRow key={co.id} company={co} selected={value === co.id}
                        onSelect={() => pick(co.id)}
                        onExpand={() => { onExpand(co.id); setOpen(false); }} />
                    ))}
                    {filtered.filter(c => c.score < 2).length > 0 && (
                      <div className="mx-3 my-0.5 border-t border-slate-100" />
                    )}
                  </>
                )}

                {/* All results */}
                {filtered
                  .filter(c => showTop ? c.score < 2 : true)
                  .map(co => (
                    <CompanyRow key={co.id} company={co} selected={value === co.id}
                      onSelect={() => pick(co.id)}
                      onExpand={() => { onExpand(co.id); setOpen(false); }} />
                  ))}

                {filtered.length === 0 && (
                  <p className="px-3 py-4 text-xs text-slate-400 text-center">No companies found</p>
                )}
              </div>

              {/* Create new footer */}
              <div className="border-t border-slate-100 p-1.5">
                <button type="button"
                  onClick={() => { setCreating(true); setNewName(search); }}
                  className="w-full flex items-center justify-center gap-1 py-1.5 text-xs text-emerald-600 hover:bg-emerald-50 rounded-lg font-medium transition-colors">
                  <Plus size={11} /> Create new company{search ? ` "${search}"` : ""}
                </button>
              </div>
            </>
          ) : (
            /* Inline create form */
            <div className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-700">New Company</p>
                <button onClick={() => setCreating(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={12} />
                </button>
              </div>
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCreate()}
                placeholder="Company name *"
                className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
              <select value={newType} onChange={e => setNewType(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                <option value="startup">Startup</option>
                <option value="fund">Fund / VC</option>
                <option value="lp">Limited Partner</option>
                <option value="corporate">Corporate / Strategic</option>
                <option value="ecosystem_partner">Ecosystem Partner</option>
                <option value="government">Government / Academic</option>
                <option value="other">Other</option>
              </select>
              <div className="flex gap-1.5">
                <button onClick={() => setCreating(false)}
                  className="flex-1 py-1.5 border border-slate-200 rounded text-xs text-slate-600 hover:bg-slate-50">
                  Cancel
                </button>
                <button onClick={handleCreate} disabled={saving || !newName.trim()}
                  className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium rounded flex items-center justify-center gap-1">
                  {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                  {saving ? "Saving…" : "Create"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Company Expand Panel ───────────────────────────────────────────────────────

function CompanyExpandPanel({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const supabase = createClient();
  const [company, setCompany]   = useState<Company | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading]   = useState(true);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setImgError(false);
      const [{ data: co }, { data: ctcts }] = await Promise.all([
        supabase.from("companies").select("*").eq("id", companyId).single(),
        supabase.from("contacts").select("*").eq("company_id", companyId)
          .order("is_primary_contact", { ascending: false }).limit(5),
      ]);
      if (!cancelled) {
        setCompany(co as Company | null);
        setContacts((ctcts as Contact[]) ?? []);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

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
              <img src={clearbitUrl} alt={company?.name ?? ""} onError={() => setImgError(true)}
                className="w-8 h-8 rounded-lg object-contain bg-white border border-slate-200 p-0.5" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">{company ? getInitials(company.name) : "…"}</span>
              </div>
            )}
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                {loading ? "Loading…" : company?.name ?? "Company"}
              </h3>
              {company && (
                <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium",
                  TYPE_BADGE[company.type] ?? "bg-slate-50 text-slate-500 border-slate-200")}>
                  {TYPE_LABEL[company.type] ?? company.type}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {company && (
              <a href={`/crm/companies/${company.id}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
                <Maximize2 size={12} /> Full profile
              </a>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={18} /></button>
          </div>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 size={24} className="text-slate-300 animate-spin" />
          </div>
        ) : !company ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Company not found.</div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="px-5 py-4 border-b border-slate-100 space-y-3">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">General Information</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Company</p>
                  <p className="text-sm text-slate-800 font-medium">{company.name}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Type</p>
                  <span className={cn("inline-flex text-xs px-1.5 py-0.5 rounded border font-medium",
                    TYPE_BADGE[company.type] ?? "bg-slate-50 text-slate-500 border-slate-200")}>
                    {TYPE_LABEL[company.type] ?? company.type}
                  </span>
                </div>
                {company.website && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Website</p>
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

            {company.description && (
              <div className="px-5 py-4 border-b border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Description</p>
                <p className="text-sm text-slate-600 leading-relaxed">{company.description}</p>
              </div>
            )}

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
                          {getInitials(`${c.first_name} ${c.last_name ?? ""}`)}
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
                          <a href={`mailto:${c.email}`} className="hover:text-blue-600 transition-colors"><Mail size={12} /></a>
                        )}
                        {c.linkedin_url && (
                          <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-600 transition-colors"><ExternalLink size={12} /></a>
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

        {company && (
          <div className="px-5 py-4 border-t border-slate-200">
            <a href={`/crm/companies/${company.id}`}
              className="flex items-center justify-center gap-2 w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors">
              Open Full Profile <ChevronRight size={14} />
            </a>
          </div>
        )}
      </div>
    </>
  );
}

// ── ContactRow — memoized; manages its own edit state ─────────────────────────

const ContactRow = memo(function ContactRow({
  contact,
  allCompanies,
  onConfirmed,
  onDiscarded,
  onExpand,
}: {
  contact: PendingContact;
  allCompanies: CompanyStub[];
  onConfirmed: (id: string) => void;
  onDiscarded: (id: string) => void;
  onExpand: (id: string) => void;
}) {
  const supabase = createClient();

  const [firstName, setFirstName]           = useState(contact.first_name ?? "");
  const [lastName, setLastName]             = useState(contact.last_name ?? "");
  const [type, setType]                     = useState<string>(() => mapTypeToAdmin(contact.type));
  const [title, setTitle]                   = useState(contact.title ?? "");
  const [companyId, setCompanyId]           = useState(contact.company_id ?? "");
  const [city, setCity]                     = useState(contact.location_city ?? "");
  const [country, setCountry]               = useState(contact.location_country ?? "");
  const [busy, setBusy]                     = useState(false);
  // Extra companies created inline for this row
  const [extraCompanies, setExtraCompanies] = useState<CompanyStub[]>([]);

  const mergedCompanies = useMemo(
    () => (extraCompanies.length ? [...extraCompanies, ...allCompanies] : allCompanies),
    [extraCompanies, allCompanies]
  );

  const handleCreateCompany = useCallback(async (name: string, coType: string): Promise<string | null> => {
    const { data, error } = await supabase
      .from("companies")
      .insert({ name, type: coType, status: "active" })
      .select("id, name, type")
      .single();
    if (error || !data) return null;
    const stub: CompanyStub = { id: data.id as string, name: data.name as string, type: data.type as string };
    setExtraCompanies(prev => [stub, ...prev]);
    setCompanyId(data.id as string);
    return data.id as string;
  }, [supabase]);

  async function confirm() {
    setBusy(true);
    const resolvedCompanyId = companyId || contact.company_id || null;

    const { error } = await supabase.from("contacts").update({
      status:           "active",
      first_name:       firstName.trim() || contact.first_name,
      last_name:        lastName.trim()  || null,
      type,
      title:            title.trim() || contact.title || null,
      company_id:       resolvedCompanyId,
      location_city:    city.trim()    || null,
      location_country: country.trim() || null,
    }).eq("id", contact.id);

    if (error) { alert(error.message); setBusy(false); return; }

    // Auto-route company type if it's still "other"
    const targetType = CONTACT_TO_COMPANY_TYPE[type as ContactTypeStr];
    if (resolvedCompanyId && targetType) {
      const co = mergedCompanies.find(c => c.id === resolvedCompanyId);
      if (co && (!co.type || co.type === "other")) {
        await supabase.from("companies").update({ type: targetType }).eq("id", resolvedCompanyId);
      }
    }

    onConfirmed(contact.id);
    setBusy(false);
  }

  async function discard() {
    setBusy(true);
    const { error } = await supabase.from("contacts").delete().eq("id", contact.id);
    if (error) { alert(error.message); setBusy(false); return; }
    onDiscarded(contact.id);
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 min-w-0 hover:border-slate-300 transition-colors">

      {/* Avatar — updates as name changes */}
      <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
        <span className="text-violet-600 text-[9px] font-bold">
          {getInitials(`${firstName} ${lastName}`) || "?"}
        </span>
      </div>

      {/* Name (editable) + email */}
      <div className="w-44 flex-shrink-0 min-w-0">
        <div className="flex gap-1 mb-0.5">
          <input
            value={firstName}
            onChange={e => setFirstName(e.target.value)}
            placeholder="First"
            className="w-[52%] text-xs font-semibold border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 text-slate-800 placeholder:text-slate-300 placeholder:font-normal"
          />
          <input
            value={lastName}
            onChange={e => setLastName(e.target.value)}
            placeholder="Last"
            className="w-[48%] text-xs font-semibold border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 text-slate-800 placeholder:text-slate-300 placeholder:font-normal"
          />
        </div>
        <div className="flex items-center gap-1">
          {contact.email ? (
            <a href={`mailto:${contact.email}`} title={contact.email}
              className="text-[10px] text-blue-500 hover:underline truncate block leading-tight">
              {contact.email}
            </a>
          ) : (
            <span className="text-[10px] text-slate-300 italic">no email</span>
          )}
          {contact.linkedin_url && (
            <a href={contact.linkedin_url} target="_blank" rel="noopener noreferrer"
              className="text-slate-300 hover:text-blue-500 flex-shrink-0">
              <ExternalLink size={9} />
            </a>
          )}
        </div>
      </div>

      {/* Type */}
      <select
        value={type}
        onChange={e => setType(e.target.value)}
        className="w-36 flex-shrink-0 text-xs border border-slate-300 rounded px-1.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-slate-700"
      >
        {CONTACT_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
      </select>

      {/* Title — combobox with suggestions, free text allowed */}
      <input
        list={`title-list-${contact.id}`}
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder={contact.title || "Job title"}
        className="w-28 flex-shrink-0 text-xs border border-slate-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 text-slate-700 placeholder:text-slate-300"
      />
      <datalist id={`title-list-${contact.id}`}>
        {TITLE_SUGGESTIONS.map(t => <option key={t} value={t} />)}
      </datalist>

      {/* Company dropdown */}
      <div className="w-48 flex-shrink-0">
        <CompanyDropdown
          contactEmail={contact.email}
          allCompanies={mergedCompanies}
          value={companyId}
          placeholder={contact.company?.name || "Select company…"}
          onChange={setCompanyId}
          onExpand={onExpand}
          onCreateNew={handleCreateCompany}
        />
      </div>

      {/* City */}
      <input
        value={city}
        onChange={e => setCity(e.target.value)}
        placeholder="City"
        className="w-20 flex-shrink-0 text-xs border border-slate-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 text-slate-700 placeholder:text-slate-300"
      />

      {/* Country — combobox matching Admin list; free text always allowed */}
      <input
        list={`country-list-${contact.id}`}
        value={country}
        onChange={e => setCountry(e.target.value)}
        placeholder="Country *"
        className="w-20 flex-shrink-0 text-xs border border-slate-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 text-slate-700 placeholder:text-slate-300"
      />
      <datalist id={`country-list-${contact.id}`}>
        {COUNTRY_OPTIONS.map(c => <option key={c} value={c} />)}
      </datalist>

      {/* Added date */}
      <span className="text-[10px] text-slate-400 flex-shrink-0 w-16 truncate text-right">
        {formatDate(contact.created_at)}
      </span>

      {/* Actions */}
      <div className="flex gap-1 flex-shrink-0 ml-auto">
        <button
          onClick={confirm}
          disabled={busy}
          className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium rounded transition-colors"
        >
          {busy ? <Loader2 size={10} className="animate-spin" /> : <Check size={11} />}
          Confirm
        </button>
        <button
          onClick={discard}
          disabled={busy}
          title="Discard"
          className="flex items-center justify-center w-7 h-7 border border-red-200 hover:bg-red-50 disabled:opacity-50 text-red-400 rounded transition-colors"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  );
});

// ── Main Component ─────────────────────────────────────────────────────────────

export function PendingContactsClient({ initialContacts, companies }: Props) {
  const [contacts, setContacts]                   = useState<PendingContact[]>(initialContacts);
  const [expandedCompanyId, setExpandedCompanyId] = useState<string | null>(null);

  const handleConfirmed = useCallback((id: string) => {
    setContacts(prev => prev.filter(c => c.id !== id));
  }, []);

  const handleDiscarded = useCallback((id: string) => {
    setContacts(prev => prev.filter(c => c.id !== id));
  }, []);

  const handleExpand = useCallback((id: string) => {
    setExpandedCompanyId(id);
  }, []);

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
    <div className="flex-1 overflow-auto p-4">
      {/* Banner */}
      <div className="mb-3 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 flex items-center gap-2">
        <span className="font-semibold">{contacts.length} contact{contacts.length !== 1 ? "s" : ""}</span>
        <span>need enrichment. Fill in the fields then click <strong>Confirm</strong> to add to your CRM.</span>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-2 px-3 mb-1">
        <div className="w-7 flex-shrink-0" />
        <div className="w-44 flex-shrink-0 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Name / Contact</div>
        <div className="w-36 flex-shrink-0 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Type *</div>
        <div className="w-28 flex-shrink-0 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Title</div>
        <div className="w-48 flex-shrink-0 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Company</div>
        <div className="w-20 flex-shrink-0 text-[10px] font-bold text-slate-400 uppercase tracking-wider">City</div>
        <div className="w-20 flex-shrink-0 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Country *</div>
        <div className="w-16 flex-shrink-0 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">Added</div>
      </div>

      {/* Rows */}
      <div className="space-y-1">
        {contacts.map(c => (
          <ContactRow
            key={c.id}
            contact={c}
            allCompanies={companies}
            onConfirmed={handleConfirmed}
            onDiscarded={handleDiscarded}
            onExpand={handleExpand}
          />
        ))}
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
