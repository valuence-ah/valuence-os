"use client";
// ─── Admin Spreadsheet Client ─────────────────────────────────────────────────
// Embeds a react-data-grid for Companies and Contacts with inline cell editing
// that saves directly to Supabase on change.
// Enhanced with: column sorting, column resizing, filter panel,
// column picker, and clear-filters button.

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
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
import { Search, Plus, Trash2, Shield, SlidersHorizontal, X, Filter, Sparkles, Rss, FolderOpen, Download, Bell, ExternalLink, MapPin, Globe, Users, Building2, Calendar } from "lucide-react";
import { formatDealStatus, normalizeSector } from "@/lib/constants";
import { AiConfigPanel } from "@/components/admin/ai-config-panel";
import { ApiConfigPanel } from "@/components/admin/api-config-panel";
import { DrivePanel } from "@/components/admin/drive-panel";
import { SourcingConfigPanel } from "@/components/admin/sourcing-config-panel";
import { WatchlistPanel } from "@/components/admin/watchlist-panel";
import { ThesisKeywordsPanel } from "@/components/admin/thesis-keywords-panel";

// ─── Row types ────────────────────────────────────────────────────────────────

type CompanyRow = Company & { _dirty?: boolean };
type ContactRow = Contact & { company_name?: string | null; _dirty?: boolean; name?: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    // Use ISO slice + UTC to avoid server/client timezone mismatch (hydration error #418)
    const [y, m, d] = iso.slice(0, 10).split("-");
    const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${d} ${MONTHS[parseInt(m) - 1]} ${y}`;
  } catch {
    return iso;
  }
}

// ─── Portal position helper — flips dropdown upward if near viewport bottom ───

function getPortalPos(
  rect: DOMRect,
  estimatedHeight = 320,
  minWidth = 200
): { top: number; left: number; width: number } {
  const spaceBelow = window.innerHeight - rect.bottom - 8;
  const useAbove = spaceBelow < estimatedHeight && rect.top > spaceBelow;
  return {
    top: useAbove ? Math.max(8, rect.top - estimatedHeight - 4) : rect.bottom + 4,
    left: Math.max(4, Math.min(rect.left, window.innerWidth - minWidth - 4)),
    width: Math.max(rect.width, minWidth),
  };
}

// ─── Toast state ─────────────────────────────────────────────────────────────

type ToastKind = "saving" | "saved" | "error";
type ToastState = { message: string; type: ToastKind } | null;

// ─── Combo editor factory (single-value) ─────────────────────────────────────

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

// ─── TypeCell: self-contained multi-select that saves directly to Supabase ────
// Completely bypasses react-data-grid's editor/save mechanism to avoid bugs
// with onClose(true) + stale closures. Uses a portal dropdown + direct DB save.

const TYPE_OPTIONS = ["startup","fund","lp","corporate","ecosystem_partner","government","other"];
const TYPE_LABELS: Record<string, string> = {
  startup:           "Startup",
  fund:              "Fund / VC",
  lp:                "LP",
  corporate:         "Corporate",
  ecosystem_partner: "Ecosystem",
  government:        "Gov / Academic",
  other:             "Other",
  // Legacy DB values → display as their modern label
  investor:          "Fund / VC",
  "strategic partner": "Corporate",
  "limited partner": "LP",
};
const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  "startup":           { bg: "#eff6ff", color: "#1d4ed8" },
  "fund":              { bg: "#f5f3ff", color: "#7c3aed" },
  "lp":                { bg: "#f0fdf4", color: "#15803d" },
  "corporate":         { bg: "#fff7ed", color: "#c2410c" },
  "ecosystem_partner": { bg: "#ecfdf5", color: "#065f46" },
  "government":        { bg: "#f0f9ff", color: "#0369a1" },
  "other":             { bg: "#f8fafc", color: "#64748b" },
  // Legacy DB values
  "investor":          { bg: "#f5f3ff", color: "#7c3aed" },
  "strategic partner": { bg: "#fff7ed", color: "#c2410c" },
  "limited partner":   { bg: "#f0fdf4", color: "#15803d" },
};

function TypeCell({
  row,
  onSaved,
}: {
  row: CompanyRow;
  onSaved: (id: string, types: string[]) => void;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const current: string[] = Array.isArray(row.types) ? row.types : [];

  function openDropdown(e: React.MouseEvent) {
    e.stopPropagation();
    setSelected([...current]);
    if (cellRef.current) {
      setPos(getPortalPos(cellRef.current.getBoundingClientRect(), 300, 220));
    }
    setOpen(true);
  }

  async function toggle(opt: string, e: React.MouseEvent) {
    e.stopPropagation();
    const next = selected.includes(opt) ? selected.filter(x => x !== opt) : [...selected, opt];
    setSelected(next);
    if (!row.id) return;
    setSaving(true);
    await supabase.from("companies").update({ types: next }).eq("id", row.id);
    setSaving(false);
    onSaved(row.id, next);
  }

  // Close when clicking outside
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (cellRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div
      ref={cellRef}
      onClick={openDropdown}
      style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", padding: "0 6px", cursor: "pointer", gap: 3, flexWrap: "wrap" }}
      title="Click to edit"
    >
      {current.length === 0 ? (
        <span style={{ fontSize: 11, color: saving ? "#3b82f6" : "#cbd5e1" }}>
          {saving ? "Saving…" : "Click to set"}
        </span>
      ) : (
        current.map(v => {
          const c = TYPE_COLORS[v.toLowerCase()] ?? { bg: "#f1f5f9", color: "#475569" };
          return (
            <span key={v} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 9999, background: c.bg, color: c.color, fontWeight: 500, whiteSpace: "nowrap" }}>
              {TYPE_LABELS[v.toLowerCase()] ?? v}
            </span>
          );
        })
      )}

      {open && pos && createPortal(
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: pos.width, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", zIndex: 99999, overflow: "hidden", fontFamily: "inherit" }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div style={{ padding: "6px 0" }}>
            {TYPE_OPTIONS.map(opt => {
              const checked = selected.includes(opt);
              const c = TYPE_COLORS[opt] ?? { bg: "#f1f5f9", color: "#475569" };
              return (
                <div
                  key={opt}
                  onClick={(e) => toggle(opt, e)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", cursor: "pointer", userSelect: "none", background: checked ? "#f0f9ff" : "transparent" }}
                >
                  <div style={{ width: 16, height: 16, flexShrink: 0, borderRadius: 4, border: `2px solid ${checked ? "#3b82f6" : "#d1d5db"}`, background: checked ? "#3b82f6" : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {checked && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                  <span style={{ fontSize: 12, padding: "1px 8px", borderRadius: 9999, background: c.bg, color: c.color, fontWeight: 500 }}>{TYPE_LABELS[opt] ?? opt}</span>
                </div>
              );
            })}
          </div>
          <div style={{ borderTop: "1px solid #f1f5f9", padding: "6px 14px", display: "flex", justifyContent: "flex-end" }}>
            <div onClick={e => { e.stopPropagation(); setOpen(false); }} style={{ padding: "4px 12px", fontSize: 11, color: "#64748b", background: "#f1f5f9", borderRadius: 6, cursor: "pointer" }}>
              Done
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── ContactTypeCell: portal single-select for contact type ───────────────────

const CONTACT_TYPE_OPTIONS = ["Advisor / KOL","Ecosystem","Employee","Founder / Mgmt","Government/Academic","Investor","Limited Partner","Other","Strategic"];
const CONTACT_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  "Advisor / KOL":       { bg: "#fef3c7", color: "#92400e" },
  "Ecosystem":           { bg: "#ecfdf5", color: "#065f46" },
  "Employee":            { bg: "#eff6ff", color: "#1d4ed8" },
  "Founder / Mgmt":      { bg: "#faf5ff", color: "#7e22ce" },
  "Government/Academic": { bg: "#f0f9ff", color: "#0369a1" },
  "Investor":            { bg: "#fff7ed", color: "#c2410c" },
  "Limited Partner":     { bg: "#f0fdf4", color: "#15803d" },
  "Other":               { bg: "#f8fafc", color: "#64748b" },
  "Strategic":           { bg: "#fff1f2", color: "#be123c" },
};

function ContactTypeCell({ row, onSaved }: { row: ContactRow; onSaved: (id: string, type: string) => void }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const current = (row.type as string) ?? "";

  function openDropdown(e: React.MouseEvent) {
    e.stopPropagation();
    if (cellRef.current) {
      setPos(getPortalPos(cellRef.current.getBoundingClientRect(), 340, 220));
    }
    setOpen(true);
  }

  async function pick(opt: string, e: React.MouseEvent) {
    e.stopPropagation();
    setOpen(false);
    if (!row.id) return;
    setSaving(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("contacts") as any).update({ type: opt }).eq("id", row.id);
    setSaving(false);
    onSaved(row.id, opt);
  }

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) { if (!cellRef.current?.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const c = CONTACT_TYPE_COLORS[current] ?? { bg: "#f8fafc", color: "#64748b" };
  return (
    <div ref={cellRef} onClick={openDropdown}
      style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", padding: "0 6px", cursor: "pointer" }}
      title="Click to edit">
      {current ? (
        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 9999, background: c.bg, color: c.color, fontWeight: 500 }}>
          {saving ? "Saving…" : current}
        </span>
      ) : (
        <span style={{ fontSize: 11, color: saving ? "#3b82f6" : "#cbd5e1" }}>{saving ? "Saving…" : "Click to set"}</span>
      )}
      {open && pos && createPortal(
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: pos.width, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", zIndex: 99999, overflow: "hidden", fontFamily: "inherit" }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div style={{ padding: "6px 0", maxHeight: 300, overflowY: "auto" }}>
            {CONTACT_TYPE_OPTIONS.map(opt => {
              const tc = CONTACT_TYPE_COLORS[opt] ?? { bg: "#f8fafc", color: "#64748b" };
              return (
                <div key={opt} onClick={e => pick(opt, e)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 14px", cursor: "pointer", userSelect: "none", background: opt === current ? "#f0f9ff" : "transparent" }}>
                  <div style={{ width: 14, height: 14, flexShrink: 0, borderRadius: "50%", border: `2px solid ${opt === current ? "#3b82f6" : "#d1d5db"}`, background: opt === current ? "#3b82f6" : "#fff" }} />
                  <span style={{ fontSize: 12, padding: "1px 8px", borderRadius: 9999, background: tc.bg, color: tc.color, fontWeight: 500 }}>{opt}</span>
                </div>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── TitleCell: portal single-select for contact title ───────────────────────

const TITLE_OPTIONS_LIST = [
  "Admin", "Advisor", "Analyst", "Associate", "Board Member",
  "CEO", "CEO / Co-founder", "CFO", "Chief of Staff", "Co-Founder",
  "COO", "CTO", "CTO / Co-founder", "Director", "Founder",
  "General Counsel", "General Partner", "Head of Investments",
  "Head of Portfolio", "Investment Manager", "Managing Director",
  "Managing Partner", "Operating Partner", "Partner", "Portfolio Manager",
  "President", "Principal", "Senior Associate", "Senior Vice President",
  "Venture Partner", "Vice President", "Other",
];

function TitleCell({ row, onSaved }: { row: ContactRow; onSaved: (id: string, title: string) => void }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const current = row.title ?? "";

  function openDropdown(e: React.MouseEvent) {
    e.stopPropagation();
    if (cellRef.current) {
      setPos(getPortalPos(cellRef.current.getBoundingClientRect(), 320, 200));
    }
    setOpen(true);
  }

  async function pick(opt: string, e: React.MouseEvent) {
    e.stopPropagation();
    setOpen(false);
    if (!row.id) return;
    setSaving(true);
    await supabase.from("contacts").update({ title: opt || null }).eq("id", row.id);
    setSaving(false);
    onSaved(row.id, opt);
  }

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) { if (!cellRef.current?.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={cellRef} onClick={openDropdown}
      style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", padding: "0 6px", cursor: "pointer" }}
      title="Click to edit">
      {current ? (
        <span style={{ fontSize: 11, color: saving ? "#3b82f6" : "#1e293b", fontWeight: 500 }}>
          {saving ? "Saving…" : current}
        </span>
      ) : (
        <span style={{ fontSize: 11, color: saving ? "#3b82f6" : "#cbd5e1" }}>{saving ? "Saving…" : "—"}</span>
      )}
      {open && pos && createPortal(
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: pos.width, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", zIndex: 99999, overflow: "hidden", fontFamily: "inherit" }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div style={{ padding: "6px 0", maxHeight: 280, overflowY: "auto" }}>
            <div onClick={e => pick("", e)}
              style={{ padding: "7px 14px", cursor: "pointer", fontSize: 12, color: "#94a3b8", borderBottom: "1px solid #f1f5f9" }}>
              — No title
            </div>
            {TITLE_OPTIONS_LIST.map(opt => (
              <div key={opt} onClick={e => pick(opt, e)}
                style={{ padding: "7px 14px", cursor: "pointer", fontSize: 12, color: "#1e293b", background: opt === current ? "#f0f9ff" : "transparent" }}>
                {opt}
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Portal single-select factory (LP Stage, Deal Status, Investment Round) ────

function makePortalSingleSelectCell<TRow extends { id: string }>(
  tableName: string,
  fieldName: string,
  options: string[],
  colors: Record<string, { bg: string; color: string }>,
  formatDisplay?: (val: string) => string
) {
  return function PortalSelectCell({
    row, onSaved,
  }: { row: TRow; onSaved: (id: string, val: string) => void }) {
    const supabase = createClient();
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const cellRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
    const current = String((row as unknown as Record<string, unknown>)[fieldName] ?? "");
    const displayLabel = formatDisplay ? formatDisplay(current) : current;

    function openDropdown(e: React.MouseEvent) {
      e.stopPropagation();
      if (cellRef.current) {
        setPos(getPortalPos(cellRef.current.getBoundingClientRect(), 320, 220));
      }
      setOpen(true);
    }

    async function pick(opt: string, e: React.MouseEvent) {
      e.stopPropagation();
      setOpen(false);
      if (!row.id) return;
      setSaving(true);
      await supabase.from(tableName).update({ [fieldName]: opt || null }).eq("id", row.id);
      setSaving(false);
      onSaved(row.id, opt);
    }

    useEffect(() => {
      if (!open) return;
      function handler(e: MouseEvent) { if (!cellRef.current?.contains(e.target as Node)) setOpen(false); }
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    const c = colors[current] ?? { bg: "#f8fafc", color: "#64748b" };
    return (
      <div ref={cellRef} onClick={openDropdown}
        style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", padding: "0 6px", cursor: "pointer" }}
        title="Click to edit">
        {current ? (
          <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 9999, background: c.bg, color: c.color, fontWeight: 500 }}>
            {saving ? "Saving…" : displayLabel}
          </span>
        ) : (
          <span style={{ fontSize: 11, color: saving ? "#3b82f6" : "#cbd5e1" }}>{saving ? "Saving…" : "Click to set"}</span>
        )}
        {open && pos && createPortal(
          <div
            style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: pos.width, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", zIndex: 99999, overflow: "hidden", fontFamily: "inherit" }}
            onMouseDown={e => e.stopPropagation()}
          >
            <div style={{ padding: "6px 0", maxHeight: 280, overflowY: "auto" }}>
              <div onClick={e => pick("", e)}
                style={{ padding: "7px 14px", cursor: "pointer", fontSize: 12, color: "#94a3b8", borderBottom: "1px solid #f1f5f9" }}>
                — Clear
              </div>
              {options.map(opt => {
                const oc = colors[opt] ?? { bg: "#f8fafc", color: "#64748b" };
                return (
                  <div key={opt} onClick={e => pick(opt, e)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", cursor: "pointer", userSelect: "none", background: opt === current ? "#f0f9ff" : "transparent" }}>
                    <div style={{ width: 14, height: 14, flexShrink: 0, borderRadius: "50%", border: `2px solid ${opt === current ? "#3b82f6" : "#d1d5db"}`, background: opt === current ? "#3b82f6" : "#fff" }} />
                    <span style={{ fontSize: 12, padding: "1px 8px", borderRadius: 9999, background: oc.bg, color: oc.color, fontWeight: 500 }}>{formatDisplay ? formatDisplay(opt) : opt}</span>
                  </div>
                );
              })}
            </div>
          </div>,
          document.body
        )}
      </div>
    );
  };
}

// ─── Portal multi-select factory (Sectors) ────────────────────────────────────

function makePortalMultiSelectCell<TRow extends { id: string }>(
  tableName: string,
  fieldName: string,
  options: string[],
  colors: Record<string, { bg: string; color: string }>
) {
  return function PortalMultiSelectCell({
    row, onSaved,
  }: { row: TRow; onSaved: (id: string, vals: string[]) => void }) {
    const supabase = createClient();
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const cellRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
    const current: string[] = Array.isArray((row as unknown as Record<string, unknown>)[fieldName])
      ? (row as unknown as Record<string, unknown>)[fieldName] as string[]
      : [];

    function openDropdown(e: React.MouseEvent) {
      e.stopPropagation();
      setSelected([...current]);
      if (cellRef.current) {
        setPos(getPortalPos(cellRef.current.getBoundingClientRect(), 220, 220));
      }
      setOpen(true);
    }

    async function toggle(opt: string, e: React.MouseEvent) {
      e.stopPropagation();
      const next = selected.includes(opt) ? selected.filter(x => x !== opt) : [...selected, opt];
      setSelected(next);
      if (!row.id) return;
      setSaving(true);
      await supabase.from(tableName).update({ [fieldName]: next }).eq("id", row.id);
      setSaving(false);
      onSaved(row.id, next);
    }

    useEffect(() => {
      if (!open) return;
      function handler(e: MouseEvent) { if (cellRef.current?.contains(e.target as Node)) return; setOpen(false); }
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    return (
      <div ref={cellRef} onClick={openDropdown}
        style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", padding: "0 6px", cursor: "pointer", gap: 3, flexWrap: "wrap" }}
        title="Click to edit">
        {current.length === 0 ? (
          <span style={{ fontSize: 11, color: saving ? "#3b82f6" : "#cbd5e1" }}>{saving ? "Saving…" : "Click to set"}</span>
        ) : (
          current.map(v => {
            const c = colors[v] ?? { bg: "#f1f5f9", color: "#475569" };
            return (
              <span key={v} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 9999, background: c.bg, color: c.color, fontWeight: 500, whiteSpace: "nowrap" }}>{v}</span>
            );
          })
        )}
        {open && pos && createPortal(
          <div
            style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: pos.width, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", zIndex: 99999, overflow: "hidden", fontFamily: "inherit" }}
            onMouseDown={e => e.stopPropagation()}
          >
            <div style={{ padding: "6px 0" }}>
              {options.map(opt => {
                const checked = selected.includes(opt);
                const c = colors[opt] ?? { bg: "#f1f5f9", color: "#475569" };
                return (
                  <div key={opt} onClick={e => toggle(opt, e)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", cursor: "pointer", userSelect: "none", background: checked ? "#f0f9ff" : "transparent" }}>
                    <div style={{ width: 16, height: 16, flexShrink: 0, borderRadius: 4, border: `2px solid ${checked ? "#3b82f6" : "#d1d5db"}`, background: checked ? "#3b82f6" : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {checked && <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    <span style={{ fontSize: 12, padding: "1px 8px", borderRadius: 9999, background: c.bg, color: c.color, fontWeight: 500 }}>{opt}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ borderTop: "1px solid #f1f5f9", padding: "6px 14px", display: "flex", justifyContent: "flex-end" }}>
              <div onClick={e => { e.stopPropagation(); setOpen(false); }} style={{ padding: "4px 12px", fontSize: 11, color: "#64748b", background: "#f1f5f9", borderRadius: 6, cursor: "pointer" }}>Done</div>
            </div>
          </div>,
          document.body
        )}
      </div>
    );
  };
}

// ─── Cell instances ───────────────────────────────────────────────────────────

const LP_STAGE_COLORS: Record<string, { bg: string; color: string }> = {
  "Lead":                   { bg: "#eff6ff", color: "#1d4ed8" },
  "Initial Meeting":        { bg: "#f5f3ff", color: "#7c3aed" },
  "Discussion in Process":  { bg: "#fef3c7", color: "#92400e" },
  "Due Diligence":          { bg: "#fff7ed", color: "#c2410c" },
  "Committed":              { bg: "#f0fdf4", color: "#15803d" },
  "Passed":                 { bg: "#f1f5f9", color: "#475569" },
};
const LpStageCell = makePortalSingleSelectCell<CompanyRow>(
  "companies", "lp_stage",
  ["Lead","Initial Meeting","Discussion in Process","Due Diligence","Committed","Passed"],
  LP_STAGE_COLORS
);

const DEAL_STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  "identified_introduced":   { bg: "#eff6ff", color: "#1d4ed8" },
  "first_meeting":           { bg: "#f5f3ff", color: "#7c3aed" },
  "discussion_in_process":   { bg: "#fef3c7", color: "#92400e" },
  "due_diligence":           { bg: "#fff7ed", color: "#c2410c" },
  "passed":                  { bg: "#f1f5f9", color: "#475569" },
  "portfolio":               { bg: "#f0fdf4", color: "#15803d" },
  "tracking_hold":           { bg: "#fdf4ff", color: "#86198f" },
  "exited":                  { bg: "#f8fafc", color: "#94a3b8" },
};
const DealStatusCell = makePortalSingleSelectCell<CompanyRow>(
  "companies", "deal_status",
  ["identified_introduced","first_meeting","discussion_in_process","due_diligence","passed","portfolio","tracking_hold","exited"],
  DEAL_STATUS_COLORS,
  formatDealStatus
);

const INVESTMENT_ROUND_COLORS: Record<string, { bg: string; color: string }> = {
  "Pre-Seed":        { bg: "#eff6ff", color: "#1d4ed8" },
  "Pre-A":           { bg: "#f0f9ff", color: "#0369a1" },
  "Seed":            { bg: "#f5f3ff", color: "#7c3aed" },
  "Seed Extension":  { bg: "#faf5ff", color: "#6d28d9" },
  "Series A":        { bg: "#ecfdf5", color: "#065f46" },
  "Series B":        { bg: "#f0fdf4", color: "#15803d" },
  "Series C":        { bg: "#f7fee7", color: "#3f6212" },
  "Growth":          { bg: "#fefce8", color: "#854d0e" },
};
const InvestmentRoundCell = makePortalSingleSelectCell<CompanyRow>(
  "companies", "stage",
  ["Pre-Seed","Pre-A","Seed","Seed Extension","Series A","Series B","Series C","Growth"],
  INVESTMENT_ROUND_COLORS
);

const SECTORS_COLORS: Record<string, { bg: string; color: string }> = {
  "Cleantech": { bg: "#f0fdf4", color: "#15803d" },
  "Techbio":   { bg: "#faf5ff", color: "#7e22ce" },
  "Other":     { bg: "#f8fafc", color: "#64748b" },
};

// ─── SectorsCell: single-select (saves as single-element array) ───────────────
function SectorsCell({ row, onSaved }: { row: CompanyRow; onSaved: (id: string, vals: string[]) => void }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const sectors = Array.isArray(row.sectors) ? (row.sectors as string[]) : [];
  const current = sectors[0] ?? "";

  function openDropdown(e: React.MouseEvent) {
    e.stopPropagation();
    if (cellRef.current) {
      setPos(getPortalPos(cellRef.current.getBoundingClientRect(), 180, 220));
    }
    setOpen(true);
  }

  async function pick(opt: string, e: React.MouseEvent) {
    e.stopPropagation();
    setOpen(false);
    if (!row.id) return;
    setSaving(true);
    const newVal = opt ? [opt] : [];
    await supabase.from("companies").update({ sectors: newVal }).eq("id", row.id);
    setSaving(false);
    onSaved(row.id, newVal);
  }

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) { if (!cellRef.current?.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const c = SECTORS_COLORS[current] ?? { bg: "#f1f5f9", color: "#475569" };
  return (
    <div ref={cellRef} onClick={openDropdown}
      style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", padding: "0 6px", cursor: "pointer" }}
      title="Click to edit">
      {current ? (
        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 9999, background: c.bg, color: c.color, fontWeight: 500, whiteSpace: "nowrap" }}>
          {saving ? "Saving…" : current}
        </span>
      ) : (
        <span style={{ fontSize: 11, color: saving ? "#3b82f6" : "#cbd5e1" }}>{saving ? "Saving…" : "Click to set"}</span>
      )}
      {open && pos && createPortal(
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: pos.width, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", zIndex: 99999, overflow: "hidden", fontFamily: "inherit" }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div style={{ padding: "6px 0" }}>
            <div onClick={e => pick("", e)}
              style={{ padding: "7px 14px", cursor: "pointer", fontSize: 12, color: "#94a3b8", borderBottom: "1px solid #f1f5f9" }}>
              — Clear
            </div>
            {(["Cleantech","Techbio","Other"] as const).map(opt => {
              const oc = SECTORS_COLORS[opt] ?? { bg: "#f8fafc", color: "#64748b" };
              return (
                <div key={opt} onClick={e => pick(opt, e)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", cursor: "pointer", userSelect: "none", background: opt === current ? "#f0f9ff" : "transparent" }}>
                  <div style={{ width: 14, height: 14, flexShrink: 0, borderRadius: "50%", border: `2px solid ${opt === current ? "#3b82f6" : "#d1d5db"}`, background: opt === current ? "#3b82f6" : "#fff" }} />
                  <span style={{ fontSize: 12, padding: "1px 8px", borderRadius: 9999, background: oc.bg, color: oc.color, fontWeight: 500 }}>{opt}</span>
                </div>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

const INVESTOR_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  "Accelerator":    { bg: "#fef3c7", color: "#92400e" },
  "Corporate":      { bg: "#fff7ed", color: "#c2410c" },
  "Family Office":  { bg: "#f5f3ff", color: "#7c3aed" },
  "HNW":            { bg: "#fdf4ff", color: "#86198f" },
  "Venture Capital":{ bg: "#eff6ff", color: "#1d4ed8" },
};
const InvestorTypeCell = makePortalSingleSelectCell<CompanyRow>(
  "companies", "investor_type",
  ["Accelerator","Corporate","Family Office","HNW","Venture Capital"],
  INVESTOR_TYPE_COLORS
);

const LP_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  "Corporate":          { bg: "#fff7ed", color: "#c2410c" },
  "Endowment":          { bg: "#f0fdf4", color: "#15803d" },
  "Family Office":      { bg: "#f5f3ff", color: "#7c3aed" },
  "Financial Institution": { bg: "#eff6ff", color: "#1d4ed8" },
  "Fund of Fund":       { bg: "#fdf4ff", color: "#86198f" },
  "Other":              { bg: "#f8fafc", color: "#64748b" },
  "Pension Fund":       { bg: "#fff1f2", color: "#be123c" },
  "Sovereign Wealth":   { bg: "#f0f9ff", color: "#0369a1" },
};
const LpTypeCell = makePortalSingleSelectCell<CompanyRow>(
  "companies", "lp_type",
  ["Corporate","Endowment","Family Office","Financial Institution","Fund of Fund","Other","Pension Fund","Sovereign Wealth"],
  LP_TYPE_COLORS
);

const STRATEGIC_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  "Corporate":   { bg: "#fff7ed", color: "#c2410c" },
  "Foundation":  { bg: "#f0fdf4", color: "#15803d" },
  "Government":  { bg: "#f0f9ff", color: "#0369a1" },
  "Other":       { bg: "#f8fafc", color: "#64748b" },
};
const StrategicTypeCell = makePortalSingleSelectCell<CompanyRow>(
  "companies", "strategic_type",
  ["Corporate","Foundation","Government","Other"],
  STRATEGIC_TYPE_COLORS
);

// ─── CompanyPickerCell: searchable company FK picker for contacts ──────────────

function CompanyPickerCell({ row, companiesRef, setCompanies, onSaved, onRequestCreate }: {
  row: ContactRow;
  companiesRef: React.RefObject<CompanyRow[]>;
  setCompanies: React.Dispatch<React.SetStateAction<CompanyRow[]>>;
  onSaved: (id: string, companyId: string | null, companyName: string | null) => void;
  onRequestCreate: (name: string, onCreated: (co: CompanyRow) => void) => void;
}) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [matching, setMatching] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const cellRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const displayName = row.company_name ?? "";

  const filtered = useMemo(() => {
    const all = companiesRef.current ?? [];
    if (!search.trim()) return all.slice(0, 50);
    const q = search.toLowerCase();
    return all.filter(c => c.name?.toLowerCase().includes(q)).slice(0, 40);
  // companiesRef is a stable ref object; search changes trigger recompute
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function openDropdown(e: React.MouseEvent) {
    e.stopPropagation();
    setSearch("");
    setAiSuggestion(null);
    if (cellRef.current) {
      setPos(getPortalPos(cellRef.current.getBoundingClientRect(), 360, 260));
    }
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  async function pick(company: CompanyRow | null, e: React.MouseEvent) {
    e.stopPropagation();
    setOpen(false);
    setSaveError(null);
    if (!row.id) return;
    setSaving(true);
    const { error } = await supabase
      .from("contacts")
      .update({ company_id: company?.id ?? null })
      .eq("id", row.id);
    setSaving(false);
    if (error) {
      setSaveError(error.message);
      console.error("[CompanyPickerCell] save failed:", error);
      return;
    }
    onSaved(row.id, company?.id ?? null, company?.name ?? null);
  }

  async function handleMatchFromEmail(e: React.MouseEvent) {
    e.stopPropagation();
    if (!row.email) return;
    setMatching(true);
    setAiSuggestion(null);
    try {
      const res = await fetch("/api/contacts/match-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: row.email }),
      });
      const data = await res.json();
      if (data.match) {
        const company = companiesRef.current.find(c => c.id === data.match.id);
        if (company) {
          await pick(company, e);
          return;
        }
      } else if (data.suggestion) {
        setAiSuggestion(data.suggestion);
      }
    } catch {
      // silently fail
    }
    setMatching(false);
  }

  async function handleCreateAndLink(e: React.MouseEvent) {
    e.stopPropagation();
    if (!aiSuggestion) return;
    setSaving(true);
    const { data: newCompany, error } = await supabase
      .from("companies")
      .insert({ name: aiSuggestion, type: "other" })
      .select()
      .single();
    if (!error && newCompany) {
      setCompanies(prev => [newCompany as CompanyRow, ...prev]);
      await pick(newCompany as CompanyRow, e);
    }
    setSaving(false);
  }


  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      // Don't close if clicking inside the trigger cell OR inside the portal dropdown
      if (cellRef.current?.contains(target)) return;
      if (portalRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={cellRef} onClick={openDropdown}
      style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", padding: "0 6px", cursor: "pointer" }}
      title="Click to link company">
      <span style={{ fontSize: 11, color: saveError ? "#ef4444" : displayName ? "#1e293b" : (saving ? "#3b82f6" : "#cbd5e1"), fontWeight: displayName ? 500 : 400 }}>
        {saving ? "Saving…" : saveError ? `⚠ ${saveError}` : (displayName || "—")}
      </span>
      {open && pos && createPortal(
        <div
          ref={portalRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, minWidth: pos.width, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", zIndex: 99999, overflow: "hidden", fontFamily: "inherit" }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div style={{ padding: "8px 8px 4px" }}>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search companies…"
              style={{ width: "100%", padding: "5px 8px", fontSize: 12, border: "1px solid #e2e8f0", borderRadius: 6, outline: "none", boxSizing: "border-box" as const }}
            />
          </div>
          <div style={{ maxHeight: 240, overflowY: "auto" }}>
            <div onMouseDown={e => pick(null, e)}
              style={{ padding: "7px 14px", cursor: "pointer", fontSize: 12, color: "#94a3b8", borderBottom: "1px solid #f1f5f9" }}>
              — No company
            </div>
            {search.trim() && !filtered.some(c => c.name.toLowerCase() === search.trim().toLowerCase()) && (
              <div onMouseDown={(e) => {
                e.stopPropagation();
                const name = search.trim();
                const rowId = row.id;
                const savedCb = onSaved;
                setOpen(false);
                onRequestCreate(name, async (newCo: CompanyRow) => {
                  // Note: handleCreatePanelSubmit already adds newCo to companies state — don't duplicate here
                  const sb = createClient();
                  await sb.from("contacts").update({ company_id: newCo.id }).eq("id", rowId);
                  savedCb(rowId, newCo.id, newCo.name);
                });
              }}
                style={{ padding: "8px 14px", cursor: "pointer", fontSize: 12, color: "#2563eb", fontWeight: 600, borderBottom: "1px solid #f1f5f9", background: "#f0f9ff" }}>
                + Create &quot;{search.trim()}&quot;
              </div>
            )}
            {filtered.map(c => (
              <div key={c.id} onMouseDown={e => pick(c, e)}
                style={{ padding: "7px 14px", cursor: "pointer", fontSize: 12, color: "#1e293b", background: c.id === row.company_id ? "#f0f9ff" : "transparent" }}>
                {c.name}
              </div>
            ))}
          </div>
          {row.email && (
            <div style={{ borderTop: "1px solid #f1f5f9", padding: "8px 10px" }}>
              {matching ? (
                <div style={{ fontSize: 12, color: "#3b82f6", padding: "4px 0" }}>Matching…</div>
              ) : (
                <div
                  onClick={handleMatchFromEmail}
                  style={{ fontSize: 12, color: "#7c3aed", cursor: "pointer", padding: "4px 0", fontWeight: 500 }}
                >
                  ✨ Match from email
                </div>
              )}
              {aiSuggestion && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>✨ AI suggests: <strong>{aiSuggestion}</strong></div>
                  <div
                    onClick={handleCreateAndLink}
                    style={{ fontSize: 12, color: "#fff", background: "#3b82f6", borderRadius: 5, padding: "4px 10px", cursor: "pointer", display: "inline-block", fontWeight: 500 }}
                  >
                    + Create &amp; Link
                  </div>
                </div>
              )}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── LinkedContactsCell: interactive contacts panel for company rows ──────────

function LinkedContactsCell({ row, contactsRef, setContacts }: {
  row: CompanyRow;
  contactsRef: React.RefObject<ContactRow[]>;
  setContacts: React.Dispatch<React.SetStateAction<ContactRow[]>>;
}) {
  const supabase = createClient();
  const cellRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [panelSearch, setPanelSearch] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // mode: "list" | "create" | "edit" | "link"
  const [mode, setMode] = useState<"list" | "create" | "edit" | "link">("list");

  // Form state shared between create and edit
  const [formFirstName, setFormFirstName] = useState("");
  const [formLastName, setFormLastName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formType, setFormType] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);

  // Link existing contact state
  const [linkSearch, setLinkSearch] = useState("");
  const [linkSaving, setLinkSaving] = useState(false);

  const linked = contactsRef.current.filter(c => c.company_id === row.id);

  // All unlinked contacts for "Link Existing" search
  const linkResults = useMemo(() => {
    if (mode !== "link") return [];
    const q = linkSearch.trim().toLowerCase();
    const all = contactsRef.current;
    const unlinked = all.filter(c => c.company_id !== row.id);
    if (!q) return unlinked.slice(0, 40);
    return unlinked.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.first_name?.toLowerCase().includes(q) ||
      c.last_name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q)
    ).slice(0, 40);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkSearch, mode]);

  const filteredLinked = useMemo(() => {
    if (!panelSearch.trim()) return linked;
    const q = panelSearch.toLowerCase();
    return linked.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.title?.toLowerCase().includes(q)
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelSearch, linked.length]);

  function openPanel(e: React.MouseEvent) {
    e.stopPropagation();
    if (cellRef.current) {
      const rect = cellRef.current.getBoundingClientRect();
      const p = getPortalPos(rect, 340, 340);
      setPos({ top: p.top, left: p.left });
    }
    setPanelSearch("");
    setMode("list");
    setOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 30);
  }

  function startCreate() {
    setFormFirstName("");
    setFormLastName("");
    setFormEmail("");
    setFormTitle("");
    setFormType("");
    setEditingId(null);
    setMode("create");
  }

  function startEdit(c: ContactRow) {
    setFormFirstName(c.first_name ?? "");
    setFormLastName(c.last_name ?? "");
    setFormEmail(c.email ?? "");
    setFormTitle(c.title ?? "");
    setFormType((c.type as string) ?? "");
    setEditingId(c.id);
    setMode("edit");
  }

  async function handleCreate() {
    setFormSaving(true);
    const { data, error } = await supabase
      .from("contacts")
      .insert({
        first_name: formFirstName,
        last_name: formLastName,
        email: formEmail,
        title: formTitle,
        type: formType || null,
        company_id: row.id,
        status: "active",
      })
      .select()
      .single();
    setFormSaving(false);
    if (!error && data) {
      const newRow: ContactRow = {
        ...(data as Contact),
        company_name: row.name,
        name: [formFirstName, formLastName].filter(Boolean).join(" "),
      };
      setContacts(prev => [...prev, newRow]);
      setMode("list");
    }
  }

  async function handleSave() {
    if (!editingId) return;
    setFormSaving(true);
    await supabase
      .from("contacts")
      .update({
        first_name: formFirstName,
        last_name: formLastName,
        email: formEmail,
        title: formTitle,
        type: formType || null,
      })
      .eq("id", editingId);
    setFormSaving(false);
    setContacts(prev => prev.map(c =>
      c.id === editingId
        ? {
            ...c,
            first_name: formFirstName,
            last_name: formLastName,
            email: formEmail,
            title: formTitle,
            type: (formType || null) as Contact["type"],
            name: [formFirstName, formLastName].filter(Boolean).join(" "),
          }
        : c
    ));
    setMode("list");
  }

  async function handleLink(contact: ContactRow) {
    setLinkSaving(true);
    await supabase.from("contacts").update({ company_id: row.id }).eq("id", contact.id);
    setContacts(prev => prev.map(c =>
      c.id === contact.id ? { ...c, company_id: row.id, company_name: row.name } : c
    ));
    setLinkSaving(false);
    setLinkSearch("");
    setMode("list");
  }

  async function handleUnlink(contactId: string, e: React.MouseEvent) {
    e.stopPropagation();
    await supabase.from("contacts").update({ company_id: null }).eq("id", contactId);
    setContacts(prev => prev.map(c =>
      c.id === contactId ? { ...c, company_id: null, company_name: null } : c
    ));
  }

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (cellRef.current?.contains(target)) return;
      // Check if click is inside portal
      const portals = document.querySelectorAll("[data-linked-contacts-portal]");
      for (const p of portals) {
        if (p.contains(target)) return;
      }
      setOpen(false);
      setMode("list");
      setLinkSearch("");
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Cell display: up to 2 pills + overflow count
  const pills = linked.slice(0, 2);
  const overflow = linked.length - 2;

  const formFields = (
    <div style={{ padding: "0 12px 12px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, marginBottom: 2 }}>FIRST NAME</div>
          <input value={formFirstName} onChange={e => setFormFirstName(e.target.value)}
            style={{ width: "100%", fontSize: 12, padding: "4px 7px", border: "1px solid #e2e8f0", borderRadius: 5, outline: "none", boxSizing: "border-box" as const }} />
        </div>
        <div>
          <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, marginBottom: 2 }}>LAST NAME</div>
          <input value={formLastName} onChange={e => setFormLastName(e.target.value)}
            style={{ width: "100%", fontSize: 12, padding: "4px 7px", border: "1px solid #e2e8f0", borderRadius: 5, outline: "none", boxSizing: "border-box" as const }} />
        </div>
      </div>
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, marginBottom: 2 }}>EMAIL</div>
        <input value={formEmail} onChange={e => setFormEmail(e.target.value)} type="email"
          style={{ width: "100%", fontSize: 12, padding: "4px 7px", border: "1px solid #e2e8f0", borderRadius: 5, outline: "none", boxSizing: "border-box" as const }} />
      </div>
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, marginBottom: 2 }}>TITLE</div>
        <input value={formTitle} onChange={e => setFormTitle(e.target.value)}
          style={{ width: "100%", fontSize: 12, padding: "4px 7px", border: "1px solid #e2e8f0", borderRadius: 5, outline: "none", boxSizing: "border-box" as const }} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, color: "#64748b", fontWeight: 600, marginBottom: 2 }}>TYPE</div>
        <select value={formType} onChange={e => setFormType(e.target.value)}
          style={{ width: "100%", fontSize: 12, padding: "4px 7px", border: "1px solid #e2e8f0", borderRadius: 5, outline: "none", background: "#fff", boxSizing: "border-box" as const }}>
          <option value="">— Select type —</option>
          {CONTACT_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
    </div>
  );

  return (
    <div
      ref={cellRef}
      onClick={openPanel}
      style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", padding: "0 6px", cursor: "pointer", gap: 3 }}
    >
      {linked.length === 0 ? (
        <span style={{ fontSize: 11, color: "#cbd5e1" }}>+ Add</span>
      ) : (
        <>
          {pills.map(c => (
            <span key={c.id} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 9999, background: "#eff6ff", color: "#2563eb", fontWeight: 500, whiteSpace: "nowrap", maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis" }}>
              {c.name || c.first_name || "Contact"}
            </span>
          ))}
          {overflow > 0 && (
            <span style={{ fontSize: 10, color: "#64748b" }}>+{overflow}</span>
          )}
        </>
      )}

      {open && pos && createPortal(
        <div
          data-linked-contacts-portal=""
          style={{ position: "fixed", top: pos.top, left: pos.left, width: 340, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", zIndex: 99999, fontFamily: "inherit", overflow: "hidden" }}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px 8px", borderBottom: "1px solid #f1f5f9" }}>
            {mode === "list" ? (
              <>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#1e293b" }}>
                  Contacts — {row.name}
                </span>
                <div style={{ display: "flex", gap: 4 }}>
                  <div
                    onClick={e => { e.stopPropagation(); setLinkSearch(""); setMode("link"); }}
                    style={{ fontSize: 11, fontWeight: 600, color: "#7c3aed", background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 5, padding: "3px 9px", cursor: "pointer" }}
                  >
                    Link
                  </div>
                  <div
                    onClick={e => { e.stopPropagation(); startCreate(); }}
                    style={{ fontSize: 11, fontWeight: 600, color: "#fff", background: "#3b82f6", borderRadius: 5, padding: "3px 9px", cursor: "pointer" }}
                  >
                    + New
                  </div>
                </div>
              </>
            ) : (
              <>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#1e293b" }}>
                  {mode === "create" ? "New Contact" : mode === "link" ? "Link Existing Contact" : "Edit Contact"}
                </span>
                <div
                  onClick={e => { e.stopPropagation(); setMode("list"); }}
                  style={{ fontSize: 11, color: "#64748b", cursor: "pointer" }}
                >
                  ← Back
                </div>
              </>
            )}
          </div>

          {mode === "list" && (
            <>
              {/* Search */}
              <div style={{ padding: "8px 12px 4px" }}>
                <input
                  ref={searchInputRef}
                  type="text"
                  value={panelSearch}
                  onChange={e => setPanelSearch(e.target.value)}
                  placeholder="Search contacts…"
                  style={{ width: "100%", fontSize: 12, padding: "5px 8px", border: "1px solid #e2e8f0", borderRadius: 6, outline: "none", boxSizing: "border-box" as const }}
                />
              </div>
              {/* Contact list */}
              <div style={{ maxHeight: 260, overflowY: "auto" }}>
                {filteredLinked.length === 0 ? (
                  <div style={{ padding: "12px 14px", fontSize: 12, color: "#94a3b8" }}>
                    {panelSearch ? "No matching contacts" : "No contacts linked"}
                  </div>
                ) : filteredLinked.map(c => {
                  const tc = CONTACT_TYPE_COLORS[(c.type as string) ?? ""] ?? { bg: "#f8fafc", color: "#64748b" };
                  return (
                    <div key={c.id} style={{ padding: "8px 12px", borderBottom: "1px solid #f8fafc", display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#1e293b", display: "flex", alignItems: "center", gap: 5 }}>
                          {c.name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                          {c.type && (
                            <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 9999, background: tc.bg, color: tc.color, fontWeight: 500 }}>
                              {c.type as string}
                            </span>
                          )}
                        </div>
                        {c.email && <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>{c.email}</div>}
                        {c.title && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 1 }}>{c.title}</div>}
                      </div>
                      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        <div onClick={e => { e.stopPropagation(); startEdit(c); }}
                          style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: "#f1f5f9", color: "#475569", cursor: "pointer", fontWeight: 500 }}>
                          Edit
                        </div>
                        <div onClick={e => handleUnlink(c.id, e)}
                          style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: "#fff1f2", color: "#be123c", cursor: "pointer", fontWeight: 500 }}>
                          Unlink
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {mode === "link" && (
            <>
              <div style={{ padding: "8px 12px 4px" }}>
                <input
                  type="text"
                  autoFocus
                  value={linkSearch}
                  onChange={e => setLinkSearch(e.target.value)}
                  placeholder="Search contacts by name or email…"
                  style={{ width: "100%", fontSize: 12, padding: "5px 8px", border: "1px solid #e2e8f0", borderRadius: 6, outline: "none", boxSizing: "border-box" as const }}
                />
              </div>
              <div style={{ maxHeight: 260, overflowY: "auto" }}>
                {linkResults.length === 0 ? (
                  <div style={{ padding: "12px 14px", fontSize: 12, color: "#94a3b8" }}>
                    {linkSearch ? "No contacts found" : "Type to search all contacts…"}
                  </div>
                ) : linkResults.map(c => (
                  <div key={c.id} style={{ padding: "8px 12px", borderBottom: "1px solid #f8fafc", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "—"}
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 1 }}>
                        {c.email}{c.company_name ? ` · ${c.company_name}` : ""}
                      </div>
                    </div>
                    <div
                      onClick={e => { e.stopPropagation(); handleLink(c); }}
                      style={{ fontSize: 11, fontWeight: 600, color: "#fff", background: linkSaving ? "#93c5fd" : "#7c3aed", borderRadius: 5, padding: "3px 9px", cursor: "pointer", flexShrink: 0 }}
                    >
                      {linkSaving ? "…" : "Link"}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {(mode === "create" || mode === "edit") && (
            <>
              {formFields}
              <div style={{ display: "flex", gap: 8, padding: "0 12px 12px" }}>
                <div
                  onClick={e => { e.stopPropagation(); mode === "create" ? handleCreate() : handleSave(); }}
                  style={{ flex: 1, padding: "6px 0", fontSize: 12, fontWeight: 600, color: "#fff", background: formSaving ? "#93c5fd" : "#3b82f6", borderRadius: 6, cursor: "pointer", textAlign: "center" }}
                >
                  {formSaving ? "Saving…" : (mode === "create" ? "Create" : "Save")}
                </div>
                <div
                  onClick={e => { e.stopPropagation(); setMode("list"); }}
                  style={{ flex: 1, padding: "6px 0", fontSize: 12, color: "#64748b", background: "#f1f5f9", borderRadius: 6, cursor: "pointer", textAlign: "center" }}
                >
                  Cancel
                </div>
              </div>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Company detail panel ─────────────────────────────────────────────────────

function CompanyDetailPanel({ company, onClose }: { company: CompanyRow; onClose: () => void }) {
  const supabase = createClient();
  const [contacts, setContacts] = useState<{ id: string; first_name: string; last_name: string | null; title: string | null; email: string | null }[]>([]);
  const [interactionCount, setInteractionCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [{ data: cts }, { count }] = await Promise.all([
        supabase.from("contacts").select("id, first_name, last_name, title, email")
          .eq("company_id", company.id).order("is_primary_contact", { ascending: false }).limit(8),
        supabase.from("interactions").select("id", { count: "exact", head: true })
          .eq("company_id", company.id),
      ]);
      if (!cancelled) {
        setContacts(cts ?? []);
        setInteractionCount(count ?? 0);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [company.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const type = company.type?.toLowerCase() ?? "";
  const isStartup   = type === "startup";
  const isFund      = type === "fund";
  const isLP        = type === "lp";
  const isCorporate = type === "corporate";

  const fmtDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="w-[480px] bg-white h-full shadow-2xl overflow-y-auto flex flex-col border-l border-slate-200"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="sticky top-0 bg-white z-10 border-b border-slate-100 px-6 py-4 flex items-start justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {company.logo_url ? (
              <img src={company.logo_url} alt={company.name}
                className="w-9 h-9 rounded-lg object-contain border border-slate-200 flex-shrink-0" />
            ) : (
              <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-sm font-bold">
                  {company.name?.charAt(0)?.toUpperCase() ?? "?"}
                </span>
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900 truncate">{company.name}</h2>
              <div className="flex flex-wrap gap-1 mt-0.5">
                {company.type && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded capitalize">{company.type}</span>
                )}
                {(company.sectors as string[] | null)?.map(s => (
                  <span key={s} className="text-[10px] px-1.5 py-0.5 bg-teal-50 text-teal-700 border border-teal-200 rounded">{s}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-2">
            <a href={`/crm/companies/${company.id}`} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
              <ExternalLink size={11} /> Full profile
            </a>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 px-6 py-4 space-y-5">
          {/* Description */}
          {company.description && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">About</p>
              <p className="text-sm text-slate-700 leading-relaxed">{company.description}</p>
            </div>
          )}

          {/* Core fields */}
          <div className="grid grid-cols-2 gap-3">
            {company.website && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Website</p>
                <a href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
                  target="_blank" rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline flex items-center gap-1 truncate">
                  <Globe size={11} />{company.website.replace(/^https?:\/\//, "")}
                </a>
              </div>
            )}
            {(company.location_city || company.location_country) && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Location</p>
                <p className="text-sm text-slate-700 flex items-center gap-1">
                  <MapPin size={11} className="text-slate-400" />
                  {[company.location_city, company.location_country].filter(Boolean).join(", ")}
                </p>
              </div>
            )}
            {company.last_contact_date && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Last Contact</p>
                <p className="text-sm text-slate-700 flex items-center gap-1">
                  <Calendar size={11} className="text-slate-400" />{fmtDate(company.last_contact_date)}
                </p>
              </div>
            )}
            {interactionCount !== null && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Interactions</p>
                <p className="text-sm text-slate-700">{interactionCount} total</p>
              </div>
            )}
          </div>

          {/* Type-specific fields */}
          {isStartup && (
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              {company.deal_status && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Deal Status</p>
                  <p className="text-sm text-slate-700">{formatDealStatus(company.deal_status)}</p>
                </div>
              )}
              {company.stage && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Round</p>
                  <p className="text-sm text-slate-700">{company.stage}</p>
                </div>
              )}
              {company.priority && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Priority</p>
                  <p className="text-sm text-slate-700">{company.priority}</p>
                </div>
              )}
            </div>
          )}
          {isFund && (
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              {company.investor_type && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Investor Type</p>
                  <p className="text-sm text-slate-700">{company.investor_type}</p>
                </div>
              )}
              {company.aum && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">AUM</p>
                  <p className="text-sm text-slate-700">{company.aum}</p>
                </div>
              )}
            </div>
          )}
          {isLP && (
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              {company.lp_type && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">LP Type</p>
                  <p className="text-sm text-slate-700">{company.lp_type}</p>
                </div>
              )}
              {company.commitment_goal && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Commitment Goal</p>
                  <p className="text-sm text-slate-700">{company.commitment_goal}</p>
                </div>
              )}
            </div>
          )}
          {isCorporate && company.strategic_type && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Strategic Type</p>
              <p className="text-sm text-slate-700">{company.strategic_type}</p>
            </div>
          )}

          {/* Notes */}
          {company.notes && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Notes</p>
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{company.notes}</p>
            </div>
          )}

          {/* Contacts */}
          <div className="pt-2 border-t border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
              <Users size={10} /> Contacts ({contacts.length})
            </p>
            {contacts.length === 0 ? (
              <p className="text-xs text-slate-400">No contacts linked</p>
            ) : (
              <div className="space-y-1.5">
                {contacts.map(c => (
                  <div key={c.id} className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-violet-600 text-[9px] font-bold">
                        {(c.first_name[0] ?? "?").toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-800 truncate">
                        {c.first_name} {c.last_name ?? ""}
                      </p>
                      {c.title && <p className="text-[10px] text-slate-400 truncate">{c.title}</p>}
                    </div>
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="ml-auto text-[10px] text-blue-500 hover:underline flex-shrink-0 truncate max-w-[140px]">
                        {c.email}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface AdminClientProps {
  initialCompanies: Company[];
  initialContacts: (Contact & { company: { name: string } | null })[];
}

export function AdminClient({ initialCompanies, initialContacts }: AdminClientProps) {
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<"companies" | "contacts" | "ai_config" | "api" | "drive" | "sourcing" | "watchlist" | "thesis_keywords">("companies");

  // ── Create Company panel (lifted above grid so it outlives cell editors) ──
  const [createRequest, setCreateRequest] = useState<{ name: string; onCreated: (co: CompanyRow) => void } | null>(null);
  const [cpName, setCpName] = useState("");
  const [cpType, setCpType] = useState("other");
  const [cpWebsite, setCpWebsite] = useState("");
  const [cpDesc, setCpDesc] = useState("");
  const [cpCity, setCpCity] = useState("");
  const [cpCountry, setCpCountry] = useState("");
  const [cpSaving, setCpSaving] = useState(false);

  function handleRequestCreate(name: string, onCreated: (co: CompanyRow) => void) {
    setCpName(name); setCpType("other"); setCpWebsite(""); setCpDesc(""); setCpCity(""); setCpCountry("");
    setCreateRequest({ name, onCreated });
  }

  async function handleCreatePanelSubmit() {
    if (!cpName.trim() || !createRequest) return;
    setCpSaving(true);
    const { data: nc, error } = await supabase.from("companies").insert({
      name: cpName.trim(), type: cpType,
      website: cpWebsite.trim() || null, description: cpDesc.trim() || null,
      location_city: cpCity.trim() || null, location_country: cpCountry.trim() || null,
    }).select().single();
    if (!error && nc) {
      setCompanies(prev => [nc as CompanyRow, ...prev]);
      await createRequest.onCreated(nc as CompanyRow);
      setCreateRequest(null);
    }
    setCpSaving(false);
  }
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [toast, setToast] = useState<ToastState>(null);
  const [companyPage, setCompanyPage] = useState(0);
  const [contactPage, setContactPage] = useState(0);
  const PAGE_SIZE = 50;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Companies state ──────────────────────────────────────────────────────
  const [companies, setCompanies] = useState<CompanyRow[]>(initialCompanies);
  const [selectedCompanyRows, setSelectedCompanyRows] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [panelCompany, setPanelCompany] = useState<CompanyRow | null>(null);

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

  // ── Refs for latest state values (used in stable useMemo closures) ───────
  const contactsRef = useRef<ContactRow[]>(contacts);
  contactsRef.current = contacts;
  const companiesRef = useRef<CompanyRow[]>(companies);
  companiesRef.current = companies;

  // ── Client-side contacts refresh on mount (get latest DB data) ──────────
  useEffect(() => {
    supabase
      .from("contacts")
      .select("*, company:companies(name)")
      .order("last_name", { ascending: true })
      .limit(10000)
      .then(({ data }) => {
        if (data) {
          setContacts(data.map((c: Contact & { company: { name: string } | null }) => ({
            ...c,
            company_name: c.company?.name ?? null,
            name: [c.first_name, c.last_name].filter(Boolean).join(" "),
          })));
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Sort state ───────────────────────────────────────────────────────────
  const [companySortColumns, setCompanySortColumns] = useState<readonly SortColumn[]>([]);
  const [contactSortColumns, setContactSortColumns] = useState<readonly SortColumn[]>([]);

  // ── Column width persistence ──────────────────────────────────────────────
  const [companyColWidths, setCompanyColWidths] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem("admin_company_col_widths") ?? "{}"); } catch { return {}; }
  });
  const [contactColWidths, setContactColWidths] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem("admin_contact_col_widths") ?? "{}"); } catch { return {}; }
  });

  // ── Column order persistence ──────────────────────────────────────────────
  const [companyColOrder, setCompanyColOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("admin_company_col_order") ?? "[]"); } catch { return []; }
  });
  const [contactColOrder, setContactColOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem("admin_contact_col_order") ?? "[]"); } catch { return []; }
  });

  // ── Drag refs for column reorder ──────────────────────────────────────────
  const dragCompanyColKey = useRef<string | null>(null);
  const dragCompanyOverKey = useRef<string | null>(null);
  const dragContactColKey = useRef<string | null>(null);
  const dragContactOverKey = useRef<string | null>(null);

  // ── Match All state ───────────────────────────────────────────────────────
  const [matchingAll, setMatchingAll] = useState(false);
  const [matchProgress, setMatchProgress] = useState<{ done: number; total: number; matched: number }>({ done: 0, total: 0, matched: 0 });

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

  // ── Search debounce ───────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

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
        name: "Company",
        width: 200,
        frozen: true,
        sortable: true,
        resizable: true,
        renderCell: ({ row }: { row: CompanyRow }) => (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", padding: "0 6px", gap: 4 }}>
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setPanelCompany(row); }}
              style={{ fontSize: 12, fontWeight: 600, color: "#2563eb", textDecoration: "underline", textUnderlineOffset: 2, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}
            >
              {row.name}
            </button>
          </div>
        ),
        renderEditCell: renderTextEditor,
      },
      {
        key: "_contacts",
        name: "Contacts",
        width: 180,
        editable: false,
        sortable: false,
        renderCell: ({ row }: { row: CompanyRow }) => (
          <LinkedContactsCell row={row} contactsRef={contactsRef} setContacts={setContacts} />
        ),
      },
      {
        key: "types",
        name: "Type",
        width: 180,
        sortable: true,
        resizable: true,
        editable: false,
        renderCell: ({ row }: { row: CompanyRow }) => (
          <TypeCell
            row={row}
            onSaved={(id, types) => {
              setCompanies(prev => prev.map(c => c.id === id ? { ...c, types } : c));
            }}
          />
        ),
      },
      {
        key: "lp_stage",
        name: "LP Stage",
        width: 180,
        sortable: true,
        resizable: true,
        editable: false,
        renderCell: ({ row }: { row: CompanyRow }) => (
          <LpStageCell row={row} onSaved={(id, val) => {
            setCompanies(prev => prev.map(c => c.id === id ? { ...c, lp_stage: val || null } : c));
          }} />
        ),
      },
      {
        key: "deal_status",
        name: "Deal Status",
        width: 180,
        sortable: true,
        resizable: true,
        editable: false,
        renderCell: ({ row }: { row: CompanyRow }) => (
          <DealStatusCell row={row} onSaved={(id, val) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setCompanies(prev => prev.map(c => c.id === id ? { ...c, deal_status: (val || null) as any } : c));
          }} />
        ),
      },
      {
        key: "stage",
        name: "Investment Round",
        width: 160,
        sortable: true,
        resizable: true,
        editable: false,
        renderCell: ({ row }: { row: CompanyRow }) => (
          <InvestmentRoundCell row={row} onSaved={(id, val) => {
            setCompanies(prev => prev.map(c => c.id === id ? { ...c, stage: val || null } : c));
          }} />
        ),
      },
      {
        key: "sectors",
        name: "Sectors",
        width: 180,
        sortable: true,
        resizable: true,
        editable: false,
        renderCell: ({ row }: { row: CompanyRow }) => (
          <SectorsCell row={row} onSaved={(id, vals) => {
            setCompanies(prev => prev.map(c => c.id === id ? { ...c, sectors: vals } : c));
          }} />
        ),
      },
      {
        key: "investor_type",
        name: "Investor Type",
        width: 160,
        sortable: true,
        resizable: true,
        editable: false,
        renderCell: ({ row }: { row: CompanyRow }) => (
          <InvestorTypeCell row={row} onSaved={(id, val) => {
            setCompanies(prev => prev.map(c => c.id === id ? { ...c, investor_type: val || null } : c));
          }} />
        ),
      },
      {
        key: "strategic_type",
        name: "Strategic Type",
        width: 160,
        sortable: true,
        resizable: true,
        editable: false,
        renderCell: ({ row }: { row: CompanyRow }) => (
          <StrategicTypeCell row={row} onSaved={(id, val) => {
            setCompanies(prev => prev.map(c => c.id === id ? { ...c, strategic_type: val || null } : c));
          }} />
        ),
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
        width: 180,
        sortable: true,
        resizable: true,
        editable: false,
        renderCell: ({ row }: { row: CompanyRow }) => (
          <LpTypeCell row={row} onSaved={(id, val) => {
            setCompanies(prev => prev.map(c => c.id === id ? { ...c, lp_type: val || null } : c));
          }} />
        ),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setCompanies, setContacts, setActiveTab, setContactFilters, contactsRef, contacts.length]
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
        editable: false,
        renderCell: ({ row }: { row: ContactRow }) => (
          <TitleCell
            row={row}
            onSaved={(id, title) => {
              setContacts(prev => prev.map(c => c.id === id ? { ...c, title: title || null } : c));
            }}
          />
        ),
      },
      {
        key: "type",
        name: "Type",
        width: 150,
        sortable: true,
        resizable: true,
        editable: false,
        renderCell: ({ row }: { row: ContactRow }) => (
          <ContactTypeCell
            row={row}
            onSaved={(id, type) => {
              setContacts(prev => prev.map(c => c.id === id ? { ...c, type: type as Contact["type"] } : c));
            }}
          />
        ),
      },
      {
        key: "company_name",
        name: "Company",
        width: 180,
        editable: false,
        sortable: true,
        resizable: true,
        renderCell: ({ row }: { row: ContactRow }) => (
          <CompanyPickerCell
            row={row}
            companiesRef={companiesRef}
            setCompanies={setCompanies}
            onSaved={(id, companyId, companyName) => {
              setContacts(prev => prev.map(c => c.id === id ? { ...c, company_id: companyId, company_name: companyName } : c));
              setCompanies(prev => [...prev]);
            }}
            onRequestCreate={handleRequestCreate}
          />
        ),
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
    [setContacts, setCompanies, companiesRef]
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

  // ─── Column widths applied ────────────────────────────────────────────────

  const companyColumnsWithWidths = useMemo(
    () => companyColumns.map(col => {
      const saved = companyColWidths[col.key as string];
      return saved ? { ...col, width: saved } : col;
    }),
    [companyColumns, companyColWidths]
  );

  const contactColumnsWithWidths = useMemo(
    () => contactColumns.map(col => {
      const saved = contactColWidths[col.key as string];
      return saved ? { ...col, width: saved } : col;
    }),
    [contactColumns, contactColWidths]
  );

  // ─── Column ordering applied ──────────────────────────────────────────────

  const orderedCompanyColumns = useMemo(() => {
    if (companyColOrder.length === 0) return companyColumnsWithWidths;
    const frozen = companyColumnsWithWidths.filter(c => (c as { frozen?: boolean }).frozen || (c.key as string) === "select-row");
    const movable = companyColumnsWithWidths.filter(c => !(c as { frozen?: boolean }).frozen && (c.key as string) !== "select-row");
    const sorted = [...movable].sort((a, b) => {
      const ai = companyColOrder.indexOf(a.key as string);
      const bi = companyColOrder.indexOf(b.key as string);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return [...frozen, ...sorted];
  }, [companyColumnsWithWidths, companyColOrder]);

  const orderedContactColumns = useMemo(() => {
    if (contactColOrder.length === 0) return contactColumnsWithWidths;
    const frozen = contactColumnsWithWidths.filter(c => (c as { frozen?: boolean }).frozen || (c.key as string) === "select-row");
    const movable = contactColumnsWithWidths.filter(c => !(c as { frozen?: boolean }).frozen && (c.key as string) !== "select-row");
    const sorted = [...movable].sort((a, b) => {
      const ai = contactColOrder.indexOf(a.key as string);
      const bi = contactColOrder.indexOf(b.key as string);
      if (ai === -1 && bi === -1) return 0;
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
    return [...frozen, ...sorted];
  }, [contactColumnsWithWidths, contactColOrder]);

  // ─── Reorder helpers ──────────────────────────────────────────────────────

  function reorderKeys(order: string[], fromKey: string, toKey: string): string[] {
    const result = [...order];
    const fi = result.indexOf(fromKey);
    const ti = result.indexOf(toKey);
    if (fi === -1 || ti === -1 || fi === ti) return result;
    result.splice(fi, 1);
    result.splice(ti, 0, fromKey);
    return result;
  }

  function addDraggableHeaders<T>(
    cols: Column<T>[],
    dragRef: React.MutableRefObject<string | null>,
    dragOverRef: React.MutableRefObject<string | null>,
    onReorder: (fromKey: string, toKey: string) => void
  ): Column<T>[] {
    return cols.map(col => {
      const key = col.key as string;
      const frozen = (col as { frozen?: boolean }).frozen;
      const isMeta = key === "select-row";
      if (isMeta || frozen) return col;
      return {
        ...col,
        renderHeaderCell: () => (
          <div
            draggable
            onDragStart={e => {
              dragRef.current = key;
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", key);
            }}
            onDragOver={e => {
              e.preventDefault();
              dragOverRef.current = key;
              e.dataTransfer.dropEffect = "move";
            }}
            onDrop={e => {
              e.preventDefault();
              const from = dragRef.current;
              if (from && from !== key) onReorder(from, key);
              dragRef.current = null;
              dragOverRef.current = null;
            }}
            onDragEnd={() => {
              dragRef.current = null;
              dragOverRef.current = null;
            }}
            style={{
              cursor: "grab",
              userSelect: "none",
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              padding: "0 4px",
              gap: 4,
            }}
            title="Drag to reorder"
          >
            <span style={{ fontSize: 11 }}>⠿</span>
            <span>{typeof col.name === "string" ? col.name : ""}</span>
          </div>
        ),
      };
    });
  }

  const handleCompanyReorder = useCallback((fromKey: string, toKey: string) => {
    setCompanyColOrder(prev => {
      const base = prev.length ? prev : orderedCompanyColumns.map(c => c.key as string);
      const next = reorderKeys(base, fromKey, toKey);
      localStorage.setItem("admin_company_col_order", JSON.stringify(next));
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedCompanyColumns]);

  const handleContactReorder = useCallback((fromKey: string, toKey: string) => {
    setContactColOrder(prev => {
      const base = prev.length ? prev : orderedContactColumns.map(c => c.key as string);
      const next = reorderKeys(base, fromKey, toKey);
      localStorage.setItem("admin_contact_col_order", JSON.stringify(next));
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedContactColumns]);

  const finalCompanyColumns = useMemo(
    () => addDraggableHeaders(orderedCompanyColumns, dragCompanyColKey, dragCompanyOverKey, handleCompanyReorder),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orderedCompanyColumns, handleCompanyReorder]
  );

  const finalContactColumns = useMemo(
    () => addDraggableHeaders(orderedContactColumns, dragContactColKey, dragContactOverKey, handleContactReorder),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orderedContactColumns, handleContactReorder]
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
      // Type: check both singular type field AND types array (null-safe)
      if (filters.type &&
          !(row.type?.toLowerCase() ?? "").includes(filters.type.toLowerCase()) &&
          !(row.types ?? []).some((t: string) => (t?.toLowerCase() ?? "").includes(filters.type.toLowerCase()))) return false;
      if (filters.deal_status && !(row.deal_status?.toLowerCase() ?? "").includes(filters.deal_status.toLowerCase())) return false;
      if (filters.stage && !((row.stage?.toLowerCase() ?? "").includes(filters.stage.toLowerCase()) || (row.lp_stage?.toLowerCase() ?? "").includes(filters.stage.toLowerCase()))) return false;
      if (filters.sectors && !(row.sectors ?? []).some((s: string) => (s?.toLowerCase() ?? "").includes(filters.sectors.toLowerCase()))) return false;
      if (filters.location_country && !(row.location_country?.toLowerCase() ?? "").includes(filters.location_country.toLowerCase())) return false;
      if (filters.source && !(row.source?.toLowerCase() ?? "").includes(filters.source.toLowerCase())) return false;
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

  // Pre-compute which values actually exist in the data for each filterable field
  const companyFilterAvailable = useMemo(() => {
    const types = new Set<string>();
    const dealStatuses = new Set<string>();
    const stages = new Set<string>();
    const sectors = new Set<string>();
    const countries = new Set<string>();
    const sources = new Set<string>();
    companies.forEach((c) => {
      if (c.type) types.add(c.type.toLowerCase());
      ((c.types as string[] | null) ?? []).forEach((t: string) => { if (t) types.add(t.toLowerCase()); });
      if (c.deal_status) dealStatuses.add(c.deal_status.toLowerCase());
      if (c.stage) stages.add(c.stage.toLowerCase());
      if ((c as unknown as Record<string, string>).lp_stage) stages.add((c as unknown as Record<string, string>).lp_stage.toLowerCase());
      ((c.sectors as string[] | null) ?? []).forEach((s: string) => { if (s) sectors.add(s.toLowerCase()); });
      if (c.location_country) countries.add(c.location_country.toLowerCase());
      if (c.source) sources.add(c.source.toLowerCase());
    });
    return { types, dealStatuses, stages, sectors, countries, sources };
  }, [companies]);

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

  // ─── Pagination ───────────────────────────────────────────────────────────

  const pagedCompanies = useMemo(() => {
    const start = companyPage * PAGE_SIZE;
    return filteredCompanies.slice(start, start + PAGE_SIZE);
  }, [filteredCompanies, companyPage, PAGE_SIZE]);

  const pagedContacts = useMemo(() => {
    const start = contactPage * PAGE_SIZE;
    return filteredContacts.slice(start, start + PAGE_SIZE);
  }, [filteredContacts, contactPage, PAGE_SIZE]);

  // Reset to page 0 when filter results change
  useEffect(() => { setCompanyPage(0); }, [filteredCompanies.length]);
  useEffect(() => { setContactPage(0); }, [filteredContacts.length]);

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

        // Normalize sectors before saving
        if (Array.isArray(fields.sectors)) {
          (fields as Partial<Company>).sectors = fields.sectors.map((s: string) => normalizeSector(s));
        }

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

  // ─── Export CSV handler ───────────────────────────────────────────────────

  function handleExportCsv() {
    const cols = isCompanies
      ? allCompanyColumns.filter(c => (c.key as string) !== "select-row" && !hiddenCompanyKeys.has(c.key as string))
      : allContactColumns.filter(c => (c.key as string) !== "select-row" && !hiddenContactKeys.has(c.key as string));

    const rows = isCompanies ? filteredCompanies : filteredContacts;

    function escCsv(v: unknown): string {
      const s = v === null || v === undefined ? "" : Array.isArray(v) ? v.join("; ") : String(v);
      if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
      return s;
    }

    const header = cols.map(c => escCsv(c.name)).join(",");
    const dataRows = rows.map(row =>
      cols.map(c => escCsv((row as unknown as Record<string, unknown>)[c.key as string])).join(",")
    );

    const csv = [header, ...dataRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const ts = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `${isCompanies ? "companies" : "contacts"}_export_${ts}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ─── Match All handler ────────────────────────────────────────────────────

  const handleMatchAll = useCallback(async () => {
    const toMatch = contacts.filter(c => c.email && c.company_id === null);
    if (toMatch.length === 0) return;
    setMatchingAll(true);
    setMatchProgress({ done: 0, total: toMatch.length, matched: 0 });
    let matched = 0;
    for (let i = 0; i < toMatch.length; i++) {
      const contact = toMatch[i];
      try {
        const res = await fetch("/api/contacts/match-company", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: contact.email }),
        });
        const data = await res.json();
        if (data.match?.id) {
          const company = companies.find(c => c.id === data.match.id);
          if (company) {
            await supabase.from("contacts").update({ company_id: data.match.id }).eq("id", contact.id);
            setContacts(prev => prev.map(c => c.id === contact.id ? { ...c, company_id: data.match.id, company_name: company.name } : c));
            matched++;
          }
        }
      } catch {
        // silently continue
      }
      setMatchProgress({ done: i + 1, total: toMatch.length, matched });
      if (i < toMatch.length - 1) {
        await new Promise(r => setTimeout(r, 200));
      }
    }
    // Brief "done" message then hide
    setMatchProgress({ done: toMatch.length, total: toMatch.length, matched });
    await new Promise(r => setTimeout(r, 2000));
    setMatchingAll(false);
  }, [contacts, companies, supabase]);

  // ─── Render ───────────────────────────────────────────────────────────────

  const isCompanies = activeTab === "companies";
  const isAiConfig  = activeTab === "ai_config";
  const isDrive     = activeTab === "drive";
  const isSourcing  = activeTab === "sourcing";

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

    // For company tab with dropdown options, only show options that exist in the data
    let visibleOptions = options;
    if (isCompanyTab && options) {
      const available =
        filterKey === "type"        ? companyFilterAvailable.types :
        filterKey === "deal_status" ? companyFilterAvailable.dealStatuses :
        filterKey === "stage"       ? companyFilterAvailable.stages :
        filterKey === "sectors"     ? companyFilterAvailable.sectors :
        null;
      if (available) {
        visibleOptions = options.filter((o) => available.has(o.toLowerCase()));
      }
    }

    // For text fields, hide if there are no values at all in the data
    if (isCompanyTab && !options) {
      const available =
        filterKey === "location_country" ? companyFilterAvailable.countries :
        filterKey === "source"           ? companyFilterAvailable.sources :
        null;
      if (available && available.size === 0) return null;
    }

    // Hide dropdown entirely if no options have data
    if (isCompanyTab && options && visibleOptions?.length === 0) return null;

    return (
      <div style={{ marginBottom: "10px" }}>
        <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#64748b", textTransform: "uppercase", marginBottom: "3px" }}>
          {label}
        </label>
        {visibleOptions ? (
          <select
            value={filters[filterKey] ?? ""}
            onChange={(e) => setFilters((prev) => ({ ...prev, [filterKey]: e.target.value }))}
            style={sharedStyle}
          >
            <option value="">All</option>
            {visibleOptions.map((o) => <option key={o} value={o}>{o}</option>)}
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
    <>
    <div className="flex flex-col h-full">
      {/* ── Header: Row 1 — title + tabs ── */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-white border-b border-slate-100 flex-shrink-0 flex-wrap">
        <Shield size={18} className="text-blue-600" />
        <h1 className="text-sm font-semibold text-slate-800 mr-2">Admin Spreadsheet</h1>

        {/* Tab selector */}
        <div className="flex rounded-md border border-slate-200 overflow-hidden text-xs font-medium">
          <button
            onClick={() => { setActiveTab("companies"); setSearch(""); setSearchInput(""); }}
            className={`px-3 py-1.5 transition-colors ${
              isCompanies
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Companies
          </button>
          <button
            onClick={() => { setActiveTab("contacts"); setSearch(""); setSearchInput(""); }}
            className={`px-3 py-1.5 border-l border-slate-200 transition-colors ${
              activeTab === "contacts"
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            Contacts
          </button>
          <button
            onClick={() => { setActiveTab("ai_config"); setSearch(""); setSearchInput(""); }}
            className={`px-3 py-1.5 border-l border-slate-200 transition-colors flex items-center gap-1 ${
              isAiConfig
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Sparkles size={11} /> AI Config
          </button>
          <button
            onClick={() => { setActiveTab("api"); setSearch(""); setSearchInput(""); }}
            className={`px-3 py-1.5 border-l border-slate-200 transition-colors flex items-center gap-1 ${
              activeTab === "api"
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Rss size={11} /> API
          </button>
          <button
            onClick={() => { setActiveTab("drive"); setSearch(""); setSearchInput(""); }}
            className={`px-3 py-1.5 border-l border-slate-200 transition-colors flex items-center gap-1 ${
              isDrive
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <FolderOpen size={11} /> Drive
          </button>
          <button
            onClick={() => { setActiveTab("sourcing"); setSearch(""); setSearchInput(""); }}
            className={`px-3 py-1.5 border-l border-slate-200 transition-colors flex items-center gap-1 ${
              activeTab === "sourcing"
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Sparkles size={11} /> Sourcing
          </button>
          <button
            onClick={() => { setActiveTab("watchlist"); setSearch(""); setSearchInput(""); }}
            className={`px-3 py-1.5 border-l border-slate-200 transition-colors flex items-center gap-1 ${
              activeTab === "watchlist"
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Bell size={11} /> Watchlist
          </button>
          <button
            onClick={() => { setActiveTab("thesis_keywords"); setSearch(""); setSearchInput(""); }}
            className={`px-3 py-1.5 border-l border-slate-200 transition-colors flex items-center gap-1 ${
              activeTab === "thesis_keywords"
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Sparkles size={11} /> Thesis
          </button>
        </div>
      </div>

      {/* ── Header: Row 2 — search + filter + columns + export + add ── */}
      <div className="flex items-center gap-3 px-4 py-2 bg-white border-b border-slate-200 flex-shrink-0 flex-wrap">
        {/* Search — hidden on api/drive/sourcing/watchlist tab */}
        <div className={`relative flex-1 max-w-xs ${(activeTab === "api" || isDrive || isSourcing || activeTab === "watchlist" || activeTab === "thesis_keywords") ? "invisible" : ""}`}>
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
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
                  <FilterField label="Type" filterKey="type" isCompanyTab={true} options={["startup","limited partner","investor","strategic partner","fund","ecosystem_partner","corporate","government","other"]} />
                  <FilterField label="Deal Status" filterKey="deal_status" isCompanyTab={true} options={["identified_introduced","first_meeting","discussion_in_process","due_diligence","passed","portfolio","tracking_hold","exited"]} />
                  <FilterField label="Stage / LP Stage" filterKey="stage" isCompanyTab={true} options={["Pre-Seed","Pre-A","Seed","Seed Extension","Series A","Series B","Series C","Growth","Lead","Initial Meeting","Discussion in Process","Due Diligence","Committed","Passed"]} />
                  <FilterField label="Sector" filterKey="sectors" isCompanyTab={true} options={["Cleantech","Techbio","Other"]} />
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

        {/* Export CSV button */}
        {!isAiConfig && activeTab !== "api" && !isDrive && (
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
          >
            <Download size={13} />
            Export CSV
          </button>
        )}

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

        {/* Match Companies button — only on contacts tab */}
        {!matchingAll && activeTab === "contacts" && (
          <button onClick={handleMatchAll} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-violet-50 text-violet-700 border border-violet-200 rounded-md hover:bg-violet-100 transition-colors">
            <Sparkles size={13} /> Match Companies
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

      {/* ── Grid or AI Config panel or API or Drive or Sourcing or Watchlist ── */}
      <div className="flex-1 overflow-hidden admin-grid">
        {activeTab === "thesis_keywords" ? (
          <ThesisKeywordsPanel />
        ) : activeTab === "watchlist" ? (
          <WatchlistPanel />
        ) : activeTab === "sourcing" ? (
          <div className="h-full overflow-y-auto"><SourcingConfigPanel /></div>
        ) : activeTab === "api" ? (
          <ApiConfigPanel />
        ) : isDrive ? (
          <div className="h-full overflow-y-auto"><DrivePanel /></div>
        ) : isAiConfig ? (
          <AiConfigPanel />
        ) : isCompanies ? (
          <div className="flex flex-col h-full">
            <DataGrid<CompanyRow, unknown, string>
              columns={finalCompanyColumns}
              rows={pagedCompanies}
              onRowsChange={handleCompanyRowsChange}
              rowKeyGetter={(row: CompanyRow) => row.id}
              selectedRows={selectedCompanyRows}
              onSelectedRowsChange={setSelectedCompanyRows}
              sortColumns={companySortColumns}
              onSortColumnsChange={setCompanySortColumns}
              onColumnResize={(col, width) => {
                const key = col.key as string;
                setCompanyColWidths(prev => {
                  const next = { ...prev, [key]: width };
                  localStorage.setItem("admin_company_col_widths", JSON.stringify(next));
                  return next;
                });
              }}
              onCellCopy={(args, event) => {
                const val = (args.row as unknown as Record<string, unknown>)[args.column.key] ?? "";
                event.clipboardData.setData("text/plain", String(val));
                event.preventDefault();
              }}
              onCellPaste={(args) => ({
                ...args.row,
                [args.column.key]: args.row[args.column.key as keyof CompanyRow],
              })}
              className="rdg-light"
              style={{ height: "calc(100vh - 140px)", blockSize: "calc(100vh - 140px)" }}
            />
            <div className="flex items-center justify-between px-4 py-2 border-t border-slate-200 bg-slate-50 text-xs text-slate-500">
              <span>{filteredCompanies.length} total · showing {filteredCompanies.length === 0 ? 0 : companyPage * PAGE_SIZE + 1}–{Math.min((companyPage + 1) * PAGE_SIZE, filteredCompanies.length)}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCompanyPage(p => Math.max(0, p - 1))}
                  disabled={companyPage === 0}
                  className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ← Prev
                </button>
                <span>Page {companyPage + 1} of {Math.max(1, Math.ceil(filteredCompanies.length / PAGE_SIZE))}</span>
                <button
                  onClick={() => setCompanyPage(p => Math.min(Math.ceil(filteredCompanies.length / PAGE_SIZE) - 1, p + 1))}
                  disabled={(companyPage + 1) * PAGE_SIZE >= filteredCompanies.length}
                  className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <DataGrid<ContactRow, unknown, string>
              columns={finalContactColumns}
              rows={pagedContacts}
              onRowsChange={handleContactRowsChange}
              rowKeyGetter={(row: ContactRow) => row.id}
              selectedRows={selectedContactRows}
              onSelectedRowsChange={setSelectedContactRows}
              sortColumns={contactSortColumns}
              onSortColumnsChange={setContactSortColumns}
              onColumnResize={(col, width) => {
                const key = col.key as string;
                setContactColWidths(prev => {
                  const next = { ...prev, [key]: width };
                  localStorage.setItem("admin_contact_col_widths", JSON.stringify(next));
                  return next;
                });
              }}
              onCellCopy={(args, event) => {
                const val = (args.row as unknown as Record<string, unknown>)[args.column.key] ?? "";
                event.clipboardData.setData("text/plain", String(val));
                event.preventDefault();
              }}
              onCellPaste={(args) => ({
                ...args.row,
                [args.column.key]: args.row[args.column.key as keyof ContactRow],
              })}
              className="rdg-light"
              style={{ height: "calc(100vh - 140px)", blockSize: "calc(100vh - 140px)" }}
            />
            <div className="flex items-center justify-between px-4 py-2 border-t border-slate-200 bg-slate-50 text-xs text-slate-500">
              <span>{filteredContacts.length} total · showing {filteredContacts.length === 0 ? 0 : contactPage * PAGE_SIZE + 1}–{Math.min((contactPage + 1) * PAGE_SIZE, filteredContacts.length)}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setContactPage(p => Math.max(0, p - 1))}
                  disabled={contactPage === 0}
                  className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  ← Prev
                </button>
                <span>Page {contactPage + 1} of {Math.max(1, Math.ceil(filteredContacts.length / PAGE_SIZE))}</span>
                <button
                  onClick={() => setContactPage(p => Math.min(Math.ceil(filteredContacts.length / PAGE_SIZE) - 1, p + 1))}
                  disabled={(contactPage + 1) * PAGE_SIZE >= filteredContacts.length}
                  className="px-2 py-1 rounded border border-slate-200 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
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

      {/* ── Match All progress overlay ── */}
      {matchingAll && (
        <div className="fixed bottom-6 right-6 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl px-5 py-4 flex items-center gap-3 min-w-[240px]">
          <Sparkles size={16} className="text-violet-500 animate-pulse" />
          <div>
            <p className="text-sm font-semibold text-slate-700">
              {matchProgress.done < matchProgress.total ? "Matching companies…" : `✓ Matched ${matchProgress.matched} contacts`}
            </p>
            <p className="text-xs text-slate-400">{matchProgress.done} of {matchProgress.total} · {matchProgress.matched} matched</p>
          </div>
        </div>
      )}

      <style>{`
        /* ── react-data-grid — Valuence OS light theme ── */
        .admin-grid .rdg {
          font-size: 12px;
          font-family: ui-sans-serif, system-ui, sans-serif;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          overflow: hidden;
          --rdg-header-background-color: #f8fafc;
          --rdg-header-row-height: 36px;
          --rdg-row-height: 34px;
          --rdg-selection-color: #0D3D38;
          --rdg-font-size: 12px;
          --rdg-color: #1e293b;
          --rdg-border-color: #f1f5f9;
          --rdg-summary-border-color: #e2e8f0;
          --rdg-background-color: #fff;
          --rdg-row-hover-background-color: #f8fafc;
          --rdg-checkbox-color: #0D3D38;
          --rdg-checkbox-focus-color: #0D3D38;
          --rdg-checkbox-disabled-border-color: #cbd5e1;
          --rdg-checkbox-disabled-background-color: #f1f5f9;
          --rdg-cell-frozen-box-shadow: 2px 0 4px rgba(0,0,0,0.06);
        }
        .admin-grid .rdg-header-row {
          background: #f8fafc;
          color: #64748b;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          font-size: 10px;
          border-bottom: 1px solid #e2e8f0;
        }
        .admin-grid .rdg-header-row .rdg-cell {
          border-right-color: #e2e8f0;
          border-bottom-color: #e2e8f0;
          padding: 0;
        }
        .admin-grid .rdg-header-cell-content {
          width: 100%;
          box-sizing: border-box;
        }
        .admin-grid .rdg-row {
          border-bottom: 1px solid #f1f5f9;
        }
        .admin-grid .rdg-row:hover {
          background-color: #f8fafc !important;
        }
        .admin-grid .rdg-row[aria-selected="true"] {
          background-color: #f0fdfa !important;
        }
        .admin-grid .rdg-cell {
          padding: 0 10px;
          display: flex;
          align-items: center;
          border-right: 1px solid #f1f5f9;
        }
        .admin-grid .rdg-cell[aria-selected="true"] {
          outline: 2px solid #0D3D38;
          outline-offset: -2px;
        }
        .admin-grid .rdg-text-editor {
          font-size: 12px;
          padding: 0 10px;
          background: #fff;
          border: 2px solid #0D3D38;
        }
        .admin-grid .rdg-sort-icon {
          color: #0D3D38;
        }
      `}</style>
    </div>
    {/* ── Create Company panel (lifted above grid so it outlives cell editors) ── — rendered at AdminClient level so it outlives grid cell editors ── */}
    {createRequest && createPortal(
      <div style={{ position: "fixed", inset: 0, zIndex: 100000 }} onMouseDown={() => setCreateRequest(null)}>
        <div style={{ position: "fixed", right: 0, top: 0, bottom: 0, width: 380, background: "#fff", boxShadow: "-4px 0 32px rgba(0,0,0,0.15)", zIndex: 100001, display: "flex", flexDirection: "column", fontFamily: "inherit" }} onMouseDown={e => e.stopPropagation()}>
          <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", margin: 0 }}>Create Company</p>
              <p style={{ fontSize: 12, color: "#94a3b8", margin: "2px 0 0" }}>Fill in the details below</p>
            </div>
            <button onClick={() => setCreateRequest(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: 20, lineHeight: 1 }}>×</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Name *</label>
              <input value={cpName} onChange={e => setCpName(e.target.value)} autoFocus style={{ width: "100%", padding: "7px 10px", fontSize: 13, border: "1px solid #e2e8f0", borderRadius: 6, outline: "none", boxSizing: "border-box" as const }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Type</label>
              <select value={cpType} onChange={e => setCpType(e.target.value)} style={{ width: "100%", padding: "7px 10px", fontSize: 13, border: "1px solid #e2e8f0", borderRadius: 6, outline: "none", background: "#fff", boxSizing: "border-box" as const }}>
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
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Website</label>
              <input value={cpWebsite} onChange={e => setCpWebsite(e.target.value)} placeholder="https://..." style={{ width: "100%", padding: "7px 10px", fontSize: 13, border: "1px solid #e2e8f0", borderRadius: 6, outline: "none", boxSizing: "border-box" as const }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Description</label>
              <textarea value={cpDesc} onChange={e => setCpDesc(e.target.value)} rows={3} style={{ width: "100%", padding: "7px 10px", fontSize: 13, border: "1px solid #e2e8f0", borderRadius: 6, outline: "none", resize: "vertical", boxSizing: "border-box" as const }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>City</label>
                <input value={cpCity} onChange={e => setCpCity(e.target.value)} style={{ width: "100%", padding: "7px 10px", fontSize: 13, border: "1px solid #e2e8f0", borderRadius: 6, outline: "none", boxSizing: "border-box" as const }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Country</label>
                <input value={cpCountry} onChange={e => setCpCountry(e.target.value)} style={{ width: "100%", padding: "7px 10px", fontSize: 13, border: "1px solid #e2e8f0", borderRadius: 6, outline: "none", boxSizing: "border-box" as const }} />
              </div>
            </div>
          </div>
          <div style={{ padding: "16px 24px", borderTop: "1px solid #f1f5f9", display: "flex", gap: 10 }}>
            <button onClick={() => setCreateRequest(null)} style={{ flex: 1, padding: "9px", border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", fontSize: 13, color: "#64748b", cursor: "pointer", fontWeight: 500 }}>Cancel</button>
            <button onClick={handleCreatePanelSubmit} disabled={cpSaving || !cpName.trim()} style={{ flex: 1, padding: "9px", border: "none", borderRadius: 8, background: cpSaving || !cpName.trim() ? "#94a3b8" : "#2563eb", fontSize: 13, color: "#fff", cursor: cpSaving || !cpName.trim() ? "not-allowed" : "pointer", fontWeight: 600 }}>
              {cpSaving ? "Creating…" : "Create Company"}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}

    {/* Company detail panel */}
    {panelCompany && (
      <CompanyDetailPanel company={panelCompany} onClose={() => setPanelCompany(null)} />
    )}
    </>
  );
}
