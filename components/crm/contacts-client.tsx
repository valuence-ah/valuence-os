"use client";
// ─── Contacts CRM — table + right-side detail panel ──────────────────────────

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Contact, Interaction } from "@/lib/types";
import { cn, formatDate, getInitials, timeAgo } from "@/lib/utils";
import {
  Search, X, Mail, Phone, Linkedin, Building2, MapPin, Plus, Loader2,
  Check, User, Calendar, MessageSquare, Edit2, Clock, ChevronRight,
  FileText, Users, Star, ChevronUp, ChevronDown, SlidersHorizontal, Columns,
} from "lucide-react";

// ── Type badge colours (Admin→Contacts types + legacy) ────────────────────────
const TYPE_BADGE: Record<string, { bg: string; text: string }> = {
  "Advisor / KOL":        { bg: "bg-amber-100",  text: "text-amber-700" },
  "Ecosystem":            { bg: "bg-teal-100",    text: "text-teal-700" },
  "Employee":             { bg: "bg-slate-100",   text: "text-slate-600" },
  "Founder / Mgmt":       { bg: "bg-blue-100",    text: "text-blue-700" },
  "Government/Academic":  { bg: "bg-sky-100",     text: "text-sky-700" },
  "Investor":             { bg: "bg-violet-100",  text: "text-violet-700" },
  "Lawyer":               { bg: "bg-slate-100",   text: "text-slate-600" },
  "Limited Partner":      { bg: "bg-green-100",   text: "text-green-700" },
  "Other":                { bg: "bg-gray-100",    text: "text-gray-600" },
  "Strategic":            { bg: "bg-rose-100",    text: "text-rose-700" },
  // legacy values
  founder:                { bg: "bg-blue-100",    text: "text-blue-700" },
  lp:                     { bg: "bg-green-100",   text: "text-green-700" },
  corporate:              { bg: "bg-orange-100",  text: "text-orange-700" },
  ecosystem_partner:      { bg: "bg-teal-100",    text: "text-teal-700" },
  fund_manager:           { bg: "bg-violet-100",  text: "text-violet-700" },
  government:             { bg: "bg-sky-100",     text: "text-sky-700" },
  advisor:                { bg: "bg-amber-100",   text: "text-amber-700" },
  other:                  { bg: "bg-gray-100",    text: "text-gray-600" },
};

const CONTACT_TYPE_OPTIONS = [
  "Advisor / KOL", "Ecosystem", "Employee", "Founder / Mgmt",
  "Government/Academic", "Investor", "Lawyer", "Limited Partner", "Other", "Strategic",
];

const INTERACTION_ICON: Record<string, string> = {
  meeting: "📅", email: "✉️", call: "📞", note: "📝", event: "🎯", intro: "🤝",
};

const SENTIMENT_CLS: Record<string, string> = {
  positive: "bg-green-100 text-green-700",
  neutral:  "bg-slate-100 text-slate-600",
  negative: "bg-red-100 text-red-600",
};

const STRENGTH_CLS: Record<string, string> = {
  strong: "bg-green-100 text-green-700",
  medium: "bg-yellow-100 text-yellow-700",
  weak:   "bg-slate-100 text-slate-600",
  new:    "bg-blue-100 text-blue-700",
};

const INPUT_CLS = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors";
const LABEL_CLS = "block text-xs font-semibold text-slate-500 mb-1";

type ContactRow = Contact & { company?: { id: string; name: string; type: string } | null };

interface Props {
  initialContacts: ContactRow[];
  totalCount: number;
}

