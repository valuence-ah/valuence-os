"use client";
// ─── Thesis Keywords Admin Panel ───────────────────────────────────────────────

import { useState, useEffect, useCallback } from "react";
import { Plus, X, RefreshCw, Loader2, Check } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

interface ThesisKeyword {
  id: string;
  keyword: string;
  category: string;
  source: string;
  active: boolean;
  match_count: number;
  last_matched_at: string | null;
  created_at: string;
}

// ── Category config ────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: "cleantech",          label: "Cleantech" },
  { value: "biotech",            label: "Biotech" },
  { value: "advanced_materials", label: "Advanced Materials" },
  { value: "enabling_tech",      label: "Enabling Tech" },
  { value: "general",            label: "General" },
] as const;

type Category = (typeof CATEGORIES)[number]["value"];

const PILL_COLORS: Record<Category, string> = {
  cleantech:          "bg-emerald-50 text-emerald-800 border border-emerald-300",
  biotech:            "bg-purple-50 text-purple-800 border border-purple-300",
  advanced_materials: "bg-blue-50 text-blue-800 border border-blue-300",
  enabling_tech:      "bg-amber-50 text-amber-800 border border-amber-300",
  general:            "bg-gray-100 text-gray-700 border border-gray-300",
};

// ── Component ──────────────────────────────────────────────────────────────────

export function ThesisKeywordsPanel() {
  const [keywords,    setKeywords]    = useState<ThesisKeyword[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [syncing,     setSyncing]     = useState(false);
  const [syncResult,  setSyncResult]  = useState<string | null>(null);

  // Add form
  const [newKeyword,  setNewKeyword]  = useState("");
  const [newCategory, setNewCategory] = useState<Category>("cleantech");
  const [adding,      setAdding]      = useState(false);
  const [addError,    setAddError]    = useState<string | null>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchKeywords = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/thesis-keywords");
      const data: ThesisKeyword[] = await res.json();
      setKeywords(Array.isArray(data) ? data : []);
    } catch {
      // silent
    }
    setLoading(false);
  }, []);

  useEffect(() => { void fetchKeywords(); }, [fetchKeywords]);

  // ── Add keyword ────────────────────────────────────────────────────────────

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const kw = newKeyword.trim();
    if (!kw) return;

    setAdding(true);
    setAddError(null);

    const res = await fetch("/api/thesis-keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: kw, category: newCategory }),
    });

    if (res.ok) {
      const created: ThesisKeyword = await res.json();
      setKeywords(prev => [...prev, created].sort((a, b) =>
        a.category.localeCompare(b.category) || a.keyword.localeCompare(b.keyword)
      ));
      setNewKeyword("");
    } else {
      const data: { error?: string } = await res.json().catch(() => ({}));
      setAddError(data.error ?? "Failed to add keyword");
    }
    setAdding(false);
  }

  // ── Delete keyword ─────────────────────────────────────────────────────────

  async function handleDelete(id: string) {
    setKeywords(prev => prev.filter(k => k.id !== id));
    await fetch(`/api/thesis-keywords?id=${id}`, { method: "DELETE" }).catch(() => {});
  }

  // ── Sync from pipeline ────────────────────────────────────────────────────

  async function handleSyncPipeline() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res  = await fetch("/api/thesis-keywords/sync-pipeline", { method: "POST" });
      const data: { added?: number; error?: string } = await res.json();
      if (data.added !== undefined) {
        setSyncResult(`${data.added} new keyword${data.added !== 1 ? "s" : ""} added from pipeline`);
        await fetchKeywords();
      } else {
        setSyncResult(data.error ?? "Sync failed");
      }
    } catch {
      setSyncResult("Sync failed");
    }
    setSyncing(false);
    setTimeout(() => setSyncResult(null), 4000);
  }

  // ── Group by category ──────────────────────────────────────────────────────

  const manualKeywords   = keywords.filter(k => k.source !== "pipeline" && k.active);
  const pipelineKeywords = keywords.filter(k => k.source === "pipeline"  && k.active);

  const byCategory = CATEGORIES.map(cat => ({
    ...cat,
    keywords: manualKeywords.filter(k => k.category === cat.value),
  })).filter(cat => cat.keywords.length > 0);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-8 max-w-3xl">

      {/* ── Add keyword ──────────────────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-3">
          Add Keyword
        </p>
        <form onSubmit={handleAdd} className="flex gap-2 items-start">
          <input
            type="text"
            placeholder="Add a thesis keyword…"
            value={newKeyword}
            onChange={e => setNewKeyword(e.target.value)}
            className="flex-1 px-3 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-colors"
          />
          <select
            value={newCategory}
            onChange={e => setNewCategory(e.target.value as Category)}
            className="px-3 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-colors"
          >
            {CATEGORIES.map(cat => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={adding || !newKeyword.trim()}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add
          </button>
        </form>
        {addError && (
          <p className="text-xs text-red-500 mt-1.5">{addError}</p>
        )}
      </div>

      {/* ── Keywords by category ─────────────────────────────────────────── */}
      {byCategory.length > 0 && (
        <div className="space-y-5">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">
            Thesis Keywords
          </p>
          {byCategory.map(cat => (
            <div key={cat.value}>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-2">
                {cat.label}
              </p>
              <div className="flex flex-wrap gap-2">
                {cat.keywords.map(kw => (
                  <span
                    key={kw.id}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${
                      PILL_COLORS[kw.category as Category] ?? PILL_COLORS.general
                    }`}
                  >
                    {kw.keyword}
                    {kw.match_count > 0 && (
                      <span className="opacity-60 text-[10px]">({kw.match_count})</span>
                    )}
                    <button
                      onClick={() => handleDelete(kw.id)}
                      className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Auto-extracted from pipeline ─────────────────────────────────── */}
      <div>
        <div className="flex items-start justify-between mb-1">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">
              Auto-extracted from Pipeline
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Keywords derived from your pipeline companies. Updated on sync.
            </p>
          </div>
          <button
            onClick={handleSyncPipeline}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {syncing
              ? <Loader2 size={12} className="animate-spin" />
              : <RefreshCw size={12} />
            }
            Sync from pipeline
          </button>
        </div>

        {syncResult && (
          <div className="flex items-center gap-1.5 text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 mt-2">
            <Check size={12} /> {syncResult}
          </div>
        )}

        {pipelineKeywords.length > 0 ? (
          <div className="flex flex-wrap gap-2 mt-3">
            {pipelineKeywords.map(kw => (
              <span
                key={kw.id}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full ${
                  PILL_COLORS[kw.category as Category] ?? PILL_COLORS.general
                }`}
              >
                {kw.keyword}
                {kw.match_count > 0 && (
                  <span className="opacity-60 text-[10px]">({kw.match_count})</span>
                )}
                <button
                  onClick={() => handleDelete(kw.id)}
                  className="ml-0.5 opacity-50 hover:opacity-100 transition-opacity"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400 mt-3 italic">
            No pipeline-sourced keywords yet. Click &quot;Sync from pipeline&quot; to extract.
          </p>
        )}
      </div>
    </div>
  );
}
