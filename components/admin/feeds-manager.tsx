"use client";
// ─── Feeds Manager ─────────────────────────────────────────────────────────────
// Admin panel tab for managing RSS / scraper feed sources and viewing articles.

import { useState, useEffect, useCallback } from "react";
import { Rss, Plus, Trash2, RefreshCw, ExternalLink, CheckCircle2, XCircle, Loader2, Globe, ChevronDown, ChevronUp, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface FeedSource {
  id: string;
  name: string;
  website_url: string;
  feed_url: string | null;
  type: "rss" | "scraper";
  active: boolean;
  keywords: string[];
  last_fetched_at: string | null;
  article_count: number;
  created_at: string;
}

interface FeedArticle {
  id: string;
  source_id: string;
  title: string;
  url: string;
  summary: string | null;
  published_at: string | null;
  tags: string[];
  fetched_at: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Add Feed Modal ─────────────────────────────────────────────────────────────

function AddFeedModal({ onClose, onAdded }: { onClose: () => void; onAdded: (src: FeedSource) => void }) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [feedUrl, setFeedUrl] = useState("");
  const [keywords, setKeywords] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function detect() {
    if (!url.trim()) return;
    setDetecting(true);
    setDetected(null);
    setError("");
    try {
      const res = await fetch("/api/feeds/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (data.feed_url) {
        setFeedUrl(data.feed_url);
        setDetected(true);
        // Auto-fill name from domain if empty
        if (!name.trim()) {
          try { setName(new URL(url.trim()).hostname.replace("www.", "")); } catch {}
        }
      } else {
        setDetected(false);
        setError("Could not auto-detect RSS feed. Enter the feed URL manually.");
      }
    } catch {
      setDetected(false);
      setError("Detection failed. Check the URL and try again.");
    } finally {
      setDetecting(false);
    }
  }

  async function save() {
    if (!name.trim() || !url.trim()) { setError("Name and website URL are required"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          website_url: url.trim(),
          feed_url: feedUrl.trim() || null,
          type: "rss",
          keywords: keywords.split(",").map(k => k.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const src = await res.json();
      onAdded(src);
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Add Feed Source</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>
        <div className="px-5 py-4 space-y-4">

          {/* Website URL + detect */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Website URL</label>
            <div className="flex gap-2">
              <input
                value={url}
                onChange={e => setUrl(e.target.value)}
                onBlur={() => url.trim() && detect()}
                placeholder="https://example.com"
                className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
              />
              <button
                onClick={detect}
                disabled={!url.trim() || detecting}
                className="px-3 py-1.5 text-xs bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
              >
                {detecting ? <Loader2 size={12} className="animate-spin" /> : <Globe size={12} />}
                Detect feed
              </button>
            </div>
            {detected === true && (
              <p className="mt-1 text-xs text-emerald-600 flex items-center gap-1">
                <CheckCircle2 size={11} /> RSS feed detected automatically
              </p>
            )}
            {detected === false && (
              <p className="mt-1 text-xs text-amber-600 flex items-center gap-1">
                <XCircle size={11} /> Not detected — enter feed URL manually below
              </p>
            )}
          </div>

          {/* Feed URL (manual override) */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Feed URL <span className="text-slate-400 font-normal">(auto-filled or enter manually)</span>
            </label>
            <input
              value={feedUrl}
              onChange={e => setFeedUrl(e.target.value)}
              placeholder="https://example.com/feed"
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
            />
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Display Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. TechCrunch"
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
            />
          </div>

          {/* Keywords */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Keywords <span className="text-slate-400 font-normal">(comma-separated, optional — filter articles)</span>
            </label>
            <input
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder="e.g. raises, seed round, series A"
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
        <div className="flex gap-2 px-5 py-3 border-t border-slate-100">
          <button onClick={onClose} className="flex-1 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !name.trim() || !url.trim()}
            className="flex-1 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : null}
            Add Source
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Articles Drawer ────────────────────────────────────────────────────────────

function ArticlesDrawer({ source, onClose }: { source: FeedSource; onClose: () => void }) {
  const [articles, setArticles] = useState<FeedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/feeds/articles?source_id=${source.id}&limit=200`);
        const data = await res.json();
        setArticles(data ?? []);
      } catch {
        setArticles([]);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [source.id]);

  const filtered = articles.filter(a =>
    !search.trim() ||
    a.title.toLowerCase().includes(search.toLowerCase()) ||
    (a.summary ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex justify-end">
      <div className="bg-white w-full max-w-xl h-full flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">{source.name} — Articles</h2>
            <p className="text-xs text-slate-400">{source.article_count} total · last fetched {relativeTime(source.last_fetched_at)}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
        </div>
        <div className="px-4 py-3 border-b border-slate-100 flex-shrink-0">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search articles…"
              className="w-full pl-7 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 size={18} className="animate-spin text-slate-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-sm text-slate-400">
              {search ? "No matching articles" : "No articles fetched yet — click Fetch Now"}
            </div>
          ) : (
            filtered.map(a => (
              <div key={a.id} className="px-4 py-3 hover:bg-slate-50">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <a href={a.url} target="_blank" rel="noreferrer"
                      className="text-sm font-medium text-slate-800 hover:text-blue-600 leading-snug line-clamp-2">
                      {a.title}
                    </a>
                    {a.summary && (
                      <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{a.summary}</p>
                    )}
                    <p className="text-[10px] text-slate-300 mt-1">{fmtDate(a.published_at)}</p>
                  </div>
                  <a href={a.url} target="_blank" rel="noreferrer"
                    className="text-slate-300 hover:text-blue-500 flex-shrink-0 mt-0.5">
                    <ExternalLink size={13} />
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main FeedsManager ──────────────────────────────────────────────────────────

export function FeedsManager() {
  const [sources, setSources] = useState<FeedSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [fetching, setFetching] = useState<Record<string, boolean>>({});
  const [fetchResults, setFetchResults] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [viewArticles, setViewArticles] = useState<FeedSource | null>(null);
  const [expandedKeywords, setExpandedKeywords] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/feeds");
      const data = await res.json();
      setSources(data ?? []);
    } catch {
      setSources([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleActive(src: FeedSource) {
    const res = await fetch(`/api/feeds/${src.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !src.active }),
    });
    if (res.ok) {
      const updated = await res.json();
      setSources(prev => prev.map(s => s.id === src.id ? updated : s));
    }
  }

  async function fetchNow(src: FeedSource) {
    setFetching(f => ({ ...f, [src.id]: true }));
    setFetchResults(r => ({ ...r, [src.id]: "" }));
    try {
      const res = await fetch(`/api/feeds/${src.id}/fetch`, { method: "POST" });
      const data = await res.json();
      const msg = data.inserted !== undefined
        ? `+${data.inserted} new · ${data.total} total`
        : data.error ?? "Done";
      setFetchResults(r => ({ ...r, [src.id]: msg }));
      // Refresh source data
      await load();
    } catch {
      setFetchResults(r => ({ ...r, [src.id]: "Error" }));
    } finally {
      setFetching(f => ({ ...f, [src.id]: false }));
    }
  }

  async function deleteSrc(id: string) {
    await fetch(`/api/feeds/${id}`, { method: "DELETE" });
    setSources(prev => prev.filter(s => s.id !== id));
    setConfirmDelete(null);
  }

  async function fetchAll() {
    for (const src of sources.filter(s => s.active)) {
      await fetchNow(src);
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-5 py-3 bg-white border-b border-slate-200 flex-shrink-0">
        <Rss size={15} className="text-orange-500" />
        <span className="text-sm font-semibold text-slate-700">Feed Sources</span>
        <span className="text-xs text-slate-400">{sources.length} source{sources.length !== 1 ? "s" : ""} · {sources.filter(s => s.active).length} active</span>
        <div className="flex-1" />
        <button
          onClick={fetchAll}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw size={12} /> Fetch All
        </button>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700"
        >
          <Plus size={13} /> Add Feed
        </button>
      </div>

      {/* Source list */}
      <div className="flex-1 overflow-y-auto p-5">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={20} className="animate-spin text-slate-400" />
          </div>
        ) : sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-slate-400">
            <Rss size={32} className="opacity-30" />
            <p className="text-sm">No feed sources yet</p>
            <button onClick={() => setShowAdd(true)} className="text-xs text-blue-600 hover:underline">
              + Add your first feed
            </button>
          </div>
        ) : (
          <div className="grid gap-3">
            {sources.map(src => (
              <div key={src.id} className={cn(
                "bg-white rounded-xl border p-4 transition-colors",
                src.active ? "border-slate-200" : "border-slate-100 opacity-60"
              )}>
                <div className="flex items-start gap-3">

                  {/* Icon */}
                  <div className={cn(
                    "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                    src.active ? "bg-orange-50" : "bg-slate-100"
                  )}>
                    <Rss size={16} className={src.active ? "text-orange-500" : "text-slate-400"} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-800">{src.name}</span>
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                        src.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                      )}>
                        {src.active ? "Active" : "Paused"}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium uppercase">
                        {src.type}
                      </span>
                    </div>
                    <a href={src.website_url} target="_blank" rel="noreferrer"
                      className="text-xs text-slate-400 hover:text-blue-500 flex items-center gap-1 mt-0.5">
                      {src.website_url} <ExternalLink size={10} />
                    </a>
                    {src.feed_url && (
                      <p className="text-[10px] text-slate-300 mt-0.5 truncate">
                        Feed: {src.feed_url}
                      </p>
                    )}

                    {/* Keywords */}
                    {src.keywords && src.keywords.length > 0 && (
                      <div className="mt-1.5">
                        <button
                          onClick={() => setExpandedKeywords(e => ({ ...e, [src.id]: !e[src.id] }))}
                          className="text-[10px] text-slate-400 flex items-center gap-0.5 hover:text-slate-600"
                        >
                          {src.keywords.length} keyword{src.keywords.length !== 1 ? "s" : ""}
                          {expandedKeywords[src.id] ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                        </button>
                        {expandedKeywords[src.id] && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {src.keywords.map(k => (
                              <span key={k} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                                {k}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Stats row */}
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400">
                      <span>{src.article_count} articles</span>
                      <span>·</span>
                      <span>Last fetched: {relativeTime(src.last_fetched_at)}</span>
                      {fetchResults[src.id] && (
                        <>
                          <span>·</span>
                          <span className="text-emerald-600 font-medium">{fetchResults[src.id]}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {/* View articles */}
                    <button
                      onClick={() => setViewArticles(src)}
                      className="px-2 py-1.5 text-[10px] font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200"
                    >
                      Articles
                    </button>

                    {/* Fetch now */}
                    <button
                      onClick={() => fetchNow(src)}
                      disabled={fetching[src.id]}
                      className="px-2 py-1.5 text-[10px] font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50 flex items-center gap-1"
                    >
                      {fetching[src.id]
                        ? <Loader2 size={10} className="animate-spin" />
                        : <RefreshCw size={10} />}
                      Fetch
                    </button>

                    {/* Toggle active */}
                    <button
                      onClick={() => toggleActive(src)}
                      className={cn(
                        "px-2 py-1.5 text-[10px] font-medium rounded-lg",
                        src.active
                          ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                          : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                      )}
                    >
                      {src.active ? "Pause" : "Resume"}
                    </button>

                    {/* Delete */}
                    {confirmDelete === src.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => deleteSrc(src.id)}
                          className="px-2 py-1.5 text-[10px] font-medium rounded-lg bg-red-500 text-white hover:bg-red-600">
                          Delete
                        </button>
                        <button onClick={() => setConfirmDelete(null)}
                          className="px-2 py-1.5 text-[10px] rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(src.id)}
                        className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg hover:bg-red-50"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAdd && (
        <AddFeedModal
          onClose={() => setShowAdd(false)}
          onAdded={src => setSources(prev => [src, ...prev])}
        />
      )}
      {viewArticles && (
        <ArticlesDrawer source={viewArticles} onClose={() => setViewArticles(null)} />
      )}
    </div>
  );
}
