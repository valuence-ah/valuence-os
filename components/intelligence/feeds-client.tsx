"use client";
// ─── News Feeds Client ─────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from "react";
import { ExternalLink, Plus, RefreshCw, Rss, Search, Star, Trash2, X, Loader2, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

interface FeedSource {
  id: string;
  name: string;
  website_url: string;
  feed_url: string | null;
  type: string;
  keywords: string[];
  is_active: boolean;
  last_fetched_at: string | null;
  article_count: number;
  created_at: string;
}

interface FeedArticle {
  id: string;
  source_id: string | null;
  title: string;
  url: string;
  summary: string | null;
  published_at: string | null;
  author: string | null;
  tags: string[];
  relevance_score: number | null;
  is_read: boolean;
  is_starred: boolean;
  created_at: string;
}

export function FeedsClient() {
  const [sources, setSources]         = useState<FeedSource[]>([]);
  const [articles, setArticles]       = useState<FeedArticle[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [search, setSearch]           = useState("");
  const [showUnread, setShowUnread]   = useState(false);
  const [showStarred, setShowStarred] = useState(false);
  const [refreshing, setRefreshing]   = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm]         = useState({ name: "", website_url: "", feed_url: "", keywords: "" });
  const [adding, setAdding]           = useState(false);
  const [detecting, setDetecting]     = useState(false);

  // Load sources and articles
  useEffect(() => {
    fetch("/api/feeds")
      .then(r => r.json())
      .then(data => { setSources(Array.isArray(data) ? data : []); setLoadingSources(false); })
      .catch(() => setLoadingSources(false));

    fetch("/api/feeds/articles?limit=200")
      .then(r => r.json())
      .then(data => { setArticles(Array.isArray(data) ? data : []); setLoadingArticles(false); })
      .catch(() => setLoadingArticles(false));
  }, []);

  const filtered = useMemo(() => {
    let rows = articles;
    if (selectedSource) rows = rows.filter(a => a.source_id === selectedSource);
    if (showUnread) rows = rows.filter(a => !a.is_read);
    if (showStarred) rows = rows.filter(a => a.is_starred);
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(a => a.title.toLowerCase().includes(q) || (a.summary ?? "").toLowerCase().includes(q));
    }
    return rows;
  }, [articles, selectedSource, showUnread, showStarred, search]);

  const unreadCount = articles.filter(a => !a.is_read).length;
  const starredCount = articles.filter(a => a.is_starred).length;

  async function handleRefresh(sourceId?: string) {
    setRefreshing(sourceId ?? "all");
    try {
      if (sourceId) {
        await fetch(`/api/feeds/${sourceId}/fetch`, { method: "POST" });
      } else {
        await fetch("/api/feeds/fetch-all", { method: "POST" });
      }
      // Reload articles
      const data = await fetch("/api/feeds/articles?limit=200").then(r => r.json());
      setArticles(Array.isArray(data) ? data : []);
      // Reload sources to update counts
      const srcs = await fetch("/api/feeds").then(r => r.json());
      setSources(Array.isArray(srcs) ? srcs : []);
    } catch {}
    setRefreshing(null);
  }

  async function handleMarkRead(articleId: string) {
    setArticles(prev => prev.map(a => a.id === articleId ? { ...a, is_read: true } : a));
    await fetch(`/api/feeds/${articleId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_read: true }) }).catch(() => {});
  }

  async function handleToggleStar(articleId: string, current: boolean) {
    setArticles(prev => prev.map(a => a.id === articleId ? { ...a, is_starred: !current } : a));
    await fetch(`/api/feeds/${articleId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_starred: !current }) }).catch(() => {});
  }

  async function handleDetectFeed() {
    if (!addForm.website_url) return;
    setDetecting(true);
    try {
      const res = await fetch("/api/feeds/detect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: addForm.website_url }) });
      const data = await res.json();
      if (data.feed_url) setAddForm(p => ({ ...p, feed_url: data.feed_url, name: p.name || data.name || p.name }));
    } catch {}
    setDetecting(false);
  }

  async function handleAddSource(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      const res = await fetch("/api/feeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addForm.name,
          website_url: addForm.website_url,
          feed_url: addForm.feed_url || null,
          keywords: addForm.keywords.split(",").map(k => k.trim()).filter(Boolean),
        }),
      });
      const data = await res.json();
      if (data.id) {
        setSources(prev => [data, ...prev]);
        setAddForm({ name: "", website_url: "", feed_url: "", keywords: "" });
        setShowAddModal(false);
      }
    } catch {}
    setAdding(false);
  }

  async function handleDeleteSource(sourceId: string) {
    if (!confirm("Remove this feed source? All its articles will be deleted.")) return;
    await fetch(`/api/feeds/${sourceId}`, { method: "DELETE" }).catch(() => {});
    setSources(prev => prev.filter(s => s.id !== sourceId));
    setArticles(prev => prev.filter(a => a.source_id !== sourceId));
    if (selectedSource === sourceId) setSelectedSource(null);
  }

  function timeAgo(dateStr: string | null): string {
    if (!dateStr) return "—";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* ── Left sidebar: feed sources ── */}
      <div className="w-64 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Feed Sources</h2>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleRefresh()}
              disabled={refreshing === "all"}
              title="Refresh all feeds"
              className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={cn(refreshing === "all" && "animate-spin")} />
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="p-1.5 text-slate-400 hover:text-blue-600 transition-colors"
              title="Add feed"
            >
              <Plus size={13} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {/* All / Unread / Starred */}
          <div className="px-2 mb-2 space-y-0.5">
            <button
              onClick={() => { setSelectedSource(null); setShowUnread(false); setShowStarred(false); }}
              className={cn("w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between",
                !selectedSource && !showUnread && !showStarred ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-600 hover:bg-slate-50"
              )}
            >
              <span className="flex items-center gap-2"><Rss size={14} /> All Articles</span>
              <span className="text-xs text-slate-400">{articles.length}</span>
            </button>
            {unreadCount > 0 && (
              <button
                onClick={() => { setSelectedSource(null); setShowUnread(true); setShowStarred(false); }}
                className={cn("w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between",
                  showUnread ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-600 hover:bg-slate-50"
                )}
              >
                <span>Unread</span>
                <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5 font-medium">{unreadCount}</span>
              </button>
            )}
            {starredCount > 0 && (
              <button
                onClick={() => { setSelectedSource(null); setShowUnread(false); setShowStarred(true); }}
                className={cn("w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between",
                  showStarred ? "bg-amber-50 text-amber-700 font-medium" : "text-slate-600 hover:bg-slate-50"
                )}
              >
                <span className="flex items-center gap-2"><Star size={14} /> Starred</span>
                <span className="text-xs text-slate-400">{starredCount}</span>
              </button>
            )}
          </div>

          <div className="px-2 mb-1">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-3 py-1">Sources</p>
          </div>

          {loadingSources ? (
            <div className="flex justify-center py-8"><Loader2 size={16} className="animate-spin text-slate-300" /></div>
          ) : sources.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <Globe size={24} className="mx-auto text-slate-300 mb-2" />
              <p className="text-xs text-slate-400">No feeds yet</p>
              <button onClick={() => setShowAddModal(true)} className="mt-2 text-xs text-blue-600 hover:text-blue-700">Add one →</button>
            </div>
          ) : (
            <div className="px-2 space-y-0.5">
              {sources.map(source => (
                <div
                  key={source.id}
                  className={cn(
                    "group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm",
                    selectedSource === source.id ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"
                  )}
                  onClick={() => { setSelectedSource(source.id === selectedSource ? null : source.id); setShowUnread(false); setShowStarred(false); }}
                >
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium text-xs">{source.name}</p>
                    {source.last_fetched_at && (
                      <p className="text-[10px] text-slate-400">{timeAgo(source.last_fetched_at)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={e => { e.stopPropagation(); handleRefresh(source.id); }}
                      disabled={refreshing === source.id}
                      className="p-1 text-slate-400 hover:text-blue-600"
                    >
                      <RefreshCw size={11} className={cn(refreshing === source.id && "animate-spin")} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleDeleteSource(source.id); }}
                      className="p-1 text-slate-400 hover:text-red-500"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                  {source.article_count > 0 && (
                    <span className="text-[10px] text-slate-400 ml-1 group-hover:hidden">{source.article_count}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Main: articles ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-slate-200 bg-white flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search articles…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <span className="text-xs text-slate-400">{filtered.length} articles</span>
        </div>

        {/* Articles list */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {loadingArticles ? (
            <div className="flex justify-center items-center h-32">
              <Loader2 size={20} className="animate-spin text-slate-300" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-slate-400">
              <Rss size={32} className="mb-3 opacity-30" />
              <p className="text-sm font-medium">No articles found</p>
              {sources.length === 0 && (
                <button onClick={() => setShowAddModal(true)} className="mt-3 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
                  Add your first feed
                </button>
              )}
            </div>
          ) : (
            filtered.map(article => (
              <div
                key={article.id}
                className={cn("px-5 py-4 hover:bg-slate-50/60 transition-colors", article.is_read && "opacity-60")}
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {!article.is_read && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0 mt-1" />}
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => handleMarkRead(article.id)}
                        className="text-sm font-semibold text-slate-800 hover:text-blue-600 leading-snug line-clamp-2"
                      >
                        {article.title}
                      </a>
                    </div>
                    {article.summary && (
                      <p className="text-xs text-slate-500 leading-relaxed line-clamp-2 mt-0.5">{article.summary}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                      {article.source_id && (
                        <span>{sources.find(s => s.id === article.source_id)?.name ?? "—"}</span>
                      )}
                      {article.author && <span>{article.author}</span>}
                      {article.published_at && <span>{timeAgo(article.published_at)}</span>}
                      {article.tags && article.tags.length > 0 && (
                        article.tags.slice(0, 3).map(t => (
                          <span key={t} className="px-1.5 py-0.5 bg-slate-100 rounded text-[10px]">{t}</span>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => handleToggleStar(article.id, article.is_starred)}
                      className={cn("p-1.5 rounded transition-colors", article.is_starred ? "text-amber-500" : "text-slate-300 hover:text-amber-400")}
                    >
                      <Star size={14} fill={article.is_starred ? "currentColor" : "none"} />
                    </button>
                    <a href={article.url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-slate-300 hover:text-blue-600 transition-colors">
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Add Feed Modal ── */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-base font-semibold">Add News Feed</h2>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>
            <form onSubmit={handleAddSource} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Feed Name *</label>
                <input required placeholder="e.g. TechCrunch" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20" value={addForm.name} onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Website URL *</label>
                <div className="flex gap-2">
                  <input required type="url" placeholder="https://techcrunch.com" className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20" value={addForm.website_url} onChange={e => setAddForm(p => ({ ...p, website_url: e.target.value }))} />
                  <button type="button" onClick={handleDetectFeed} disabled={detecting || !addForm.website_url} className="px-3 py-2 text-xs font-medium bg-slate-50 text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50 flex items-center gap-1.5">
                    {detecting ? <Loader2 size={12} className="animate-spin" /> : <Rss size={12} />}
                    Detect
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">RSS/Atom Feed URL</label>
                <input type="url" placeholder="https://techcrunch.com/feed/ (auto-detected or paste manually)" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20" value={addForm.feed_url} onChange={e => setAddForm(p => ({ ...p, feed_url: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Keywords (comma-separated)</label>
                <input placeholder="deep tech, biotech, cleantech, climate" className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20" value={addForm.keywords} onChange={e => setAddForm(p => ({ ...p, keywords: e.target.value }))} />
                <p className="text-xs text-slate-400 mt-1">Articles matching these keywords will be highlighted</p>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 py-2.5 border border-slate-200 text-slate-700 text-sm rounded-lg hover:bg-slate-50">Cancel</button>
                <button type="submit" disabled={adding} className="flex-1 py-2.5 bg-blue-600 text-white text-sm rounded-lg disabled:opacity-50 flex items-center justify-center gap-2">
                  {adding ? <Loader2 size={14} className="animate-spin" /> : null}
                  {adding ? "Adding…" : "Add Feed"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