// ── Avatar ─────────────────────────────────────────────────────────────────────
const AVATAR_COLORS = [
  "from-violet-500 to-purple-600",
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-pink-500 to-rose-600",
  "from-cyan-500 to-sky-600",
];
function avatarGradient(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xfffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export function ContactsClient({ initialContacts, totalCount }: Props) {
  const supabase = createClient();

  // ── List state ───────────────────────────────────────────────────────────────
  const [contacts, setContacts] = useState(initialContacts);
  const [allLoaded, setAllLoaded] = useState(initialContacts.length >= totalCount);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadOffset, setLoadOffset] = useState(initialContacts.length);
  const [searchInput, setSearchInput] = useState(""); // raw input value
  const [search, setSearch]           = useState(""); // debounced value
  const [typeFilter, setTypeFilter]   = useState("all");

  // ── Sort state ───────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<string>("last_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // ── Filter panel state ───────────────────────────────────────────────────────
  const [showFilters, setShowFilters] = useState(false);
  const [cityFilter, setCityFilter]   = useState("");
  const [countryFilter, setCountryFilter] = useState("");

  // ── Column visibility (persisted) ────────────────────────────────────────────
  const DEFAULT_COLS = ["name", "company", "type", "city", "country", "email", "lastContact"];
  const [visibleCols, setVisibleCols] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("contacts_visible_cols");
      return saved ? JSON.parse(saved) : DEFAULT_COLS;
    } catch { return DEFAULT_COLS; }
  });
  const [showColMenu, setShowColMenu] = useState(false);

  function toggleCol(col: string) {
    setVisibleCols(prev => {
      const next = prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col];
      localStorage.setItem("contacts_visible_cols", JSON.stringify(next));
      return next;
    });
  }

  // ── Debounce search input 300ms ───────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // ── Panel state ──────────────────────────────────────────────────────────────
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelTab, setPanelTab]     = useState<"overview" | "timeline" | "meetings">("overview");

  // ── Interaction state ────────────────────────────────────────────────────────
  const [interactions, setInteractions]         = useState<Interaction[]>([]);
  const [loadingInteractions, setLoadingInteractions] = useState(false);

  // ── Edit state ───────────────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<ContactRow>>({});
  const [saving, setSaving]   = useState(false);

  // ── Add contact modal ────────────────────────────────────────────────────────
  const [showModal, setShowModal] = useState(false);
  const [addForm, setAddForm]     = useState<Partial<ContactRow>>({ type: "Founder / Mgmt" as never });
  const [addSaving, setAddSaving] = useState(false);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);

  // ── Derived ──────────────────────────────────────────────────────────────────
  const selected = selectedId ? (contacts.find(c => c.id === selectedId) ?? null) : null;

  const filtered = useMemo(() => contacts.filter(c => {
    const matchType = typeFilter === "all" || c.type === typeFilter;
    const q = search.toLowerCase();
    const fullName = `${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase();
    const matchSearch = !q
      || fullName.includes(q)
      || (c.email ?? "").toLowerCase().includes(q)
      || (c.company?.name ?? "").toLowerCase().includes(q);
    const matchCity = !cityFilter || (c.location_city ?? "").toLowerCase().includes(cityFilter.toLowerCase());
    const matchCountry = !countryFilter || (c.location_country ?? "").toLowerCase().includes(countryFilter.toLowerCase());
    return matchType && matchSearch && matchCity && matchCountry;
  }).sort((a, b) => {
    let av: string | number = "";
    let bv: string | number = "";
    switch (sortKey) {
      case "name": av = `${a.last_name} ${a.first_name}`.toLowerCase(); bv = `${b.last_name} ${b.first_name}`.toLowerCase(); break;
      case "company": av = (a.company?.name ?? "").toLowerCase(); bv = (b.company?.name ?? "").toLowerCase(); break;
      case "type": av = (a.type ?? "").toLowerCase(); bv = (b.type ?? "").toLowerCase(); break;
      case "city": av = (a.location_city ?? "").toLowerCase(); bv = (b.location_city ?? "").toLowerCase(); break;
      case "country": av = (a.location_country ?? "").toLowerCase(); bv = (b.location_country ?? "").toLowerCase(); break;
      default: av = `${a.last_name} ${a.first_name}`.toLowerCase(); bv = `${b.last_name} ${b.first_name}`.toLowerCase();
    }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    return 0;
  }), [contacts, search, typeFilter, cityFilter, countryFilter, sortKey, sortDir]);

  const meetings = useMemo(
    () => interactions.filter(i => i.type === "meeting" || i.type === "call").slice(0, 3),
    [interactions]
  );

  // ── Load interactions when contact selected ───────────────────────────────────
  useEffect(() => {
    if (!selectedId) return;
    setLoadingInteractions(true);
    setInteractions([]);
    supabase
      .from("interactions")
      .select("*")
      .contains("contact_ids", [selectedId])
      .order("date", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setInteractions((data ?? []) as Interaction[]);
        setLoadingInteractions(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // ── Sort handler ─────────────────────────────────────────────────────────────
  function handleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function openContact(id: string) {
    if (id === selectedId) { setSelectedId(null); return; }
    setSelectedId(id);
    setPanelTab("overview");
    setEditing(false);
  }

  function startEditing() {
    if (!selected) return;
    setEditForm({
      first_name:       selected.first_name,
      last_name:        selected.last_name,
      email:            selected.email,
      phone:            selected.phone,
      title:            selected.title,
      type:             selected.type,
      linkedin_url:     selected.linkedin_url,
      location_city:    selected.location_city,
      location_country: selected.location_country,
      notes:            selected.notes,
      relationship_strength: selected.relationship_strength,
    });
    setEditing(true);
  }

  async function saveEdits() {
    if (!selected) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("contacts")
      .update({
        first_name:       editForm.first_name,
        last_name:        editForm.last_name,
        email:            editForm.email,
        phone:            editForm.phone,
        title:            editForm.title,
        type:             editForm.type,
        linkedin_url:     editForm.linkedin_url,
        location_city:    editForm.location_city,
        location_country: editForm.location_country,
        notes:            editForm.notes,
        relationship_strength: editForm.relationship_strength,
      })
      .eq("id", selected.id)
      .select("*, company:companies(id, name, type)")
      .single();
    setSaving(false);
    if (!error && data) {
      setContacts(prev => prev.map(c => c.id === selected.id ? (data as ContactRow) : c));
      setEditing(false);
    }
  }

  async function loadCompanies() {
    if (companies.length > 0) return;
    const { data } = await supabase.from("companies").select("id, name").order("name");
    setCompanies(data ?? []);
  }

  async function handleAddContact(e: React.FormEvent) {
    e.preventDefault();
    setAddSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("contacts")
      .insert({ ...addForm, status: "active", created_by: user?.id })
      .select("*, company:companies(id, name, type)")
      .single();
    setAddSaving(false);
    if (!error && data) {
      setContacts(prev => [data as ContactRow, ...prev]);
      setShowModal(false);
      setAddForm({ type: "Founder / Mgmt" as never });
    }
  }

  // ── Load more ────────────────────────────────────────────────────────────────
  async function loadMore() {
    if (loadingMore || allLoaded) return;
    setLoadingMore(true);
    const { data } = await supabase
      .from("contacts")
      .select("*, company:companies(id, name, type)")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .range(loadOffset, loadOffset + 199);

    if (data && data.length > 0) {
      setContacts(prev => [...prev, ...(data as ContactRow[])]);
      setLoadOffset(prev => prev + data.length);
      if (loadOffset + data.length >= totalCount) setAllLoaded(true);
    } else {
      setAllLoaded(true);
    }
    setLoadingMore(false);
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 overflow-hidden">
      {/* ── Table area ── */}
      <div className={cn("flex-1 overflow-auto", selectedId ? "mr-[440px]" : "")}>
        {/* Toolbar */}
        <div className="px-6 py-4 border-b border-slate-100 bg-white sticky top-0 z-10">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex gap-2 flex-wrap items-center">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  className="pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-lg w-56 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  placeholder="Search contacts…"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                />
              </div>
              {/* Filter button */}
              <button
                onClick={() => setShowFilters(f => !f)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-colors",
                  showFilters
                    ? "bg-blue-50 border-blue-300 text-blue-600"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50"
                )}
              >
                <SlidersHorizontal size={14} /> Filters
                {(typeFilter !== "all" || cityFilter || countryFilter) && (
                  <span className="ml-0.5 w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" />
                )}
              </button>
              {/* Columns button */}
              <div className="relative">
                <button
                  onClick={() => setShowColMenu(m => !m)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-colors",
                    showColMenu
                      ? "bg-blue-50 border-blue-300 text-blue-600"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <Columns size={14} /> Columns
                </button>
                {showColMenu && (
                  <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1.5 min-w-[160px]">
                    {[
                      { key: "name", label: "Name" },
                      { key: "company", label: "Company" },
                      { key: "type", label: "Type" },
                      { key: "city", label: "City" },
                      { key: "country", label: "Country" },
                      { key: "email", label: "Email" },
                      { key: "lastContact", label: "Last Contact" },
                    ].map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={visibleCols.includes(key)}
                          onChange={() => toggleCol(key)}
                          className="accent-blue-600"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => { setShowModal(true); loadCompanies(); }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={15} /> Add Contact
            </button>
          </div>

          {/* Filter bar */}
          {showFilters && (
            <div className="flex flex-wrap gap-3 items-end mt-3 pt-3 border-t border-slate-100">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Contact Type</label>
                <select
                  className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white"
                  value={typeFilter}
                  onChange={e => setTypeFilter(e.target.value)}
                >
                  <option value="all">All types</option>
                  {CONTACT_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">City</label>
                <input
                  className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-36 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  placeholder="Filter by city…"
                  value={cityFilter}
                  onChange={e => setCityFilter(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Country</label>
                <input
                  className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-36 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
                  placeholder="Filter by country…"
                  value={countryFilter}
                  onChange={e => setCountryFilter(e.target.value)}
                />
              </div>
              {(typeFilter !== "all" || cityFilter || countryFilter) && (
                <button
                  onClick={() => { setTypeFilter("all"); setCityFilter(""); setCountryFilter(""); }}
                  className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-500 px-2 py-2 transition-colors"
                >
                  <X size={12} /> Clear filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* Table */}
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-[61px] z-10 bg-slate-50">
            <tr>
              {visibleCols.includes("name") && (
                <th
                  className="text-left px-4 py-3 text-xs font-semibold text-slate-500 border-b border-slate-200 whitespace-nowrap cursor-pointer select-none hover:text-slate-700"
                  onClick={() => handleSort("name")}
                >
                  <span className="inline-flex items-center gap-1">
                    Name
                    {sortKey === "name" ? (sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
                  </span>
                </th>
              )}
              {visibleCols.includes("type") && (
                <th
                  className="text-left px-4 py-3 text-xs font-semibold text-slate-500 border-b border-slate-200 whitespace-nowrap cursor-pointer select-none hover:text-slate-700"
                  onClick={() => handleSort("type")}
                >
                  <span className="inline-flex items-center gap-1">
                    Type
                    {sortKey === "type" ? (sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
                  </span>
                </th>
              )}
              {visibleCols.includes("company") && (
                <th
                  className="text-left px-4 py-3 text-xs font-semibold text-slate-500 border-b border-slate-200 whitespace-nowrap cursor-pointer select-none hover:text-slate-700"
                  onClick={() => handleSort("company")}
                >
                  <span className="inline-flex items-center gap-1">
                    Company
                    {sortKey === "company" ? (sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
                  </span>
                </th>
              )}
              {visibleCols.includes("email") && (
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 border-b border-slate-200 whitespace-nowrap">
                  Email
                </th>
              )}
              {visibleCols.includes("city") && (
                <th
                  className="text-left px-4 py-3 text-xs font-semibold text-slate-500 border-b border-slate-200 whitespace-nowrap cursor-pointer select-none hover:text-slate-700"
                  onClick={() => handleSort("city")}
                >
                  <span className="inline-flex items-center gap-1">
                    City
                    {sortKey === "city" ? (sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
                  </span>
                </th>
              )}
              {visibleCols.includes("country") && (
                <th
                  className="text-left px-4 py-3 text-xs font-semibold text-slate-500 border-b border-slate-200 whitespace-nowrap cursor-pointer select-none hover:text-slate-700"
                  onClick={() => handleSort("country")}
                >
                  <span className="inline-flex items-center gap-1">
                    Country
                    {sortKey === "country" ? (sortDir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
                  </span>
                </th>
              )}
              {visibleCols.includes("lastContact") && (
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 border-b border-slate-200 whitespace-nowrap">
                  Last Contact
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={visibleCols.length} className="text-center py-16 text-slate-400 text-sm">
                  {search ? `No contacts matching "${search}"` : "No contacts yet."}
                </td>
              </tr>
            ) : filtered.map(c => {
              const isSelected = c.id === selectedId;
              const typeCls = TYPE_BADGE[c.type] ?? { bg: "bg-gray-100", text: "text-gray-600" };
              const fullName = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
              return (
                <tr
                  key={c.id}
                  onClick={() => openContact(c.id)}
                  className={cn(
                    "border-b border-slate-100 cursor-pointer transition-colors hover:bg-blue-50/60",
                    isSelected ? "bg-blue-50 border-l-2 border-l-blue-500" : ""
                  )}
                >
                  {/* Name */}
                  {visibleCols.includes("name") && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={cn("w-8 h-8 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-xs font-bold flex-shrink-0", avatarGradient(fullName))}>
                          {getInitials(fullName)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 truncate max-w-[160px]">{fullName || "—"}</p>
                          {c.title && <p className="text-[10px] text-slate-400 truncate max-w-[160px]">{c.title}</p>}
                        </div>
                      </div>
                    </td>
                  )}
                  {/* Type */}
                  {visibleCols.includes("type") && (
                    <td className="px-4 py-3">
                      <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap", typeCls.bg, typeCls.text)}>
                        {c.type}
                      </span>
                    </td>
                  )}
                  {/* Company */}
                  {visibleCols.includes("company") && (
                    <td className="px-4 py-3 max-w-[150px]">
                      {c.company ? (
                        <span className="text-xs text-slate-700 font-medium truncate block max-w-[140px]">{c.company.name}</span>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                  )}
                  {/* Email */}
                  {visibleCols.includes("email") && (
                    <td className="px-4 py-3 max-w-[180px]">
                      {c.email ? (
                        <a href={`mailto:${c.email}`} onClick={e => e.stopPropagation()} className="text-xs text-blue-600 hover:underline truncate block max-w-[170px]">{c.email}</a>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                  )}
                  {/* City */}
                  {visibleCols.includes("city") && (
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-500">{c.location_city ?? "—"}</span>
                    </td>
                  )}
                  {/* Country */}
                  {visibleCols.includes("country") && (
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-500">{c.location_country ?? "—"}</span>
                    </td>
                  )}
                  {/* Last Contact */}
                  {visibleCols.includes("lastContact") && (
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-500">{c.last_contact_date ? timeAgo(c.last_contact_date) : "—"}</span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Load More */}
        {!allLoaded && !search && (
          <div className="flex items-center justify-center py-4 border-t border-slate-100">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {loadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
              {loadingMore ? "Loading…" : `Load more (${contacts.length} of ${totalCount} loaded)`}
            </button>
          </div>
        )}
      </div>

      {/* ── Right Detail Panel ── */}
      {selectedId && selected && (
        <div className="fixed right-0 top-0 bottom-0 w-[440px] bg-white border-l border-slate-200 flex flex-col shadow-xl z-30">
          {/* Panel Header */}
          <div className="flex items-start justify-between p-5 border-b border-slate-100">
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn("w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-sm font-bold flex-shrink-0", avatarGradient(`${selected.first_name} ${selected.last_name}`))}>
                {getInitials(`${selected.first_name ?? ""} ${selected.last_name ?? ""}`)}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 text-sm leading-tight">{selected.first_name} {selected.last_name}</p>
                {selected.title && <p className="text-xs text-slate-400 truncate">{selected.title}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {!editing && (
                <button onClick={startEditing} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
                  <Edit2 size={14} />
                </button>
              )}
              <button onClick={() => setSelectedId(null)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Quick links */}
          {!editing && (
            <div className="flex items-center gap-3 px-5 py-2 border-b border-slate-100 bg-slate-50/50">
              {selected.email && (
                <a href={`mailto:${selected.email}`} className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 transition-colors">
                  <Mail size={12} /> <span className="hidden sm:inline">{selected.email}</span>
                  {!selected.email.includes("@") ? "" : <span className="sm:hidden">Email</span>}
                </a>
              )}
              {selected.phone && (
                <a href={`tel:${selected.phone}`} className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 transition-colors">
                  <Phone size={12} /> {selected.phone}
                </a>
              )}
              {selected.linkedin_url && (
                <a href={selected.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 transition-colors">
                  <Linkedin size={12} /> LinkedIn
                </a>
              )}
            </div>
          )}

          {/* Tabs */}
          <div className="flex border-b border-slate-100 px-5 bg-white">
            {(["overview", "timeline", "meetings"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => { setPanelTab(tab); setEditing(false); }}
                className={cn(
                  "text-xs font-medium py-2.5 px-3 border-b-2 transition-colors capitalize",
                  panelTab === tab
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                )}
              >
                {tab === "meetings" ? "Meetings / Calls" : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Panel Body */}
          <div className="flex-1 overflow-y-auto">

            {/* ── Overview Tab ── */}
            {panelTab === "overview" && (
              <div className="p-5 space-y-4">
                {editing ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={LABEL_CLS}>First Name</label>
                        <input className={INPUT_CLS} value={editForm.first_name ?? ""} onChange={e => setEditForm(p => ({ ...p, first_name: e.target.value }))} />
                      </div>
                      <div>
                        <label className={LABEL_CLS}>Last Name</label>
                        <input className={INPUT_CLS} value={editForm.last_name ?? ""} onChange={e => setEditForm(p => ({ ...p, last_name: e.target.value }))} />
                      </div>
                    </div>
                    <div>
                      <label className={LABEL_CLS}>Title</label>
                      <input className={INPUT_CLS} value={editForm.title ?? ""} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} />
                    </div>
                    <div>
                      <label className={LABEL_CLS}>Type</label>
                      <select className={INPUT_CLS} value={editForm.type ?? ""} onChange={e => setEditForm(p => ({ ...p, type: e.target.value as never }))}>
                        {CONTACT_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className={LABEL_CLS}>Email</label>
                      <input className={INPUT_CLS} type="email" value={editForm.email ?? ""} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} />
                    </div>
                    <div>
                      <label className={LABEL_CLS}>Phone</label>
                      <input className={INPUT_CLS} value={editForm.phone ?? ""} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} />
                    </div>
                    <div>
                      <label className={LABEL_CLS}>LinkedIn URL</label>
                      <input className={INPUT_CLS} value={editForm.linkedin_url ?? ""} onChange={e => setEditForm(p => ({ ...p, linkedin_url: e.target.value }))} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={LABEL_CLS}>City</label>
                        <input className={INPUT_CLS} value={editForm.location_city ?? ""} onChange={e => setEditForm(p => ({ ...p, location_city: e.target.value }))} />
                      </div>
                      <div>
                        <label className={LABEL_CLS}>Country</label>
                        <input className={INPUT_CLS} value={editForm.location_country ?? ""} onChange={e => setEditForm(p => ({ ...p, location_country: e.target.value }))} />
                      </div>
                    </div>
                    <div>
                      <label className={LABEL_CLS}>Relationship Strength</label>
                      <select className={INPUT_CLS} value={editForm.relationship_strength ?? ""} onChange={e => setEditForm(p => ({ ...p, relationship_strength: (e.target.value || null) as never }))}>
                        <option value="">— None —</option>
                        <option value="strong">Strong</option>
                        <option value="medium">Medium</option>
                        <option value="weak">Weak</option>
                        <option value="new">New</option>
                      </select>
                    </div>
                    <div>
                      <label className={LABEL_CLS}>Notes</label>
                      <textarea className={INPUT_CLS} rows={4} value={editForm.notes ?? ""} onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setEditing(false)} className="flex-1 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
                      <button onClick={saveEdits} disabled={saving} className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-1.5">
                        {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        {saving ? "Saving…" : "Save Changes"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* Info grid */}
                    <div className="grid grid-cols-2 gap-4">
                      {selected.company && (
                        <div className="col-span-2">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Company</p>
                          <div className="flex items-center gap-2">
                            <Building2 size={12} className="text-slate-400" />
                            <span className="text-sm text-slate-700 font-medium">{selected.company.name}</span>
                          </div>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Type</p>
                        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", (TYPE_BADGE[selected.type] ?? { bg: "bg-gray-100", text: "text-gray-600" }).bg, (TYPE_BADGE[selected.type] ?? { bg: "bg-gray-100", text: "text-gray-600" }).text)}>
                          {selected.type}
                        </span>
                      </div>
                      {selected.relationship_strength && (
                        <div>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Relationship</p>
                          <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium capitalize", STRENGTH_CLS[selected.relationship_strength])}>
                            {selected.relationship_strength}
                          </span>
                        </div>
                      )}
                      {selected.email && (
                        <div className="col-span-2">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Email</p>
                          <a href={`mailto:${selected.email}`} className="text-sm text-blue-600 hover:underline">{selected.email}</a>
                        </div>
                      )}
                      {selected.phone && (
                        <div>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Phone</p>
                          <a href={`tel:${selected.phone}`} className="text-sm text-slate-700">{selected.phone}</a>
                        </div>
                      )}
                      {(selected.location_city || selected.location_country) && (
                        <div>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Location</p>
                          <div className="flex items-center gap-1">
                            <MapPin size={11} className="text-slate-400" />
                            <span className="text-sm text-slate-600">{[selected.location_city, selected.location_country].filter(Boolean).join(", ")}</span>
                          </div>
                        </div>
                      )}
                      {selected.last_contact_date && (
                        <div>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Last Contact</p>
                          <div className="flex items-center gap-1">
                            <Clock size={11} className="text-slate-400" />
                            <span className="text-sm text-slate-600">{timeAgo(selected.last_contact_date)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                    {selected.notes && (
                      <div className="mt-4">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Notes</p>
                        <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap bg-slate-50 rounded-lg p-3">{selected.notes}</p>
                      </div>
                    )}
                    {!selected.notes && !selected.email && !selected.phone && (
                      <div className="text-center py-8 text-slate-400">
                        <User size={28} className="mx-auto mb-2 opacity-40" />
                        <p className="text-sm">No details yet</p>
                        <button onClick={startEditing} className="mt-2 text-xs text-blue-600 hover:underline">Add details</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Timeline Tab ── */}
            {panelTab === "timeline" && (
              <div className="p-5">
                {loadingInteractions ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={20} className="animate-spin text-blue-500" />
                  </div>
                ) : interactions.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <Calendar size={28} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No interactions recorded</p>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="absolute left-5 top-0 bottom-0 w-px bg-slate-100" />
                    <div className="space-y-4">
                      {interactions.map(i => (
                        <div key={i.id} className="flex gap-3 relative pl-1">
                          <div className="w-10 h-10 rounded-full bg-white border-2 border-slate-100 flex items-center justify-center text-base flex-shrink-0 z-10 relative">
                            {INTERACTION_ICON[i.type] ?? "💬"}
                          </div>
                          <div className="flex-1 min-w-0 bg-slate-50/80 rounded-xl p-3 border border-slate-100">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <p className="text-sm font-medium text-slate-700 leading-tight">{i.subject ?? i.type}</p>
                              <span className="text-[10px] text-slate-400 flex-shrink-0 mt-0.5">{formatDate(i.date)}</span>
                            </div>
                            {i.body && <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{i.body}</p>}
                            {i.sentiment && (
                              <span className={cn("inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium mt-1.5", SENTIMENT_CLS[i.sentiment] ?? "")}>
                                {i.sentiment}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Meetings / Calls Tab ── */}
            {panelTab === "meetings" && (
              <div className="p-5 space-y-4">
                {loadingInteractions ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={20} className="animate-spin text-blue-500" />
                  </div>
                ) : meetings.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <MessageSquare size={28} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No meetings or calls recorded</p>
                  </div>
                ) : (
                  meetings.map((m, idx) => (
                    <div key={m.id} className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{INTERACTION_ICON[m.type] ?? "📅"}</span>
                          <div>
                            <p className="text-xs font-semibold text-slate-700">{m.subject ?? (m.type === "meeting" ? "Meeting" : "Call")}</p>
                            <p className="text-[10px] text-slate-400">{formatDate(m.date)}</p>
                          </div>
                        </div>
                        {m.sentiment && (
                          <span className={cn("text-[10px] px-2 py-0.5 rounded-full font-medium", SENTIMENT_CLS[m.sentiment] ?? "")}>
                            {m.sentiment}
                          </span>
                        )}
                      </div>
                      <div className="px-4 py-3">
                        {m.summary ? (
                          <>
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Summary</p>
                            <p className="text-xs text-slate-600 leading-relaxed">{m.summary}</p>
                          </>
                        ) : m.body ? (
                          <p className="text-xs text-slate-500 leading-relaxed">{m.body}</p>
                        ) : (
                          <p className="text-xs text-slate-400 italic">No summary available</p>
                        )}
                        {m.action_items && m.action_items.length > 0 && (
                          <div className="mt-3">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1.5">Action Items</p>
                            <ul className="space-y-1">
                              {m.action_items.map((item, i) => (
                                <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                                  <span className="text-blue-500 mt-0.5 flex-shrink-0">•</span>
                                  {item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Add Contact Modal ── */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-base font-semibold text-slate-900">Add Contact</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleAddContact} className="px-6 py-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">First Name *</label>
                  <input required className={INPUT_CLS} value={addForm.first_name ?? ""} onChange={e => setAddForm(p => ({ ...p, first_name: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Last Name *</label>
                  <input required className={INPUT_CLS} value={addForm.last_name ?? ""} onChange={e => setAddForm(p => ({ ...p, last_name: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Email</label>
                  <input type="email" className={INPUT_CLS} value={addForm.email ?? ""} onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Phone</label>
                  <input className={INPUT_CLS} value={addForm.phone ?? ""} onChange={e => setAddForm(p => ({ ...p, phone: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Title</label>
                  <input className={INPUT_CLS} value={addForm.title ?? ""} onChange={e => setAddForm(p => ({ ...p, title: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Type *</label>
                  <select required className={INPUT_CLS} value={addForm.type ?? ""} onChange={e => setAddForm(p => ({ ...p, type: e.target.value as never }))}>
                    {CONTACT_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Company</label>
                  <select className={INPUT_CLS} value={addForm.company_id ?? ""} onChange={e => setAddForm(p => ({ ...p, company_id: e.target.value || null }))}>
                    <option value="">— None —</option>
                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">City</label>
                  <input className={INPUT_CLS} value={addForm.location_city ?? ""} onChange={e => setAddForm(p => ({ ...p, location_city: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Country</label>
                  <input className={INPUT_CLS} value={addForm.location_country ?? ""} onChange={e => setAddForm(p => ({ ...p, location_country: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">LinkedIn URL</label>
                <input className={INPUT_CLS} value={addForm.linkedin_url ?? ""} onChange={e => setAddForm(p => ({ ...p, linkedin_url: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">Notes</label>
                <textarea className={INPUT_CLS} rows={2} value={addForm.notes ?? ""} onChange={e => setAddForm(p => ({ ...p, notes: e.target.value }))} />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-2.5 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={addSaving} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2">
                  {addSaving ? <Loader2 size={14} className="animate-spin" /> : null}
                  {addSaving ? "Saving…" : "Add Contact"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
