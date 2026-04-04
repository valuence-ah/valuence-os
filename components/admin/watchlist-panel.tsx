"use client";
// ─── Watchlist Panel ──────────────────────────────────────────────────────────
// Admin CRUD for feed_watchlist: add, edit keywords, toggle notify, delete.
// Lives in Admin → Watchlist tab.

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Plus, Trash2, Save, X, Search, RefreshCw, Bell, BellOff,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeedWatchlistItem, FeedWatchlistType } from "@/lib/types";

const TYPE_OPTIONS: { value: FeedWatchlistType; label: string; cls: string }[] = [
  { value: "fund",        label: "Fund",        cls: "bg-blue-50   text-blue-700   border-blue-200"   },
  { value: "accelerator", label: "Accelerator", cls: "bg-purple-50 text-purple-700 border-purple-200" },
  { value: "corporate",   label: "Corporate",   cls: "bg-amber-50  text-amber-700  border-amber-200"  },
  { value: "keyword",     label: "Keyword",     cls: "bg-gray-50   text-gray-700   border-gray-200"   },
];

function TypeBadge({ type }: { type: FeedWatchlistType }) {
  const opt = TYPE_OPTIONS.find(o => o.value === type) ?? TYPE_OPTIONS[3];
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded border", opt.cls)}>
      {opt.label}
    </span>
  );
}

// ── Add / Edit Modal ──────────────────────────────────────────────────────────
interface ModalProps {
  item?: FeedWatchlistItem | null;
  onClose: () => void;
  onSaved: (item: FeedWatchlistItem) => void;
}

