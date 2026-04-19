"use client";
// ─── New Contacts — two-column review queue ───────────────────────────────────
// Left:  virtualized list (one 48 px row per contact, no form state).
// Right: single detail panel (one controlled form at a time).
// Performance target: <50 DOM rows rendered, <16 ms per keystroke.

import {
  useState, useRef, useEffect, useCallback, useMemo, memo,
  useTransition,
} from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useVirtualizer } from "@tanstack/react-virtual";
import { createClient } from "@/lib/supabase/client";
import type { Contact, CompanyType, Company } from "@/lib/types";
import { getInitials, formatDate, cn } from "@/lib/utils";
import {
  COMPANY_TYPE_OPTIONS,
  INVESTOR_TYPE_OPTIONS,
  STRATEGIC_TYPE_OPTIONS,
  LP_TYPE_OPTIONS,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Check, X, Mail, ExternalLink, UserPlus, Maximize2, Loader2,
  Search, ChevronDown, ChevronUp, Plus, MapPin, Globe, Users,
  Tag, ChevronRight, Linkedin, SlidersHorizontal, Trash2, Pencil,
  Clock, ArrowLeft, FileText, Upload, Download, CheckSquare, Square,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type CompanyStub = { id: string; name: string; type: string; website?: string | null };
type PendingContact = Contact & { company?: CompanyStub | null };
type SortKey = "name" | "email" | "type" | "title" | "country" | "added";
type SortDir = "asc" | "desc";

interface Props {
  initialContacts: PendingContact[];
  companies: CompanyStub[];
  total: number;
  cursor: number;
  pageSize: number;
  initialQuery: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

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

const TITLE_OPTIONS = [
  "Admin", "Advisor", "Analyst", "Associate", "Board Member",
  "CEO", "CEO / Co-founder", "CFO", "Chief of Staff", "Co-Founder",
  "COO", "CTO", "CTO / Co-founder", "Director", "Founder",
  "General Counsel", "General Partner", "Head of Investments",
  "Head of Portfolio", "Investment Manager", "Managing Director",
  "Managing Partner", "Operating Partner", "Partner",
  "Portfolio Manager", "President", "Principal", "Senior Associate",
  "Senior Vice President", "Venture Partner", "Vice President", "Other",
] as const;

const COUNTRY_OPTIONS = [
  "Australia", "Brunei", "Canada", "China", "France", "Germany",
  "India", "Israel", "Japan", "Malaysia", "Singapore", "South Korea",
  "Thailand", "UK", "USA",
] as const;

const CONTACT_TO_COMPANY_TYPE: Partial<Record<ContactTypeStr, CompanyType>> = {
  "Founder / Mgmt":      "startup",
  "Limited Partner":     "lp",
  "Investor":            "fund",
  "Strategic":           "corporate",
  "Ecosystem":           "ecosystem_partner",
  "Government/Academic": "government",
};

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
  investor:          "Fund / VC",
  "strategic partner": "Corporate",
  "limited partner": "LP",
};

const INPUT_CLS =
  "h-9 text-sm border border-slate-300 rounded-md px-3 bg-white focus:outline-none focus:ring-2 focus:ring-brand-teal/40 focus:border-brand-teal text-slate-700 w-full transition-colors";

const LS_COUNTRIES_KEY  = "pending_contacts_custom_countries";
const LS_EXCLUSIONS_KEY = "pending_contacts_exclusions";

// ── Helpers ────────────────────────────────────────────────────────────────────

function extractRootDomain(s: string): string {
  return s.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#@]/)[0].toLowerCase();
}
function getEmailDomain(email: string | null): string | null {
  if (!email?.includes("@")) return null;
  return extractRootDomain(email.split("@")[1]);
}
function scoreCompanies(
  companies: CompanyStub[],
  emailDomain: string | null
): (CompanyStub & { score: number })[] {
  if (!emailDomain) return companies.map(co => ({ ...co, score: 0 }));
  const domainRoot = emailDomain.split(".")[0];
  return companies.map(co => {
    if (co.website != null) {
      const siteDomain = extractRootDomain(co.website);
      if (
        siteDomain === emailDomain ||
        siteDomain.endsWith("." + emailDomain) ||
        emailDomain.endsWith("." + siteDomain)
      )
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

// ── CompanyRow (inside CompanyDropdown list) ───────────────────────────────────

const CompanyRow = memo(function CompanyRow({
  company, selected, onSelect, onExpand,
}: {
  company: CompanyStub & { score: number };
  selected: boolean;
  onSelect: () => void;
  onExpand: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer",
        selected && "bg-brand-tealTint"
      )}
    >
      <div
        className={cn(
          "w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center",
          selected
            ? "bg-brand-teal border-brand-teal"
            : "border-slate-300 hover:border-brand-teal"
        )}
        onClick={onSelect}
      >
        {selected && <Check size={9} className="text-white" />}
      </div>
      <button
        type="button"
        onClick={onSelect}
        className="flex-1 flex items-center gap-1.5 text-left min-w-0"
      >
        <span
          className={cn(
            "text-xs truncate flex-1",
            selected ? "text-brand-teal font-semibold" : "text-slate-700"
          )}
        >
          {company.name}
        </span>
        <span
          className={cn(
            "text-[9px] px-1 py-0.5 rounded border font-medium flex-shrink-0",
            TYPE_BADGE[company.type] ?? "bg-slate-50 text-slate-500 border-slate-200"
          )}
        >
          {TYPE_LABEL[company.type] ?? company.type}
        </span>
      </button>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onExpand(); }}
        className="flex items-center gap-0.5 text-[9px] text-brand-teal hover:text-brand-tealDark bg-brand-tealTint hover:bg-teal-100 border border-teal-200 rounded px-1 py-0.5 font-medium flex-shrink-0"
      >
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
  defaultCompanyType?: string;
  onTypeChange?: (companyId: string, newType: string) => void;
}

function CompanyDropdown({
  contactEmail, allCompanies, value, placeholder, onChange,
  onExpand, onCreateNew, defaultCompanyType = "startup", onTypeChange,
}: CompanyDropdownProps) {
  const [open, setOpen]           = useState(false);
  const [search, setSearch]       = useState("");
  const [creating, setCreating]   = useState(false);
  const [newName, setNewName]     = useState("");
  const [newType, setNewType]     = useState(defaultCompanyType);
  const [editingType, setEditingType] = useState(false);
  const [newInvestorType, setNewInvestorType]   = useState("");
  const [newStrategicType, setNewStrategicType] = useState("");
  const [newLpType, setNewLpType]               = useState("");
  const [saving, setSaving]       = useState(false);
  const [showPartnerDropdown, setShowPartnerDropdown] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const emailDomain  = useMemo(() => getEmailDomain(contactEmail), [contactEmail]);
  const scored       = useMemo(() => scoreCompanies(allCompanies, emailDomain), [allCompanies, emailDomain]);
  const q            = search.toLowerCase();
  const filtered     = useMemo(
    () => scored.filter(c => !q || c.name.toLowerCase().includes(q)).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name)),
    [scored, q]
  );
  const topMatches   = useMemo(() => filtered.filter(c => c.score >= 2), [filtered]);
  const showTop      = topMatches.length > 0 && !q;
  const selectedCompany = useMemo(() => allCompanies.find(c => c.id === value), [allCompanies, value]);

  useEffect(() => {
    if (!open) return;
    function outside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, [open]);

  function pick(id: string) { onChange(id); setOpen(false); setSearch(""); setCreating(false); }

  async function handleCreate() {
    if (!newName.trim()) return;
    setSaving(true);
    const id = await onCreateNew(newName.trim(), newType || defaultCompanyType);
    if (id) pick(id);
    setSaving(false);
    setCreating(false);
    setNewName("");
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className={cn(INPUT_CLS, "flex items-center justify-between gap-1 pr-1 cursor-pointer")}>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1 flex-1 min-w-0 text-left"
        >
          <span className={cn("truncate flex-1 text-left text-sm", !selectedCompany && "text-slate-400")}>
            {selectedCompany?.name ?? placeholder}
          </span>
          <ChevronDown size={13} className="text-slate-400 flex-shrink-0" />
        </button>
        {selectedCompany && (
          editingType ? (
            <select
              autoFocus
              value={selectedCompany.type}
              onChange={async e => {
                const t = e.target.value;
                onTypeChange?.(selectedCompany.id, t);
                setEditingType(false);
              }}
              onBlur={() => setEditingType(false)}
              className="text-[9px] border border-brand-teal rounded px-0.5 py-0.5 bg-white cursor-pointer focus:outline-none ml-1 flex-shrink-0"
            >
              {COMPANY_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); setEditingType(true); }}
              title="Click to change company type"
              className={cn(
                "text-[9px] px-1 py-0.5 rounded border font-medium flex-shrink-0 ml-1 hover:ring-1 hover:ring-brand-teal cursor-pointer",
                TYPE_BADGE[selectedCompany.type] ?? "bg-slate-50 text-slate-500 border-slate-200"
              )}
            >
              {TYPE_LABEL[selectedCompany.type] ?? selectedCompany.type}
            </button>
          )
        )}
      </div>

      {open && (
        <div className="absolute z-30 top-full left-0 mt-1 w-64 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden">
          <div className="p-1.5 border-b border-slate-100">
            <div className="flex items-center gap-1 px-2 py-1 bg-slate-50 rounded">
              <Search size={11} className="text-slate-400 flex-shrink-0" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search companies…"
                className="flex-1 text-xs bg-transparent outline-none placeholder:text-slate-400"
              />
              {search && (
                <button onClick={() => setSearch("")}>
                  <X size={10} className="text-slate-400" />
                </button>
              )}
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {showTop && (
              <>
                <p className="px-3 pt-1.5 pb-0.5 text-[9px] text-slate-400 uppercase tracking-wider font-semibold">
                  Best match
                </p>
                {topMatches.map(co => (
                  <CompanyRow
                    key={co.id}
                    company={co}
                    selected={value === co.id}
                    onSelect={() => pick(co.id)}
                    onExpand={() => { onExpand(co.id); setOpen(false); }}
                  />
                ))}
                {filtered.filter(c => c.score < 2).length > 0 && (
                  <div className="mx-3 my-0.5 border-t border-slate-100" />
                )}
              </>
            )}
            {filtered
              .filter(c => (showTop ? c.score < 2 : true))
              .map(co => (
                <CompanyRow
                  key={co.id}
                  company={co}
                  selected={value === co.id}
                  onSelect={() => pick(co.id)}
                  onExpand={() => { onExpand(co.id); setOpen(false); }}
                />
              ))}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-xs text-slate-400 text-center">No companies found</p>
            )}
          </div>
          <div className="border-t border-slate-100">
            {!creating ? (
              <button
                onClick={() => { setCreating(true); setNewName(search); setNewType(defaultCompanyType); }}
                className="w-full flex items-center gap-1.5 px-3 py-2 text-xs text-brand-teal hover:bg-brand-tealTint transition-colors font-medium"
              >
                <Plus size={11} /> Create new company
              </button>
            ) : (
              <div className="p-2 space-y-1.5">
                <input
                  value={newName}
                  onChange={e => { setNewName(e.target.value); setShowPartnerDropdown(true); }}
                  onFocus={() => setShowPartnerDropdown(true)}
                  onBlur={() => setTimeout(() => setShowPartnerDropdown(false), 150)}
                  placeholder="Company name"
                  className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-teal"
                />
                {showPartnerDropdown && (
                  <div className="absolute z-40 left-1.5 right-1.5 bg-white border border-slate-200 rounded shadow-lg max-h-32 overflow-y-auto">
                    {allCompanies
                      .filter(c => !newName || c.name.toLowerCase().includes(newName.toLowerCase()))
                      .slice(0, 8)
                      .map(c => (
                        <button
                          key={c.id}
                          onMouseDown={() => { pick(c.id); setCreating(false); setShowPartnerDropdown(false); }}
                          className="w-full text-left px-3 py-1.5 text-xs hover:bg-brand-tealTint flex items-center justify-between gap-2"
                        >
                          <span className="font-medium text-slate-700">{c.name}</span>
                          <span className={cn("text-[9px] px-1 py-0.5 rounded border font-medium",
                            TYPE_BADGE[c.type] ?? "bg-slate-50 text-slate-500 border-slate-200")}>
                            {TYPE_LABEL[c.type] ?? c.type}
                          </span>
                        </button>
                      ))}
                  </div>
                )}
                <select
                  value={newType}
                  onChange={e => { setNewType(e.target.value); setNewInvestorType(""); setNewStrategicType(""); setNewLpType(""); }}
                  className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-teal"
                >
                  {COMPANY_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {newType === "fund" && (
                  <select value={newInvestorType} onChange={e => setNewInvestorType(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-teal">
                    <option value="">Investor type…</option>
                    {INVESTOR_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                )}
                {newType === "corporate" && (
                  <select value={newStrategicType} onChange={e => setNewStrategicType(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-teal">
                    <option value="">Strategic type…</option>
                    {STRATEGIC_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                )}
                {newType === "lp" && (
                  <select value={newLpType} onChange={e => setNewLpType(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-brand-teal">
                    <option value="">LP type…</option>
                    {LP_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                )}
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setCreating(false)}
                    className="flex-1 py-1.5 border border-slate-200 rounded text-xs text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={saving || !newName.trim()}
                    className="flex-1 py-1.5 bg-brand-teal hover:bg-brand-tealDark disabled:opacity-50 text-white text-xs font-medium rounded flex items-center justify-center gap-1"
                  >
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

// ── CompanyExpandPanel ─────────────────────────────────────────────────────────

function CompanyExpandPanel({
  companyId, onClose, createMode, onCreated, initialName, initialType,
  onDeleted, onUpdated,
}: {
  companyId: string;
  onClose: () => void;
  createMode?: boolean;
  onCreated?: (id: string) => void;
  onDeleted?: (id: string) => void;
  onUpdated?: (id: string, updates: Partial<CompanyStub>) => void;
  initialName?: string;
  initialType?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [company, setCompany]   = useState<Company | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading]   = useState(true);
  const [imgError, setImgError] = useState(false);
  const [editing, setEditing]   = useState(false);
  const [editName, setEditName] = useState("");
  const [editWebsite, setEditWebsite]         = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCity, setEditCity]               = useState("");
  const [editCountry, setEditCountry]         = useState("");
  const [editType, setEditType]               = useState("");
  const [editInvestorType, setEditInvestorType]   = useState("");
  const [editStrategicType, setEditStrategicType] = useState("");
  const [editLpType, setEditLpType]               = useState("");
  const [saving, setSaving]         = useState(false);
  const [createSaving, setCreateSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting]     = useState(false);
  const [deckUrl, setDeckUrl]       = useState<string | null>(null);
  const [deckName, setDeckName]     = useState<string | null>(null);
  const [deckUploading, setDeckUploading] = useState(false);
  const [deckError, setDeckError]   = useState<string | null>(null);
  const [deckDragOver, setDeckDragOver] = useState(false);
  const deckInputRef                = useRef<HTMLInputElement>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [fieldDraft, setFieldDraft] = useState("");
  const [fieldSaving, setFieldSaving] = useState(false);
  const [nameError, setNameError]   = useState<string | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [ceFirstName, setCeFirstName] = useState("");
  const [ceLastName, setCeLastName]   = useState("");
  const [ceTitle, setCeTitle]         = useState("");
  const [ceType, setCeType]           = useState("");
  const [ceLinkedin, setCeLinkedin]   = useState("");
  const [ceCity, setCeCity]           = useState("");
  const [ceCountry, setCeCountry]     = useState("");
  const [contactSaving, setContactSaving] = useState(false);

  async function handleDelete() {
    if (!company) return;
    setDeleting(true);
    onDeleted?.(company.id);
    onClose();
    await supabase.from("companies").delete().eq("id", company.id);
  }

  useEffect(() => {
    if (createMode) {
      setEditing(true);
      setEditName(initialName ?? "");
      setEditType(initialType ?? "startup");
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
      if (!cancelled) {
        setCompany(co as Company | null);
        setContacts((ctcts as Contact[]) ?? []);
        setDeckUrl((co as Company | null)?.pitch_deck_url ?? null);
        setLoading(false);
      }
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
    setEditInvestorType(company.investor_type ?? "");
    setEditStrategicType(company.strategic_type ?? "");
    setEditLpType(company.lp_type ?? "");
    setEditing(true);
  }

  async function saveEdits() {
    if (createMode) {
      if (!editName.trim()) return;
      setCreateSaving(true);
      const { data, error } = await supabase.from("companies")
        .insert({
          name: editName.trim(), type: editType || "startup",
          investor_type:  editType === "fund"      ? (editInvestorType  || null) : null,
          strategic_type: editType === "corporate" ? (editStrategicType || null) : null,
          lp_type:        editType === "lp"        ? (editLpType        || null) : null,
          website: editWebsite.trim() || null,
          description: editDescription.trim() || null,
          location_city: editCity.trim() || null,
          location_country: editCountry.trim() || null,
        })
        .select("id").single();
      setCreateSaving(false);
      if (error || !data) return;
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
      investor_type:  (editType || company.type) === "fund"      ? (editInvestorType  || null) : null,
      strategic_type: (editType || company.type) === "corporate" ? (editStrategicType || null) : null,
      lp_type:        (editType || company.type) === "lp"        ? (editLpType        || null) : null,
    };
    const { error } = await supabase.from("companies").update(updates).eq("id", company.id);
    setSaving(false);
    if (error) {
      if (error.code === "23505") setNameError(`A company named "${String(updates.name)}" already exists.`);
      return;
    }
    setNameError(null);
    setCompany({ ...company, ...updates } as Company);
    setEditing(false);
    onUpdated?.(company.id, {
      name: String(updates.name ?? company.name),
      type: String(updates.type ?? company.type),
      website: (updates.website as string | null | undefined) ?? company.website,
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
        setEditingField("name");
        setFieldDraft(value);
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
    const updates: Partial<Contact> = {
      first_name: ceFirstName.trim() || selectedContact.first_name,
      last_name:  ceLastName.trim()  || selectedContact.last_name,
      title:      ceTitle.trim()     || selectedContact.title,
      type:       ceType as Contact["type"],
      linkedin_url:     ceLinkedin.trim() || selectedContact.linkedin_url,
      location_city:    ceCity.trim()    || selectedContact.location_city,
      location_country: ceCountry.trim() || selectedContact.location_country,
    };
    const { error } = await supabase.from("contacts").update(updates).eq("id", selectedContact.id);
    if (!error) {
      setContacts(prev => prev.map(c => c.id === selectedContact.id ? { ...c, ...updates } as Contact : c));
      setSelectedContact(prev => prev ? { ...prev, ...updates } as Contact : prev);
    }
    setContactSaving(false);
  }

  async function handleDeckUpload(file: File) {
    if (!company) return;
    setDeckUploading(true);
    setDeckError(null);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${company.id}/${Date.now()}-${safeName}`;
      const { error: storageErr } = await supabase.storage
        .from("decks")
        .upload(filePath, file, { contentType: file.type || "application/octet-stream", upsert: true });
      if (storageErr) throw new Error(storageErr.message);
      const { data: { publicUrl } } = supabase.storage.from("decks").getPublicUrl(filePath);
      const { data: { user } } = await supabase.auth.getUser();
      await Promise.all([
        supabase.from("documents").insert({
          company_id: company.id, name: file.name, type: "deck",
          storage_path: filePath, mime_type: file.type || "application/octet-stream",
          file_size: file.size, uploaded_by: user?.id ?? null,
        }),
        supabase.from("companies").update({ pitch_deck_url: publicUrl }).eq("id", company.id),
      ]);
      setDeckUrl(publicUrl);
      setDeckName(file.name);
    } catch (e) {
      setDeckError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setDeckUploading(false);
    }
  }

  const domain = company?.website
    ? company.website.replace(/^https?:\/\//, "").replace(/\/.*$/, "")
    : null;
  const clearbitUrl = domain
    ? `https://img.logo.dev/${domain}?token=pk_FYk-9BO1QwS9yyppOxJ2vQ&format=png&size=128`
    : null;

  // Abbreviated panel JSX (same structure as before, styling updated to brand tokens)
  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-[420px] bg-white shadow-2xl z-50 flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          {selectedContact ? (
            <div className="flex items-center gap-2">
              <IconButton aria-label="Back to company" onClick={() => setSelectedContact(null)}>
                <ArrowLeft size={16} />
              </IconButton>
              <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                <span className="text-violet-600 text-[10px] font-bold">
                  {getInitials(`${selectedContact.first_name} ${selectedContact.last_name ?? ""}`)}
                </span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-ink-900">
                  {selectedContact.first_name} {selectedContact.last_name}
                </h3>
                <p className="text-xs text-ink-500">{selectedContact.title ?? selectedContact.type}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {clearbitUrl && !imgError && (
                <img
                  src={clearbitUrl}
                  alt=""
                  onError={() => setImgError(true)}
                  className="w-7 h-7 rounded object-contain"
                />
              )}
              <h3 className="text-sm font-semibold text-ink-900">
                {createMode ? "New Company" : loading ? "Loading…" : company?.name ?? "Company"}
              </h3>
            </div>
          )}
          <IconButton aria-label="Close panel" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </div>

        {/* Body */}
        {loading && !createMode ? (
          <div className="flex items-center justify-center flex-1 py-16">
            <Loader2 size={24} className="animate-spin text-slate-300" />
          </div>
        ) : selectedContact ? (
          // Contact edit form
          <div className="p-5 space-y-4 flex-1">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "First name", val: ceFirstName, set: setCeFirstName },
                { label: "Last name",  val: ceLastName,  set: setCeLastName },
              ].map(({ label, val, set }) => (
                <div key={label}>
                  <label className="block text-xs font-medium text-ink-500 mb-1">{label}</label>
                  <input value={val} onChange={e => set(e.target.value)} className={INPUT_CLS} />
                </div>
              ))}
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1">Title</label>
              <input value={ceTitle} onChange={e => setCeTitle(e.target.value)} className={INPUT_CLS} />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1">Type</label>
              <select value={ceType} onChange={e => setCeType(e.target.value)}
                className={cn(INPUT_CLS, "cursor-pointer")}>
                {CONTACT_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-500 mb-1">LinkedIn URL</label>
              <input value={ceLinkedin} onChange={e => setCeLinkedin(e.target.value)}
                placeholder="https://linkedin.com/in/…" className={INPUT_CLS} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink-500 mb-1">City</label>
                <input value={ceCity} onChange={e => setCeCity(e.target.value)} className={INPUT_CLS} />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink-500 mb-1">Country</label>
                <input value={ceCountry} onChange={e => setCeCountry(e.target.value)} className={INPUT_CLS} />
              </div>
            </div>
            <Button onClick={saveContact} isLoading={contactSaving} className="w-full">
              Save contact
            </Button>
          </div>
        ) : (
          // Company view / edit
          <div className="flex-1">
            {/* Company fields */}
            <div className="p-5 border-b border-slate-100">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <p className="text-[10px] font-semibold text-ink-500 mb-1">Name</p>
                  {editingField === "name" ? (
                    <input
                      autoFocus
                      value={fieldDraft}
                      onChange={e => setFieldDraft(e.target.value)}
                      onBlur={() => void saveField("name", fieldDraft)}
                      onKeyDown={e => {
                        if (e.key === "Enter") void saveField("name", fieldDraft);
                        if (e.key === "Escape") setEditingField(null);
                      }}
                      className={INPUT_CLS}
                    />
                  ) : (
                    <p
                      className="text-sm text-ink-900 font-medium cursor-pointer hover:bg-brand-tealTint rounded px-1 -mx-1 py-0.5 transition-colors"
                      onDoubleClick={() => { setEditingField("name"); setFieldDraft(company?.name ?? ""); setNameError(null); }}
                    >
                      {company?.name}
                    </p>
                  )}
                  {nameError && <p className="text-[10px] text-danger mt-0.5">{nameError}</p>}
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-ink-500 mb-1">Type</p>
                  {editingField === "type" ? (
                    <select
                      autoFocus
                      value={fieldDraft}
                      onChange={e => void saveField("type", e.target.value)}
                      onBlur={() => setEditingField(null)}
                      className={cn(INPUT_CLS, "cursor-pointer")}
                    >
                      {COMPANY_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : (
                    <span
                      onDoubleClick={() => { setEditingField("type"); setFieldDraft(company?.type ?? ""); }}
                      className={cn(
                        "inline-flex text-xs px-1.5 py-0.5 rounded border font-medium cursor-pointer hover:ring-1 hover:ring-brand-teal",
                        TYPE_BADGE[company?.type ?? ""] ?? "bg-slate-50 text-slate-500 border-slate-200"
                      )}
                    >
                      {TYPE_LABEL[company?.type ?? ""] ?? company?.type}
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-ink-500 mb-1">Website</p>
                  {editingField === "website" ? (
                    <input
                      autoFocus value={fieldDraft} onChange={e => setFieldDraft(e.target.value)}
                      onBlur={() => void saveField("website", fieldDraft)}
                      onKeyDown={e => { if (e.key === "Enter") void saveField("website", fieldDraft); if (e.key === "Escape") setEditingField(null); }}
                      placeholder="https://…" className={INPUT_CLS}
                    />
                  ) : company?.website ? (
                    <div className="flex items-center gap-1 group cursor-pointer"
                      onDoubleClick={() => { setEditingField("website"); setFieldDraft(company.website ?? ""); }}>
                      <a href={company.website} target="_blank" rel="noopener noreferrer"
                        className="text-xs text-link hover:underline flex items-center gap-1" onClick={e => e.stopPropagation()}>
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
                <div className="col-span-2">
                  <p className="text-[10px] font-semibold text-ink-500 mb-1">Location</p>
                  <div className="grid grid-cols-2 gap-2">
                    {editingField === "city" ? (
                      <input autoFocus value={fieldDraft} onChange={e => setFieldDraft(e.target.value)}
                        onBlur={() => void saveField("city", fieldDraft)}
                        onKeyDown={e => { if (e.key === "Enter") void saveField("city", fieldDraft); if (e.key === "Escape") setEditingField(null); }}
                        placeholder="City" className={INPUT_CLS} />
                    ) : (
                      <p className="text-sm text-ink-700 flex items-center gap-1 cursor-pointer hover:bg-brand-tealTint rounded px-1 -mx-1 py-0.5 transition-colors"
                        onDoubleClick={() => { setEditingField("city"); setFieldDraft(company?.location_city ?? ""); }}>
                        <MapPin size={11} className="text-ink-500 flex-shrink-0" />
                        {company?.location_city || <span className="text-slate-300 italic text-xs">City</span>}
                      </p>
                    )}
                    {editingField === "country" ? (
                      <input autoFocus value={fieldDraft} onChange={e => setFieldDraft(e.target.value)}
                        onBlur={() => void saveField("country", fieldDraft)}
                        onKeyDown={e => { if (e.key === "Enter") void saveField("country", fieldDraft); if (e.key === "Escape") setEditingField(null); }}
                        placeholder="Country" className={INPUT_CLS} />
                    ) : (
                      <p className="text-sm text-ink-700 cursor-pointer hover:bg-brand-tealTint rounded px-1 -mx-1 py-0.5 transition-colors"
                        onDoubleClick={() => { setEditingField("country"); setFieldDraft(company?.location_country ?? ""); }}>
                        {company?.location_country || <span className="text-slate-300 italic text-xs">Country</span>}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Pitch deck */}
            {!createMode && company && (
              <div className="px-5 py-4 border-b border-slate-100">
                <p className="text-[10px] font-bold text-ink-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                  <FileText size={10} /> Pitch Deck
                </p>
                <input ref={deckInputRef} type="file" accept=".pdf,.pptx,.ppt,.key" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleDeckUpload(f); e.target.value = ""; }} />
                {deckUrl ? (
                  <div className="flex items-center gap-2.5 p-3 bg-brand-tealTint border border-teal-200 rounded-xl">
                    <FileText size={15} className="text-brand-teal flex-shrink-0" />
                    <a href={deckUrl} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-brand-teal font-semibold hover:underline truncate flex-1">
                      {deckName ?? "View Deck"}
                    </a>
                    <button onClick={() => deckInputRef.current?.click()}
                      className="text-[10px] text-ink-500 hover:text-ink-700 border border-slate-200 bg-white rounded-lg px-2 py-1 transition-colors">
                      Replace
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => !deckUploading && deckInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDeckDragOver(true); }}
                    onDragLeave={() => setDeckDragOver(false)}
                    onDrop={e => { e.preventDefault(); setDeckDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) handleDeckUpload(f); }}
                    className={cn(
                      "flex flex-col items-center justify-center gap-2 py-6 rounded-xl border-2 border-dashed transition-all cursor-pointer select-none",
                      deckUploading ? "border-brand-teal bg-brand-tealTint cursor-default"
                        : deckDragOver ? "border-brand-teal bg-brand-tealTint scale-[1.01]"
                        : "border-slate-200 bg-slate-50 hover:border-brand-teal hover:bg-brand-tealTint"
                    )}
                  >
                    {deckUploading ? (
                      <><Loader2 size={20} className="text-brand-teal animate-spin" /><p className="text-xs text-brand-teal font-medium">Uploading…</p></>
                    ) : (
                      <><Upload size={16} className="text-ink-500" />
                      <p className="text-xs text-ink-700 font-medium">Drop deck or <span className="text-brand-teal">browse</span></p>
                      <p className="text-[10px] text-ink-500">PDF, PPTX, PPT, KEY</p></>
                    )}
                  </div>
                )}
                {deckError && <p className="text-[10px] text-danger mt-1.5">{deckError}</p>}
              </div>
            )}

            {/* Contacts */}
            <div className="px-5 py-4">
              <p className="text-[10px] font-bold text-ink-500 uppercase tracking-widest mb-3 flex items-center gap-1">
                <Users size={10} /> Contacts ({contacts.length})
              </p>
              {contacts.length === 0 ? (
                <p className="text-xs text-slate-300 italic">No contacts linked yet</p>
              ) : (
                <div className="space-y-2">
                  {contacts.map(c => (
                    <button key={c.id} onClick={() => openContact(c)}
                      className="w-full flex items-center gap-3 p-2.5 bg-slate-50 hover:bg-brand-tealTint hover:border-teal-200 border border-transparent rounded-lg transition-all text-left group">
                      <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-violet-600 text-[10px] font-bold">
                          {getInitials(`${c.first_name} ${c.last_name ?? ""}`)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-ink-900 truncate group-hover:text-brand-teal">
                          {c.first_name} {c.last_name}
                        </p>
                        <p className="text-[10px] text-ink-500 truncate">{c.title ?? c.type}</p>
                      </div>
                      <ChevronRight size={11} className="text-slate-300 group-hover:text-brand-teal" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        {company && !createMode && !selectedContact && (
          <div className="px-5 py-4 border-t border-slate-200 space-y-2 sticky bottom-0 bg-white">
            <a href={`/crm/companies/${company.id}`}
              className="flex items-center justify-center gap-2 w-full py-2 bg-brand-teal hover:bg-brand-tealDark text-white text-sm font-medium rounded-lg transition-colors">
              Open Full Profile <ChevronRight size={14} />
            </a>
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-danger flex-1">Delete this company and unlink all contacts?</span>
                <button onClick={() => setConfirmDelete(false)} className="text-xs px-2.5 py-1 border border-slate-200 rounded text-ink-500 hover:bg-slate-50">Cancel</button>
                <Button variant="destructive" size="sm" onClick={handleDelete} isLoading={deleting}>
                  <Trash2 size={10} /> Delete
                </Button>
              </div>
            ) : (
              <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)} className="w-full">
                <Trash2 size={13} /> Delete Company
              </Button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Left list row (display-only, 48 px, no form state) ────────────────────────

const ListRow = memo(function ListRow({
  contact,
  selected,
  checked,
  onSelect,
  onCheck,
}: {
  contact: PendingContact;
  selected: boolean;
  checked: boolean;
  onSelect: () => void;
  onCheck: (checked: boolean) => void;
}) {
  const initials = getInitials(`${contact.first_name ?? ""} ${contact.last_name ?? ""}`);
  const hasRequired = !!(contact.type && contact.location_country);

  return (
    <div
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "h-12 flex items-center gap-2.5 px-3 cursor-pointer border-b border-slate-100 transition-colors",
        selected ? "bg-brand-tealTint" : "hover:bg-slate-50"
      )}
    >
      {/* Checkbox */}
      <button
        type="button"
        aria-label={checked ? "Deselect contact" : "Select contact"}
        onClick={e => { e.stopPropagation(); onCheck(!checked); }}
        className="flex-shrink-0 text-ink-500 hover:text-brand-teal transition-colors"
      >
        {checked ? (
          <CheckSquare size={14} className="text-brand-teal" />
        ) : (
          <Square size={14} />
        )}
      </button>

      {/* Avatar */}
      <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
        <span className="text-violet-600 text-[10px] font-bold">{initials}</span>
      </div>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <p className={cn("text-xs font-semibold truncate", selected ? "text-brand-teal" : "text-ink-900")}>
          {contact.first_name ?? ""} {contact.last_name ?? ""}
        </p>
        <p className="text-[10px] text-ink-500 truncate">
          {contact.email ?? contact.company?.name ?? "—"}
        </p>
      </div>

      {/* Ready indicator */}
      <div
        title={hasRequired ? "Ready to confirm" : "Missing type or country"}
        className={cn(
          "w-1.5 h-1.5 rounded-full flex-shrink-0",
          hasRequired ? "bg-success" : "bg-slate-300"
        )}
      />
    </div>
  );
});

// ── Detail panel (single controlled form for selected contact) ─────────────────

function ContactDetailPanel({
  contact,
  allCompanies,
  onConfirmed,
  onDiscarded,
  onExpand,
  onCompanyUpdated,
  customCountries,
  onAddCustomCountry,
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

  const [firstName,    setFirstName]    = useState(contact.first_name ?? "");
  const [lastName,     setLastName]     = useState(contact.last_name ?? "");
  const [type,         setType]         = useState<string>(() => mapTypeToAdmin(contact.type));
  const [title,        setTitle]        = useState(contact.title ?? "");
  const [customTitle,  setCustomTitle]  = useState("");
  const [companyId,    setCompanyId]    = useState(contact.company_id ?? "");
  const [city,         setCity]         = useState(contact.location_city ?? "");
  const [country,      setCountry]      = useState(() => {
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
  const [createPanelDefaultType, setCreatePanelDefaultType] = useState("startup");

  // Reset form when selected contact changes
  useEffect(() => {
    setFirstName(contact.first_name ?? "");
    setLastName(contact.last_name ?? "");
    setType(mapTypeToAdmin(contact.type));
    setTitle(contact.title ?? "");
    setCustomTitle("");
    setCompanyId(contact.company_id ?? "");
    setCity(contact.location_city ?? "");
    const c = contact.location_country ?? "";
    setCountry((COUNTRY_OPTIONS as readonly string[]).includes(c) ? c : (c ? "__custom__" : ""));
    setCustomCountry((COUNTRY_OPTIONS as readonly string[]).includes(c) ? "" : c);
    setExtraCompanies([]);
    setBusy(false);
  }, [contact.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const mergedCompanies = useMemo(
    () => (extraCompanies.length ? [...extraCompanies, ...allCompanies] : allCompanies),
    [extraCompanies, allCompanies]
  );

  const handleCreateCompany = useCallback(async (name: string, coType: string): Promise<string | null> => {
    setCreatePanelName(name);
    setCreatePanelDefaultType(coType);
    setShowCreatePanel(true);
    return null;
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
  const canConfirm      = !!type && !!resolvedCountry && !busy;

  async function confirm() {
    if (!canConfirm) return;
    setBusy(true);
    if (country === "__custom__" && customCountry.trim()) {
      onAddCustomCountry(customCountry.trim());
    }
    const resolvedCompanyId = companyId || null;

    const contactSave = supabase.from("contacts").update({
      first_name:       firstName.trim() || contact.first_name,
      last_name:        lastName.trim()  || contact.last_name,
      type:             type as Contact["type"],
      title:            resolvedTitle || null,
      company_id:       resolvedCompanyId,
      location_city:    city.trim() || null,
      location_country: resolvedCountry,
      status:           "active",
    }).eq("id", contact.id);

    const companySave = (() => {
      if (!resolvedCompanyId) return null;
      const co = mergedCompanies.find(c => c.id === resolvedCompanyId);
      if (!co) return null;
      const mappedType = CONTACT_TO_COMPANY_TYPE[type as ContactTypeStr];
      const typeToWrite = co.type && co.type !== "other" ? co.type : (mappedType ?? null);
      if (!typeToWrite || typeToWrite === co.type) return null;
      return supabase.from("companies").update({ type: typeToWrite }).eq("id", resolvedCompanyId);
    })();

    const [{ error: ce }] = await Promise.all([contactSave, companySave ?? Promise.resolve({ error: null })]);
    if (ce) { setBusy(false); return; }
    onConfirmed(contact.id);
  }

  async function discard() {
    setBusy(true);
    onDiscarded(contact.id);
    await supabase.from("contacts").update({ status: "archived" }).eq("id", contact.id);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Contact header */}
      <div className="px-5 pt-5 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
            <span className="text-violet-600 text-sm font-bold">
              {getInitials(`${firstName} ${lastName}`)}
            </span>
          </div>
          <div>
            <p className="text-sm font-semibold text-ink-900">
              {firstName || contact.first_name} {lastName || contact.last_name}
            </p>
            <p className="text-xs text-ink-500">{contact.email ?? "No email"}</p>
          </div>
        </div>

        {/* Name row */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label htmlFor={`fn-${contact.id}`} className="block text-xs font-medium text-ink-500 mb-1">
              First name
            </label>
            <input
              id={`fn-${contact.id}`}
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label htmlFor={`ln-${contact.id}`} className="block text-xs font-medium text-ink-500 mb-1">
              Last name
            </label>
            <input
              id={`ln-${contact.id}`}
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              className={INPUT_CLS}
            />
          </div>
        </div>

        {/* Email (read-only) */}
        <div className="mb-3">
          <label className="block text-xs font-medium text-ink-500 mb-1">Email</label>
          <div className={cn(INPUT_CLS, "flex items-center gap-2 bg-slate-50 text-ink-500 cursor-default")}>
            <Mail size={13} className="flex-shrink-0 text-ink-500" />
            <span className="truncate text-sm">{contact.email ?? "—"}</span>
          </div>
        </div>
      </div>

      {/* Scrollable fields */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Type */}
        <div>
          <label htmlFor={`type-${contact.id}`} className="block text-xs font-medium text-ink-500 mb-1">
            Type <span className="text-danger">*</span>
          </label>
          <select
            id={`type-${contact.id}`}
            value={type}
            onChange={e => setType(e.target.value)}
            className={cn(INPUT_CLS, "cursor-pointer")}
          >
            {CONTACT_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        {/* Title */}
        <div>
          <label htmlFor={`title-${contact.id}`} className="block text-xs font-medium text-ink-500 mb-1">
            Title
          </label>
          <select
            id={`title-${contact.id}`}
            value={title}
            onChange={e => setTitle(e.target.value)}
            className={cn(INPUT_CLS, "cursor-pointer")}
          >
            <option value="">— Select title —</option>
            {TITLE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {title === "Other" && (
            <input
              value={customTitle}
              onChange={e => setCustomTitle(e.target.value)}
              placeholder="Enter title"
              className={cn(INPUT_CLS, "mt-2")}
              aria-label="Custom title"
            />
          )}
        </div>

        {/* Company */}
        <div>
          <label className="block text-xs font-medium text-ink-500 mb-1">Company</label>
          <CompanyDropdown
            contactEmail={contact.email}
            allCompanies={mergedCompanies}
            value={companyId}
            placeholder={contact.company?.name || "Select company…"}
            onChange={setCompanyId}
            onExpand={onExpand}
            onCreateNew={handleCreateCompany}
            defaultCompanyType={CONTACT_TO_COMPANY_TYPE[type as ContactTypeStr] ?? "startup"}
            onTypeChange={async (coId, newType) => {
              const sb = createClient();
              const { error } = await sb.from("companies").update({ type: newType }).eq("id", coId);
              if (!error) {
                setExtraCompanies(prev => prev.map(c => c.id === coId ? { ...c, type: newType } : c));
                onCompanyUpdated(coId, { type: newType });
              }
            }}
          />
        </div>

        {/* City + Country */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`city-${contact.id}`} className="block text-xs font-medium text-ink-500 mb-1">
              City
            </label>
            <input
              id={`city-${contact.id}`}
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="City"
              className={INPUT_CLS}
            />
          </div>
          <div>
            <label htmlFor={`country-${contact.id}`} className="block text-xs font-medium text-ink-500 mb-1">
              Country <span className="text-danger">*</span>
            </label>
            <select
              id={`country-${contact.id}`}
              value={country}
              onChange={e => setCountry(e.target.value)}
              className={cn(INPUT_CLS, "cursor-pointer")}
            >
              <option value="">Select…</option>
              {[
                ...COUNTRY_OPTIONS,
                ...customCountries.filter(c => !(COUNTRY_OPTIONS as readonly string[]).includes(c)),
              ]
                .sort()
                .map(c => <option key={c} value={c}>{c}</option>)}
              <option value="__custom__">Other…</option>
            </select>
            {country === "__custom__" && (
              <input
                value={customCountry}
                onChange={e => setCustomCountry(e.target.value)}
                placeholder="Country name"
                className={cn(INPUT_CLS, "mt-2")}
                aria-label="Custom country name"
              />
            )}
          </div>
        </div>

        {/* Added date */}
        <p className="text-xs text-ink-500">
          Added {formatDate(contact.created_at)}
        </p>
      </div>

      {/* Actions */}
      <div className="px-5 py-4 border-t border-slate-200 flex gap-2">
        <Button
          onClick={confirm}
          disabled={!canConfirm}
          isLoading={busy}
          className="flex-1"
        >
          <Check size={14} /> Confirm
        </Button>
        <Button
          variant="ghost"
          onClick={() => onDiscarded(contact.id)}
          disabled={busy}
          className="px-3"
          title="Skip to next"
        >
          Skip
        </Button>
        <IconButton
          aria-label="Reject contact"
          variant="destructive"
          onClick={discard}
          disabled={busy}
        >
          <X size={14} />
        </IconButton>
      </div>

      {showCreatePanel && (
        <CompanyExpandPanel
          companyId=""
          createMode
          initialName={createPanelName}
          initialType={createPanelDefaultType}
          onCreated={handleCompanyCreated}
          onClose={() => setShowCreatePanel(false)}
          onUpdated={onCompanyUpdated}
        />
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function PendingContactsClient({
  initialContacts,
  companies,
  total,
  cursor,
  pageSize,
  initialQuery,
}: Props) {
  const router     = useRouter();
  const pathname   = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [contacts, setContacts]           = useState<PendingContact[]>(initialContacts);
  const [totalCount, setTotalCount]       = useState(total);
  const [companiesState, setCompaniesState] = useState<CompanyStub[]>(companies);
  const [selectedId, setSelectedId]       = useState<string | null>(
    initialContacts[0]?.id ?? null
  );
  const [checkedIds, setCheckedIds]       = useState<Set<string>>(new Set());
  const [expandedCompanyId, setExpandedCompanyId] = useState<string | null>(null);
  const [customCountries, setCustomCountries] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(LS_COUNTRIES_KEY) ?? "[]") as string[]; } catch { return []; }
  });
  const [exclusions, setExclusions]       = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(LS_EXCLUSIONS_KEY) ?? "[]") as string[]; } catch { return []; }
  });
  const [searchValue, setSearchValue]     = useState(initialQuery);
  const [bulkWorking, setBulkWorking]     = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const listParentRef = useRef<HTMLDivElement>(null);

  // Refresh companies from DB on mount (badges may be stale from SSR snapshot)
  useEffect(() => {
    const supabase = createClient();
    supabase.from("companies").select("id, name, type, website").order("name").limit(10000)
      .then(({ data }) => { if (data?.length) setCompaniesState(data as CompanyStub[]); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced server search via router navigation
  function handleSearchChange(val: string) {
    setSearchValue(val);
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (val) params.set("q", val); else params.delete("q");
      params.set("cursor", "0");
      startTransition(() => router.push(`${pathname}?${params.toString()}`));
    }, 250);
  }

  function goToPage(newCursor: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("cursor", String(newCursor));
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  function setPageSize(size: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("pageSize", String(size));
    params.set("cursor", "0");
    startTransition(() => router.push(`${pathname}?${params.toString()}`));
  }

  // Apply email exclusion filter client-side
  const visibleContacts = useMemo(() => {
    if (!exclusions.length) return contacts;
    return contacts.filter(c => {
      const email = (c.email ?? "").toLowerCase();
      return !exclusions.some(ex => email.includes(ex));
    });
  }, [contacts, exclusions]);

  // Virtualizer
  const rowVirtualizer = useVirtualizer({
    count: visibleContacts.length,
    getScrollElement: () => listParentRef.current,
    estimateSize: () => 48,
    overscan: 5,
  });

  // Keyboard navigation: arrow keys change selection
  const listRef = useRef<HTMLDivElement>(null);
  function handleListKeyDown(e: React.KeyboardEvent) {
    const idx = visibleContacts.findIndex(c => c.id === selectedId);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = visibleContacts[idx + 1];
      if (next) setSelectedId(next.id);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = visibleContacts[idx - 1];
      if (prev) setSelectedId(prev.id);
    }
  }

  // Auto-scroll selected row into view
  useEffect(() => {
    const idx = visibleContacts.findIndex(c => c.id === selectedId);
    if (idx >= 0) rowVirtualizer.scrollToIndex(idx, { align: "auto" });
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Select all / none
  const allChecked = checkedIds.size === visibleContacts.length && visibleContacts.length > 0;
  function toggleAll() {
    setCheckedIds(allChecked ? new Set() : new Set(visibleContacts.map(c => c.id)));
  }

  const handleConfirmed = useCallback((id: string) => {
    setContacts(prev => {
      const next = prev.filter(c => c.id !== id);
      // Auto-advance selection
      const oldIdx = prev.findIndex(c => c.id === id);
      const nextContact = next[oldIdx] ?? next[oldIdx - 1] ?? null;
      setSelectedId(nextContact?.id ?? null);
      return next;
    });
    setTotalCount(n => n - 1);
    setCheckedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
  }, []);

  const handleDiscarded = useCallback((id: string) => {
    handleConfirmed(id); // same removal + advance logic
  }, [handleConfirmed]);

  const handleExpand    = useCallback((id: string) => setExpandedCompanyId(id), []);

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

  // Bulk confirm
  async function bulkConfirm() {
    const ids = Array.from(checkedIds);
    if (!ids.length) return;
    setBulkWorking(true);
    const supabase = createClient();
    await supabase.rpc("confirm_contacts", { ids });
    ids.forEach(id => handleConfirmed(id));
    setCheckedIds(new Set());
    setBulkWorking(false);
  }

  // Bulk reject
  async function bulkReject() {
    const ids = Array.from(checkedIds);
    if (!ids.length) return;
    setBulkWorking(true);
    const supabase = createClient();
    await supabase.rpc("reject_contacts", { ids });
    ids.forEach(id => handleDiscarded(id));
    setCheckedIds(new Set());
    setBulkWorking(false);
  }

  // Export CSV
  function exportCSV() {
    const rows = visibleContacts.filter(c => checkedIds.size === 0 || checkedIds.has(c.id));
    const headers = ["first_name","last_name","email","type","title","company","city","country","added"];
    const csv = [
      headers.join(","),
      ...rows.map(c => [
        c.first_name ?? "", c.last_name ?? "", c.email ?? "",
        c.type ?? "", c.title ?? "", c.company?.name ?? "",
        c.location_city ?? "", c.location_country ?? "",
        formatDate(c.created_at),
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = "pending-contacts.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  const selectedContact = visibleContacts.find(c => c.id === selectedId) ?? null;

  if (totalCount === 0 && !initialQuery) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          icon={<UserPlus className="h-7 w-7" />}
          title="No new contacts"
          description="Contacts missing a type or country appear here for review."
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 bg-white flex-shrink-0 flex-wrap gap-y-2">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none" />
          <input
            value={searchValue}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search name, email…"
            aria-label="Search contacts"
            className="h-9 w-full pl-9 pr-3 text-sm border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-brand-teal/40 focus:border-brand-teal"
          />
          {isPending && <Loader2 size={12} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-ink-500" />}
        </div>

        {/* Bulk actions (shown when contacts are checked) */}
        {checkedIds.size > 0 && (
          <>
            <Button onClick={bulkConfirm} isLoading={bulkWorking} size="sm">
              <Check size={13} /> Confirm {checkedIds.size}
            </Button>
            <Button variant="destructive" size="sm" onClick={bulkReject} isLoading={bulkWorking}>
              <X size={13} /> Reject {checkedIds.size}
            </Button>
          </>
        )}

        <Button variant="secondary" size="sm" onClick={exportCSV}>
          <Download size={13} /> Export CSV
        </Button>

        {/* Page size selector */}
        <div className="flex items-center gap-1.5 text-xs text-ink-500">
          <span>Show</span>
          <select
            value={pageSize}
            onChange={e => setPageSize(Number(e.target.value))}
            aria-label="Contacts per page"
            className="h-8 border border-slate-200 rounded-md px-2 text-xs focus:outline-none focus:ring-2 focus:ring-brand-teal/40 cursor-pointer"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span>of {totalCount}</span>
        </div>
      </div>

      {/* Two-column body */}
      <div className="flex-1 flex min-h-0">
        {/* LEFT: virtualized list */}
        <div className="w-72 flex-shrink-0 border-r border-slate-200 flex flex-col min-h-0">
          {/* List header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 bg-slate-50 flex-shrink-0">
            <button
              type="button"
              aria-label={allChecked ? "Deselect all" : "Select all"}
              onClick={toggleAll}
              className="text-ink-500 hover:text-brand-teal transition-colors"
            >
              {allChecked ? <CheckSquare size={14} className="text-brand-teal" /> : <Square size={14} />}
            </button>
            <span className="text-xs text-ink-500 flex-1">
              {visibleContacts.length} contact{visibleContacts.length !== 1 ? "s" : ""}
              {checkedIds.size > 0 && ` · ${checkedIds.size} selected`}
            </span>
          </div>

          {/* Scroll container */}
          <div
            ref={listParentRef}
            className="flex-1 overflow-y-auto"
            role="listbox"
            aria-label="Pending contacts"
            tabIndex={0}
            onKeyDown={handleListKeyDown}
          >
            <div
              style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}
            >
              {rowVirtualizer.getVirtualItems().map(virtualRow => {
                const contact = visibleContacts[virtualRow.index];
                return (
                  <div
                    key={contact.id}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      transform: `translateY(${virtualRow.start}px)`,
                    }}
                  >
                    <ListRow
                      contact={contact}
                      selected={selectedId === contact.id}
                      checked={checkedIds.has(contact.id)}
                      onSelect={() => setSelectedId(contact.id)}
                      onCheck={checked => {
                        setCheckedIds(prev => {
                          const s = new Set(prev);
                          checked ? s.add(contact.id) : s.delete(contact.id);
                          return s;
                        });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pagination controls */}
          {totalCount > pageSize && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-slate-100 bg-slate-50 flex-shrink-0 text-xs text-ink-500">
              <button
                disabled={cursor === 0}
                onClick={() => goToPage(Math.max(0, cursor - pageSize))}
                className="disabled:opacity-30 hover:text-brand-teal transition-colors"
              >
                Prev
              </button>
              <span>{cursor + 1}–{Math.min(cursor + pageSize, totalCount)} of {totalCount}</span>
              <button
                disabled={cursor + pageSize >= totalCount}
                onClick={() => goToPage(cursor + pageSize)}
                className="disabled:opacity-30 hover:text-brand-teal transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </div>

        {/* RIGHT: detail panel */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {selectedContact ? (
            <ContactDetailPanel
              key={selectedContact.id}
              contact={selectedContact}
              allCompanies={companiesState}
              onConfirmed={handleConfirmed}
              onDiscarded={handleDiscarded}
              onExpand={handleExpand}
              onCompanyUpdated={handleCompanyUpdated}
              customCountries={customCountries}
              onAddCustomCountry={handleAddCustomCountry}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-ink-500">
              <EmptyState
                icon={<UserPlus className="h-7 w-7" />}
                title={totalCount === 0 ? "All caught up" : "Select a contact"}
                description={
                  totalCount === 0
                    ? "No pending contacts remain."
                    : "Click a name on the left to review it."
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* Company expand drawer */}
      {expandedCompanyId && (
        <CompanyExpandPanel
          companyId={expandedCompanyId}
          onClose={() => setExpandedCompanyId(null)}
          onDeleted={id => {
            setContacts(prev => prev.map(c => c.company_id === id ? { ...c, company_id: null, company: undefined } : c));
            setExpandedCompanyId(null);
          }}
          onUpdated={handleCompanyUpdated}
        />
      )}
    </div>
  );
}
