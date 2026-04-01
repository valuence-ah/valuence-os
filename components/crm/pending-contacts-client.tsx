"use client";
// ─── New Contacts — compact single-row review queue ───────────────────────────

import { useState, useRef, useEffect, useCallback, useMemo, memo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Contact, CompanyType, Company } from "@/lib/types";
import { getInitials, formatDate, cn } from "@/lib/utils";
import {
  Check, X, Mail, ExternalLink, UserPlus, Maximize2, Loader2,
  Search, ChevronDown, ChevronUp, Plus, MapPin, Globe, Users,
  Tag, ChevronRight, Linkedin, SlidersHorizontal, Trash2, Pencil, Clock, ArrowLeft,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type CompanyStub = { id: string; name: string; type: string; website?: string | null };
type PendingContact = Contact & { company?: CompanyStub | null };
type SortKey = "name" | "email" | "type" | "title" | "country" | "added";
type SortDir = "asc" | "desc";

interface Props {
  initialContacts: PendingContact[];
  companies: CompanyStub[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Type options — "Lawyer" removed per user request
const CONTACT_TYPE_OPTIONS = [
  "Advisor / KOL",
  "Ecosystem",
  "Employee",
  "Founder / Mgmt",
  "Government/Academic",
  "Investor",
  "Limited Partner",
  "Other",
  "Strategic",
] as const;

type ContactTypeStr = (typeof CONTACT_TYPE_OPTIONS)[number];

// Titles — full alphabetic list matching Admin → Contacts
const TITLE_OPTIONS = [
  "Admin",
  "Advisor",
  "Analyst",
  "Associate",
  "Board Member",
  "CEO",
  "CEO / Co-founder",
  "CFO",
  "Chief of Staff",
  "Co-Founder",
  "COO",
  "CTO",
  "CTO / Co-founder",
  "Director",
  "Founder",
  "General Counsel",
  "General Partner",
  "Head of Investments",
  "Head of Portfolio",
  "Investment Manager",
  "Managing Director",
  "Managing Partner",
  "Operating Partner",
  "Partner",
  "Portfolio Manager",
  "President",
  "Principal",
  "Senior Associate",
  "Senior Vice President",
  "Venture Partner",
  "Vice President",
  "Other",
] as const;

// Countries — alphabetic; "Other (custom…)" allows free entry
const COUNTRY_OPTIONS = [
  "Australia",
  "Brunei",
  "Canada",
  "China",
  "France",
  "Germany",
  "India",
  "Israel",
  "Japan",
  "Malaysia",
  "Singapore",
  "South Korea",
  "Thailand",
  "UK",
  "USA",
] as const;

const CONTACT_TO_COMPANY_TYPE: Partial<Record<ContactTypeStr, CompanyType>> = {
  "Founder / Mgmt":      "startup",
  "Limited Partner":     "lp",
  "Investor":            "fund",
  "Strategic":           "corporate",
  "Ecosystem":           "ecosystem_partner",
  "Government/Academic": "government",
};

// Maps display labels back to the DB enum values the contacts table expects
const CONTACT_DISPLAY_TO_DB_TYPE: Record<string, Contact["type"]> = {
  "Advisor / KOL":       "advisor",
  "Ecosystem":           "ecosystem_partner",
  "Employee":            "other",
  "Founder / Mgmt":      "founder",
  "Government/Academic": "government",
  "Investor":            "fund_manager",
  "Limited Partner":     "lp",
  "Other":               "other",
  "Strategic":           "corporate",
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
  startup:           "Startup",
  lp:                "LP",
  fund:              "Fund / VC",
  ecosystem_partner: "Ecosystem",
  corporate:         "Corporate",
  government:        "Gov / Academic",
  other:             "Other",
  // Legacy DB values
  investor:          "Fund / VC",
  "strategic partner": "Corporate",
  "limited partner": "LP",
};

// Shared input/select height class for consistency
const INPUT_CLS = "h-[28px] text-xs border border-slate-300 rounded px-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-slate-700 w-full";

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractRootDomain(s: string): string {
  return s.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#@]/)[0].toLowerCase();
}
function getEmailDomain(email: string | null): string | null {
  if (!email?.includes("@")) return null;
  return extractRootDomain(email.split("@")[1]);
}
function scoreCompanies(companies: CompanyStub[], emailDomain: string | null): (CompanyStub & { score: number })[] {
  if (!emailDomain) return companies.map(co => ({ ...co, score: 0 }));
  const domainRoot = emailDomain.split(".")[0];
  return companies.map(co => {
    if (co.website != null) {
      const siteDomain = extractRootDomain(co.website);
      if (siteDomain === emailDomain || siteDomain.endsWith("." + emailDomain) || emailDomain.endsWith("." + siteDomain))
        return { ...co, score: 3 };
    }
    const nameLower = co.name.toLowerCase().replace(/\s+/g, "");
    if (nameLower.includes(domainRoot) || domainRoot.includes(nameLower.slice(0, 5)))
      return { ...co, score: 2 };
    return { ...co, score: 0 };
  });
}

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
  if ((CONTACT_TYPE_OPTIONS as readonly string[]).includes(raw)) return raw;
  return map[raw] ?? "Other";
}

// ── CompanyRow ─────────────────────────────────────────────────────────────────

const CompanyRow = memo(function CompanyRow({
  company, selected, onSelect, onExpand,
}: { company: CompanyStub & { score: number }; selected: boolean; onSelect: () => void; onExpand: () => void }) {
  return (
    <div className={cn("flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer", selected && "bg-blue-50")}>
      <div
        className={cn("w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center",
          selected ? "bg-blue-600 border-blue-600" : "border-slate-300 hover:border-blue-400")}
        onClick={onSelect}
      >
        {selected && <Check size={9} className="text-white" />}
      </div>
      <button type="button" onClick={onSelect} className="flex-1 flex items-center gap-1.5 text-left min-w-0">
        <span className={cn("text-xs truncate flex-1", selected ? "text-blue-800 font-semibold" : "text-slate-700")}>
          {company.name}
        </span>
        <span className={cn("text-[9px] px-1 py-0.5 rounded border font-medium flex-shrink-0",
          TYPE_BADGE[company.type] ?? "bg-slate-50 text-slate-500 border-slate-200")}>
          {TYPE_LABEL[company.type] ?? company.type}
        </span>
      </button>
      <button type="button" onClick={e => { e.stopPropagation(); onExpand(); }}
        className="flex items-center gap-0.5 text-[9px] text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded px-1 py-0.5 font-medium flex-shrink-0">
        <Maximize2 size={8} />
      </button>
    </div>
  );
});

// ── CompanyDropdown ────────────────────────────────────────────────────────────

interface CompanyDropdownProps {
  contactEmail: string | null;
  allCompanies: CompanyStub[];
  value: string;
  placeholder: string;
  onChange: (id: string) => void;
  onExpand: (id: string) => void;
  onCreateNew: (name: string, type: string) => Promise<string | null>;
}

function CompanyDropdown({ contactEmail, allCompanies, value, placeholder, onChange, onExpand, onCreateNew }: CompanyDropdownProps) {
  const [open, setOpen]           = useState(false);
  const [search, setSearch]       = useState("");
  const [creating, setCreating]   = useState(false);
  const [newName, setNewName]     = useState("");
  const [newType, setNewType]     = useState("startup");
  const [saving, setSaving]       = useState(false);
  const [showPartnerDropdown, setShowPartnerDropdown] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId]     = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const emailDomain = useMemo(() => getEmailDomain(contactEmail), [contactEmail]);
  const scored = useMemo(() => scoreCompanies(allCompanies, emailDomain), [allCompanies, emailDomain]);
  const q = search.toLowerCase();
  const filtered = useMemo(() =>
    scored.filter(c => !q || c.name.toLowerCase().includes(q)).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
    [scored, q]);
  const topMatches = useMemo(() => filtered.filter(c => c.score >= 2), [filtered]);
  const showTop = topMatches.length > 0 && !q;

  useEffect(() => {
    if (!open) return;
    function outside(e: MouseEvent) { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  const selectedCompany = useMemo(() => allCompanies.find(c => c.id === value), [allCompanies, value]);

  function pick(id: string) { onChange(id); setOpen(false); setSearch(""); setCreating(false); }

  async function handleCreate() {
    if (!newName.trim()) return;
    setSaving(true);
    const id = await onCreateNew(newName.trim(), newType);
    if (id) { pick(id); }
    setSaving(false);
    setCreating(false);
    setNewName("");
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <button type="button" onClick={() => setOpen(v => !v)}
        className={cn(INPUT_CLS, "flex items-center justify-between gap-1 cursor-pointer pr-2")}>
        <span className={cn("truncate flex-1 text-left", !selectedCompany && "text-slate-300")}>
          {selectedCompany?.name ?? placeholder}
        </span>
        {selectedCompany && (
          <span className={cn("text-[9px] px-1 py-0.5 rounded border font-medium flex-shrink-0",
            TYPE_BADGE[selectedCompany.type] ?? "bg-slate-50 text-slate-500 border-slate-200")}>
            {TYPE_LABEL[selectedCompany.type] ?? selectedCompany.type}
          </span>
        )}
        <ChevronDown size={11} className="text-slate-400 flex-shrink-0 ml-0.5" />
      </button>

      {open && (
        <div className="absolute z-30 top-full left-0 mt-0.5 w-64 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
          <div className="p-1.5 border-b border-slate-100">
            <div className="flex items-center gap-1 px-2 py-1 bg-slate-50 rounded">
              <Search size={11} className="text-slate-400 flex-shrink-0" />
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search companies…"
                className="flex-1 text-xs bg-transparent outline-none placeholder:text-slate-400" />
              {search && <button onClick={() => setSearch("")}><X size={10} className="text-slate-400" /></button>}
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {showTop && (
              <>
                <p className="px-3 pt-1.5 pb-0.5 text-[9px] text-slate-400 uppercase tracking-wider font-semibold">Best match</p>
                {topMatches.map(co => (
                  <CompanyRow key={co.id} company={co} selected={value === co.id}
                    onSelect={() => pick(co.id)} onExpand={() => { onExpand(co.id); setOpen(false); }} />
                ))}
                {filtered.filter(c => c.score < 2).length > 0 && <div className="mx-3 my-0.5 border-t border-slate-100" />}
              </>
            )}
            {filtered.filter(c => showTop ? c.score < 2 : true).map(co => (
              <CompanyRow key={co.id} company={co} selected={value === co.id}
                onSelect={() => pick(co.id)} onExpand={() => { onExpand(co.id); setOpen(false); }} />
            ))}
            {filtered.length === 0 && <p className="px-3 py-4 text-xs text-slate-400 text-center">No companies found</p>}
          </div>
          <div className="border-t border-slate-100">
            {!creating ? (
              <button onClick={() => { setCreating(true); setNewName(search); setShowPartnerDropdown(false); setSelectedPartnerId(null); }}
                className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 transition-colors font-medium">
                <Plus size={11} /> Create new company
              </button>
            ) : (
              <div className="p-2 space-y-1.5">
                <input value={newName} onChange={e => { setNewName(e.target.value); setShowPartnerDropdown(true); }}
                  onFocus={() => setShowPartnerDropdown(true)}
                  onBlur={() => setTimeout(() => setShowPartnerDropdown(false), 150)}
                  placeholder="Company name"
                  className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                {showPartnerDropdown && (
                  <div className="absolute z-40 left-1.5 right-1.5 bg-white border border-slate-200 rounded shadow-lg max-h-32 overflow-y-auto">
                    {allCompanies.filter(c => !newName || c.name.toLowerCase().includes(newName.toLowerCase())).slice(0, 8).map(c => (
                      <button key={c.id} onMouseDown={() => { pick(c.id); setCreating(false); setSelectedPartnerId(c.id); setShowPartnerDropdown(false); }}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-700">{c.name}</span>
                        <span className={cn("text-[9px] px-1 py-0.5 rounded border font-medium",
                          TYPE_BADGE[c.type] ?? "bg-slate-50 text-slate-500 border-slate-200")}>
                          {TYPE_LABEL[c.type] ?? c.type}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <select value={newType} onChange={e => setNewType(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400">
                  <option value="startup">Startup</option>
                  <option value="fund">Fund / VC</option>
                  <option value="lp">LP</option>
                  <option value="corporate">Corporate</option>
                  <option value="ecosystem_partner">Ecosystem</option>
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
        </div>
      )}
    </div>
  );
}

// ── Company Expand Panel ───────────────────────────────────────────────────────

function CompanyExpandPanel({ companyId, onClose, createMode, onCreated, initialName, onDeleted, onUpdated }: {
  companyId: string;
  onClose: () => void;
  createMode?: boolean;
  onCreated?: (id: string) => void;
  onDeleted?: (id: string) => void;
  onUpdated?: (id: string, updates: Partial<CompanyStub>) => void;
  initialName?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [company, setCompany]   = useState<Company | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading]   = useState(true);
  const [imgError, setImgError] = useState(false);
  const [editing, setEditing]   = useState(false);
  const [editName, setEditName] = useState("");
  const [editWebsite, setEditWebsite]       = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCity, setEditCity]             = useState("");
  const [editCountry, setEditCountry]       = useState("");
  const [editType, setEditType]             = useState("");
  const [saving, setSaving]                 = useState(false);
  const [createSaving, setCreateSaving]     = useState(false);
  const [confirmDelete, setConfirmDelete]   = useState(false);
  const [deleting, setDeleting]             = useState(false);

  // Inline field editing
  const [editingField, setEditingField]     = useState<string | null>(null);
  const [fieldDraft, setFieldDraft]         = useState("");
  const [fieldSaving, setFieldSaving]       = useState(false);
  const [nameError, setNameError]           = useState<string | null>(null);

  // Contact sub-panel
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [ceFirstName, setCeFirstName]       = useState("");
  const [ceLastName, setCeLastName]         = useState("");
  const [ceTitle, setCeTitle]               = useState("");
  const [ceType, setCeType]                 = useState("");
  const [ceLinkedin, setCeLinkedin]         = useState("");
  const [ceCity, setCeCity]                 = useState("");
  const [ceCountry, setCeCountry]           = useState("");
  const [contactSaving, setContactSaving]   = useState(false);

  async function handleDelete() {
    if (!company) return;
    setDeleting(true);
    // Dismiss immediately — no waiting for network
    onDeleted?.(company.id);
    onClose();
    const { error } = await supabase.from("companies").delete().eq("id", company.id);
    if (error) console.error("[delete company]", error);
  }

  useEffect(() => {
    if (createMode) {
      setEditing(true);
      setEditName(initialName ?? "");
      setEditType("startup");
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true); setImgError(false);
      const [{ data: co }, { data: ctcts }] = await Promise.all([
        supabase.from("companies").select("*").eq("id", companyId).single(),
        supabase.from("contacts").select("*").eq("company_id", companyId)
          .order("is_primary_contact", { ascending: false }).limit(5),
      ]);
      if (!cancelled) { setCompany(co as Company | null); setContacts((ctcts as Contact[]) ?? []); setLoading(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  function startEditing() {
    if (!company) return;
    setEditName(company.name);
    setEditWebsite(company.website ?? "");
    setEditDescription(company.description ?? "");
    setEditCity(company.location_city ?? "");
    setEditCountry(company.location_country ?? "");
    setEditType(company.type);
    setEditing(true);
  }
  async function saveEdits() {
    if (createMode) {
      if (!editName.trim()) return;
      setCreateSaving(true);
      const { data, error } = await supabase.from("companies")
        .insert({
          name: editName.trim(),
          type: editType || "startup",
          website: editWebsite.trim() || null,
          description: editDescription.trim() || null,
          location_city: editCity.trim() || null,
          location_country: editCountry.trim() || null,
          status: "active",
        })
        .select("id")
        .single();
      setCreateSaving(false);
      if (error || !data) { console.error("[create company]", error); return; }
      onCreated?.(data.id);
      onClose();
      return;
    }
    if (!company) return;
    setSaving(true);
    const updates: Record<string, unknown> = {
      name: editName.trim() || company.name,
      website: editWebsite.trim() || null,
      description: editDescription.trim() || null,
      location_city: editCity.trim() || null,
      location_country: editCountry.trim() || null,
      type: editType || company.type,
    };
    const { error } = await supabase.from("companies").update(updates).eq("id", company.id);
    setSaving(false);
    if (error) {
      if (error.code === "23505") {
        setNameError(`A company named "${String(updates.name)}" already exists.`);
      } else {
        console.error("[save company]", error);
      }
      return;
    }
    setNameError(null);
    setCompany({ ...company, ...updates } as Company);
    setEditing(false);
    onUpdated?.(company.id, {
      name: String(updates.name ?? company.name),
      type: String(updates.type ?? company.type),
      website: updates.website as string | null | undefined ?? company.website,
    });
  }

  async function saveField(field: string, value: string) {
    if (!company) return;
    setFieldSaving(true);
    setEditingField(null);
    const updates: Record<string, unknown> = {};
    if (field === "name")    updates.name = value.trim() || company.name;
    else if (field === "type")    updates.type = value;
    else if (field === "website") updates.website = value.trim() || null;
    else if (field === "city")    updates.location_city = value.trim() || null;
    else if (field === "country") updates.location_country = value.trim() || null;
    const { error: fErr } = await supabase.from("companies").update(updates).eq("id", company.id);
    if (fErr) {
      setFieldSaving(false);
      if (field === "name" && fErr.code === "23505") {
        setNameError(`A company named "${value.trim()}" already exists.`);
        setEditingField("name"); // re-open inline edit so user can change it
        setFieldDraft(value);
      } else {
        console.error("[saveField]", fErr);
      }
      return;
    }
    setNameError(null);
    const updated = { ...company, ...updates } as Company;
    setCompany(updated);
    onUpdated?.(company.id, {
      name: String(updates.name ?? company.name),
      type: String(updates.type ?? company.type),
      website: (updates.website as string | null | undefined) ?? company.website,
    });
    setFieldSaving(false);
  }

  function openContact(c: Contact) {
    setSelectedContact(c);
    setCeFirstName(c.first_name ?? "");
    setCeLastName(c.last_name ?? "");
    setCeTitle(c.title ?? "");
    setCeType(mapTypeToAdmin(c.type));
    setCeLinkedin(c.linkedin_url ?? "");
    setCeCity(c.location_city ?? "");
    setCeCountry(c.location_country ?? "");
  }

  async function saveContact() {
    if (!selectedContact) return;
    setContactSaving(true);
    const dbType: Contact["type"] = CONTACT_DISPLAY_TO_DB_TYPE[ceType] ?? "other";
    const updates: Partial<Contact> = {
      first_name: ceFirstName.trim() || selectedContact.first_name,
      last_name:  ceLastName.trim() || selectedContact.last_name,
      title:      ceTitle.trim() || selectedContact.title,
      type:       dbType,
      linkedin_url: ceLinkedin.trim() || selectedContact.linkedin_url,
      location_city: ceCity.trim() || selectedContact.location_city,
      location_country: ceCountry.trim() || selectedContact.location_country,
    };
    const { error } = await supabase.from("contacts").update(updates).eq("id", selectedContact.id);
    if (!error) {
      setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, ...updates } as Contact : c));
      setSelectedContact(prev => prev ? { ...prev, ...updates } as Contact : prev);
    }
    setContactSaving(false);
  }

  const domain = company?.website ? company.website.replace(/^https?:\/\//, "").replace(/\/.*$/, "") : null;
  const clearbitUrl = domain ? `https://img.logo.dev/${domain}?token=pk_FYk-9BO1QwS9yyppOxJ2vQ&format=png&size=128` : null;

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-[420px] bg-white shadow-2xl z-50 flex flex-col">
        {selectedContact ? (
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <button onClick={() => setSelectedContact(null)}
                className="p-1 hover:bg-slate-100 rounded transition-colors text-slate-500 hover:text-slate-700">
                <ArrowLeft size={16} />
              </button>
              <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                <span className="text-violet-600 text-[10px] font-bold">
                  {getInitials(`${selectedContact.first_name} ${selectedContact.last_name ?? ""}`)}
                </span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">{selectedContact.first_name} {selectedContact.last_name}</h3>
                <p className="text-[10px] text-slate-400">{selectedContact.title ?? selectedContact.type}</p>
              </div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={18} /></button>
          </div>
        ) : (
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
                <h3 className="text-sm font-semibold text-slate-900">{createMode ? "New Company" : loading ? "Loading…" : company?.name ?? "Company"}</h3>
                {company && (
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded border font-medium",
                    TYPE_BADGE[company.type] ?? "bg-slate-50 text-slate-500 border-slate-200")}>
                    {TYPE_LABEL[company.type] ?? company.type}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {company && !editing && (
                <button onClick={startEditing}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
                  <Pencil size={11} /> Edit
                </button>
              )}
              {company && (
                <a href={`/crm/companies/${company.id}`} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 transition-colors">
                  <Maximize2 size={12} /> Full profile
                </a>
              )}
              <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1"><X size={18} /></button>
            </div>
          </div>
        )}
        {selectedContact ? (
          /* ── Contact edit sub-panel ── */
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] font-semibold text-slate-400 mb-1">First Name</p>
                <input value={ceFirstName} onChange={e => setCeFirstName(e.target.value)}
                  className={INPUT_CLS} />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 mb-1">Last Name</p>
                <input value={ceLastName} onChange={e => setCeLastName(e.target.value)}
                  className={INPUT_CLS} />
              </div>
              <div className="col-span-2">
                <p className="text-[10px] font-semibold text-slate-400 mb-1">Email</p>
                <div className={cn(INPUT_CLS, "flex items-center gap-1 bg-slate-50 text-slate-400 cursor-default")}>
                  <Mail size={10} className="flex-shrink-0" />
                  <span className="truncate text-[11px]">{selectedContact.email ?? "—"}</span>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 mb-1">Title</p>
                <select value={ceTitle} onChange={e => setCeTitle(e.target.value)} className={cn(INPUT_CLS, "cursor-pointer")}>
                  <option value="">— Title —</option>
                  {TITLE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 mb-1">Type</p>
                <select value={ceType} onChange={e => setCeType(e.target.value)} className={cn(INPUT_CLS, "cursor-pointer")}>
                  {CONTACT_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <p className="text-[10px] font-semibold text-slate-400 mb-1">LinkedIn</p>
                <input value={ceLinkedin} onChange={e => setCeLinkedin(e.target.value)}
                  placeholder="https://linkedin.com/in/…"
                  className={INPUT_CLS} />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 mb-1">City</p>
                <input value={ceCity} onChange={e => setCeCity(e.target.value)}
                  placeholder="City" className={INPUT_CLS} />
              </div>
              <div>
                <p className="text-[10px] font-semibold text-slate-400 mb-1">Country</p>
                <input value={ceCountry} onChange={e => setCeCountry(e.target.value)}
                  placeholder="Country" className={INPUT_CLS} />
              </div>
            </div>
            <button onClick={saveContact} disabled={contactSaving}
              className="w-full flex items-center justify-center gap-1.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors">
              {contactSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              {contactSaving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        ) : loading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 size={24} className="text-slate-300 animate-spin" /></div>
        ) : !company ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Company not found.</div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {editing ? (
              <div className="px-5 py-4 border-b border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Edit Company</p>
                  <div className="flex gap-1.5">
                    <button onClick={() => setEditing(false)} className="text-xs px-2.5 py-1 border border-slate-200 rounded text-slate-500 hover:bg-slate-50">Cancel</button>
                    <button onClick={saveEdits} disabled={saving}
                      className="text-xs px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded font-medium flex items-center gap-1">
                      {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Save
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Name</p>
                    <input value={editName} onChange={e => { setEditName(e.target.value); setNameError(null); }} className={cn(INPUT_CLS, nameError && "border-red-400 focus:ring-red-400")} />
                    {nameError && (
                      <p className="text-[10px] text-red-500 mt-0.5 flex items-center gap-1">
                        <X size={9} /> {nameError}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Type</p>
                    <select value={editType} onChange={e => setEditType(e.target.value)} className={cn(INPUT_CLS, "cursor-pointer")}>
                      <option value="startup">Startup</option>
                      <option value="fund">Fund / VC</option>
                      <option value="lp">LP</option>
                      <option value="corporate">Corporate</option>
                      <option value="ecosystem_partner">Ecosystem</option>
                      <option value="government">Government / Academic</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Website</p>
                    <input value={editWebsite} onChange={e => setEditWebsite(e.target.value)} placeholder="https://..." className={INPUT_CLS} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 mb-0.5">City</p>
                      <input value={editCity} onChange={e => setEditCity(e.target.value)} className={INPUT_CLS} />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Country</p>
                      <input value={editCountry} onChange={e => setEditCountry(e.target.value)} className={INPUT_CLS} />
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Description</p>
                    <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} rows={3}
                      className="w-full text-xs border border-slate-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 text-slate-700 resize-none" />
                  </div>
                </div>
              </div>
            ) : (
            <>
            <div className="px-5 py-4 border-b border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">General Information</p>
                <span className="text-[9px] text-slate-300 italic">double-click to edit</span>
                {fieldSaving && <Loader2 size={10} className="animate-spin text-blue-400" />}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {/* Company name */}
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Company</p>
                  {editingField === "name" ? (
                    <input autoFocus value={fieldDraft} onChange={e => { setFieldDraft(e.target.value); setNameError(null); }}
                      onBlur={() => void saveField("name", fieldDraft)}
                      onKeyDown={e => { if (e.key === "Enter") void saveField("name", fieldDraft); if (e.key === "Escape") { setEditingField(null); setNameError(null); } }}
                      className={cn("text-sm font-medium border rounded px-1.5 py-0.5 focus:outline-none w-full", nameError ? "border-red-400 focus:ring-1 focus:ring-red-400" : "border-blue-400")} />
                  ) : (
                    <p className="text-sm text-slate-800 font-medium cursor-pointer hover:bg-blue-50 rounded px-1 -mx-1 py-0.5 transition-colors"
                      onDoubleClick={() => { setEditingField("name"); setFieldDraft(company.name); setNameError(null); }}>
                      {company.name}
                    </p>
                  )}
                  {nameError && editingField === "name" && (
                    <p className="text-[10px] text-red-500 mt-0.5 flex items-center gap-1">
                      <X size={9} /> {nameError}
                    </p>
                  )}
                </div>
                {/* Type */}
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Type</p>
                  {editingField === "type" ? (
                    <select autoFocus value={fieldDraft}
                      onChange={e => void saveField("type", e.target.value)}
                      onBlur={() => setEditingField(null)}
                      className="text-xs border border-blue-400 rounded px-1 py-0.5 focus:outline-none bg-white cursor-pointer w-full">
                      <option value="startup">Startup</option>
                      <option value="fund">Fund / VC</option>
                      <option value="lp">LP</option>
                      <option value="corporate">Corporate</option>
                      <option value="ecosystem_partner">Ecosystem</option>
                      <option value="government">Government / Academic</option>
                      <option value="other">Other</option>
                    </select>
                  ) : (
                    <span
                      onDoubleClick={() => { setEditingField("type"); setFieldDraft(company.type); }}
                      className={cn("inline-flex text-xs px-1.5 py-0.5 rounded border font-medium cursor-pointer hover:ring-1 hover:ring-blue-300",
                        TYPE_BADGE[company.type] ?? "bg-slate-50 text-slate-500 border-slate-200")}>
                      {TYPE_LABEL[company.type] ?? company.type}
                    </span>
                  )}
                </div>
                {/* Website */}
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Website</p>
                  {editingField === "website" ? (
                    <input autoFocus value={fieldDraft} onChange={e => setFieldDraft(e.target.value)}
                      onBlur={() => void saveField("website", fieldDraft)}
                      onKeyDown={e => { if (e.key === "Enter") void saveField("website", fieldDraft); if (e.key === "Escape") setEditingField(null); }}
                      placeholder="https://…"
                      className="text-xs border border-blue-400 rounded px-1.5 py-0.5 focus:outline-none w-full" />
                  ) : company.website ? (
                    <div className="flex items-center gap-1 group cursor-pointer"
                      onDoubleClick={() => { setEditingField("website"); setFieldDraft(company.website ?? ""); }}>
                      <a href={company.website} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                        onClick={e => e.stopPropagation()}>
                        <Globe size={11} />{company.website.replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}
                      </a>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-300 italic cursor-pointer hover:text-slate-400"
                      onDoubleClick={() => { setEditingField("website"); setFieldDraft(""); }}>
                      Add website…
                    </p>
                  )}
                </div>
                {/* LinkedIn */}
                {company.linkedin_url && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 mb-0.5">LinkedIn</p>
                    <a href={company.linkedin_url} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                      <Linkedin size={11} /> Profile
                    </a>
                  </div>
                )}
                {/* Location */}
                <div className="col-span-2">
                  <p className="text-[10px] font-semibold text-slate-400 mb-0.5">Location</p>
                  <div className="grid grid-cols-2 gap-2">
                    {editingField === "city" ? (
                      <input autoFocus value={fieldDraft} onChange={e => setFieldDraft(e.target.value)}
                        onBlur={() => void saveField("city", fieldDraft)}
                        onKeyDown={e => { if (e.key === "Enter") void saveField("city", fieldDraft); if (e.key === "Escape") setEditingField(null); }}
                        placeholder="City"
                        className="text-sm border border-blue-400 rounded px-1.5 py-0.5 focus:outline-none" />
                    ) : (
                      <p className="text-sm text-slate-700 flex items-center gap-1 cursor-pointer hover:bg-blue-50 rounded px-1 -mx-1 py-0.5 transition-colors"
                        onDoubleClick={() => { setEditingField("city"); setFieldDraft(company.location_city ?? ""); }}>
                        <MapPin size={11} className="text-slate-400 flex-shrink-0" />
                        {company.location_city || <span className="text-slate-300 italic text-xs">City</span>}
                      </p>
                    )}
                    {editingField === "country" ? (
                      <input autoFocus value={fieldDraft} onChange={e => setFieldDraft(e.target.value)}
                        onBlur={() => void saveField("country", fieldDraft)}
                        onKeyDown={e => { if (e.key === "Enter") void saveField("country", fieldDraft); if (e.key === "Escape") setEditingField(null); }}
                        placeholder="Country"
                        className="text-sm border border-blue-400 rounded px-1.5 py-0.5 focus:outline-none" />
                    ) : (
                      <p className="text-sm text-slate-700 cursor-pointer hover:bg-blue-50 rounded px-1 -mx-1 py-0.5 transition-colors"
                        onDoubleClick={() => { setEditingField("country"); setFieldDraft(company.location_country ?? ""); }}>
                        {company.location_country || <span className="text-slate-300 italic text-xs">Country</span>}
                      </p>
                    )}
                  </div>
                </div>
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
            </>
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
                    <button key={c.id} onClick={() => openContact(c)}
                      className="w-full flex items-center gap-3 p-2.5 bg-slate-50 hover:bg-blue-50 hover:border-blue-200 border border-transparent rounded-lg transition-all text-left group">
                      <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-violet-600 text-[10px] font-bold">
                          {getInitials(`${c.first_name} ${c.last_name ?? ""}`)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-800 truncate group-hover:text-blue-700">
                          {c.first_name} {c.last_name}
                          {c.is_primary_contact && (
                            <span className="ml-1.5 text-[9px] text-blue-600 bg-blue-50 px-1 py-0.5 rounded">Primary</span>
                          )}
                        </p>
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] text-slate-400 truncate">{c.title ?? c.type}</p>
                          {c.last_contact_date && (
                            <span className="text-[9px] text-slate-300 flex items-center gap-0.5 flex-shrink-0">
                              <Clock size={8} /> {formatDate(c.last_contact_date)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1.5 text-slate-300 items-center">
                        {c.email && <a href={`mailto:${c.email}`} onClick={e => e.stopPropagation()} className="hover:text-blue-600 transition-colors"><Mail size={12} /></a>}
                        {c.linkedin_url && <a href={c.linkedin_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="hover:text-blue-600 transition-colors"><ExternalLink size={12} /></a>}
                        <ChevronRight size={11} className="text-slate-300 group-hover:text-blue-400 transition-colors" />
                      </div>
                    </button>
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
        {company && !createMode && !selectedContact && (
          <div className="px-5 py-4 border-t border-slate-200 space-y-2">
            <a href={`/crm/companies/${company.id}`}
              className="flex items-center justify-center gap-2 w-full py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors">
              Open Full Profile <ChevronRight size={14} />
            </a>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600 flex-1">Delete this company and unlink all contacts?</span>
                <button onClick={() => setConfirmDelete(false)} className="text-xs px-2.5 py-1 border border-slate-200 rounded text-slate-500 hover:bg-slate-50">Cancel</button>
                <button onClick={handleDelete} disabled={deleting}
                  className="text-xs px-2.5 py-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded font-medium flex items-center gap-1">
                  {deleting ? <Loader2 size={10} className="animate-spin" /> : <Trash2 size={10} />} Delete
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)}
                className="flex items-center justify-center gap-1.5 w-full py-2 border border-red-200 text-red-500 hover:bg-red-50 text-sm font-medium rounded-lg transition-colors">
                <Trash2 size={13} /> Delete Company
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── ContactRow ────────────────────────────────────────────────────────────────

const ContactRow = memo(function ContactRow({
  contact, allCompanies, onConfirmed, onDiscarded, onExpand,
  onCompanyUpdated, customCountries, onAddCustomCountry,
}: {
  contact: PendingContact;
  allCompanies: CompanyStub[];
  onConfirmed: (id: string) => void;
  onDiscarded: (id: string) => void;
  onExpand: (id: string) => void;
  onCompanyUpdated: (id: string, updates: Partial<CompanyStub>) => void;
  customCountries: string[];
  onAddCustomCountry: (country: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [firstName, setFirstName] = useState(contact.first_name ?? "");
  const [lastName,  setLastName]  = useState(contact.last_name ?? "");
  const [type,      setType]      = useState<string>(() => mapTypeToAdmin(contact.type));
  const [title,     setTitle]     = useState(contact.title ?? "");
  const [customTitle, setCustomTitle] = useState("");
  const [companyId, setCompanyId] = useState(contact.company_id ?? "");
  const [city,      setCity]      = useState(contact.location_city ?? "");
  const [country,   setCountry]   = useState(() => {
    const c = contact.location_country ?? "";
    return (COUNTRY_OPTIONS as readonly string[]).includes(c) ? c : (c ? "__custom__" : "");
  });
  const [customCountry, setCustomCountry] = useState(() => {
    const c = contact.location_country ?? "";
    return (COUNTRY_OPTIONS as readonly string[]).includes(c) ? "" : c;
  });
  const [busy, setBusy] = useState(false);
  const [extraCompanies, setExtraCompanies] = useState<CompanyStub[]>([]);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [createPanelName, setCreatePanelName] = useState("");

  const mergedCompanies = useMemo(
    () => (extraCompanies.length ? [...extraCompanies, ...allCompanies] : allCompanies),
    [extraCompanies, allCompanies]
  );

  const handleCreateCompany = useCallback(async (name: string, _coType: string): Promise<string | null> => {
    setCreatePanelName(name);
    setShowCreatePanel(true);
    return null; // panel will handle creation
  }, []);

  const handleCompanyCreated = useCallback(async (newId: string) => {
    const { data } = await supabase.from("companies").select("id, name, type, website").eq("id", newId).single();
    if (data) {
      const stub = data as CompanyStub;
      setExtraCompanies(prev => [stub, ...prev]);
      setCompanyId(stub.id);
    }
    setShowCreatePanel(false);
  }, [supabase]);

  const resolvedTitle   = title === "Other" ? customTitle : title;
  const resolvedCountry = country === "__custom__" ? customCountry : country;

  async function confirm() {
    if (!type || !resolvedCountry) return;
    setBusy(true);
    const resolvedCompanyId = companyId || null;
    const targetType = CONTACT_TO_COMPANY_TYPE[type as ContactTypeStr];
    // Persist custom country for future dropdowns
    if (country === "__custom__" && customCountry.trim()) {
      onAddCustomCountry(customCountry.trim());
    }
    // Dismiss immediately — no waiting for network
    onConfirmed(contact.id);
    // Map display label back to DB enum value before saving
    const dbType: Contact["type"] = CONTACT_DISPLAY_TO_DB_TYPE[type] ?? "other";
    // Run DB saves concurrently in background (component may unmount)
    const contactSave = supabase.from("contacts").update({
      first_name: firstName.trim() || contact.first_name,
      last_name:  lastName.trim()  || contact.last_name,
      type:       dbType,
      title:      resolvedTitle || null,
      company_id: resolvedCompanyId,
      location_city:    city.trim() || null,
      location_country: resolvedCountry,
      status: "active",
    }).eq("id", contact.id);
    const companySave = (resolvedCompanyId && targetType)
      ? (() => {
          const co = mergedCompanies.find(c => c.id === resolvedCompanyId);
          return co && (!co.type || co.type === "other")
            ? supabase.from("companies").update({ type: targetType }).eq("id", resolvedCompanyId)
            : null;
        })()
      : null;
    const [{ error: ce }, coResult] = await Promise.all([contactSave, companySave ?? Promise.resolve({ error: null })]);
    if (ce) console.error("[confirm] contact save error:", ce);
    if ((coResult as { error: unknown } | null)?.error) console.error("[confirm] company save error:", (coResult as { error: unknown }).error);
  }

  async function discard() {
    setBusy(true);
    // Dismiss immediately — no waiting for network
    onDiscarded(contact.id);
    const { error } = await supabase.from("contacts").update({ status: "archived" }).eq("id", contact.id);
    if (error) console.error("[discard] update failed:", error);
  }

  const initials = getInitials(`${firstName} ${lastName}`);

  return (
    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2.5 hover:border-slate-300 hover:bg-slate-50/40 transition-all">

      {/* Avatar */}
      <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
        <span className="text-violet-600 text-[10px] font-bold">{initials}</span>
      </div>

      {/* Name */}
      <div className="w-48 flex-shrink-0 flex gap-1">
        <input value={firstName} onChange={e => setFirstName(e.target.value)} placeholder="First"
          className={cn(INPUT_CLS, "w-1/2")} />
        <input value={lastName} onChange={e => setLastName(e.target.value)} placeholder="Last"
          className={cn(INPUT_CLS, "w-1/2")} />
      </div>

      {/* Email — fixed, not editable */}
      <div className="w-56 flex-shrink-0">
        <div className={cn(INPUT_CLS, "flex items-center gap-1 bg-slate-50 text-slate-500 cursor-default overflow-hidden")}>
          <Mail size={10} className="flex-shrink-0 text-slate-400" />
          <span className="truncate text-[11px]">{contact.email ?? "—"}</span>
        </div>
      </div>

      {/* Type */}
      <select value={type} onChange={e => setType(e.target.value)}
        className={cn(INPUT_CLS, "w-36 flex-shrink-0 cursor-pointer")}>
        {CONTACT_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
      </select>

      {/* Title */}
      <div className="w-32 flex-shrink-0 space-y-1">
        <select value={title} onChange={e => setTitle(e.target.value)}
          className={cn(INPUT_CLS, "cursor-pointer")}>
          <option value="">— Title —</option>
          {TITLE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {title === "Other" && (
          <input value={customTitle} onChange={e => setCustomTitle(e.target.value)}
            placeholder="Custom title"
            className={cn(INPUT_CLS)} />
        )}
      </div>

      {/* Company */}
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
      <input value={city} onChange={e => setCity(e.target.value)} placeholder="City"
        className={cn(INPUT_CLS, "w-20 flex-shrink-0")} />

      {/* Country */}
      <div className="w-28 flex-shrink-0 space-y-1">
        <select value={country} onChange={e => setCountry(e.target.value)}
          className={cn(INPUT_CLS, "cursor-pointer")}>
          <option value="">Country</option>
          {[...COUNTRY_OPTIONS, ...customCountries.filter(c => !(COUNTRY_OPTIONS as readonly string[]).includes(c))].sort().map(c => <option key={c} value={c}>{c}</option>)}
          <option value="__custom__">Other (type below)…</option>
        </select>
        {country === "__custom__" && (
          <input value={customCountry} onChange={e => setCustomCountry(e.target.value)}
            placeholder="Country name"
            className={cn(INPUT_CLS)} />
        )}
      </div>

      {/* Added date */}
      <span className="text-[10px] text-slate-400 flex-shrink-0 w-20 truncate text-right">
        {formatDate(contact.created_at)}
      </span>

      {/* Actions */}
      <div className="flex gap-1 flex-shrink-0 ml-auto">
        <button onClick={confirm} disabled={busy || !type || !resolvedCountry}
          className="flex items-center gap-1 px-2.5 h-[28px] bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-medium rounded transition-colors">
          {busy ? <Loader2 size={10} className="animate-spin" /> : <Check size={11} />}
          Confirm
        </button>
        <button onClick={discard} disabled={busy} title="Discard"
          className="flex items-center justify-center w-7 h-[28px] border border-red-200 hover:bg-red-50 disabled:opacity-50 text-red-400 rounded transition-colors">
          <X size={12} />
        </button>
      </div>

      {showCreatePanel && (
        <CompanyExpandPanel
          companyId=""
          createMode
          initialName={createPanelName}
          onCreated={handleCompanyCreated}
          onClose={() => setShowCreatePanel(false)}
          onUpdated={onCompanyUpdated}
        />
      )}
    </div>
  );
});

// ── SortHeader ─────────────────────────────────────────────────────────────────

function SortHeader({ label, sortKey, active, dir, onSort, className }: {
  label: string; sortKey: SortKey; active: boolean; dir: SortDir;
  onSort: (k: SortKey) => void; className?: string;
}) {
  return (
    <button onClick={() => onSort(sortKey)}
      className={cn("flex items-center gap-0.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider hover:text-slate-600 transition-colors", className)}>
      {label}
      {active
        ? (dir === "asc" ? <ChevronUp size={10} className="text-blue-500" /> : <ChevronDown size={10} className="text-blue-500" />)
        : <ChevronDown size={10} className="opacity-30" />}
    </button>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

const LS_EXCLUSIONS_KEY  = "pending_contacts_exclusions";
const LS_COUNTRIES_KEY   = "pending_contacts_custom_countries";

export function PendingContactsClient({ initialContacts, companies }: Props) {
  const [contacts, setContacts]               = useState<PendingContact[]>(initialContacts);
  const [companiesState, setCompaniesState]   = useState<CompanyStub[]>(companies);
  const [expandedCompanyId, setExpandedCompanyId] = useState<string | null>(null);
  const [customCountries, setCustomCountries] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(LS_COUNTRIES_KEY) ?? "[]") as string[]; } catch { return []; }
  });
  const [sortKey, setSortKey]                 = useState<SortKey>("added");
  const [sortDir, setSortDir]                 = useState<SortDir>("desc");
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [exclusions, setExclusions]           = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(LS_EXCLUSIONS_KEY) ?? "[]") as string[]; } catch { return []; }
  });
  const [newExclusion, setNewExclusion]       = useState("");

  // Persist exclusions to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(LS_EXCLUSIONS_KEY, JSON.stringify(exclusions));
  }, [exclusions]);

  function addExclusion() {
    const word = newExclusion.trim().toLowerCase();
    if (!word || exclusions.includes(word)) return;
    setExclusions(prev => [...prev, word]);
    setNewExclusion("");
  }
  function removeExclusion(word: string) {
    setExclusions(prev => prev.filter(e => e !== word));
  }

  // Filter contacts by exclusion words
  const visibleContacts = useMemo(() => {
    if (!exclusions.length) return contacts;
    return contacts.filter(c => {
      const email = (c.email ?? "").toLowerCase();
      return !exclusions.some(ex => email.includes(ex));
    });
  }, [contacts, exclusions]);

  const hiddenCount = contacts.length - visibleContacts.length;

  // Sort
  const sortedContacts = useMemo(() => {
    return [...visibleContacts].sort((a, b) => {
      let av = "", bv = "";
      if (sortKey === "name")    { av = `${a.first_name} ${a.last_name ?? ""}`.toLowerCase(); bv = `${b.first_name} ${b.last_name ?? ""}`.toLowerCase(); }
      if (sortKey === "email")   { av = a.email ?? ""; bv = b.email ?? ""; }
      if (sortKey === "type")    { av = a.type ?? ""; bv = b.type ?? ""; }
      if (sortKey === "title")   { av = a.title ?? ""; bv = b.title ?? ""; }
      if (sortKey === "country") { av = a.location_country ?? ""; bv = b.location_country ?? ""; }
      if (sortKey === "added")   { av = a.created_at ?? ""; bv = b.created_at ?? ""; }
      const cmp = av.localeCompare(bv);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [visibleContacts, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  const handleConfirmed = useCallback((id: string) => { setContacts(prev => prev.filter(c => c.id !== id)); }, []);
  const handleDiscarded = useCallback((id: string) => { setContacts(prev => prev.filter(c => c.id !== id)); }, []);
  const handleExpand    = useCallback((id: string) => { setExpandedCompanyId(id); }, []);

  const handleCompanyUpdated = useCallback((id: string, updates: Partial<CompanyStub>) => {
    setCompaniesState(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, []);

  const handleAddCustomCountry = useCallback((country: string) => {
    if (!country) return;
    setCustomCountries(prev => {
      if (prev.includes(country)) return prev;
      const next = [...prev, country].sort();
      localStorage.setItem(LS_COUNTRIES_KEY, JSON.stringify(next));
      return next;
    });
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

      {/* Banner + controls */}
      <div className="mb-3 flex items-center gap-3 flex-wrap">
        <div className="flex-1 px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-700 flex items-center gap-2">
          <span className="font-semibold">{visibleContacts.length} contact{visibleContacts.length !== 1 ? "s" : ""}</span>
          <span>need enrichment. Fill in the fields then click <strong>Confirm</strong>.</span>
          {hiddenCount > 0 && (
            <span className="ml-auto text-slate-500 italic">{hiddenCount} hidden by email filter</span>
          )}
        </div>
        <button onClick={() => setShowFilterPanel(v => !v)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border transition-colors",
            showFilterPanel
              ? "bg-blue-600 border-blue-600 text-white"
              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
          )}>
          <SlidersHorizontal size={12} />
          Email Filter {exclusions.length > 0 && `(${exclusions.length})`}
        </button>
      </div>

      {/* Email exclusion filter panel */}
      {showFilterPanel && (
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-amber-800 mb-0.5">Exclude emails containing these words</p>
            <p className="text-[11px] text-amber-600">Contacts whose email address contains any of these words will be hidden from this list. Case-insensitive.</p>
          </div>

          {/* Existing exclusion tags */}
          {exclusions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {exclusions.map(word => (
                <span key={word} className="flex items-center gap-1 px-2 py-1 bg-white border border-amber-300 rounded-lg text-xs text-amber-800 font-mono">
                  {word}
                  <button onClick={() => removeExclusion(word)} className="text-amber-400 hover:text-red-500 transition-colors">
                    <Trash2 size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Add new exclusion */}
          <div className="flex gap-2">
            <input
              value={newExclusion}
              onChange={e => setNewExclusion(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addExclusion()}
              placeholder="e.g. info, marketing, newsletter, noreply…"
              className="flex-1 h-[28px] text-xs border border-amber-300 rounded-lg px-3 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 text-slate-700 placeholder:text-slate-400"
            />
            <button onClick={addExclusion} disabled={!newExclusion.trim()}
              className="flex items-center gap-1 px-3 h-[28px] bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors">
              <Plus size={11} /> Add
            </button>
          </div>

          <p className="text-[10px] text-amber-500">
            Common exclusions: <button onClick={() => { const common = ["info", "marketing", "newsletter", "noreply", "no-reply", "donotreply", "notifications", "updates", "alerts", "bounce", "support", "hello", "contact"]; setExclusions(prev => [...prev, ...common.filter(w => !prev.includes(w))]); }} className="underline hover:text-amber-700">Add common spam patterns</button>
          </p>
        </div>
      )}

      {/* Column headers */}
      <div className="flex items-center gap-2 px-3 mb-1">
        <div className="w-7 flex-shrink-0" />
        <SortHeader label="Name / Contact" sortKey="name"    active={sortKey==="name"}    dir={sortDir} onSort={handleSort} className="w-48 flex-shrink-0" />
        <SortHeader label="Email"          sortKey="email"   active={sortKey==="email"}   dir={sortDir} onSort={handleSort} className="w-56 flex-shrink-0" />
        <SortHeader label="Type *"         sortKey="type"    active={sortKey==="type"}    dir={sortDir} onSort={handleSort} className="w-36 flex-shrink-0" />
        <SortHeader label="Title"          sortKey="title"   active={sortKey==="title"}   dir={sortDir} onSort={handleSort} className="w-32 flex-shrink-0" />
        <div className="w-48 flex-shrink-0 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Company</div>
        <div className="w-20 flex-shrink-0 text-[10px] font-bold text-slate-400 uppercase tracking-wider">City</div>
        <SortHeader label="Country *"      sortKey="country" active={sortKey==="country"} dir={sortDir} onSort={handleSort} className="w-28 flex-shrink-0" />
        <SortHeader label="Added"          sortKey="added"   active={sortKey==="added"}   dir={sortDir} onSort={handleSort} className="w-20 flex-shrink-0 justify-end" />
      </div>

      {/* Rows */}
      <div className="space-y-1">
        {sortedContacts.map(c => (
          <ContactRow
            key={c.id}
            contact={c}
            allCompanies={companiesState}
            onConfirmed={handleConfirmed}
            onDiscarded={handleDiscarded}
            onExpand={handleExpand}
            onCompanyUpdated={handleCompanyUpdated}
            customCountries={customCountries}
            onAddCustomCountry={handleAddCustomCountry}
          />
        ))}
      </div>

      {expandedCompanyId && (
        <CompanyExpandPanel
          companyId={expandedCompanyId}
          onClose={() => setExpandedCompanyId(null)}
          onDeleted={(id) => {
            setContacts(prev => prev.map(c => c.company_id === id ? { ...c, company_id: null, company: undefined } : c));
            setExpandedCompanyId(null);
          }}
          onUpdated={handleCompanyUpdated}
        />
      )}
    </div>
  );
}
