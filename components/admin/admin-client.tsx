"use client";
// ─── Admin Spreadsheet Client ─────────────────────────────────────────────────
// Embeds a react-data-grid for Companies and Contacts with inline cell editing
// that saves directly to Supabase on change.

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  DataGrid,
  type Column,
  type RowsChangeData,
  renderTextEditor,
  SelectColumn,
} from "react-data-grid";
import "react-data-grid/lib/styles.css";
import { createClient } from "@/lib/supabase/client";
import type { Company, Contact } from "@/lib/types";
import { Search, Plus, Trash2, Shield } from "lucide-react";

// ─── Row types ────────────────────────────────────────────────────────────────

type CompanyRow = Company & { _dirty?: boolean };
type ContactRow = Contact & { company_name?: string | null; _dirty?: boolean };

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

// ─── Main component ───────────────────────────────────────────────────────────

interface AdminClientProps {
  initialCompanies: Company[];
  initialContacts: (Contact & { company: { name: string } | null })[];
}

export function AdminClient({ initialCompanies, initialContacts }: AdminClientProps) {
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<"companies" | "contacts">("companies");
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
    }))
  );
  const [selectedContactRows, setSelectedContactRows] = useState<ReadonlySet<string>>(
    () => new Set()
  );

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
  const companyColumns: Column<CompanyRow>[] = useMemo(
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
        renderEditCell: renderTextEditor,
      },
      {
        key: "type",
        name: "Type",
        width: 150,
        renderEditCell: renderTextEditor,
      },
      {
        key: "lp_stage",
        name: "LP Stage",
        width: 140,
        renderEditCell: renderTextEditor,
      },
      {
        key: "deal_status",
        name: "Deal Status",
        width: 130,
        renderEditCell: renderTextEditor,
      },
      {
        key: "stage",
        name: "Investment Round",
        width: 150,
        renderEditCell: renderTextEditor,
      },
      {
        key: "sectors",
        name: "Sectors",
        width: 180,
        renderCell: ({ row }: { row: CompanyRow }) =>
          Array.isArray(row.sectors) ? row.sectors.join(", ") : (row.sectors ?? ""),
        renderEditCell: renderTextEditor,
      },
      {
        key: "description",
        name: "Description",
        width: 300,
        renderEditCell: renderTextEditor,
      },
      {
        key: "website",
        name: "Website",
        width: 180,
        renderEditCell: renderTextEditor,
      },
      {
        key: "location_city",
        name: "City",
        width: 120,
        renderEditCell: renderTextEditor,
      },
      {
        key: "location_country",
        name: "Country",
        width: 120,
        renderEditCell: renderTextEditor,
      },
      {
        key: "founded_year",
        name: "Founded",
        width: 90,
        renderEditCell: renderTextEditor,
      },
      {
        key: "funding_raised",
        name: "Funding Raised",
        width: 140,
        renderEditCell: renderTextEditor,
      },
      {
        key: "aum",
        name: "AUM",
        width: 120,
        renderEditCell: renderTextEditor,
      },
      {
        key: "commitment_goal",
        name: "Commitment Goal",
        width: 150,
        renderEditCell: renderTextEditor,
      },
      {
        key: "notes",
        name: "Notes",
        width: 250,
        renderEditCell: renderTextEditor,
      },
      {
        key: "source",
        name: "Source",
        width: 120,
        renderEditCell: renderTextEditor,
      },
      {
        key: "created_at",
        name: "Created",
        width: 110,
        renderCell: ({ row }: { row: CompanyRow }) => fmtDate(row.created_at),
        editable: false,
      },
    ],
    []
  );

  // ─── Contact columns ───────────────────────────────────────────────────────
  const contactColumns: Column<ContactRow>[] = useMemo(
    () => [
      {
        ...SelectColumn,
        frozen: true,
      },
      {
        key: "first_name",
        name: "First Name",
        width: 130,
        frozen: true,
        renderEditCell: renderTextEditor,
      },
      {
        key: "last_name",
        name: "Last Name",
        width: 130,
        renderEditCell: renderTextEditor,
      },
      {
        key: "email",
        name: "Email",
        width: 200,
        renderEditCell: renderTextEditor,
      },
      {
        key: "title",
        name: "Title",
        width: 160,
        renderEditCell: renderTextEditor,
      },
      {
        key: "type",
        name: "Type",
        width: 130,
        renderEditCell: renderTextEditor,
      },
      {
        key: "company_name",
        name: "Company",
        width: 160,
        editable: false,
        renderCell: ({ row }: { row: ContactRow }) => row.company_name ?? "",
      },
      {
        key: "phone",
        name: "Phone",
        width: 130,
        renderEditCell: renderTextEditor,
      },
      {
        key: "linkedin_url",
        name: "LinkedIn",
        width: 180,
        renderEditCell: renderTextEditor,
      },
      {
        key: "location_city",
        name: "City",
        width: 120,
        renderEditCell: renderTextEditor,
      },
      {
        key: "location_country",
        name: "Country",
        width: 120,
        renderEditCell: renderTextEditor,
      },
      {
        key: "notes",
        name: "Notes",
        width: 250,
        renderEditCell: renderTextEditor,
      },
      {
        key: "created_at",
        name: "Created",
        width: 110,
        renderCell: ({ row }: { row: ContactRow }) => fmtDate(row.created_at),
        editable: false,
      },
    ],
    []
  );

  // ─── Filtered rows ─────────────────────────────────────────────────────────
  const filteredCompanies = useMemo(() => {
    if (!search.trim()) return companies;
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
  }, [companies, search]);

  const filteredContacts = useMemo(() => {
    if (!search.trim()) return contacts;
    const q = search.toLowerCase();
    return contacts.filter(
      (c) =>
        c.first_name?.toLowerCase().includes(q) ||
        c.last_name?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.title?.toLowerCase().includes(q) ||
        c.company_name?.toLowerCase().includes(q)
    );
  }, [contacts, search]);

  // ─── Row change handlers ──────────────────────────────────────────────────

  const handleCompanyRowsChange = useCallback(
    async (updatedRows: CompanyRow[], { indexes }: RowsChangeData<CompanyRow>) => {
      setCompanies((prev) => {
        const next = [...prev];
        for (const idx of indexes) {
          // find by id in the unfiltered list
          const changed = updatedRows[idx];
          const globalIdx = next.findIndex((r) => r.id === changed.id);
          if (globalIdx !== -1) next[globalIdx] = changed;
        }
        return next;
      });

      // Save each changed row
      for (const idx of indexes) {
        const row = updatedRows[idx];
        if (!row.id) continue;

        showToast("Saving…", "saving");

        // Build update payload — exclude read-only / join fields
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
        const { _dirty, company_name, company, ...fields } = row as ContactRow & { company?: unknown };

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
      .insert({ first_name: "New", last_name: "Contact", type: "other", status: "active" })
      .select()
      .single();

    if (error || !data) {
      showToast("Error: " + (error?.message ?? "unknown"), "error");
      return;
    }
    const row: ContactRow = { ...(data as Contact), company_name: null };
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
  const rowCount = isCompanies ? filteredCompanies.length : filteredContacts.length;
  const totalCount = isCompanies ? companies.length : contacts.length;
  const selectedCount = isCompanies
    ? selectedCompanyRows.size
    : selectedContactRows.size;

  return (
    <div className="flex flex-col h-full">
      {/* ── Header bar ── */}
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200 flex-shrink-0">
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
              !isCompanies
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Contacts
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
          {search ? `${rowCount} / ${totalCount}` : rowCount} row{rowCount !== 1 ? "s" : ""}
        </span>

        <div className="flex-1" />

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

      {/* ── Grid ── */}
      <div className="flex-1 overflow-hidden admin-grid">
        {isCompanies ? (
          <DataGrid<CompanyRow, unknown, string>
            columns={companyColumns}
            rows={filteredCompanies}
            onRowsChange={handleCompanyRowsChange}
            rowKeyGetter={(row: CompanyRow) => row.id}
            selectedRows={selectedCompanyRows}
            onSelectedRowsChange={setSelectedCompanyRows}
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
