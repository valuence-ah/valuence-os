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
import { Search, Plus, Trash2, Shield, SlidersHorizontal, X, Filter, Sparkles, Rss } from "lucide-react";
import { AiConfigPanel } from "@/components/admin/ai-config-panel";
import { FeedsManager } from "@/components/admin/feeds-manager";

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

const TYPE_OPTIONS = ["startup","limited partner","investor","strategic partner","ecosystem_partner","other"];
const TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  "startup":           { bg: "#eff6ff", color: "#1d4ed8" },
  "limited partner":   { bg: "#f0fdf4", color: "#15803d" },
  "investor":          { bg: "#faf5ff", color: "#7e22ce" },
  "strategic partner": { bg: "#fff7ed", color: "#c2410c" },
  "ecosystem_partner": { bg: "#ecfdf5", color: "#065f46" },
  "other":             { bg: "#f8fafc", color: "#64748b" },
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
      const rect = cellRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 220) });
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
              {v}
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
                  <span style={{ fontSize: 12, padding: "1px 8px", borderRadius: 9999, background: c.bg, color: c.color, fontWeight: 500 }}>{opt}</span>
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

const CONTACT_TYPE_OPTIONS = ["Advisor / KOL","Ecosystem","Employee","Founder / Mgmt","Government/Academic","Investor","Lawyer","Limited Partner","Other","Strategic"];
const CONTACT_TYPE_COLORS: Record<string, { bg: string; color: string }> = {
  "Advisor / KOL":       { bg: "#fef3c7", color: "#92400e" },
  "Ecosystem":           { bg: "#ecfdf5", color: "#065f46" },
  "Employee":            { bg: "#eff6ff", color: "#1d4ed8" },
  "Founder / Mgmt":      { bg: "#faf5ff", color: "#7e22ce" },
  "Government/Academic": { bg: "#f0f9ff", color: "#0369a1" },
  "Investor":            { bg: "#fff7ed", color: "#c2410c" },
  "Lawyer":              { bg: "#fdf4ff", color: "#86198f" },
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
      const rect = cellRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 220) });
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

// ─── CompanyPickerCell: searchable company FK picker for contacts ──────────────

function CompanyPickerCell({ row, companiesRef, setCompanies, onSaved }: {
  row: ContactRow;
  companiesRef: React.RefObject<CompanyRow[]>;
  setCompanies: React.Dispatch<React.SetStateAction<CompanyRow[]>>;
  onSaved: (id: string, companyId: string | null, companyName: string | null) => void;
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
      const rect = cellRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 260) });
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
      setPos({ top: rect.bottom + 4, left: rect.left });
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

// ─── Main component ───────────────────────────────────────────────────────────

interface AdminClientProps {
  initialCompanies: Company[];
  initialContacts: (Contact & { company: { name: string } | null })[];
}

export function AdminClient({ initialCompanies, initialContacts }: AdminClientProps) {
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<"companies" | "contacts" | "ai_config" | "feeds">("companies");
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
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", padding: "0 6px" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#1e293b" }}>{row.name}</span>
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
        renderEditCell: renderTextEditor,
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
          <button
            onClick={() => { setActiveTab("feeds"); setSearch(""); }}
            className={`px-3 py-1.5 border-l border-slate-200 transition-colors flex items-center gap-1 ${
              activeTab === "feeds"
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            <Rss size={11} /> Feeds
          </button>
        </div>

        {/* Search — hidden on feeds tab */}
        <div className={`relative flex-1 max-w-xs ${activeTab === "feeds" ? "invisible" : ""}`}>
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
                  <FilterField label="Type" filterKey="types" isCompanyTab={true} options={["startup","limited partner","investor","strategic partner","ecosystem_partner","other"]} />
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

      {/* ── Grid or AI Config panel or Feeds ── */}
      <div className="flex-1 overflow-hidden admin-grid">
        {activeTab === "feeds" ? (
          <FeedsManager />
        ) : isAiConfig ? (
          <AiConfigPanel />
        ) : isCompanies ? (
          <DataGrid<CompanyRow, unknown, string>
            columns={finalCompanyColumns}
            rows={filteredCompanies}
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
            className="rdg-light"
            style={{ height: "calc(100vh - 108px)", blockSize: "calc(100vh - 108px)" }}
          />
        ) : (
          <DataGrid<ContactRow, unknown, string>
            columns={finalContactColumns}
            rows={filteredContacts}
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
