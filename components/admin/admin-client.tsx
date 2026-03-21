"use client";
// ─── Admin Spreadsheet Client ─────────────────────────────────────────────────
// Embeds a react-data-grid for Companies and Contacts with inline cell editing
// that saves directly to Supabase on change.
// Enhanced with: column sorting, column resizing, per-column filter row,
// column picker, and clear-filters button.

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  DataGrid,
  type Column,
  type RenderHeaderCellProps,
  type RowsChangeData,
  type SortColumn,
  renderTextEditor,
  SelectColumn,
} from "react-data-grid";
import "react-data-grid/lib/styles.css";
import { createClient } from "@/lib/supabase/client";
import type { Company, Contact } from "@/lib/types";
import { Search, Plus, Trash2, Shield, SlidersHorizontal, X } from "lucide-react";

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

  // ── Sort state ───────────────────────────────────────────────────────────
  const [companySortColumns, setCompanySortColumns] = useState<readonly SortColumn[]>([]);
  const [contactSortColumns, setContactSortColumns] = useState<readonly SortColumn[]>([]);

  // ── Per-column filter state ───────────────────────────────────────────────
  const [companyFilters, setCompanyFilters] = useState<Record<string, string>>({});
  const [contactFilters, setContactFilters] = useState<Record<string, string>>({});

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
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<CompanyRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}
              {sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input
              style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }}
              placeholder="Filter…"
              value={companyFilters[column.key as string] ?? ""}
              onChange={(e) => setCompanyFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        ),
      },
      {
        key: "type",
        name: "Type",
        width: 150,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<CompanyRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}{sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }} placeholder="Filter…" value={companyFilters[column.key as string] ?? ""} onChange={(e) => setCompanyFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
          </div>
        ),
      },
      {
        key: "lp_stage",
        name: "LP Stage",
        width: 140,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<CompanyRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}{sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }} placeholder="Filter…" value={companyFilters[column.key as string] ?? ""} onChange={(e) => setCompanyFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
          </div>
        ),
      },
      {
        key: "deal_status",
        name: "Deal Status",
        width: 130,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<CompanyRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}{sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }} placeholder="Filter…" value={companyFilters[column.key as string] ?? ""} onChange={(e) => setCompanyFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
          </div>
        ),
      },
      {
        key: "stage",
        name: "Investment Round",
        width: 150,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<CompanyRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}{sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }} placeholder="Filter…" value={companyFilters[column.key as string] ?? ""} onChange={(e) => setCompanyFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
          </div>
        ),
      },
      {
        key: "sectors",
        name: "Sectors",
        width: 180,
        sortable: true,
        resizable: true,
        renderCell: ({ row }: { row: CompanyRow }) =>
          Array.isArray(row.sectors) ? row.sectors.join(", ") : (row.sectors ?? ""),
        renderEditCell: renderTextEditor,
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<CompanyRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}{sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }} placeholder="Filter…" value={companyFilters[column.key as string] ?? ""} onChange={(e) => setCompanyFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
          </div>
        ),
      },
      {
        key: "description",
        name: "Description",
        width: 300,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<CompanyRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}{sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }} placeholder="Filter…" value={companyFilters[column.key as string] ?? ""} onChange={(e) => setCompanyFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
          </div>
        ),
      },
      {
        key: "website",
        name: "Website",
        width: 180,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<CompanyRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}{sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }} placeholder="Filter…" value={companyFilters[column.key as string] ?? ""} onChange={(e) => setCompanyFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
          </div>
        ),
      },
      {
        key: "location_city",
        name: "City",
        width: 120,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<CompanyRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}{sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }} placeholder="Filter…" value={companyFilters[column.key as string] ?? ""} onChange={(e) => setCompanyFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
          </div>
        ),
      },
      {
        key: "location_country",
        name: "Country",
        width: 120,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<CompanyRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}{sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }} placeholder="Filter…" value={companyFilters[column.key as string] ?? ""} onChange={(e) => setCompanyFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
          </div>
        ),
      },
      {
        key: "founded_year",
        name: "Founded",
        width: 90,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<CompanyRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}{sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }} placeholder="Filter…" value={companyFilters[column.key as string] ?? ""} onChange={(e) => setCompanyFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
          </div>
        ),
      },
      {
        key: "funding_raised",
        name: "Funding Raised",
        width: 140,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<CompanyRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}{sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }} placeholder="Filter…" value={companyFilters[column.key as string] ?? ""} onChange={(e) => setCompanyFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
          </div>
        ),
      },
      {
        key: "aum",
        name: "AUM",
        width: 120,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<CompanyRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}{sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }} placeholder="Filter…" value={companyFilters[column.key as string] ?? ""} onChange={(e) => setCompanyFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
          </div>
        ),
      },
      {
        key: "commitment_goal",
        name: "Commitment Goal",
        width: 150,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<CompanyRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}{sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }} placeholder="Filter…" value={companyFilters[column.key as string] ?? ""} onChange={(e) => setCompanyFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
          </div>
        ),
      },
      {
        key: "notes",
        name: "Notes",
        width: 250,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<CompanyRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}{sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }} placeholder="Filter…" value={companyFilters[column.key as string] ?? ""} onChange={(e) => setCompanyFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
          </div>
        ),
      },
      {
        key: "source",
        name: "Source",
        width: 120,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<CompanyRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}{sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }} placeholder="Filter…" value={companyFilters[column.key as string] ?? ""} onChange={(e) => setCompanyFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
          </div>
        ),
      },
      {
        key: "created_at",
        name: "Created",
        width: 110,
        sortable: true,
        resizable: true,
        renderCell: ({ row }: { row: CompanyRow }) => fmtDate(row.created_at),
        editable: false,
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<CompanyRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}{sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }} placeholder="Filter…" value={companyFilters[column.key as string] ?? ""} onChange={(e) => setCompanyFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [companyFilters]
  );

  // ─── Contact columns ───────────────────────────────────────────────────────
  const allContactColumns: Column<ContactRow>[] = useMemo(
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
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<ContactRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}{sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }} placeholder="Filter…" value={contactFilters[column.key as string] ?? ""} onChange={(e) => setContactFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
          </div>
        ),
      },
      {
        key: "last_name",
        name: "Last Name",
        width: 130,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<ContactRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}{sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }} placeholder="Filter…" value={contactFilters[column.key as string] ?? ""} onChange={(e) => setContactFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
          </div>
        ),
      },
      {
        key: "email",
        name: "Email",
        width: 200,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<ContactRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}{sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }} placeholder="Filter…" value={contactFilters[column.key as string] ?? ""} onChange={(e) => setContactFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
          </div>
        ),
      },
      {
        key: "title",
        name: "Title",
        width: 160,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<ContactRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}{sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }} placeholder="Filter…" value={contactFilters[column.key as string] ?? ""} onChange={(e) => setContactFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
          </div>
        ),
      },
      {
        key: "type",
        name: "Type",
        width: 130,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<ContactRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}{sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }} placeholder="Filter…" value={contactFilters[column.key as string] ?? ""} onChange={(e) => setContactFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
          </div>
        ),
      },
      {
        key: "company_name",
        name: "Company",
        width: 160,
        editable: false,
        sortable: true,
        resizable: true,
        renderCell: ({ row }: { row: ContactRow }) => row.company_name ?? "",
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<ContactRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}{sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }} placeholder="Filter…" value={contactFilters[column.key as string] ?? ""} onChange={(e) => setContactFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
          </div>
        ),
      },
      {
        key: "phone",
        name: "Phone",
        width: 130,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<ContactRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}{sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }} placeholder="Filter…" value={contactFilters[column.key as string] ?? ""} onChange={(e) => setContactFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
          </div>
        ),
      },
      {
        key: "linkedin_url",
        name: "LinkedIn",
        width: 180,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<ContactRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}{sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }} placeholder="Filter…" value={contactFilters[column.key as string] ?? ""} onChange={(e) => setContactFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
          </div>
        ),
      },
      {
        key: "location_city",
        name: "City",
        width: 120,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<ContactRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}{sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }} placeholder="Filter…" value={contactFilters[column.key as string] ?? ""} onChange={(e) => setContactFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
          </div>
        ),
      },
      {
        key: "location_country",
        name: "Country",
        width: 120,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<ContactRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}{sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }} placeholder="Filter…" value={contactFilters[column.key as string] ?? ""} onChange={(e) => setContactFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
          </div>
        ),
      },
      {
        key: "notes",
        name: "Notes",
        width: 250,
        sortable: true,
        resizable: true,
        renderEditCell: renderTextEditor,
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<ContactRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}{sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }} placeholder="Filter…" value={contactFilters[column.key as string] ?? ""} onChange={(e) => setContactFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
          </div>
        ),
      },
      {
        key: "created_at",
        name: "Created",
        width: 110,
        sortable: true,
        resizable: true,
        renderCell: ({ row }: { row: ContactRow }) => fmtDate(row.created_at),
        editable: false,
        renderHeaderCell: ({ column, sortDirection }: RenderHeaderCellProps<ContactRow>) => (
          <div className="rdg-header-cell-content" style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between", padding: "4px 8px", gap: "2px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: 600, color: "#fff", textTransform: "uppercase", letterSpacing: "0.04em", userSelect: "none" }}>
              {column.name}{sortDirection === "ASC" ? " ↑" : sortDirection === "DESC" ? " ↓" : ""}
            </span>
            <input style={{ fontSize: "11px", padding: "1px 4px", border: "1px solid #475569", borderRadius: "3px", background: "#0f172a", color: "#e2e8f0", width: "100%", outline: "none" }} placeholder="Filter…" value={contactFilters[column.key as string] ?? ""} onChange={(e) => setContactFilters((prev) => ({ ...prev, [column.key as string]: e.target.value }))} onClick={(e) => e.stopPropagation()} />
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contactFilters]
  );

  // ─── Visible columns (apply column picker) ────────────────────────────────
  // Keys that can never be hidden: SelectColumn key and frozen name/first_name
  const FROZEN_COMPANY_KEYS = new Set(["name"]);
  const FROZEN_CONTACT_KEYS = new Set(["first_name"]);

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

    // 2. Per-column filter
    const colFiltered = filtered.filter((row) =>
      Object.entries(companyFilters).every(([key, val]) => {
        if (!val) return true;
        const cellVal = String((row as unknown as Record<string, unknown>)[key] ?? "").toLowerCase();
        return cellVal.includes(val.toLowerCase());
      })
    );

    // 3. Sort
    if (companySortColumns.length === 0) return colFiltered;
    return [...colFiltered].sort((a, b) => {
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
              c.first_name?.toLowerCase().includes(q) ||
              c.last_name?.toLowerCase().includes(q) ||
              c.email?.toLowerCase().includes(q) ||
              c.title?.toLowerCase().includes(q) ||
              c.company_name?.toLowerCase().includes(q)
          );
        })();

    // 2. Per-column filter
    const colFiltered = filtered.filter((row) =>
      Object.entries(contactFilters).every(([key, val]) => {
        if (!val) return true;
        const cellVal = String((row as unknown as Record<string, unknown>)[key] ?? "").toLowerCase();
        return cellVal.includes(val.toLowerCase());
      })
    );

    // 3. Sort
    if (contactSortColumns.length === 0) return colFiltered;
    return [...colFiltered].sort((a, b) => {
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

  // ─── Clear filters helper ────────────────────────────────────────────────

  const hasActiveFilters = isCompanies
    ? Object.values(companyFilters).some(Boolean)
    : Object.values(contactFilters).some(Boolean);

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
          {search || hasActiveFilters ? `${rowCount} / ${totalCount}` : rowCount} row{rowCount !== 1 ? "s" : ""}
        </span>

        <div className="flex-1" />

        {/* Clear Filters button — only when column filters are active */}
        {hasActiveFilters && (
          <button
            onClick={handleClearFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-md hover:bg-amber-100 transition-colors"
          >
            <X size={13} />
            Clear Filters
          </button>
        )}

        {/* Columns picker button */}
        <div className="relative" ref={columnPickerRef}>
          <button
            onClick={() => setShowColumnPicker((v) => !v)}
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
          --rdg-header-row-height: 60px;
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
