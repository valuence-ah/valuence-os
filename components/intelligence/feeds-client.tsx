"use client";
// ─── Daily Intelligence Brief ──────────────────────────────────────────────────
// Replaces the old flat news feed with a curated AI brief.
// Only shows articles with relevance_score >= 2.

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Plus, X, Loader2, Rss, Newspaper } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeedArticle, FeedSource } from "@/lib/types";
import { BriefSignalCard }   from "./brief-signal-card";
import { BriefDismissed }    from "./brief-dismissed";
import { BriefThesisPulse }  from "./brief-thesis-pulse";

// ── Types ──────────────────────────────────────────────────────────────────────

type BriefBucket = "startup_round" | "fund_raise" | "ma_partnership";

interface KeywordStat {
  keyword: string;
  match_count: number;
}

interface BriefCounts {
  total: number;
  sources: number;
  passed: number;
  high: number;
}

// ── Bucket config ──────────────────────────────────────────────────────────────

const BUCKET_CONFIG: Record<BriefBucket, { label: string; dot: string }> = {
  startup_round:  { label: "Startup rounds",      dot: "bg-teal-500"   },
  fund_raise:     { label: "Fund launches + raises", dot: "bg-purple-500" },
  ma_partnership: { label: "M&A + partnerships",  dot: "bg-orange-500" },
};

// ── Brief summary (template-based, no API call) ────────────────────────────────

