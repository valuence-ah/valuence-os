"use client";
// ─── Feeds Three-Panel Layout ──────────────────────────────────────────────────
// Left: sources sidebar (190px)
// Center: all news with filter tabs + search
// Right: AI daily brief (380px) — only relevance_score >= 2

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Rss } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { FeedArticle, FeedSource } from "@/lib/types";
import { FeedsThesisPulse }  from "./feeds-thesis-pulse";
import { FeedsSourcePanel }  from "./feeds-source-panel";
import { FeedsNewsColumn }   from "./feeds-news-column";
import { FeedsBriefColumn }  from "./feeds-brief-column";

// ── Types ──────────────────────────────────────────────────────────────────────

interface KeywordStat {
  keyword: string;
  match_count: number;
}

// ── Debounce hook ──────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ── Brief summary ──────────────────────────────────────────────────────────────

function buildBriefSummary(articles: FeedArticle[]): string {
  if (articles.length === 0) return "Sync feeds to generate your daily brief.";
  const count = articles.length;
  const parts = articles.slice(0, 3).map(a => {
    if (a.ai_why_relevant) return a.ai_why_relevant.split(".")[0];
    if (a.deal_amount) return `${a.title} (${a.deal_amount})`;
    return a.title;
  });
  return `${count} signal${count !== 1 ? "s" : ""} worth your attention. ${parts.filter(Boolean).join(". ")}.`;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function FeedsClient() {
  const router = useRouter();

  // Data
  const [allArticles,    setAllArticles]    = useState<FeedArticle[]>([]);
  const [briefArticles,  setBriefArticles]  = useState<FeedArticle[]>([]);
  const [sources,        setSources]        = useState<FeedSource[]>([]);
  const [keywordStats,   setKeywordStats]   = useState<KeywordStat[]>([]);

  // Counts
  const [totalScanned,      setTotalScanned]      = useState(0);
  const [totalRelevant,     setTotalRelevant]      = useState(0);
  const [totalHighPriority, setTotalHighPriority]  = useState(0);

  // UI state
  const [loading,         setLoading]         = useState(true);
  const [syncing,         setSyncing]         = useState(false);
  const [bucketFilter,    setBucketFilter]    = useState("all");
  const [sourceFilter,    setSourceFilter]    = useState<string | null>(null);
  const [searchQuery,     setSearchQuery]     = useState("");
  const [showAddModal,    setShowAddModal]    = useState(false);
  const [addForm,         setAddForm]         = useState({ name: "", website_url: "", feed_url: "", keywords: "" });
  const [adding,          setAdding]          = useState(false);
  const [detecting,       setDetecting]       = useState(false);

  const debouncedSearch = useDebounce(searchQuery, 300);

  // ── Source name map ──────────────────────────────────────────────────────────

  const sourceMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of sources) m[s.id] = s.name;
    return m;
  }, [sources]);

  // ── Data fetchers ────────────────────────────────────────────────────────────

  const fetchAllArticles = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("feed_articles")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(200);
    setAllArticles(data ?? []);
  }, []);

  const fetchBriefArticles = useCallback(async () => {
    const supabase = createClient();
    try {
      const { data } = await supabase
        .from("feed_articles")
        .select("*")
        .gte("relevance_score", 2)
        .eq("dismissed", false)
        .order("relevance_score", { ascending: false })
        .order("published_at", { ascending: false })
        .limit(10);
      setBriefArticles(data ?? []);
    } catch {
      setBriefArticles([]);
    }
  }, []);

  const fetchSources = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("feed_sources")
      .select("*")
      .eq("active", true)
      .order("name");
    setSources(data ?? []);
  }, []);

  const fetchKeywordStats = useCallback(async () => {
    const supabase = createClient();
    try {
      const { data } = await supabase
        .from("thesis_keywords")
        .select("keyword, match_count")
        .eq("active", true)
        .gt("match_count", 0)
        .order("match_count", { ascending: false })
        .limit(16);
      setKeywordStats(data ?? []);
    } catch {
      setKeywordStats([]);
    }
  }, []);

  const fetchCounts = useCallback(async () => {
    const supabase = createClient();
    try {
      const { count: scanned } = await supabase
        .from("feed_articles")
        .select("id", { count: "exact", head: true });
      const { count: relevant } = await supabase
        .from("feed_articles")
        .select("id", { count: "exact", head: true })
        .gte("relevance_score", 2);
      const { count: high } = await supabase
        .from("feed_articles")
        .select("id", { count: "exact", head: true })
        .gte("relevance_score", 4);
      setTotalScanned(scanned ?? 0);
      setTotalRelevant(relevant ?? 0);
      setTotalHighPriority(high ?? 0);
    } catch { /* graceful */ }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      fetchAllArticles(),
      fetchBriefArticles(),
      fetchSources(),
      fetchKeywordStats(),
      fetchCounts(),
    ]);
  }, [fetchAllArticles, fetchBriefArticles, fetchSources, fetchKeywordStats, fetchCounts]);

  // Initial load
  useEffect(() => {
    setLoading(true);
    refreshAll().finally(() => setLoading(false));
  }, [refreshAll]);

  // ── Filtered articles (center column) ───────────────────────────────────────

  const filteredArticles = useMemo(() => {
    let result = allArticles;
    if (bucketFilter !== "all") {
      result = result.filter(a => a.bucket === bucketFilter);
    }
    if (sourceFilter) {
      result = result.filter(a => a.source_id === sourceFilter);
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      result = result.filter(a =>
        a.title?.toLowerCase().includes(q) ||
        a.summary?.toLowerCase().includes(q) ||
        (a.mentioned_companies ?? []).some(c => c.toLowerCase().includes(q))
      );
    }
    return result;
  }, [allArticles, bucketFilter, sourceFilter, debouncedSearch]);

  // ── Brief summary ────────────────────────────────────────────────────────────

  const briefSummary = useMemo(() => buildBriefSummary(briefArticles), [briefArticles]);

  // ── Sync handler ─────────────────────────────────────────────────────────────

  async function handleSync() {
    setSyncing(true);
    try {
      const fetchRes = await fetch("/api/feeds/fetch-all", { method: "POST" });
      if (!fetchRes.ok) console.error("[sync] fetch-all failed:", fetchRes.status);

      const catRes = await fetch("/api/feeds/categorize", { method: "POST" });
      if (!catRes.ok) console.error("[sync] categorize failed:", catRes.status);

      await refreshAll();
    } catch (err) {
      console.error("[sync] Error:", err);
    } finally {
      setSyncing(false);
    }
  }

  // ── Add to Pipeline ──────────────────────────────────────────────────────────

  async function handleAddToPipeline(article: FeedArticle) {
    const companyName = article.mentioned_companies?.[0];
    if (!companyName) {
      alert("No company name detected. Add manually from the Pipeline page.");
      return;
    }
    const supabase = createClient();
    const { data: existing } = await supabase
      .from("companies")
      .select("id")
      .ilike("name", `%${companyName}%`)
      .limit(1)
      .maybeSingle();

    if (existing) { router.push("/crm/pipeline"); return; }

    const { data: created, error } = await supabase
      .from("companies")
      .insert({
        name:        companyName,
        type:        "startup",
        types:       ["startup"],
        deal_status: "identified_introduced",
        sectors:     article.sectors?.length ? article.sectors : null,
        notes:       `Source: ${sourceMap[article.source_id ?? ""] ?? "feed"} — ${article.title}`,
      })
      .select("id")
      .single();

    if (error || !created) {
      console.error("[feeds] Create company error:", error);
      alert("Could not create company. Add manually from the Pipeline page.");
      return;
    }

    await supabase
      .from("feed_articles")
      .update({ matched_company_ids: [created.id] })
      .eq("id", article.id);

    setAllArticles(prev =>
      prev.map(a => a.id === article.id
        ? { ...a, matched_company_ids: [created.id] }
        : a
      )
    );
    router.push("/crm/pipeline");
  }

  // ── Add to Funds CRM ─────────────────────────────────────────────────────────

  async function handleAddToFunds(article: FeedArticle) {
    const fundName = article.mentioned_investors?.[0] ?? article.mentioned_companies?.[0];
    if (!fundName) {
      alert("No fund name detected. Add manually from the Funds page.");
      return;
    }
    const supabase = createClient();
    const { data: existing } = await supabase
      .from("companies")
      .select("id")
      .ilike("name", `%${fundName}%`)
      .in("type", ["investor", "lp", "limited partner"])
      .limit(1)
      .maybeSingle();

    if (existing) { router.push("/crm/funds"); return; }

    const { data: created, error } = await supabase
      .from("companies")
      .insert({
        name:  fundName,
        type:  "investor",
        types: ["investor"],
        notes: `Discovered via news feed: ${article.title}`,
      })
      .select("id")
      .single();

    if (error || !created) {
      alert(`Could not create fund "${fundName}". Add manually from the Funds page.`);
      return;
    }
    router.push("/crm/funds");
  }

  // ── Add source ───────────────────────────────────────────────────────────────

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
    } catch { /* silent */ } finally {
      setDetecting(false);
    }
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
        setSources(prev => [...prev, data]);
        setAddForm({ name: "", website_url: "", feed_url: "", keywords: "" });
        setShowAddModal(false);
      }
    } catch { /* silent */ } finally {
      setAdding(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col flex-1 overflow-hidden px-4 pb-4 pt-3 gap-3 min-h-0">
      {/* Thesis pulse — full width top bar */}
      <FeedsThesisPulse
        keywords={keywordStats}
        syncing={syncing}
        onSync={handleSync}
        onManageSources={() => setShowAddModal(true)}
      />

      {/* Three-panel layout */}
      <div className="flex flex-1 overflow-hidden border border-gray-200 rounded-lg bg-white min-h-0">
        <FeedsSourcePanel
          sources={sources}
          selectedSource={sourceFilter}
          onSelectSource={setSourceFilter}
        />
        <FeedsNewsColumn
          articles={filteredArticles}
          bucketFilter={bucketFilter}
          onBucketFilter={setBucketFilter}
          searchQuery={searchQuery}
          onSearch={setSearchQuery}
          sourceMap={sourceMap}
          loading={loading}
          onAddToPipeline={handleAddToPipeline}
          onAddToFunds={handleAddToFunds}
        />
        <FeedsBriefColumn
          summary={briefSummary}
          articles={briefArticles}
          totalScanned={totalScanned}
          totalRelevant={totalRelevant}
          totalHighPriority={totalHighPriority}
          sourceMap={sourceMap}
          onAddToPipeline={handleAddToPipeline}
          onAddToFunds={handleAddToFunds}
        />
      </div>

      {/* Add Feed Modal */}
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
              <h2 className="text-base font-semibold">Add News Source</h2>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddSource} className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Feed Name *</label>
                <input
                  required
                  placeholder="e.g. TechCrunch"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
                  value={addForm.name}
                  onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Website URL *</label>
                <div className="flex gap-2">
                  <input
                    required type="url"
                    placeholder="https://techcrunch.com"
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
                    value={addForm.website_url}
                    onChange={e => setAddForm(p => ({ ...p, website_url: e.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={handleDetectFeed}
                    disabled={detecting || !addForm.website_url}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    {detecting ? <Loader2 size={12} className="animate-spin" /> : <Rss size={12} />}
                    Detect
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">RSS Feed URL</label>
                <input
                  type="url"
                  placeholder="Auto-detected, or paste manually"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
                  value={addForm.feed_url}
                  onChange={e => setAddForm(p => ({ ...p, feed_url: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Keywords (comma-separated)</label>
                <input
                  placeholder="deep tech, biotech, cleantech"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400"
                  value={addForm.keywords}
                  onChange={e => setAddForm(p => ({ ...p, keywords: e.target.value }))}
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adding}
                  className="flex-1 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {adding ? <Loader2 size={14} className="animate-spin" /> : null}
                  {adding ? "Adding…" : "Add Source"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