function WatchlistModal({ item, onClose, onSaved }: ModalProps) {
  const supabase = createClient();
  const isEdit = !!item;

  const [name, setName]         = useState(item?.name ?? "");
  const [type, setType]         = useState<FeedWatchlistType>(item?.type ?? "fund");
  const [kwInput, setKwInput]   = useState((item?.keywords ?? []).join(", "));
  const [notify, setNotify]     = useState(item?.notify ?? true);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) { setError("Name is required."); return; }
    setSaving(true);
    setError(null);

    const keywords = kwInput
      .split(",")
      .map(k => k.trim())
      .filter(Boolean);

    const payload = { name: name.trim(), type, keywords, notify };

    if (isEdit && item) {
      const { data, error: err } = await supabase
        .from("feed_watchlist")
        .update(payload)
        .eq("id", item.id)
        .select()
        .single();
      if (err) { setError(err.message); setSaving(false); return; }
      onSaved(data as FeedWatchlistItem);
    } else {
      // Check for existing entry with same name (case-insensitive)
      const { data: existing } = await supabase
        .from("feed_watchlist")
        .select("id, keywords")
        .ilike("name", name.trim())
        .maybeSingle();

      if (existing) {
        // Merge keywords and update instead of creating a duplicate
        const merged = Array.from(new Set([...(existing.keywords ?? []), ...keywords]));
        const { data, error: err } = await supabase
          .from("feed_watchlist")
          .update({ type, keywords: merged, notify })
          .eq("id", existing.id)
          .select()
          .single();
        if (err) { setError(err.message); setSaving(false); return; }
        onSaved(data as FeedWatchlistItem);
      } else {
        const { data, error: err } = await supabase
          .from("feed_watchlist")
          .insert(payload)
          .select()
          .single();
        if (err) { setError(err.message); setSaving(false); return; }
        onSaved(data as FeedWatchlistItem);
      }
    }
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-800">
            {isEdit ? "Edit watchlist entry" : "Add to watchlist"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Breakthrough Energy Ventures"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Type
            </label>
            <div className="relative">
              <select
                value={type}
                onChange={e => setType(e.target.value as FeedWatchlistType)}
                className="w-full appearance-none px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white pr-8"
              >
                {TYPE_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Keywords */}
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Keywords <span className="text-gray-400 font-normal normal-case">(comma-separated)</span>
            </label>
            <textarea
              rows={3}
              value={kwInput}
              onChange={e => setKwInput(e.target.value)}
              placeholder="e.g. Breakthrough Energy, BEV, Breakthrough Energy Ventures"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Articles matching any keyword will be flagged as watchlist activity.
            </p>
          </div>

          {/* Notify toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <button
              type="button"
              onClick={() => setNotify(v => !v)}
              className={cn(
                "relative inline-flex h-5 w-9 rounded-full transition-colors",
                notify ? "bg-blue-600" : "bg-gray-200"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 h-4 w-4 bg-white rounded-full shadow transition-transform",
                  notify ? "translate-x-4" : "translate-x-0"
                )}
              />
            </button>
            <span className="text-sm text-gray-700">Flag matching articles</span>
          </label>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? <RefreshCw size={12} className="animate-spin" /> : <Save size={12} />}
            {isEdit ? "Save changes" : "Add entry"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────
export function WatchlistPanel() {
  const supabase = createClient();

  const [items, setItems]           = useState<FeedWatchlistItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [typeFilter, setTypeFilter] = useState<FeedWatchlistType | "all">("all");
  const [modal, setModal]           = useState<{ open: boolean; item?: FeedWatchlistItem | null }>({ open: false });
  const [deleteId, setDeleteId]     = useState<string | null>(null);
  const [deleting, setDeleting]     = useState(false);
  const [deduping, setDeduping]     = useState(false);
  const [dedupMsg, setDedupMsg]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("feed_watchlist")
      .select("*")
      .order("name");
    setItems((data as FeedWatchlistItem[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  // Filtered view
  const filtered = items.filter(item => {
    const matchSearch = !search || item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.keywords.some(k => k.toLowerCase().includes(search.toLowerCase()));
    const matchType = typeFilter === "all" || item.type === typeFilter;
    return matchSearch && matchType;
  });

  // Counts per type
  const counts = items.reduce<Record<string, number>>((acc, i) => {
    acc[i.type] = (acc[i.type] ?? 0) + 1;
    return acc;
  }, {});

  function handleSaved(saved: FeedWatchlistItem) {
    setItems(prev => {
      const idx = prev.findIndex(i => i.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved].sort((a, b) => a.name.localeCompare(b.name));
    });
  }

  async function handleToggleNotify(item: FeedWatchlistItem) {
    const { data } = await supabase
      .from("feed_watchlist")
      .update({ notify: !item.notify })
      .eq("id", item.id)
      .select()
      .single();
    if (data) handleSaved(data as FeedWatchlistItem);
  }

  async function handleDeduplicate() {
    setDeduping(true);
    setDedupMsg(null);
    try {
      const res = await fetch("/api/admin/deduplicate-watchlist", { method: "POST" });
      const data = await res.json() as { message?: string };
      setDedupMsg(data.message ?? "Done.");
      await load();
    } catch {
      setDedupMsg("Deduplication failed.");
    }
    setDeduping(false);
  }

  async function confirmDelete() {
    if (!deleteId) return;
    setDeleting(true);
    await supabase.from("feed_watchlist").delete().eq("id", deleteId);
    setItems(prev => prev.filter(i => i.id !== deleteId));
    setDeleteId(null);
    setDeleting(false);
  }

  return (
    <div className="h-full flex flex-col bg-slate-50">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-slate-200 flex-wrap flex-shrink-0">
        {/* Search */}
        <div className="relative w-56">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name or keyword…"
            className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>

        {/* Type filter pills */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setTypeFilter("all")}
            className={cn(
              "px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors",
              typeFilter === "all"
                ? "bg-slate-700 text-white border-slate-700"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            )}
          >
            All ({items.length})
          </button>
          {TYPE_OPTIONS.map(o => (
            <button
              key={o.value}
              onClick={() => setTypeFilter(prev => prev === o.value ? "all" : o.value)}
              className={cn(
                "px-2.5 py-1 text-[11px] font-medium rounded-full border transition-colors",
                typeFilter === o.value ? o.cls : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
              )}
            >
              {o.label} {counts[o.value] ? `(${counts[o.value]})` : ""}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        <span className="text-xs text-slate-400">{filtered.length} entr{filtered.length !== 1 ? "ies" : "y"}</span>

        <button
          onClick={load}
          className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>

        <button
          onClick={handleDeduplicate}
          disabled={deduping}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-amber-300 text-amber-700 bg-amber-50 rounded-md hover:bg-amber-100 transition-colors disabled:opacity-50"
          title="Merge duplicate entries"
        >
          <RefreshCw size={12} className={deduping ? "animate-spin" : ""} />
          Deduplicate
        </button>

        <button
          onClick={() => setModal({ open: true, item: null })}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus size={13} /> Add Entry
        </button>
      </div>
      {dedupMsg && (
        <div className="px-5 py-1.5 bg-amber-50 border-b border-amber-200 text-[11px] text-amber-800">{dedupMsg}</div>
      )}

      {/* ── Table ── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-sm text-slate-400">
            <RefreshCw size={16} className="animate-spin mr-2" /> Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400">
            <p className="text-sm">No entries found.</p>
            {search && <p className="text-xs mt-1">Try clearing your search.</p>}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white border-b border-slate-200 z-10">
              <tr>
                <th className="text-left px-4 py-2.5 font-semibold text-slate-500 w-[200px]">Name</th>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-500 w-[110px]">Type</th>
                <th className="text-left px-3 py-2.5 font-semibold text-slate-500">Keywords</th>
                <th className="text-center px-3 py-2.5 font-semibold text-slate-500 w-[80px]">Flagging</th>
                <th className="text-right px-4 py-2.5 font-semibold text-slate-500 w-[80px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(item => (
                <tr key={item.id} className="hover:bg-white transition-colors group">
                  {/* Name */}
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-slate-800">{item.name}</span>
                  </td>

                  {/* Type */}
                  <td className="px-3 py-2.5">
                    <TypeBadge type={item.type} />
                  </td>

                  {/* Keywords */}
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {item.keywords.length === 0 ? (
                        <span className="text-slate-400 italic">—</span>
                      ) : (
                        item.keywords.map(kw => (
                          <span
                            key={kw}
                            className="inline-flex items-center px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px]"
                          >
                            {kw}
                          </span>
                        ))
                      )}
                    </div>
                  </td>

                  {/* Notify toggle */}
                  <td className="px-3 py-2.5 text-center">
                    <button
                      onClick={() => handleToggleNotify(item)}
                      title={item.notify ? "Flagging on — click to disable" : "Flagging off — click to enable"}
                      className={cn(
                        "p-1 rounded transition-colors",
                        item.notify
                          ? "text-blue-600 hover:bg-blue-50"
                          : "text-slate-300 hover:bg-slate-50 hover:text-slate-500"
                      )}
                    >
                      {item.notify ? <Bell size={14} /> : <BellOff size={14} />}
                    </button>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setModal({ open: true, item })}
                        className="p-1 text-slate-400 hover:text-blue-600 rounded transition-colors"
                        title="Edit"
                      >
                        <Save size={13} />
                      </button>
                      <button
                        onClick={() => setDeleteId(item.id)}
                        className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Add / Edit modal ── */}
      {modal.open && (
        <WatchlistModal
          item={modal.item}
          onClose={() => setModal({ open: false })}
          onSaved={handleSaved}
        />
      )}

      {/* ── Delete confirm ── */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Remove from watchlist?</h3>
            <p className="text-xs text-gray-500 mb-5">
              This entry will be removed. Articles already flagged won&apos;t be changed.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setDeleteId(null)}
                className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