function generateBriefSummary(articles: FeedArticle[]): string {
  if (articles.length === 0) return "No new signals today matching your thesis.";
  const count = articles.length;
  const top = articles.slice(0, 3);
  const parts = top.map(a => {
    if (a.ai_why_relevant) return a.ai_why_relevant.split(".")[0];
    if (a.deal_amount)     return `${a.title} (${a.deal_amount})`;
    return a.title;
  });
  return `${count} signal${count > 1 ? "s" : ""} worth your attention today. ${parts.filter(Boolean).join(". ")}.`;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function FeedsClient() {
  const router = useRouter();

  // Core data
  const [relevantArticles,  setRelevantArticles]  = useState<FeedArticle[]>([]);
  const [dismissedArticles, setDismissedArticles] = useState<Pick<FeedArticle, "id" | "title" | "ai_why_relevant">[]>([]);
  const [keywordStats,      setKeywordStats]      = useState<KeywordStat[]>([]);
  const [sources,           setSources]           = useState<FeedSource[]>([]);
  const [counts,            setCounts]            = useState<BriefCounts>({ total: 0, sources: 0, passed: 0, high: 0 });

  // UI state
  const [loading,     setLoading]     = useState(true);
  const [syncing,     setSyncing]     = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm,     setAddForm]     = useState({ name: "", website_url: "", feed_url: "", keywords: "" });
  const [adding,      setAdding]      = useState(false);
  const [detecting,   setDetecting]   = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayISO = todayStart.toISOString();

    const [
      relevantRes,
      dismissedRes,
      sourcesRes,
      kwRes,
    ] = await Promise.all([
      fetch("/api/feeds/brief?type=relevant").then(r => r.json()).catch(() => []),
      fetch(`/api/feeds/brief?type=dismissed&since=${encodeURIComponent(todayISO)}`).then(r => r.json()).catch(() => []),
      fetch("/api/feeds").then(r => r.json()).catch(() => []),
      fetch("/api/thesis-keywords?active=true").then(r => r.json()).catch(() => []),
    ]);

    const relevant: FeedArticle[] = Array.isArray(relevantRes) ? relevantRes : [];
    const dismissed: Pick<FeedArticle, "id" | "title" | "ai_why_relevant">[] = Array.isArray(dismissedRes) ? dismissedRes : [];
    const srcs: FeedSource[] = Array.isArray(sourcesRes) ? sourcesRes : [];
    const kws: KeywordStat[] = Array.isArray(kwRes)
      ? kwRes
          .filter((k: { match_count: number }) => k.match_count > 0)
          .sort((a: KeywordStat, b: KeywordStat) => b.match_count - a.match_count)
          .slice(0, 12)
      : [];

    setRelevantArticles(relevant);
    setDismissedArticles(dismissed);
    setSources(srcs);
    setKeywordStats(kws);
    setCounts({
      total:   relevant.length + dismissed.length,
      sources: srcs.length,
      passed:  relevant.length,
      high:    relevant.filter(a => (a.relevance_score ?? 0) >= 4).length,
    });

    setLoading(false);
  }, []);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // ── Source map ─────────────────────────────────────────────────────────────

  const sourceMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of sources) m[s.id] = s.name;
    return m;
  }, [sources]);

  // ── Group by bucket ────────────────────────────────────────────────────────

  const bucketGroups = useMemo(() => {
    const groups: Record<BriefBucket, FeedArticle[]> = {
      startup_round:  [],
      fund_raise:     [],
      ma_partnership: [],
    };
    for (const a of relevantArticles) {
      const b = a.bucket as BriefBucket;
      if (groups[b]) groups[b].push(a);
    }
    return groups;
  }, [relevantArticles]);

  // ── Brief summary ──────────────────────────────────────────────────────────

  const briefSummary = useMemo(() => generateBriefSummary(relevantArticles), [relevantArticles]);

  // ── Sync handler ───────────────────────────────────────────────────────────

  async function handleSync() {
    setSyncing(true);
    try {
      await fetch("/api/feeds/fetch-all", { method: "POST" });
      // Wait a moment for categorize to fire (it's fire-and-forget on the server)
      await new Promise(r => setTimeout(r, 3000));
      await fetchData();
    } catch { /* silent */ }
    setSyncing(false);
  }

  // ── Dismiss handler ────────────────────────────────────────────────────────

  async function handleDismiss(article: FeedArticle) {
    // Optimistic update
    setRelevantArticles(prev => prev.filter(a => a.id !== article.id));
    setDismissedArticles(prev => [...prev, {
      id: article.id,
      title: article.title,
      ai_why_relevant: article.ai_why_relevant,
    }]);

    await fetch(`/api/feeds/${article.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dismissed: true }),
    }).catch(() => {});
  }

  // ── Add to Pipeline ────────────────────────────────────────────────────────

  async function handleAddToPipeline(article: FeedArticle) {
    const companyName = article.mentioned_companies?.[0];
    if (!companyName) return;

    const checkRes = await fetch(`/api/search/companies?q=${encodeURIComponent(companyName)}&limit=1`);
    const existing: Array<{ id: string }> = await checkRes.json().catch(() => []);
    if (existing?.[0]) {
      router.push("/crm/pipeline");
      return;
    }

    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:        companyName,
        type:        "startup",
        types:       ["startup"],
        deal_status: "identified_introduced",
        sectors:     article.sectors?.length ? article.sectors : null,
        notes:       `Discovered via news feed: ${article.title}`,
      }),
    });
    const newCo: { id?: string } = await res.json().catch(() => ({}));
    if (newCo.id) {
      await fetch(`/api/feeds/${article.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matched_company_ids: [newCo.id] }),
      }).catch(() => {});
      router.push("/crm/pipeline");
    }
  }

  // ── Add to Funds CRM ───────────────────────────────────────────────────────

  async function handleAddToFunds(article: FeedArticle) {
    const fundName = article.mentioned_investors?.[0] ?? article.mentioned_companies?.[0];
    if (!fundName) return;

    const checkRes = await fetch(`/api/search/companies?q=${encodeURIComponent(fundName)}&limit=1`);
    const existing: Array<{ id: string }> = await checkRes.json().catch(() => []);
    if (existing?.[0]) {
      router.push("/crm/funds");
      return;
    }

    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:  fundName,
        type:  "investor",
        types: ["investor"],
        notes: `Discovered via news feed: ${article.title}`,
      }),
    });
    const newFund: { id?: string } = await res.json().catch(() => ({}));
    if (newFund.id) router.push("/crm/funds");
  }

  // ── Add source handlers ────────────────────────────────────────────────────

  async function handleDetectFeed() {
    if (!addForm.website_url) return;
    setDetecting(true);
    try {
      const res = await fetch("/api/feeds/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: addForm.website_url }),
      });
      const data: { feed_url?: string } = await res.json();
      if (data.feed_url) setAddForm(p => ({ ...p, feed_url: data.feed_url! }));
    } catch { /* silent */ }
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
          name:        addForm.name,
          website_url: addForm.website_url,
          feed_url:    addForm.feed_url || null,
          keywords:    addForm.keywords.split(",").map(k => k.trim()).filter(Boolean),
        }),
      });
      const data: FeedSource = await res.json();
      if (data.id) {
        setSources(prev => [data, ...prev]);
        setAddForm({ name: "", website_url: "", feed_url: "", keywords: "" });
        setShowAddModal(false);
      }
    } catch { /* silent */ }
    setAdding(false);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const hasAnySignals = relevantArticles.length > 0;

  return (
    <div className="flex-1 overflow-y-auto bg-gray-50">
      <div className="max-w-3xl mx-auto px-6 py-6">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">News Feeds</h1>
            <p className="text-sm text-gray-500 mt-0.5">RSS and news feeds across your sectors</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-200 text-gray-600 rounded-lg bg-white hover:bg-gray-50 transition-colors"
            >
              <Plus size={13} />
              Manage sources
            </button>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 px-3 py-1.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={cn(syncing && "animate-spin")} />
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          </div>
        </div>

        {loading ? (
          // ── Skeleton ─────────────────────────────────────────────────────
          <div className="space-y-4">
            <div className="bg-gray-100 rounded-xl h-28 animate-pulse" />
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white border border-gray-200 rounded-lg p-4 space-y-2 animate-pulse">
                <div className="flex gap-2">
                  <div className="h-4 w-16 bg-gray-200 rounded-full" />
                  <div className="h-4 w-12 bg-gray-100 rounded-full" />
                </div>
                <div className="h-4 w-3/4 bg-gray-200 rounded" />
                <div className="h-10 bg-gray-100 rounded-lg" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* ── AI Daily Brief block ───────────────────────────────────── */}
            <div className="bg-gray-50 rounded-xl p-5 mb-6 border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                  AI daily brief
                </p>
                <p className="text-xs text-gray-400">
                  {new Date().toLocaleDateString("en-US", {
                    weekday: "long",
                    month:   "long",
                    day:     "numeric",
                    year:    "numeric",
                  })}
                </p>
              </div>
              <p className="text-sm text-gray-900 leading-relaxed mb-3">
                {briefSummary}
              </p>
              <p className="text-xs text-gray-400">
                {counts.total} articles scanned from {counts.sources} sources.
                {" "}{counts.passed} passed relevance filter.
                {" "}{counts.high > 0 ? `${counts.high} flagged as high priority.` : ""}
              </p>
            </div>

            {/* ── No signals state ───────────────────────────────────────── */}
            {!hasAnySignals ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Newspaper size={28} className="text-gray-300 mb-3" />
                <p className="text-sm font-medium text-gray-500">No curated signals yet</p>
                <p className="text-xs text-gray-400 mt-1 max-w-xs">
                  Sync your feeds to fetch articles. Relevant signals (score ≥ 2) will appear here after AI categorization.
                </p>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  className="mt-4 flex items-center gap-2 px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw size={14} className={cn(syncing && "animate-spin")} />
                  {syncing ? "Syncing…" : "Sync now"}
                </button>
              </div>
            ) : (
              <>
                {/* ── Bucket sections ──────────────────────────────────── */}
                {(["startup_round", "fund_raise", "ma_partnership"] as BriefBucket[]).map(bucket => {
                  const articles = bucketGroups[bucket];
                  if (articles.length === 0) return null;
                  const cfg = BUCKET_CONFIG[bucket];

                  return (
                    <div key={bucket} className="mb-8">
                      {/* Bucket header */}
                      <div className="flex items-center gap-2.5 mb-3 mt-2">
                        <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                        <p className="text-[15px] font-medium text-gray-900">{cfg.label}</p>
                        <span className="text-xs text-gray-400">
                          {articles.length} relevant today
                        </span>
                      </div>

                      {/* Cards */}
                      <div className="space-y-3">
                        {articles.map(article => (
                          <BriefSignalCard
                            key={article.id}
                            article={article}
                            sourceName={article.source_id ? sourceMap[article.source_id] : undefined}
                            onDismiss={handleDismiss}
                            onAddToPipeline={handleAddToPipeline}
                            onAddToFunds={handleAddToFunds}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* ── Dismissed section ────────────────────────────────────── */}
            <BriefDismissed articles={dismissedArticles} />

            {/* ── Thesis Pulse ─────────────────────────────────────────── */}
            <BriefThesisPulse keywordStats={keywordStats} />
          </>
        )}
      </div>

      {/* ── Add Feed Modal ──────────────────────────────────────────────────── */}
      {showAddModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-md"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-base font-semibold">Add News Feed</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddSource} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Feed Name *
                </label>
                <input
                  required
                  placeholder="e.g. TechCrunch"
                  className="w-full px-3 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-colors"
                  value={addForm.name}
                  onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Website URL *
                </label>
                <div className="flex gap-2">
                  <input
                    required
                    type="url"
                    placeholder="https://techcrunch.com"
                    className="flex-1 px-3 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-colors"
                    value={addForm.website_url}
                    onChange={e => setAddForm(p => ({ ...p, website_url: e.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={handleDetectFeed}
                    disabled={detecting || !addForm.website_url}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-gray-50 text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50"
                  >
                    {detecting ? <Loader2 size={12} className="animate-spin" /> : <Rss size={12} />}
                    Detect
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  RSS/Atom Feed URL
                </label>
                <input
                  type="url"
                  placeholder="https://techcrunch.com/feed/ (auto-detected)"
                  className="w-full px-3 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-colors"
                  value={addForm.feed_url}
                  onChange={e => setAddForm(p => ({ ...p, feed_url: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                  Keywords (comma-separated)
                </label>
                <input
                  placeholder="deep tech, biotech, cleantech"
                  className="w-full px-3 py-2 text-sm text-gray-700 border border-gray-200 rounded-lg bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-colors"
                  value={addForm.keywords}
                  onChange={e => setAddForm(p => ({ ...p, keywords: e.target.value }))}
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adding}
                  className="flex-1 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
                >
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
