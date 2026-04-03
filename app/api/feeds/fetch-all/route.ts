// ─── POST /api/feeds/fetch-all ─────────────────────────────────────────────────
// Fetches all active RSS sources in parallel (max 8 concurrent).
// Each source has a 2-attempt fallback: direct fetch, then allorigins proxy.
// Skips rss2json (too slow). Inserts new articles; updates source stats.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Parser from "rss-parser";

const parser = new Parser();
export const dynamic    = "force-dynamic";
export const maxDuration = 60;

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":     "text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

interface NormItem { title: string; link: string; pubDate: string; snippet: string; }

async function fetchItems(feedUrl: string): Promise<NormItem[]> {
  // Attempt 1: direct fetch (8s timeout)
  try {
    const res = await fetch(feedUrl, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const xml = await res.text();
      if (xml.trim().startsWith("<")) {
        const feed = await parser.parseString(xml);
        return (feed.items ?? []).map(i => ({
          title:   i.title ?? "(no title)",
          link:    i.link ?? i.guid ?? "",
          pubDate: i.pubDate ?? "",
          snippet: (i.contentSnippet ?? "").slice(0, 500),
        }));
      }
    }
  } catch { /* fall through */ }

  // Attempt 2: allorigins.win proxy (10s timeout)
  try {
    const aoRes = await fetch(
      `https://api.allorigins.win/raw?url=${encodeURIComponent(feedUrl)}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (aoRes.ok) {
      const xml = await aoRes.text();
      if (xml.trim().startsWith("<")) {
        const feed = await parser.parseString(xml);
        return (feed.items ?? []).map(i => ({
          title:   i.title ?? "(no title)",
          link:    i.link ?? i.guid ?? "",
          pubDate: i.pubDate ?? "",
          snippet: (i.contentSnippet ?? "").slice(0, 500),
        }));
      }
    }
  } catch { /* fall through */ }

  return []; // Give up gracefully — don't throw
}

// Run promises with a concurrency limit
async function pMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency = 8
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map(fn));
    for (const r of settled) {
      results.push(r.status === "fulfilled" ? r.value : (undefined as unknown as R));
    }
  }
  return results;
}

export async function GET() {
  const supabase = await createClient();
  const { data: sources, error } = await supabase
    .from("feed_sources")
    .select("*")
    .eq("active", true);

  if (error || !sources) {
    return NextResponse.json({ error: "Failed to load sources" }, { status: 500 });
  }

  // Process all sources in parallel (8 at a time)
  const results = await pMap(sources, async (source) => {
    const feedUrl = source.feed_url || `${(source.website_url ?? "").replace(/\/$/, "")}/feed`;
    try {
      const rawItems = await fetchItems(feedUrl);
      const keywords: string[] = source.keywords ?? [];
      const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago
      const items = rawItems
        .filter(i => {
          // Only articles from the last 24 hours (or undated)
          if (i.pubDate) {
            const pub = new Date(i.pubDate).getTime();
            if (!isNaN(pub) && pub < cutoff) return false;
          }
          // Keyword filter
          if (keywords.length === 0) return true;
          const t = `${i.title} ${i.snippet}`.toLowerCase();
          return keywords.some(k => t.includes(k.toLowerCase()));
        })
        .map(i => ({
          source_id:    source.id,
          title:        i.title,
          url:          i.link,
          summary:      i.snippet || null,
          published_at: i.pubDate ? new Date(i.pubDate).toISOString() : null,
          tags:         [] as string[],
        }))
        .filter(a => a.url);

      let insertedCount = 0;
      if (items.length > 0) {
        const { data: inserted } = await supabase
          .from("feed_articles")
          .upsert(items, { onConflict: "url", ignoreDuplicates: true })
          .select("id");
        insertedCount = inserted?.length ?? 0;
      }

      // Update source stats
      const { count } = await supabase
        .from("feed_articles")
        .select("id", { count: "exact", head: true })
        .eq("source_id", source.id);
      await supabase
        .from("feed_sources")
        .update({ last_fetched_at: new Date().toISOString(), article_count: count ?? 0, updated_at: new Date().toISOString() })
        .eq("id", source.id);

      return { id: source.id, name: source.name, inserted: insertedCount };
    } catch (err) {
      return { id: source.id, name: source.name, inserted: 0, error: String(err) };
    }
  }, 8);

  return NextResponse.json({ ok: true, results, ran_at: new Date().toISOString() });
}

// Allow POST for manual triggers from the UI
export const POST = GET;
