"use client";
// ─── Admin Spreadsheet Client ─────────────────────────────────────────────────
// Embeds a react-data-grid for Companies and Contacts with inline cell editing
// that saves directly to Supabase on change.
// Enhanced with: column sorting, column resizing, filter panel,
// column picker, and clear-filters button.

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  DataGrid,
  type Column,
  type RowsChangeData,
  type SortColumn,
  type RenderEditCellProps,
  renderTextEditor,
  SelectColumn,
} from "react-data-grid";
import "react-data-grid/lib/styles.css";
import { createClient } from "@/lib/supabase/client";
import type { Company, Contact } from "@/lib/types";
import { Search, Plus, Trash2, Shield, SlidersHorizontal, X, Filter, Sparkles } from "lucide-react";
import { AiConfigPanel } from "@/components/admin/ai-config-panel";

// ─── Row types ────────────────────────────────────────────────────────────────

type CompanyRow = Company & { _dirty?: boolean };
type ContactRow = Contact & { company_name?: string | null; _dirty?: boolean; name?: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// ─── Toast state ─────────────────────────────────────────────────────────────

type ToastKind = "saving" | "saved" | "error";
type ToastState = { message: string; type: ToastKind } | null;

// ─── Combo editor factory ─────────────────────────────────────────────────────

function makeComboEditor<TRow>(options: string[]) {
  return function ComboEditor({ row, column, onRowChange, onClose }: RenderEditCellProps<TRow>) {
    const listId = `combo-${column.key}`;
    const val = String((row as Record<string, unknown>)[column.key as string] ?? "");
    return (
      <>
        <input
          list={listId}
          defaultValue={val}
          autoFocus
          style={{ width: "100%", height: "100%", padding: "0 8px", border: "none", outline: "none", fontSize: "12px", background: "#fff" }}
          onChange={(e) => onRowChange({ ...row, [column.key]: e.target.value })}
          onBlur={() => onClose(true)}
          onKeyDown={(e) => { if (e.key === "Enter") onClose(true); if (e.key === "Escape") onClose(false); }}
        />
        <datalist id={listId}>
          {options.map(o => <option key={o} value={o} />)}
        </datalist>
      </>
    );
  };
}

// ─── Main component ───────────────────────────────────────────────────────────

interface AdminClientProps {
  initialCompanies: Company[];
  initialContacts: (Contact & { company: { name: string } | null })[];
}

export function AdminClient({ initialCompanies, initialContacts }: AdminClientProps) {
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<"companies" | "contacts" | "ai_config">("companies");
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Companies state ──────────────────────────────────────────────────────
  const [companies, setCompanies] = useState<CompanyRow[]>(initialCompanies);
  const [selectedCompanyRows, setSelectedCompanyRows] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  // ── Contacts state ───────────────────────────────────────────────────────
  const [contacts, setContacts] = useState<ContactRow[]>(
    initialContacts.map((c) => ({
      ...c,
      company_name: c.company?.name ?? null,
      name: [c.first_name, c.last_name].filter(Boolean).join(" "),
    }))
  );
  const [selectedContactRows, setSelectedContactRows] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  // ── Sort state ───────────────────────────────────────────────────────────
  const [companySortColumns, setCompanySortColumns] = useState<readonly SortColumn[]>([]);
  const [contactSortColumns, setContactSortColumns] = useState<readonly SortColumn[]>([]);

  // ── Panel filter state ────────────────────────────────────────────────────
  const [companyFilters, setCompanyFilters] = useState<Record<string, string>>({});
  const [contactFilters, setContactFilters] = useState<Record<string, string>>({});
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const filterPanelRef = useRef<HTMLDivElement>(null);

  // ── Column picker state ───────────────────────────────────────────────────
  const [hiddenCompanyKeys, setHiddenCompanyKeys] = useState<Set<string>>(new Set());
  const [hiddenContactKeys, setHiddenContactKeys] = useState<Set<string>>(new Set());
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const columnPickerRef = useRef<HTMLDivElement>(null);

  // Close column picker when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (columnPickerRef.current && !columnPickerRef.current.contains(e.target as Node)) {
        setShowColumnPicker(false);
      }
    }
    if (showColumnPicker) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showColumnPicker]);

  // Close filter panel when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (filterPanelRef.current && !filterPanelRef.current.contains(e.target as Node)) {
        setShowFilterPanel(false);
      }
    }
    if (showFilterPanel) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showFilterPanel]);

  // ── Toast helper ─────────────────────────────────────────────────────────
  function showToast(message: string, type: ToastKind) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    if (type !== "saving") {
      toastTimer.current = setTimeout(() => setToast(null), 3000);
    }
  }

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // ─── Company columns ───────────────────────────────────────────────────────
  const allCompanyColumns: Column<CompanyRow>[] = useMemo(
    () => [
      {
        ...SelectColumn,
        frozen: true,
      },
      {
        key: "name",
        name: "Company Name",
        width: 200,
        frozen: true,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
      },
      {
        key: "type",
        name: "Type",
        width: 150,
        sortable: true,
        resizable: true,
        renderEditCell: makeComboEditor<CompanyRow>(["Startup","Limited Partner","Investor","Strategic Partner","Other"]),
      },
      {
        key: "lp_stage",
        name: "LP Stage",
        width: 140,
        sortable: true,
        resizable: true,
        renderEditCell: makeComboEditor<CompanyRow>(["Lead","Initial Meeting","Discussion in Process","Due Diligence","Committed","Passed"]),
      },
      {
        key: "deal_status",
        name: "Deal Status",
        width: 130,
        sortable: true,
        resizable: true,
        renderEditCell: makeComboEditor<CompanyRow>(["identified_introduced","first_meeting","discussion_in_process","due_diligence","passed","portfolio","tracking_hold","exited"]),
      },
      {
        key: "stage",
        name: "Investment Round",
        width: 150,
        sortable: true,
        resizable: true,
        renderEditCell: makeComboEditor<CompanyRow>(["Pre-Seed","Pre-A","Seed","Seed Extension","Series A","Series B","Series C","Growth"]),
      },
      {
        key: "sectors",
        name: "Sectors",
        width: 180,
        sortable: true,
        resizable: true,
        renderCell: ({ row }: { row: CompanyRow }) =>
          Array.isArray(row.sectors) ? row.sectors.join(", ") : (row.sectors ?? ""),
        renderEditCell: makeComboEditor<CompanyRow>(["Biotech","Cleantech","Other"]),
      },
      {
        key: "description",
        name: "Description",
        width: 300,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
      },
      {
        key: "website",
        name: "Website",
        width: 180,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
      },
      {
        key: "location_city",
        name: "City",
        width: 120,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
      },
      {
        key: "location_country",
        name: "Country",
        width: 120,
        sortable: true,
        resizable: true,
        renderEditCell: makeComboEditor<CompanyRow>(["USA","UK","Canada","Singapore","South Korea","Japan","Germany","France","Australia","Israel","India","China","Thailand","Malaysia","Brunei","Other"]),
      },
      {
        key: "founded_year",
        name: "Founded",
        width: 90,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
      },
      {
        key: "funding_raised",
        name: "Funding Raised",
        width: 140,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
      },
      {
        key: "aum",
        name: "AUM",
        width: 120,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
      },
      {
        key: "commitment_goal",
        name: "Commitment Goal",
        width: 150,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
      },
      {
        key: "notes",
        name: "Notes",
        width: 250,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
      },
      {
        key: "source",
        name: "Source",
        width: 120,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
      },
      {
        key: "sub_type",
        name: "Sub-sector",
        width: 200,
        sortable: true,
        resizable: true,
        renderEditCell: makeComboEditor<CompanyRow>([
          "Additive / Advanced Manufacturing","Advanced Diagnostics / Biomarkers",
          "Advanced Materials","Air","Biomanufacturing","Computing / AI",
          "Digital Health","Drug Discovery","Earth","Energy Source / Storage",
          "Food / Ag","Organomics","Regenerative / Longevity","SynBio","Water / Waste",
        ]),
      },
      {
        key: "last_funding_date",
        name: "Last Funding Date",
        width: 140,
        sortable: true,
        resizable: true,
        renderCell: ({ row }: { row: CompanyRow }) => fmtDate(row.last_funding_date),
        renderEditCell: renderTextEditor,
      },
      {
        key: "last_funding_stage",
        name: "Last Funding Stage",
        width: 150,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
      },
      {
        key: "first_contact_date",
        name: "First Contact",
        width: 120,
        sortable: true,
        resizable: true,
        renderCell: ({ row }: { row: CompanyRow }) => fmtDate(row.first_contact_date),
        renderEditCell: renderTextEditor,
      },
      {
        key: "last_contact_date",
        name: "Last Contact",
        width: 120,
        sortable: true,
        resizable: true,
        renderCell: ({ row }: { row: CompanyRow }) => fmtDate(row.last_contact_date),
        renderEditCell: renderTextEditor,
      },
      {
        key: "is_strategic_partner",
        name: "Strategic Partner",
        width: 130,
        sortable: true,
        resizable: true,
        renderCell: ({ row }: { row: CompanyRow }) => (row.is_strategic_partner ? "Yes" : "No"),
        renderEditCell: renderTextEditor,
      },
      {
        key: "lp_type",
        name: "LP Type",
        width: 120,
        sortable: true,
        resizable: true,
        renderEditCell: makeComboEditor<CompanyRow>(["Lead","Initial Meeting","Discussion in Process","Due Diligence","Committed","Passed"]),
      },
      {
        key: "fund_focus",
        name: "Fund Focus",
        width: 140,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
      },
      {
        key: "employee_count",
        name: "Employees",
        width: 100,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
      },
      {
        key: "logo_url",
        name: "Logo URL",
        width: 200,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
      },
      {
        key: "pitch_deck_url",
        name: "Deck URL",
        width: 200,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
      },
      {
        key: "linkedin_url",
        name: "LinkedIn",
        width: 180,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
      },
      {
        key: "tags",
        name: "Key Words",
        width: 200,
        sortable: true,
        resizable: true,
        renderCell: ({ row }: { row: CompanyRow }) =>
          Array.isArray(row.tags) ? row.tags.join(", ") : (row.tags ?? ""),
        renderEditCell: renderTextEditor,
      },
      {
        key: "created_at",
        name: "Created",
        width: 110,
        sortable: true,
        resizable: true,
        renderCell: ({ row }: { row: CompanyRow }) => fmtDate(row.created_at),
        editable: false,
      },
    ],
    []
  );

  // ─── Contact columns ───────────────────────────────────────────────────────
  const allContactColumns: Column<ContactRow>[] = useMemo(
    () => [
      {
        ...SelectColumn,
        frozen: true,
      },
      {
        key: "name",
        name: "Name",
        width: 200,
        frozen: true,
        sortable: true,
        resizable: true,
        renderCell: ({ row }: { row: ContactRow }) =>
          [row.first_name, row.last_name].filter(Boolean).join(" "),
        renderEditCell: renderTextEditor,
      },
      {
        key: "email",
        name: "Email",
        width: 200,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
      },
      {
        key: "title",
        name: "Title",
        width: 160,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
      },
      {
        key: "type",
        name: "Type",
        width: 130,
        sortable: true,
        resizable: true,
        renderEditCell: makeComboEditor<ContactRow>(["Advisor / KOL","Ecosystem","Employee","Founder / Mgmt","Government/Academic","Investor","Lawyer","Limited Partner","Other","Strategic"]),
      },
      {
        key: "company_name",
        name: "Company",
        width: 160,
        editable: false,
        sortable: true,
        resizable: true,
        renderCell: ({ row }: { row: ContactRow }) => row.company_name ?? "",
      },
      {
        key: "phone",
        name: "Phone",
        width: 130,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
      },
      {
        key: "linkedin_url",
        name: "LinkedIn",
        width: 180,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
      },
      {
        key: "location_city",
        name: "City",
        width: 120,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
      },
      {
        key: "location_country",
        name: "Country",
        width: 120,
        sortable: true,
        resizable: true,
        renderEditCell: makeComboEditor<ContactRow>(["USA","UK","Canada","Singapore","South Korea","Japan","Germany","France","Australia","Israel","India","China","Thailand","Malaysia","Brunei","Other"]),
      },
      {
        key: "notes",
        name: "Notes",
        width: 250,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
      },
      {
        key: "relationship_strength",
        name: "Relationship",
        width: 120,
        sortable: true,
        resizable: true,
        renderEditCell: makeComboEditor<ContactRow>(["strong","medium","weak","new"]),
      },
      {
        key: "is_primary_contact",
        name: "Primary",
        width: 90,
        sortable: true,
        resizable: true,
        renderCell: ({ row }: { row: ContactRow }) => (row.is_primary_contact ? "Yes" : "No"),
        renderEditCell: renderTextEditor,
      },
      {
        key: "last_contact_date",
        name: "Last Contact",
        width: 120,
        sortable: true,
        resizable: true,
        renderCell: ({ row }: { row: ContactRow }) => fmtDate(row.last_contact_date),
        renderEditCell: renderTextEditor,
      },
      {
        key: "status",
        name: "Status",
        width: 100,
        sortable: true,
        resizable: true,
        renderEditCell: makeComboEditor<ContactRow>(["active","pending"]),
      },
      {
        key: "created_at",
        name: "Created",
        width: 110,
        sortable: true,
        resizable: true,
        renderCell: ({ row }: { row: ContactRow }) => fmtDate(row.created_at),
        editable: false,
      },
    ],
    []
  );

  // ─── Visible columns (apply column picker) ────────────────────────────────
  // Keys that can never be hidden: SelectColumn key and frozen name/first_name
  const FROZEN_COMPANY_KEYS = new Set(["name"]);
  const FROZEN_CONTACT_KEYS = new Set(["name"]);

  const companyColumns = useMemo(
    () =>
      allCompanyColumns.filter((col) => {
        const key = col.key as string;
        // SelectColumn has key "select-row"; never hide it
        if (key === "select-row") return true;
        if (FROZEN_COMPANY_KEYS.has(key)) return true;
        return !hiddenCompanyKeys.has(key);
      }),
    [allCompanyColumns, hiddenCompanyKeys]
  );

  const contactColumns = useMemo(
    () =>
      allContactColumns.filter((col) => {
        const key = col.key as string;
        if (key === "select-row") return true;
        if (FROZEN_CONTACT_KEYS.has(key)) return true;
        return !hiddenContactKeys.has(key);
      }),
    [allContactColumns, hiddenContactKeys]
  );

  // ─── Filtered + sorted rows ───────────────────────────────────────────────

  const filteredCompanies = useMemo(() => {
    // 1. Global search filter
    const filtered = !search.trim()
      ? companies
      : (() => {
          const q = search.toLowerCase();
          return companies.filter(
            (c) =>
              c.name?.toLowerCase().includes(q) ||
              c.type?.toLowerCase().includes(q) ||
              c.location_city?.toLowerCase().includes(q) ||
              c.location_country?.toLowerCase().includes(q) ||
              c.description?.toLowerCase().includes(q) ||
              c.notes?.toLowerCase().includes(q)
          );
        })();

    // 2. Panel filters
    const panelFiltered = filtered.filter((row) => {
      const filters = companyFilters;
      if (filters.type && !row.type?.toLowerCase().includes(filters.type.toLowerCase())) return false;
      if (filters.deal_status && !row.deal_status?.toLowerCase().includes(filters.deal_status.toLowerCase())) return false;
      if (filters.stage && !(row.stage?.toLowerCase().includes(filters.stage.toLowerCase()) || row.lp_stage?.toLowerCase().includes(filters.stage.toLowerCase()))) return false;
      if (filters.sectors && !(row.sectors ?? []).some((s: string) => s.toLowerCase().includes(filters.sectors.toLowerCase()))) return false;
      if (filters.location_country && !row.location_country?.toLowerCase().includes(filters.location_country.toLowerCase())) return false;
      if (filters.source && !row.source?.toLowerCase().includes(filters.source.toLowerCase())) return false;
      return true;
    });

    // 3. Sort
    if (companySortColumns.length === 0) return panelFiltered;
    return [...panelFiltered].sort((a, b) => {
      for (const { columnKey, direction } of companySortColumns) {
        const aVal = String((a as unknown as Record<string, unknown>)[columnKey] ?? "");
        const bVal = String((b as unknown as Record<string, unknown>)[columnKey] ?? "");
        const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
        if (cmp !== 0) return direction === "ASC" ? cmp : -cmp;
      }
      return 0;
    });
  }, [companies, search, companyFilters, companySortColumns]);

  const filteredContacts = useMemo(() => {
    // 1. Global search filter
    const filtered = !search.trim()
      ? contacts
      : (() => {
          const q = search.toLowerCase();
          return contacts.filter(
            (c) =>
              c.name?.toLowerCase().includes(q) ||
              c.first_name?.toLowerCase().includes(q) ||
              c.last_name?.toLowerCase().includes(q) ||
              c.email?.toLowerCase().includes(q) ||
              c.title?.toLowerCase().includes(q) ||
              c.company_name?.toLowerCase().includes(q)
          );
        })();

    // 2. Panel filters
    const panelFiltered = filtered.filter((row) => {
      const filters = contactFilters;
      if (filters.type && !row.type?.toLowerCase().includes(filters.type.toLowerCase())) return false;
      if (filters.company_name && !row.company_name?.toLowerCase().includes(filters.company_name.toLowerCase())) return false;
      if (filters.location_country && !row.location_country?.toLowerCase().includes(filters.location_country.toLowerCase())) return false;
      if (filters.status && !row.status?.toLowerCase().includes(filters.status.toLowerCase())) return false;
      if (filters.relationship_strength && !row.relationship_strength?.toLowerCase().includes(filters.relationship_strength.toLowerCase())) return false;
      return true;
    });

    // 3. Sort
    if (contactSortColumns.length === 0) return panelFiltered;
    return [...panelFiltered].sort((a, b) => {
      for (const { columnKey, direction } of contactSortColumns) {
        const aVal = String((a as unknown as Record<string, unknown>)[columnKey] ?? "");
        const bVal = String((b as unknown as Record<string, unknown>)[columnKey] ?? "");
        const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
        if (cmp !== 0) return direction === "ASC" ? cmp : -cmp;
      }
      return 0;
    });
  }, [contacts, search, contactFilters, contactSortColumns]);

  // ─── Row change handlers ──────────────────────────────────────────────────

  const handleCompanyRowsChange = useCallback(
    async (updatedRows: CompanyRow[], { indexes }: RowsChangeData<CompanyRow>) => {
      setCompanies((prev) => {
        const next = [...prev];
        for (const idx of indexes) {
          const changed = updatedRows[idx];
          const globalIdx = next.findIndex((r) => r.id === changed.id);
          if (globalIdx !== -1) next[globalIdx] = changed;
        }
        return next;
      });

      for (const idx of indexes) {
        const row = updatedRows[idx];
        if (!row.id) continue;

        showToast("Saving…", "saving");

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _dirty, company, ...fields } = row as CompanyRow & { company?: unknown };

        const { error } = await supabase
          .from("companies")
          .update(fields as Partial<Company>)
          .eq("id", row.id);

        if (error) {
          showToast("Error saving: " + error.message, "error");
        } else {
          showToast("Saved ✓", "saved");
        }
      }
    },
    [supabase]
  );

  const handleContactRowsChange = useCallback(
    async (updatedRows: ContactRow[], { indexes }: RowsChangeData<ContactRow>) => {
      setContacts((prev) => {
        const next = [...prev];
        for (const idx of indexes) {
          const changed = updatedRows[idx];
          const globalIdx = next.findIndex((r) => r.id === changed.id);
          if (globalIdx !== -1) next[globalIdx] = changed;
        }
        return next;
      });

      for (const idx of indexes) {
        const row = updatedRows[idx];
        if (!row.id) continue;

        showToast("Saving…", "saving");

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { _dirty, company_name, company, name, ...fields } = row as ContactRow & { company?: unknown };

        // Split combined "Name" field back into first_name / last_name
        if (name !== undefined) {
          const parts = name.trim().split(/\s+/);
          fields.first_name = parts[0] ?? "";
          fields.last_name = parts.slice(1).join(" ") || "";
        }

        const { error } = await supabase
          .from("contacts")
          .update(fields as Partial<Contact>)
          .eq("id", row.id);

        if (error) {
          showToast("Error saving: " + error.message, "error");
        } else {
          showToast("Saved ✓", "saved");
        }
      }
    },
    [supabase]
  );

  // ─── Add Row ──────────────────────────────────────────────────────────────

  async function handleAddCompany() {
    showToast("Saving…", "saving");
    const { data, error } = await supabase
      .from("companies")
      .insert({ name: "New Company", type: "startup" })
      .select()
      .single();

    if (error || !data) {
      showToast("Error: " + (error?.message ?? "unknown"), "error");
      return;
    }
    setCompanies((prev) => [data as CompanyRow, ...prev]);
    showToast("Saved ✓", "saved");
  }

  async function handleAddContact() {
    showToast("Saving…", "saving");
    const { data, error } = await supabase
      .from("contacts")
      .insert({ first_name: "New", last_name: "Contact", type: "Other", status: "active" })
      .select()
      .single();

    if (error || !data) {
      showToast("Error: " + (error?.message ?? "unknown"), "error");
      return;
    }
    const contact = data as Contact;
    const row: ContactRow = {
      ...contact,
      company_name: null,
      name: [contact.first_name, contact.last_name].filter(Boolean).join(" "),
    };
    setContacts((prev) => [row, ...prev]);
    showToast("Saved ✓", "saved");
  }

  // ─── Delete Rows ──────────────────────────────────────────────────────────

  async function handleDeleteCompanies() {
    const ids = Array.from(selectedCompanyRows);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} company row(s)? This cannot be undone.`)) return;

    showToast("Saving…", "saving");
    const { error } = await supabase.from("companies").delete().in("id", ids);
    if (error) {
      showToast("Error: " + error.message, "error");
      return;
    }
    setCompanies((prev) => prev.filter((r) => !ids.includes(r.id)));
    setSelectedCompanyRows(new Set());
    showToast("Deleted ✓", "saved");
  }

  async function handleDeleteContacts() {
    const ids = Array.from(selectedContactRows);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} contact row(s)? This cannot be undone.`)) return;

    showToast("Saving…", "saving");
    const { error } = await supabase.from("contacts").delete().in("id", ids);
    if (error) {
      showToast("Error: " + error.message, "error");
      return;
    }
    setContacts((prev) => prev.filter((r) => !ids.includes(r.id)));
    setSelectedContactRows(new Set());
    showToast("Deleted ✓", "saved");
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const isCompanies = activeTab === "companies";
  const isAiConfig  = activeTab === "ai_config";

  // ─── Clear filters helper ────────────────────────────────────────────────

  const hasActiveFilters = isCompanies
    ? Object.values(companyFilters).some((v) => v.trim() !== "")
    : Object.values(contactFilters).some((v) => v.trim() !== "");

  const activeFilterCount = isCompanies
    ? Object.values(companyFilters).filter((v) => v.trim() !== "").length
    : Object.values(contactFilters).filter((v) => v.trim() !== "").length;

  function handleClearFilters() {
    if (isCompanies) setCompanyFilters({});
    else setContactFilters({});
  }

  const rowCount = isCompanies ? filteredCompanies.length : filteredContacts.length;
  const totalCount = isCompanies ? companies.length : contacts.length;
  const selectedCount = isCompanies
    ? selectedCompanyRows.size
    : selectedContactRows.size;

  // Columns available to toggle (skip SelectColumn and frozen key)
  const pickableColumns = isCompanies
    ? allCompanyColumns.filter(
        (col) => (col.key as string) !== "select-row" && !FROZEN_COMPANY_KEYS.has(col.key as string)
      )
    : allContactColumns.filter(
        (col) => (col.key as string) !== "select-row" && !FROZEN_CONTACT_KEYS.has(col.key as string)
      );

  const hiddenKeys = isCompanies ? hiddenCompanyKeys : hiddenContactKeys;
  const setHiddenKeys = isCompanies ? setHiddenCompanyKeys : setHiddenContactKeys;

  // ─── Filter panel field helpers ───────────────────────────────────────────

  function FilterField({
    label,
    filterKey,
    options,
    isCompanyTab,
  }: {
    label: string;
    filterKey: string;
    options?: string[];
    isCompanyTab: boolean;
  }) {
    const filters = isCompanyTab ? companyFilters : contactFilters;
    const setFilters = isCompanyTab ? setCompanyFilters : setContactFilters;
    const sharedStyle = {
      width: "100%",
      fontSize: "12px",
      padding: "5px 8px",
      border: "1px solid #e2e8f0",
      borderRadius: "4px",
      background: "#f8fafc",
      color: "#1e293b",
      outline: "none",
      boxSizing: "border-box" as const,
    };
    return (
      <div style={{ marginBottom: "10px" }}>
        <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", marginBottom: "3px" }}>
          {label}
        </label>
        {options ? (
          <select
            value={filters[filterKey] ?? ""}
            onChange={(e) => setFilters((prev) => ({ ...prev, [filterKey]: e.target.value }))}
            style={sharedStyle}
          >
            <option value="">All</option>
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input
            type="text"
            value={filters[filterKey] ?? ""}
            onChange={(e) => setFilters((prev) => ({ ...prev, [filterKey]: e.target.value }))}
            placeholder={`Filter by ${label.toLowerCase()}…`}
            style={sharedStyle}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Header bar ── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 flex-shrink-0 flex-wrap">
        <Shield size={18} className="text-blue-600" />
        <h1 className="text-sm font-semibold text-slate-800 mr-2">Admin Spreadsheet</h1>

        {/* Tab selector */}
        <div className="flex rounded-md border border-slate-200 overflow-hidden text-xs font-medium">
          <button
            onClick={() => { setActiveTab("companies"); setSearch(""); }}
            className={`px-3 py-1.5 transition-colors ${
              isCompanies
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Companies
          </button>
          <button
            onClick={() => { setActiveTab("contacts"); setSearch(""); }}
            className={`px-3 py-1.5 border-l border-slate-200 transition-colors ${
              activeTab === "contacts"
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Contacts
          </button>
          <button
            onClick={() => { setActiveTab("ai_config"); setSearch(""); }}
            className={`px-3 py-1.5 border-l border-slate-200 transition-colors flex items-center gap-1 ${
              isAiConfig
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Sparkles size={11} /> AI Config
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 max-w-xs">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>

        {/* Row count */}
        <span className="text-xs text-slate-400 whitespace-nowrap">
          {search || hasActiveFilters ? `${rowCount} / ${totalCount}` : rowCount} row{rowCount !== 1 ? "s" : ""}
        </span>

        <div className="flex-1" />

        {/* Clear Filters button — only when panel filters are active */}
        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-md hover:bg-amber-100 transition-colors"
          >
            <X size={13} />
            Clear Filters
          </button>
        )}

        {/* Filter panel button */}
        <div className="relative" ref={filterPanelRef}>
          <button
            onClick={() => { setShowFilterPanel((v) => !v); setShowColumnPicker(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-md transition-colors ${
              showFilterPanel
                ? "bg-slate-700 text-white border-slate-700"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            <Filter size={13} />
            {activeFilterCount > 0 ? `Filter (${activeFilterCount})` : "Filter"}
          </button>

          {showFilterPanel && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                right: 0,
                zIndex: 50,
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                padding: "14px",
                minWidth: "240px",
                maxHeight: "480px",
                overflowY: "auto",
              }}
            >
              <p style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Filter Results
              </p>

              {isCompanies ? (
                <>
                  <FilterField label="Type" filterKey="type" isCompanyTab={true} options={["startup","limited partner","investor","strategic partner","ecosystem_partner","other"]} />
                  <FilterField label="Deal Status" filterKey="deal_status" isCompanyTab={true} options={["sourced","monitoring","active_deal","portfolio","passed","exited"]} />
                  <FilterField label="Stage / LP Stage" filterKey="stage" isCompanyTab={true} options={["pre-seed","seed","series_a","series_b","Lead","Initial Meeting","Discussion in Process","Due Diligence","Committed","Passed"]} />
                  <FilterField label="Sector" filterKey="sectors" isCompanyTab={true} options={["cleantech","techbio","advanced materials","energy storage","carbon capture","climate tech","synthetic biology","industrial biotech","agtech","water tech","circular economy","deep tech","hardware","other"]} />
                  <FilterField label="Location Country" filterKey="location_country" isCompanyTab={true} />
                  <FilterField label="Source" filterKey="source" isCompanyTab={true} />
                </>
              ) : (
                <>
                  <FilterField label="Type" filterKey="type" isCompanyTab={false} options={["founder","lp","corporate","ecosystem_partner","fund_manager","government","advisor","other"]} />
                  <FilterField label="Company" filterKey="company_name" isCompanyTab={false} />
                  <FilterField label="Location Country" filterKey="location_country" isCompanyTab={false} />
                  <FilterField label="Status" filterKey="status" isCompanyTab={false} options={["active","pending"]} />
                  <FilterField label="Relationship" filterKey="relationship_strength" isCompanyTab={false} options={["strong","medium","weak","new"]} />
                </>
              )}

              <button
                onClick={() => { handleClearFilters(); }}
                style={{
                  marginTop: "4px",
                  width: "100%",
                  fontSize: "12px",
                  fontWeight: 500,
                  padding: "6px 10px",
                  border: "1px solid #fcd34d",
                  borderRadius: "4px",
                  background: "#fffbeb",
                  color: "#92400e",
                  cursor: "pointer",
                }}
              >
                Clear All
              </button>
            </div>
          )}
        </div>

        {/* Columns picker button */}
        <div className="relative" ref={columnPickerRef}>
          <button
            onClick={() => { setShowColumnPicker((v) => !v); setShowFilterPanel(false); }}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-md transition-colors ${
              showColumnPicker
                ? "bg-slate-700 text-white border-slate-700"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            <SlidersHorizontal size={13} />
            Columns
          </button>

          {showColumnPicker && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                right: 0,
                zIndex: 50,
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                padding: "12px",
                minWidth: "200px",
                maxHeight: "400px",
                overflowY: "auto",
              }}
            >
              <p style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", marginBottom: "8px", textTransform: "uppercase" }}>
                Toggle Columns
              </p>
              {pickableColumns.map((col) => (
                <label
                  key={col.key as string}
                  style={{ display: "flex", alignItems: "center", gap: "8px", padding: "4px 0", cursor: "pointer", fontSize: "12px", color: "#1e293b" }}
                >
                  <input
                    type="checkbox"
                    checked={!hiddenKeys.has(col.key as string)}
                    onChange={(e) =>
                      setHiddenKeys((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.delete(col.key as string);
                        else next.add(col.key as string);
                        return next;
                      })
                    }
                  />
                  {col.name}
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Delete button — only show when rows selected */}
        {selectedCount > 0 && (
          <button
            onClick={isCompanies ? handleDeleteCompanies : handleDeleteContacts}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-50 text-red-600 border border-red-200 rounded-md hover:bg-red-100 transition-colors"
          >
            <Trash2 size={13} />
            Delete {selectedCount} row{selectedCount !== 1 ? "s" : ""}
          </button>
        )}

        {/* Add Row button */}
        <button
          onClick={isCompanies ? handleAddCompany : handleAddContact}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus size={13} />
          Add Row
        </button>
      </div>

      {/* ── Grid or AI Config panel ── */}
      <div className="flex-1 overflow-hidden admin-grid">
        {isAiConfig ? (
          <AiConfigPanel />
        ) : isCompanies ? (
          <DataGrid<CompanyRow, unknown, string>
            columns={companyColumns}
            rows={filteredCompanies}
            onRowsChange={handleCompanyRowsChange}
            rowKeyGetter={(row: CompanyRow) => row.id}
            selectedRows={selectedCompanyRows}
            onSelectedRowsChange={setSelectedCompanyRows}
            sortColumns={companySortColumns}
            onSortColumnsChange={setCompanySortColumns}
            className="rdg-light"
            style={{ height: "calc(100vh - 108px)", blockSize: "calc(100vh - 108px)" }}
          />
        ) : (
          <DataGrid<ContactRow, unknown, string>
            columns={contactColumns}
            rows={filteredContacts}
            onRowsChange={handleContactRowsChange}
            rowKeyGetter={(row: ContactRow) => row.id}
            selectedRows={selectedContactRows}
            onSelectedRowsChange={setSelectedContactRows}
            sortColumns={contactSortColumns}
            onSortColumnsChange={setContactSortColumns}
            className="rdg-light"
            style={{ height: "calc(100vh - 108px)", blockSize: "calc(100vh - 108px)" }}
          />
        )}
      </div>

      {/* ── Toast notification ── */}
      {toast && (
        <div
          className={`fixed bottom-5 right-5 px-4 py-2 rounded-lg text-sm font-medium shadow-lg z-50 transition-all ${
            toast.type === "saving"
              ? "bg-slate-700 text-white"
              : toast.type === "saved"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      <style>{`
        /* ── react-data-grid custom theming ── */
        .admin-grid .rdg {
          font-size: 12px;
          font-family: ui-sans-serif, system-ui, sans-serif;
          border: none;
          --rdg-header-background-color: #1e293b;
          --rdg-header-row-height: 36px;
          --rdg-row-height: 32px;
          --rdg-selection-color: #3b82f6;
          --rdg-font-size: 12px;
          --rdg-color: #1e293b;
          --rdg-border-color: #e2e8f0;
          --rdg-summary-border-color: #e2e8f0;
          --rdg-background-color: #fff;
          --rdg-row-hover-background-color: #f0f9ff;
          --rdg-checkbox-color: #3b82f6;
          --rdg-checkbox-focus-color: #2563eb;
          --rdg-checkbox-disabled-border-color: #94a3b8;
          --rdg-checkbox-disabled-background-color: #e2e8f0;
          --rdg-cell-frozen-box-shadow: 2px 0 4px rgba(0,0,0,0.06);
        }
        .admin-grid .rdg-header-row {
          background: #1e293b;
          color: #fff;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.03em;
          font-size: 11px;
        }
        .admin-grid .rdg-header-row .rdg-cell {
          border-right-color: #334155;
          border-bottom-color: #334155;
          padding: 0;
        }
        .admin-grid .rdg-header-cell-content {
          width: 100%;
          box-sizing: border-box;
        }
        .admin-grid .rdg-row:nth-child(even) {
          background-color: #f8fafc;
        }
        .admin-grid .rdg-row:nth-child(odd) {
          background-color: #ffffff;
        }
        .admin-grid .rdg-row:hover {
          background-color: #eff6ff !important;
        }
        .admin-grid .rdg-row[aria-selected="true"] {
          background-color: #dbeafe !important;
        }
        .admin-grid .rdg-cell {
          padding: 0 8px;
          display: flex;
          align-items: center;
        }
        .admin-grid .rdg-cell[aria-selected="true"] {
          outline: 2px solid #3b82f6;
          outline-offset: -2px;
        }
        .admin-grid .rdg-text-editor {
          font-size: 12px;
          padding: 0 8px;
          background: #fff;
          border: 2px solid #3b82f6;
        }
      `}</style>
    </div>
  );
}
