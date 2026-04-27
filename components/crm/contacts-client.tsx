"use client";
// ─── Contacts CRM — summary tiles · table · detail panel ─────────────────────

import { useState, useMemo, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Contact, Interaction } from "@/lib/types";
import { cn, formatDate, getInitials, timeAgo } from "@/lib/utils";
import {
  Search, X, Mail, Phone, Linkedin, Building2, MapPin, Plus, Loader2,
  Check, User, Calendar, Edit2, Clock, ChevronUp, ChevronDown,
  SlidersHorizontal, Columns, Pencil, PlusCircle, Activity, TrendingUp,
  AlertCircle, Users, FileText,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_BADGE: Record<string, { bg: string; text: string }> = {
  "Advisor / KOL":        { bg: "bg-amber-100",  text: "text-amber-700"  },
  "Ecosystem":            { bg: "bg-teal-100",    text: "text-teal-700"   },
  "Employee":             { bg: "bg-slate-100",   text: "text-slate-600"  },
  "Founder / Mgmt":       { bg: "bg-blue-100",    text: "text-blue-700"   },
  "Government/Academic":  { bg: "bg-sky-100",     text: "text-sky-700"    },
  "Investor":             { bg: "bg-violet-100",  text: "text-violet-700" },
  "Lawyer":               { bg: "bg-slate-100",   text: "text-slate-600"  },
  "Limited Partner":      { bg: "bg-green-100",   text: "text-green-700"  },
  "Other":                { bg: "bg-gray-100",    text: "text-gray-600"   },
  "Strategic":            { bg: "bg-rose-100",    text: "text-rose-700"   },
  founder:                { bg: "bg-blue-100",    text: "text-blue-700"   },
  lp:                     { bg: "bg-green-100",   text: "text-green-700"  },
  corporate:              { bg: "bg-orange-100",  text: "text-orange-700" },
  ecosystem_partner:      { bg: "bg-teal-100",    text: "text-teal-700"   },
  fund_manager:           { bg: "bg-violet-100",  text: "text-violet-700" },
  government:             { bg: "bg-sky-100",     text: "text-sky-700"    },
  advisor:                { bg: "bg-amber-100",   text: "text-amber-700"  },
  other:                  { bg: "bg-gray-100",    text: "text-gray-600"   },
};

const CONTACT_TYPE_OPTIONS = [
  "Advisor / KOL", "Ecosystem", "Employee", "Founder / Mgmt",
  "Government/Academic", "Investor", "Lawyer", "Limited Partner", "Other", "Strategic",
];

const REL_STAGE_CFG = {
  active:  { label: "Active",   bg: "bg-green-100",  text: "text-green-700"  },
  warm:    { label: "Warm",     bg: "bg-amber-100",  text: "text-amber-700"  },
  cold:    { label: "Cold",     bg: "bg-slate-100",  text: "text-slate-600"  },
  dormant: { label: "Dormant",  bg: "bg-red-100",    text: "text-red-600"    },
  none:    { label: "—",        bg: "bg-gray-50",    text: "text-gray-400"   },
} as const;

const INTERACTION_ICON: Record<string, string> = {
  meeting: "📅", email: "✉️", call: "📞", note: "📝", event: "🎯", intro: "🤝",
};

const SENTIMENT_CLS: Record<string, string> = {
  positive: "bg-green-100 text-green-700",
  neutral:  "bg-slate-100 text-slate-600",
  negative: "bg-red-100 text-red-600",
};

const PIPELINE_STAGES = [
  { value: "identified_introduced", label: "Identified" },
  { value: "first_meeting",         label: "1st Meeting" },
  { value: "discussion_in_process", label: "Discussion" },
  { value: "tracking_hold",         label: "Tracking / Hold" },
  { value: "due_diligence",         label: "Due Diligence" },
  { value: "portfolio",             label: "Portfolio" },
];

const AVATAR_COLORS = [
  "from-violet-500 to-purple-600",
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-pink-500 to-rose-600",
  "from-cyan-500 to-sky-600",
];

const INPUT_CLS = "w-full px-3 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-colors";
const LABEL_CLS = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5";

const COL_DEFS = [
  { key: "name",        label: "Name",         sortable: true  },
  { key: "type",        label: "Type",         sortable: true  },
  { key: "company",     label: "Company",      sortable: true  },
  { key: "email",       label: "Email",        sortable: false },
  { key: "city",        label: "City",         sortable: true  },
  { key: "country",     label: "Country",      sortable: true  },
  { key: "lastContact", label: "Last Contact", sortable: true  },
  { key: "relStage",    label: "Rel. Stage",   sortable: true  },
  { key: "tags",        label: "Tags",         sortable: false },
];

// ── Types ─────────────────────────────────────────────────────────────────────

type RelStage = "active" | "warm" | "cold" | "dormant" | "none";
type TileFilter = "all" | "thisMonth" | "active" | "noLastContact";

type ContactRow = Contact & {
  company?: {
    id: string;
    name: string;
    type: string;
    deal_status?: string | null;
    website?: string | null;
  } | null;
};

interface Props {
  initialContacts: ContactRow[];
  totalCount: number;
  newThisMonthCount: number;
  noLastContactCount: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function avatarGradient(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xfffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function getRelStage(lastContactDate: string | null | undefined): RelStage {
  if (!lastContactDate) return "none";
  const days = Math.floor((Date.now() - new Date(lastContactDate).getTime()) / 86400000);
  if (days <= 90)  return "active";
  if (days <= 180) return "warm";
  if (days <= 365) return "cold";
  return "dormant";
}

// ── CompanyCell ───────────────────────────────────────────────────────────────

interface CompanyCellProps {
  contactId: string;
  companyId: string | null;
  companyName: string | null;
  onSaved: (newCompanyId: string, newCompanyName: string) => void;
}

function CompanyCell({ contactId, companyId: _companyId, companyName, onSaved }: CompanyCellProps) {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: string; name: string; type: string | null }>>([]);
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState<"saved" | "failed" | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Click outside to close
  useEffect(() => {
    if (!editing) return;
    function handle(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setEditing(false);
        setQuery("");
        setResults([]);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [editing]);

  // Debounced search
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim()) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/search/companies?q=${encodeURIComponent(query)}&limit=8`);
        const data = await r.json() as Array<{ id: string; name: string; type: string | null }>;
        setResults(Array.isArray(data) ? data.slice(0, 8) : []);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 200);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  // Auto-focus when editing opens
  useEffect(() => {
    if (editing) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [editing]);

  async function selectCompany(id: string, name: string) {
    setEditing(false);
    setQuery("");
    setResults([]);
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: id }),
      });
      if (!res.ok) throw new Error("failed");
      onSaved(id, name);
      setFlash("saved");
    } catch {
      setFlash("failed");
    }
    setTimeout(() => setFlash(null), 1500);
  }

  async function createAndSelect(name: string) {
    setEditing(false);
    setQuery("");
    setResults([]);
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type: "startup" }),
      });
      if (!res.ok) throw new Error("failed");
      const co = await res.json() as { id: string; name: string };
      await selectCompany(co.id, co.name);
    } catch {
      setFlash("failed");
      setTimeout(() => setFlash(null), 1500);
    }
  }

  const exactMatch = results.some(r => r.name.toLowerCase() === query.toLowerCase());

  return (
    <div ref={containerRef} className="relative min-w-0">
      {flash === "saved" && (
        <span className="absolute inset-0 flex items-center px-2 text-xs text-emerald-600 font-medium bg-emerald-50 rounded z-10">Saved</span>
      )}
      {flash === "failed" && (
        <span className="absolute inset-0 flex items-center px-2 text-xs text-red-600 font-medium bg-red-50 rounded z-10">Failed</span>
      )}
      {!flash && !editing && (
        <button
          onClick={() => setEditing(true)}
          className="w-full text-left text-xs text-slate-700 hover:text-blue-600 truncate cursor-pointer px-1 py-0.5 rounded hover:bg-blue-50 transition-colors"
          title={companyName ?? "Click to assign company"}
        >
          {companyName ?? <span className="text-slate-300 italic">—</span>}
        </button>
      )}
      {!flash && editing && (
        <>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === "Escape") { setEditing(false); setQuery(""); setResults([]); } }}
            placeholder={companyName ?? "Search company…"}
            className="w-full border border-teal-400 rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-teal-500"
          />
          {(results.length > 0 || (query.trim() && !loading)) && (
            <div className="absolute z-50 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto mt-1 w-64 min-w-full">
              {results.map(co => (
                <button
                  key={co.id}
                  onMouseDown={e => { e.preventDefault(); void selectCompany(co.id, co.name); }}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer text-xs w-full text-left"
                >
                  <img
                    src={`https://img.logo.dev/${co.name.toLowerCase().replace(/\s+/g, "")}.com?token=pk_HB0fMSZ0SZO9X3jdNFBfGg`}
                    alt=""
                    className="w-4 h-4 rounded object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                  <span className="flex-1 truncate text-slate-800">{co.name}</span>
                  {co.type && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded">{co.type}</span>
                  )}
                </button>
              ))}
              {!exactMatch && query.trim() && (
                <button
                  onMouseDown={e => { e.preventDefault(); void createAndSelect(query.trim()); }}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-teal-50 cursor-pointer text-xs w-full text-left text-teal-700 border-t border-gray-100"
                >
                  <span>+ Create New: {query.trim()}</span>
                </button>
              )}
              {loading && (
                <div className="px-3 py-2 text-xs text-slate-400">Searching…</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ContactsClient({
  initialContacts,
  totalCount,
  newThisMonthCount,
  noLastContactCount,
}: Props) {
  const supabase = createClient();

  // ── List state ───────────────────────────────────────────────────────────────
  const [contacts, setContacts]     = useState(initialContacts);
  const [allLoaded, setAllLoaded]   = useState(initialContacts.length >= totalCount);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadOffset, setLoadOffset]  = useState(initialContacts.length);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch]           = useState("");
  const [searchResults, setSearchResults] = useState<ContactRow[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  // ── Filter state ─────────────────────────────────────────────────────────────
  const [tileFilter, setTileFilter]   = useState<TileFilter>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [typeFilter, setTypeFilter]   = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [cityFilter, setCityFilter]   = useState("");
  const [countryFilter, setCountryFilter] = useState("");
  const [tagsFilter, setTagsFilter]   = useState("");

  // ── Sort state ───────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // ── Column visibility ─────────────────────────────────────────────────────────
  const DEFAULT_COLS = ["name", "type", "company", "email", "country", "lastContact", "relStage", "tags"];
  const [visibleCols, setVisibleCols] = useState<string[]>(() => {
    try {
      const s = localStorage.getItem("contacts_visible_cols_v2");
      return s ? JSON.parse(s) : DEFAULT_COLS;
    } catch { return DEFAULT_COLS; }
  });
  const [showColMenu, setShowColMenu] = useState(false);

  function toggleCol(col: string) {
    setVisibleCols(prev => {
      const next = prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col];
      localStorage.setItem("contacts_visible_cols_v2", JSON.stringify(next));
      return next;
    });
  }

  // ── Panel state ───────────────────────────────────────────────────────────────
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [panelTab, setPanelTab]       = useState<"overview" | "interactions" | "pipeline" | "notes">("overview");

  // ── Interactions ──────────────────────────────────────────────────────────────
  const [interactions, setInteractions]       = useState<Interaction[]>([]);
  const [loadingInteractions, setLoadingInteractions] = useState(false);

  // ── Edit contact ──────────────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<ContactRow>>({});
  const [saving, setSaving]   = useState(false);

  // ── Notes auto-save ───────────────────────────────────────────────────────────
  const [notesValue, setNotesValue] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved]   = useState(false);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Log Interaction modal ─────────────────────────────────────────────────────
  const [logTarget, setLogTarget] = useState<ContactRow | null>(null);
  const [logForm, setLogForm]     = useState({
    type: "call", subject: "", date: new Date().toISOString().slice(0, 10), body: "",
  });
  const [logSaving, setLogSaving] = useState(false);

  // ── Add to Pipeline modal ─────────────────────────────────────────────────────
  const [pipelineTarget, setPipelineTarget] = useState<ContactRow | null>(null);
  const [pipelineStage, setPipelineStage]   = useState("identified_introduced");
  const [pipelineSaving, setPipelineSaving] = useState(false);

  // ── Add Contact modal ─────────────────────────────────────────────────────────
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm]   = useState<Partial<ContactRow>>({ type: "Founder / Mgmt" as never });
  const [addSaving, setAddSaving] = useState(false);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);

  // ── Derived ───────────────────────────────────────────────────────────────────
  const selected = selectedId ? (contacts.find(c => c.id === selectedId) ?? null) : null;

  const activeCount = useMemo(
    () => contacts.filter(c => getRelStage(c.last_contact_date) === "active").length,
    [contacts],
  );

  const activeFilterCount = [
    tileFilter !== "all", typeFilter !== "all", stageFilter !== "all",
    !!cityFilter, !!countryFilter, !!tagsFilter,
  ].filter(Boolean).length;

  const filtered = useMemo(() => {
    // Use server-side search results when a query is active; otherwise use loaded contacts
    const source = (search.trim() && searchResults !== null) ? searchResults : contacts;

    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

    return source.filter(c => {
      if (tileFilter === "thisMonth"      && new Date(c.created_at) < monthStart)      return false;
      if (tileFilter === "active"         && getRelStage(c.last_contact_date) !== "active") return false;
      if (tileFilter === "noLastContact"  && c.last_contact_date !== null)              return false;
      if (typeFilter  !== "all"           && c.type !== typeFilter)                     return false;
      if (stageFilter !== "all"           && getRelStage(c.last_contact_date) !== stageFilter) return false;
      if (tagsFilter && !(c.tags ?? []).some(t => t.toLowerCase().includes(tagsFilter.toLowerCase()))) return false;
      if (cityFilter    && !(c.location_city    ?? "").toLowerCase().includes(cityFilter.toLowerCase()))    return false;
      if (countryFilter && !(c.location_country ?? "").toLowerCase().includes(countryFilter.toLowerCase())) return false;
      // When using server results the name/email filtering has already been done server-side
      if (!search.trim() || searchResults === null) {
        const q = search.toLowerCase();
        if (q) {
          const name = `${c.first_name} ${c.last_name}`.toLowerCase();
          if (!name.includes(q) && !(c.email ?? "").toLowerCase().includes(q) && !(c.company?.name ?? "").toLowerCase().includes(q)) return false;
        }
      }
      return true;
    }).sort((a, b) => {
      let av = "", bv = "";
      switch (sortKey) {
        case "name":        av = `${a.last_name} ${a.first_name}`.toLowerCase();  bv = `${b.last_name} ${b.first_name}`.toLowerCase();  break;
        case "company":     av = (a.company?.name ?? "").toLowerCase();           bv = (b.company?.name ?? "").toLowerCase();           break;
        case "type":        av = a.type ?? "";                                    bv = b.type ?? "";                                    break;
        case "city":        av = a.location_city ?? "";                           bv = b.location_city ?? "";                           break;
        case "country":     av = a.location_country ?? "";                        bv = b.location_country ?? "";                        break;
        case "lastContact": av = a.last_contact_date ?? "";                       bv = b.last_contact_date ?? "";                       break;
        case "relStage": {
          const ord = ["active","warm","cold","dormant","none"];
          av = String(ord.indexOf(getRelStage(a.last_contact_date)));
          bv = String(ord.indexOf(getRelStage(b.last_contact_date)));
          break;
        }
        default: av = `${a.last_name} ${a.first_name}`.toLowerCase(); bv = `${b.last_name} ${b.first_name}`.toLowerCase();
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ?  1 : -1;
      return 0;
    });
  }, [contacts, searchResults, tileFilter, search, typeFilter, stageFilter, cityFilter, countryFilter, tagsFilter, sortKey, sortDir]);

  // ── Effects ───────────────────────────────────────────────────────────────────

  // Debounce: update local `search` state AND trigger server-side search for non-empty queries
  useEffect(() => {
    const t = setTimeout(async () => {
      setSearch(searchInput);
      if (!searchInput.trim()) {
        setSearchResults(null);
        setSearchLoading(false);
        return;
      }
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/search/contacts?q=${encodeURIComponent(searchInput.trim())}&limit=50`);
        if (res.ok) {
          const data = await res.json() as ContactRow[];
          setSearchResults(Array.isArray(data) ? data : null);
        } else {
          setSearchResults(null);
        }
      } catch {
        setSearchResults(null);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

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

  // Reset notes value when selected contact changes
  useEffect(() => {
    if (selected) { setNotesValue(selected.notes ?? ""); setNotesSaved(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  function handleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  function openContact(id: string) {
    if (id === selectedId) { setSelectedId(null); return; }
    setSelectedId(id); setPanelTab("overview"); setEditing(false);
  }

  function handleTileClick(key: TileFilter) {
    setTileFilter(prev => prev === key ? "all" : key);
  }

  function clearFilters() {
    setTileFilter("all"); setTypeFilter("all"); setStageFilter("all");
    setCityFilter(""); setCountryFilter(""); setTagsFilter("");
  }

  function startEditing() {
    if (!selected) return;
    setEditForm({
      first_name: selected.first_name, last_name: selected.last_name,
      email: selected.email, phone: selected.phone, title: selected.title,
      type: selected.type, linkedin_url: selected.linkedin_url,
      location_city: selected.location_city, location_country: selected.location_country,
      notes: selected.notes, relationship_strength: selected.relationship_strength,
    });
    setEditing(true);
  }

  async function saveEdits() {
    if (!selected) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("contacts")
      .update({
        first_name: editForm.first_name, last_name: editForm.last_name,
        email: editForm.email, phone: editForm.phone, title: editForm.title,
        type: editForm.type, linkedin_url: editForm.linkedin_url,
        location_city: editForm.location_city, location_country: editForm.location_country,
        notes: editForm.notes, relationship_strength: editForm.relationship_strength,
      })
      .eq("id", selected.id)
      .select("*, company:companies(id, name, type, deal_status, website)")
      .single();
    setSaving(false);
    if (!error && data) {
      setContacts(prev => prev.map(c => c.id === selected.id ? (data as ContactRow) : c));
      setEditing(false);
    }
  }

  function handleNotesChange(val: string) {
    setNotesValue(val);
    setNotesSaved(false);
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(async () => {
      if (!selectedId) return;
      setNotesSaving(true);
      await supabase.from("contacts").update({ notes: val }).eq("id", selectedId);
      setNotesSaving(false);
      setNotesSaved(true);
      setContacts(prev => prev.map(c => c.id === selectedId ? { ...c, notes: val } : c));
    }, 1200);
  }

  async function submitLogInteraction(e: React.FormEvent) {
    e.preventDefault();
    if (!logTarget) return;
    setLogSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: newInteraction } = await supabase
      .from("interactions")
      .insert({
        type: logForm.type, subject: logForm.subject || null,
        date: logForm.date, body: logForm.body || null,
        contact_ids: [logTarget.id], company_id: logTarget.company_id,
        created_by: user?.id,
      })
      .select()
      .single();
    // Update last_contact_date if this is more recent
    const current = logTarget.last_contact_date ?? "";
    if (!current || logForm.date > current) {
      await supabase.from("contacts").update({ last_contact_date: logForm.date }).eq("id", logTarget.id);
      setContacts(prev => prev.map(c => c.id === logTarget.id ? { ...c, last_contact_date: logForm.date } : c));
    }
    if (selectedId === logTarget.id && newInteraction) {
      setInteractions(prev => [newInteraction as Interaction, ...prev]);
    }
    setLogSaving(false);
    setLogTarget(null);
    setLogForm({ type: "call", subject: "", date: new Date().toISOString().slice(0, 10), body: "" });
  }

  async function submitAddToPipeline(e: React.FormEvent) {
    e.preventDefault();
    if (!pipelineTarget?.company_id) return;
    setPipelineSaving(true);
    await supabase.from("companies").update({ deal_status: pipelineStage }).eq("id", pipelineTarget.company_id);
    setContacts(prev => prev.map(c =>
      c.id === pipelineTarget.id && c.company
        ? { ...c, company: { ...c.company, deal_status: pipelineStage as import("@/lib/types").DealStatus } }
        : c
    ));
    setPipelineSaving(false);
    setPipelineTarget(null);
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
      .select("*, company:companies(id, name, type, deal_status, website)")
      .single();
    setAddSaving(false);
    if (!error && data) {
      setContacts(prev => [data as ContactRow, ...prev]);
      setShowAddModal(false);
      setAddForm({ type: "Founder / Mgmt" as never });
    }
  }

  async function loadMore() {
    if (loadingMore || allLoaded) return;
    setLoadingMore(true);
    const { data } = await supabase
      .from("contacts")
      .select("*, company:companies(id, name, type, deal_status, website)")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .range(loadOffset, loadOffset + 199);
    if (data?.length) {
      setContacts(prev => [...prev, ...(data as ContactRow[])]);
      setLoadOffset(prev => prev + data.length);
      if (loadOffset + data.length >= totalCount) setAllLoaded(true);
    } else {
      setAllLoaded(true);
    }
    setLoadingMore(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 overflow-hidden flex-col">

      {/* ── Summary Tiles ── */}
      <div className="hidden md:flex px-6 py-3 gap-3 border-b border-slate-100 bg-white flex-wrap">
        {([
          { key: "all"          as TileFilter, label: "Total Contacts",   value: totalCount,         icon: <Users size={16} />,       color: "blue"    },
          { key: "thisMonth"    as TileFilter, label: "New This Month",   value: newThisMonthCount,  icon: <TrendingUp size={16} />,  color: "emerald" },
          { key: "active"       as TileFilter, label: "Active (≤90d)",    value: activeCount,        icon: <Activity size={16} />,    color: "green"   },
          { key: "noLastContact"as TileFilter, label: "No Last Contact",  value: noLastContactCount, icon: <AlertCircle size={16} />, color: "amber"   },
        ] as const).map(tile => {
          const isActive = tileFilter === tile.key;
          const cfg: Record<string, { border: string; icon: string; val: string; hover: string }> = {
            blue:    { border: isActive ? "border-blue-400 bg-blue-50"    : "border-slate-200 bg-white", icon: "text-blue-500",    val: "text-blue-700",    hover: "hover:bg-blue-50/60"    },
            emerald: { border: isActive ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-white", icon: "text-emerald-500", val: "text-emerald-700", hover: "hover:bg-emerald-50/60" },
            green:   { border: isActive ? "border-green-400 bg-green-50"   : "border-slate-200 bg-white", icon: "text-green-500",   val: "text-green-700",   hover: "hover:bg-green-50/60"   },
            amber:   { border: isActive ? "border-amber-400 bg-amber-50"   : "border-slate-200 bg-white", icon: "text-amber-500",   val: "text-amber-700",   hover: "hover:bg-amber-50/60"   },
          };
          const c = cfg[tile.color];
          return (
            <button key={tile.key} onClick={() => handleTileClick(tile.key)}
              className={cn("flex-1 min-w-[148px] flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left", c.border, c.hover)}
            >
              <span className={cn("flex-shrink-0", c.icon)}>{tile.icon}</span>
              <div>
                <p className={cn("text-xl font-bold leading-tight tabular-nums", c.val)}>{tile.value.toLocaleString()}</p>
                <p className="text-[11px] text-slate-500 leading-tight mt-0.5">{tile.label}</p>
              </div>
              {isActive && <span className="ml-auto text-[10px] font-semibold text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full">ON</span>}
            </button>
          );
        })}
      </div>

      {/* ── Main content ── */}
      <div className={cn("flex-1 overflow-auto", selectedId ? "mr-[460px]" : "")}>

        {/* Toolbar */}
        <div className="px-6 py-3 border-b border-slate-100 bg-white sticky top-0 z-10">
          <div className="flex flex-wrap gap-2.5 items-center justify-between">
            <div className="flex gap-2 flex-wrap items-center">
              {/* Search */}
              <div className="relative">
                {searchLoading
                  ? <Loader2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-teal-500 animate-spin" />
                  : <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                }
                <input
                  className="pl-8 pr-7 py-2 text-sm border border-slate-200 rounded-lg w-52 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
                  placeholder="Search contacts…"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                />
                {searchInput && (
                  <button className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" onClick={() => { setSearchInput(""); setSearchResults(null); }}>
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Filters button */}
              <button
                onClick={() => setShowFilters(f => !f)}
                className={cn("flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-colors",
                  showFilters ? "bg-blue-50 border-blue-300 text-blue-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                )}
              >
                <SlidersHorizontal size={14} /> Filters
                {activeFilterCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[9px] font-bold flex items-center justify-center">{activeFilterCount}</span>
                )}
              </button>

              {/* Columns button */}
              <div className="relative">
                <button
                  onClick={() => setShowColMenu(m => !m)}
                  className={cn("flex items-center gap-1.5 px-3 py-2 text-sm border rounded-lg transition-colors",
                    showColMenu ? "bg-blue-50 border-blue-300 text-blue-600" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  )}
                >
                  <Columns size={14} /> Columns
                </button>
                {showColMenu && (
                  <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1.5 min-w-[160px]">
                    {COL_DEFS.map(({ key, label }) => (
                      <label key={key} className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer">
                        <input type="checkbox" checked={visibleCols.includes(key)} onChange={() => toggleCol(key)} className="accent-blue-600" />
                        {label}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Active tile chip */}
              {tileFilter !== "all" && (
                <span className="flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-medium">
                  {tileFilter === "thisMonth" ? "New This Month" : tileFilter === "active" ? "Active (≤90d)" : "No Last Contact"}
                  <button onClick={() => setTileFilter("all")} className="ml-0.5 hover:text-blue-900"><X size={10} /></button>
                </span>
              )}

              <span className="text-xs text-slate-400">{filtered.length.toLocaleString()} shown</span>
            </div>

            <button
              onClick={() => { setShowAddModal(true); loadCompanies(); }}
              className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus size={14} /> Add Contact
            </button>
          </div>

          {/* Filter panel */}
          {showFilters && (
            <div className="flex flex-wrap gap-3 items-end mt-3 pt-3 border-t border-slate-100">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Type</label>
                <select className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none min-w-[140px]"
                  value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                  <option value="all">All types</option>
                  {CONTACT_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Relationship Stage</label>
                <select className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none min-w-[150px]"
                  value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
                  <option value="all">All stages</option>
                  <option value="active">Active (≤90d)</option>
                  <option value="warm">Warm (≤180d)</option>
                  <option value="cold">Cold (≤365d)</option>
                  <option value="dormant">Dormant (&gt;365d)</option>
                  <option value="none">No contact date</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">City</label>
                <input className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-28 focus:outline-none" placeholder="Filter…" value={cityFilter} onChange={e => setCityFilter(e.target.value)} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Country</label>
                <input className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-28 focus:outline-none" placeholder="Filter…" value={countryFilter} onChange={e => setCountryFilter(e.target.value)} />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Tag</label>
                <input className="text-sm border border-slate-200 rounded-lg px-3 py-2 w-28 focus:outline-none" placeholder="Filter…" value={tagsFilter} onChange={e => setTagsFilter(e.target.value)} />
              </div>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="flex items-center gap-1 text-xs text-slate-500 hover:text-red-500 px-2 py-2 transition-colors">
                  <X size={12} /> Clear all
                </button>
              )}
            </div>
          )}
        </div>

        {/* Mobile card list — each contact in its own row */}
        <div className="md:hidden overflow-y-auto flex-1">
          {filtered.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-slate-400">
              {search ? `No contacts matching "${search}"` : "No contacts match current filters."}
            </p>
          ) : filtered.map(c => {
            const fullName = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
            const typeCls  = TYPE_BADGE[c.type] ?? { bg: "bg-gray-100", text: "text-gray-600" };
            return (
              <div key={c.id} onClick={() => openContact(c.id)}
                className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-white cursor-pointer hover:bg-slate-50 active:bg-slate-100">
                <div className="min-w-0 flex-1 mr-3">
                  <p className="text-sm font-medium text-slate-800 truncate">{fullName || "—"}</p>
                  {c.company?.name && <p className="text-xs text-slate-400 truncate">{c.company.name}</p>}
                </div>
                {c.type && (
                  <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0", typeCls.bg, typeCls.text)}>
                    {c.type}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {/* Table */}
        <div className="hidden md:block overflow-x-auto -mx-4 md:mx-0"><table className="w-full text-sm border-collapse min-w-[640px]">
          <thead className="sticky top-[57px] z-10 bg-slate-50">
            <tr>
              {COL_DEFS.filter(c => visibleCols.includes(c.key)).map(col => (
                <th key={col.key}
                  className={cn("text-left px-4 py-2.5 text-xs font-semibold text-slate-500 border-b border-slate-200 whitespace-nowrap select-none",
                    col.sortable && "cursor-pointer hover:text-slate-700"
                  )}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortKey === col.key
                      ? (sortDir === "asc" ? <ChevronUp size={11} /> : <ChevronDown size={11} />)
                      : null}
                  </span>
                </th>
              ))}
              {/* Actions column header */}
              <th className="px-3 py-2.5 border-b border-slate-200 w-14" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={visibleCols.length + 1} className="text-center py-16 text-slate-400 text-sm">
                  {search ? `No contacts matching "${search}"` : "No contacts match current filters."}
                </td>
              </tr>
            ) : filtered.map(c => {
              const isSelected = c.id === selectedId;
              const fullName   = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim();
              const typeCls    = TYPE_BADGE[c.type] ?? { bg: "bg-gray-100", text: "text-gray-600" };
              const stage      = getRelStage(c.last_contact_date);
              const stageCfg   = REL_STAGE_CFG[stage];

              return (
                <tr key={c.id} onClick={() => openContact(c.id)}
                  className={cn(
                    "group border-b border-slate-100 cursor-pointer transition-colors hover:bg-blue-50/40",
                    isSelected ? "bg-blue-50 border-l-2 border-l-blue-500" : ""
                  )}
                >
                  {/* Name */}
                  {visibleCols.includes("name") && (
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={cn("w-7 h-7 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0", avatarGradient(fullName))}>
                          {getInitials(fullName)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 truncate max-w-[150px] text-[13px]">{fullName || "—"}</p>
                          {c.title && <p className="text-[10px] text-slate-400 truncate max-w-[150px]">{c.title}</p>}
                        </div>
                      </div>
                    </td>
                  )}
                  {/* Type */}
                  {visibleCols.includes("type") && (
                    <td className="px-4 py-2.5">
                      <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap", typeCls.bg, typeCls.text)}>
                        {c.type}
                      </span>
                    </td>
                  )}
                  {/* Company */}
                  {visibleCols.includes("company") && (
                    <td className="px-4 py-2.5 max-w-[140px]" onClick={e => e.stopPropagation()}>
                      <CompanyCell
                        contactId={c.id}
                        companyId={c.company_id ?? null}
                        companyName={c.company?.name ?? null}
                        onSaved={(newId, newName) => {
                          setContacts(prev => prev.map(ct => ct.id === c.id
                            ? { ...ct, company_id: newId, company: { ...(ct.company ?? {} as import("@/lib/types").Company), id: newId, name: newName } as import("@/lib/types").Company }
                            : ct
                          ));
                        }}
                      />
                    </td>
                  )}
                  {/* Email */}
                  {visibleCols.includes("email") && (
                    <td className="px-4 py-2.5 max-w-[180px]">
                      {c.email
                        ? <a href={`mailto:${c.email}`} onClick={e => e.stopPropagation()} className="text-[11px] text-blue-600 hover:underline truncate block max-w-[170px]">{c.email}</a>
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                  )}
                  {/* City */}
                  {visibleCols.includes("city") && (
                    <td className="px-4 py-2.5">
                      <span className="text-[11px] text-slate-500">{c.location_city ?? "—"}</span>
                    </td>
                  )}
                  {/* Country */}
                  {visibleCols.includes("country") && (
                    <td className="px-4 py-2.5">
                      <span className="text-[11px] text-slate-500">{c.location_country ?? "—"}</span>
                    </td>
                  )}
                  {/* Last Contact */}
                  {visibleCols.includes("lastContact") && (
                    <td className="px-4 py-2.5">
                      <span className="text-[11px] text-slate-500">{c.last_contact_date ? timeAgo(c.last_contact_date) : "—"}</span>
                    </td>
                  )}
                  {/* Relationship Stage */}
                  {visibleCols.includes("relStage") && (
                    <td className="px-4 py-2.5">
                      {stage !== "none"
                        ? <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap", stageCfg.bg, stageCfg.text)}>{stageCfg.label}</span>
                        : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                  )}
                  {/* Tags */}
                  {visibleCols.includes("tags") && (
                    <td className="px-4 py-2.5">
                      {(c.tags ?? []).length > 0 ? (
                        <div className="flex items-center gap-1 flex-wrap max-w-[160px]">
                          {(c.tags ?? []).slice(0, 3).map(tag => (
                            <span key={tag} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md font-medium whitespace-nowrap">{tag}</span>
                          ))}
                          {(c.tags ?? []).length > 3 && (
                            <span className="text-[10px] text-slate-400 font-medium">+{(c.tags ?? []).length - 3}</span>
                          )}
                        </div>
                      ) : <span className="text-slate-300 text-xs">—</span>}
                    </td>
                  )}
                  {/* Hover actions */}
                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button title="Log Interaction"
                        onClick={() => { setLogTarget(c); setLogForm({ type: "call", subject: "", date: new Date().toISOString().slice(0, 10), body: "" }); }}
                        className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-700 transition-colors"
                      >
                        <Pencil size={13} />
                      </button>
                      {c.company_id && (
                        <button title="Add to Pipeline"
                          onClick={() => { setPipelineTarget(c); setPipelineStage("identified_introduced"); }}
                          className="p-1.5 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-700 transition-colors"
                        >
                          <PlusCircle size={13} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>

        {/* Load More — desktop only */}
        {!allLoaded && !search && (
          <div className="flex items-center justify-center py-4 border-t border-slate-100">
            <button onClick={loadMore} disabled={loadingMore}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
            >
              {loadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
              {loadingMore ? "Loading…" : `Load more (${contacts.length.toLocaleString()} of ${totalCount.toLocaleString()} loaded)`}
            </button>
          </div>
        )}
      </div>

      {/* ── Right Detail Panel ── */}
      {selectedId && selected && (
        <div className="fixed right-0 top-0 bottom-0 w-[460px] bg-white border-l border-slate-200 flex flex-col shadow-xl z-30">
          {/* Header */}
          <div className="flex items-start justify-between p-5 border-b border-slate-100">
            <div className="flex items-center gap-3 min-w-0">
              <div className={cn("w-10 h-10 rounded-full bg-gradient-to-br flex items-center justify-center text-white text-sm font-bold flex-shrink-0",
                avatarGradient(`${selected.first_name} ${selected.last_name}`))}>
                {getInitials(`${selected.first_name ?? ""} ${selected.last_name ?? ""}`)}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-800 text-sm leading-tight">{selected.first_name} {selected.last_name}</p>
                {selected.title   && <p className="text-xs text-slate-400 truncate">{selected.title}</p>}
                {selected.company && <p className="text-xs text-slate-500 font-medium truncate mt-0.5">{selected.company.name}</p>}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              {(() => {
                const s = getRelStage(selected.last_contact_date);
                if (s === "none") return null;
                const cfg = REL_STAGE_CFG[s];
                return <span className={cn("text-[11px] px-2 py-0.5 rounded-full font-medium mr-1", cfg.bg, cfg.text)}>{cfg.label}</span>;
              })()}
              {!editing && (
                <button onClick={startEditing} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors" title="Edit">
                  <Edit2 size={14} />
                </button>
              )}
              <button onClick={() => setSelectedId(null)} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Quick actions bar */}
          {!editing && (
            <div className="flex items-center gap-3 px-5 py-2 border-b border-slate-100 bg-slate-50/50 flex-wrap">
              {selected.email && (
                <a href={`mailto:${selected.email}`} className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 transition-colors truncate max-w-[180px]">
                  <Mail size={11} /><span className="truncate">{selected.email}</span>
                </a>
              )}
              {selected.phone && (
                <a href={`tel:${selected.phone}`} className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 transition-colors">
                  <Phone size={11} />{selected.phone}
                </a>
              )}
              {selected.linkedin_url && (
                <a href={selected.linkedin_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 transition-colors">
                  <Linkedin size={11} />LinkedIn
                </a>
              )}
              <button
                onClick={() => { setLogTarget(selected); setLogForm({ type: "call", subject: "", date: new Date().toISOString().slice(0, 10), body: "" }); }}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium ml-auto"
              >
                <Pencil size={11} />Log
              </button>
            </div>
          )}

          {/* Tabs */}
          <div className="flex border-b border-slate-100 px-5 bg-white">
            {(["overview", "interactions", "pipeline", "notes"] as const).map(tab => (
              <button key={tab}
                onClick={() => { setPanelTab(tab); setEditing(false); }}
                className={cn("text-xs font-medium py-2.5 px-3 border-b-2 transition-colors capitalize whitespace-nowrap",
                  panelTab === tab ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-700"
                )}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Panel Body */}
          <div className="flex-1 overflow-y-auto">

            {/* Overview Tab */}
            {panelTab === "overview" && (
              <div className="p-5 space-y-4">
                {editing ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className={LABEL_CLS}>First Name</label><input className={INPUT_CLS} value={editForm.first_name ?? ""} onChange={e => setEditForm(p => ({ ...p, first_name: e.target.value }))} /></div>
                      <div><label className={LABEL_CLS}>Last Name</label><input className={INPUT_CLS} value={editForm.last_name ?? ""} onChange={e => setEditForm(p => ({ ...p, last_name: e.target.value }))} /></div>
                    </div>
                    <div><label className={LABEL_CLS}>Title</label><input className={INPUT_CLS} value={editForm.title ?? ""} onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))} /></div>
                    <div>
                      <label className={LABEL_CLS}>Type</label>
                      <select className={INPUT_CLS} value={editForm.type ?? ""} onChange={e => setEditForm(p => ({ ...p, type: e.target.value as never }))}>
                        {CONTACT_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                    <div><label className={LABEL_CLS}>Email</label><input className={INPUT_CLS} type="email" value={editForm.email ?? ""} onChange={e => setEditForm(p => ({ ...p, email: e.target.value }))} /></div>
                    <div><label className={LABEL_CLS}>Phone</label><input className={INPUT_CLS} value={editForm.phone ?? ""} onChange={e => setEditForm(p => ({ ...p, phone: e.target.value }))} /></div>
                    <div><label className={LABEL_CLS}>LinkedIn URL</label><input className={INPUT_CLS} value={editForm.linkedin_url ?? ""} onChange={e => setEditForm(p => ({ ...p, linkedin_url: e.target.value }))} /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className={LABEL_CLS}>City</label><input className={INPUT_CLS} value={editForm.location_city ?? ""} onChange={e => setEditForm(p => ({ ...p, location_city: e.target.value }))} /></div>
                      <div><label className={LABEL_CLS}>Country</label><input className={INPUT_CLS} value={editForm.location_country ?? ""} onChange={e => setEditForm(p => ({ ...p, location_country: e.target.value }))} /></div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button onClick={() => setEditing(false)} className="flex-1 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50">Cancel</button>
                      <button onClick={saveEdits} disabled={saving} className="flex-1 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-1.5">
                        {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        {saving ? "Saving…" : "Save"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-4">
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
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Relationship</p>
                      {(() => {
                        const s = getRelStage(selected.last_contact_date);
                        const cfg = REL_STAGE_CFG[s];
                        return <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", cfg.bg, cfg.text)}>{cfg.label}</span>;
                      })()}
                    </div>
                    {selected.email && (
                      <div className="col-span-2">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Email</p>
                        <a href={`mailto:${selected.email}`} className="text-sm text-blue-600 hover:underline">{selected.email}</a>
                      </div>
                    )}
                    {selected.phone && (
                      <div>
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Phone</p>
                        <span className="text-sm text-slate-700">{selected.phone}</span>
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
                    {(selected.tags ?? []).length > 0 && (
                      <div className="col-span-2">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Tags</p>
                        <div className="flex flex-wrap gap-1.5">
                          {(selected.tags ?? []).map(tag => (
                            <span key={tag} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-medium">{tag}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {!selected.email && !selected.phone && !selected.company && (
                      <div className="col-span-2 text-center py-8 text-slate-400">
                        <User size={28} className="mx-auto mb-2 opacity-40" />
                        <p className="text-sm">No details yet</p>
                        <button onClick={startEditing} className="mt-2 text-xs text-blue-600 hover:underline">Add details</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Interactions Tab */}
            {panelTab === "interactions" && (
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Interaction History</p>
                  <button
                    onClick={() => { setLogTarget(selected); setLogForm({ type: "call", subject: "", date: new Date().toISOString().slice(0, 10), body: "" }); }}
                    className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    <Plus size={12} />Log new
                  </button>
                </div>
                {loadingInteractions ? (
                  <div className="flex items-center justify-center py-12"><Loader2 size={20} className="animate-spin text-blue-500" /></div>
                ) : interactions.length === 0 ? (
                  <div className="text-center py-12 text-slate-400">
                    <Calendar size={28} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No interactions recorded</p>
                    <button onClick={() => { setLogTarget(selected); setLogForm({ type: "call", subject: "", date: new Date().toISOString().slice(0, 10), body: "" }); }}
                      className="mt-2 text-xs text-blue-600 hover:underline">Log first interaction</button>
                  </div>
                ) : (
                  <div className="relative">
                    <div className="absolute left-5 top-0 bottom-0 w-px bg-slate-100" />
                    <div className="space-y-3">
                      {interactions.map(i => (
                        <div key={i.id} className="flex gap-3 relative pl-1">
                          <div className="w-10 h-10 rounded-full bg-white border-2 border-slate-100 flex items-center justify-center text-base flex-shrink-0 z-10">
                            {INTERACTION_ICON[i.type] ?? "💬"}
                          </div>
                          <div className="flex-1 min-w-0 bg-slate-50/80 rounded-xl p-3 border border-slate-100">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <p className="text-sm font-medium text-slate-700 leading-tight">{i.subject ?? i.type}</p>
                              <span className="text-[10px] text-slate-400 flex-shrink-0">{formatDate(i.date)}</span>
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

            {/* Pipeline Tab */}
            {panelTab === "pipeline" && (
              <div className="p-5">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Pipeline Status</p>
                {!selected.company ? (
                  <div className="text-center py-12 text-slate-400">
                    <Building2 size={28} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No company linked</p>
                    <p className="text-xs mt-1 text-slate-400">Edit contact to associate a company</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="border border-slate-200 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-800 text-sm">{selected.company.name}</p>
                          <p className="text-xs text-slate-500 mt-0.5 capitalize">{selected.company.type?.replace(/_/g, " ") ?? "—"}</p>
                        </div>
                        {selected.company.deal_status ? (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium capitalize whitespace-nowrap">
                            {selected.company.deal_status.replace(/_/g, " ")}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400 whitespace-nowrap">Not in pipeline</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => { setPipelineTarget(selected); setPipelineStage("identified_introduced"); }}
                      className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-slate-300 rounded-xl text-sm text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
                    >
                      <PlusCircle size={14} />
                      {selected.company.deal_status ? "Update Pipeline Stage" : "Add to Pipeline"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Notes Tab */}
            {panelTab === "notes" && (
              <div className="p-5 flex flex-col" style={{ minHeight: "400px" }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Notes</p>
                  <span className="text-[10px] text-slate-400 flex items-center gap-1">
                    {notesSaving && <><Loader2 size={10} className="animate-spin" />Saving…</>}
                    {!notesSaving && notesSaved && <><Check size={10} className="text-green-500" />Saved</>}
                    {!notesSaving && !notesSaved && notesValue !== (selected?.notes ?? "") && "Unsaved"}
                  </span>
                </div>
                <textarea
                  className="flex-1 min-h-[320px] w-full text-sm border border-slate-200 rounded-xl px-4 py-3 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 resize-none leading-relaxed text-slate-700 placeholder-slate-300"
                  placeholder="Add notes about this contact…"
                  value={notesValue}
                  onChange={e => handleNotesChange(e.target.value)}
                />
                <p className="text-[10px] text-slate-400 mt-2">Auto-saved as you type.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Log Interaction Modal ── */}
      {logTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setLogTarget(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Log Interaction</h2>
                <p className="text-xs text-slate-500">{logTarget.first_name} {logTarget.last_name}</p>
              </div>
              <button onClick={() => setLogTarget(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <form onSubmit={submitLogInteraction} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}>Type</label>
                  <select className={INPUT_CLS} value={logForm.type} onChange={e => setLogForm(p => ({ ...p, type: e.target.value }))}>
                    <option value="call">📞 Call</option>
                    <option value="meeting">📅 Meeting</option>
                    <option value="email">✉️ Email</option>
                    <option value="note">📝 Note</option>
                    <option value="event">🎯 Event</option>
                    <option value="intro">🤝 Intro</option>
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLS}>Date</label>
                  <input type="date" className={INPUT_CLS} value={logForm.date} onChange={e => setLogForm(p => ({ ...p, date: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className={LABEL_CLS}>Subject</label>
                <input className={INPUT_CLS} placeholder="Brief description…" value={logForm.subject} onChange={e => setLogForm(p => ({ ...p, subject: e.target.value }))} />
              </div>
              <div>
                <label className={LABEL_CLS}>Notes</label>
                <textarea className={INPUT_CLS} rows={3} placeholder="Key takeaways, action items…" value={logForm.body} onChange={e => setLogForm(p => ({ ...p, body: e.target.value }))} />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setLogTarget(null)} className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={logSaving} className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2">
                  {logSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  {logSaving ? "Saving…" : "Log Interaction"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add to Pipeline Modal ── */}
      {pipelineTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setPipelineTarget(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Add to Pipeline</h2>
                <p className="text-xs text-slate-500">{pipelineTarget.company?.name ?? "No company linked"}</p>
              </div>
              <button onClick={() => setPipelineTarget(null)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <form onSubmit={submitAddToPipeline} className="px-6 py-5 space-y-4">
              {!pipelineTarget.company_id ? (
                <p className="text-sm text-slate-500 text-center py-4">This contact has no associated company.</p>
              ) : (
                <>
                  <div>
                    <label className={LABEL_CLS}>Pipeline Stage</label>
                    <select className={INPUT_CLS} value={pipelineStage} onChange={e => setPipelineStage(e.target.value)}>
                      {PIPELINE_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setPipelineTarget(null)} className="flex-1 py-2.5 border border-slate-200 text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50">Cancel</button>
                    <button type="submit" disabled={pipelineSaving} className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2">
                      {pipelineSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      {pipelineSaving ? "Saving…" : "Confirm"}
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ── Add Contact Modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-base font-semibold text-slate-900">Add Contact</h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <form onSubmit={handleAddContact} className="px-6 py-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-slate-600 mb-1.5">First Name *</label><input required className={INPUT_CLS} value={addForm.first_name ?? ""} onChange={e => setAddForm(p => ({ ...p, first_name: e.target.value }))} /></div>
                <div><label className="block text-xs font-medium text-slate-600 mb-1.5">Last Name *</label><input required className={INPUT_CLS} value={addForm.last_name ?? ""} onChange={e => setAddForm(p => ({ ...p, last_name: e.target.value }))} /></div>
                <div><label className="block text-xs font-medium text-slate-600 mb-1.5">Email</label><input type="email" className={INPUT_CLS} value={addForm.email ?? ""} onChange={e => setAddForm(p => ({ ...p, email: e.target.value }))} /></div>
                <div><label className="block text-xs font-medium text-slate-600 mb-1.5">Phone</label><input className={INPUT_CLS} value={addForm.phone ?? ""} onChange={e => setAddForm(p => ({ ...p, phone: e.target.value }))} /></div>
                <div><label className="block text-xs font-medium text-slate-600 mb-1.5">Title</label><input className={INPUT_CLS} value={addForm.title ?? ""} onChange={e => setAddForm(p => ({ ...p, title: e.target.value }))} /></div>
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
                <div><label className="block text-xs font-medium text-slate-600 mb-1.5">City</label><input className={INPUT_CLS} value={addForm.location_city ?? ""} onChange={e => setAddForm(p => ({ ...p, location_city: e.target.value }))} /></div>
                <div><label className="block text-xs font-medium text-slate-600 mb-1.5">Country</label><input className={INPUT_CLS} value={addForm.location_country ?? ""} onChange={e => setAddForm(p => ({ ...p, location_country: e.target.value }))} /></div>
              </div>
              <div><label className="block text-xs font-medium text-slate-600 mb-1.5">LinkedIn URL</label><input className={INPUT_CLS} value={addForm.linkedin_url ?? ""} onChange={e => setAddForm(p => ({ ...p, linkedin_url: e.target.value }))} /></div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-2.5 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={addSaving} className="flex-1 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2">
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
