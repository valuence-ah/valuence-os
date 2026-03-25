// ─── GET /api/feeds/fetch-all
// Vercel Cron — fetches all active sources with three-tier fallback:
//   1. Direct fetch with browser headers
//   2. allorigins.win raw proxy
//   3. rss2json.com JSON proxy

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Parser from "rss-parser";

const parser = new Parser();
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://www.google.com/",
};

interface NormItem { title: string; link: string; pubDate: string; snippet: string; }

async function fetchItems(feedUrl: string): Promise<NormItem[]> {
  // Attempt 1: direct fetch
  try {
    const res = await fetch(feedUrl, { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(12000) });
    if (res.ok) {
      const xml = await res.text();
      const feed = await parser.parseString(xml);
      return (feed.items ?? []).map(i => ({ title: i.title ?? "(no title)", link: i.link ?? i.guid ?? "", pubDate: i.pubDate ?? "", snippet: (i.contentSnippet ?? "").slice(0, 500) }));
    }
  } catch {}

  // Attempt 2: allorigins.win raw proxy
  try {
    const aoRes = await fetch(
      `https://api.allorigins.win/raw?url=${encodeURIComponent(feedUrl)}`,
      { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15000) }
    );
    if (aoRes.ok) {
      const xml = await aoRes.text();
      if (xml.trim().startsWith("<")) {
        const feed = await parser.parseString(xml);
        return (feed.items ?? []).map(i => ({ title: i.title ?? "(no title)", link: i.link ?? i.guid ?? "", pubDate: i.pubDate ?? "", snippet: (i.contentSnippet ?? "").slice(0, 500) }));
      }
    }
  } catch {}

  // Attempt 3: rss2json.com proxy
  const proxyRes = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}&count=50`, { signal: AbortSignal.timeout(12000) });
  if (!proxyRes.ok) throw new Error(`All proxies failed — last HTTP ${proxyRes.status}`);
  const data = await proxyRes.json() as { status: string; items?: Array<{ title?: string; link?: string; pubDate?: string; description?: string }> };
  if (data.status !== "ok" || !data.items) throw new Error(`rss2json error: ${data.status}`);
  return data.items.map(i => ({ title: i.title ?? "(no title)", link: i.link ?? "", pubDate: i.pubDate ?? "", snippet: (i.description ?? "").replace(/<[^>]+>/g, "").slice(0, 500) }));
}

export async function GET() {
  const supabase = await createClient();
  const { data: sources, error } = await supabase.from("feed_sources").select("*").eq("active", true);
  if (error || !sources) return NextResponse.json({ error: "Failed to load sources" }, { status: 500 });

  const results: { id: string; name: string; inserted: number; error?: string }[] = [];

  for (const source of sources) {
    const feedUrl = source.feed_url || `${source.website_url.replace(/\/$/, "")}/feed`;
    try {
      const rawItems = await fetchItems(feedUrl);
      const keywords: string[] = source.keywords ?? [];
      const items = rawItems
        .filter(i => { if (keywords.length === 0) return true; const t = `${i.title} ${i.snippet}`.toLowerCase(); return keywords.some(k => t.includes(k.toLowerCase())); })
        .map(i => ({ source_id: source.id, title: i.title, url: i.link, summary: i.snippet || null, published_at: i.pubDate ? new Date(i.pubDate).toISOString() : null, tags: [] as string[] }))
        .filter(a => a.url);

      const { data: inserted } = await supabase.from("feed_articles").upsert(items, { onConflict: "url", ignoreDuplicates: true }).select("id");
      const { count } = await supabase.from("feed_articles").select("id", { count: "exact", head: true }).eq("source_id", source.id);
      await supabase.from("feed_sources").update({ last_fetched_at: new Date().toISOString(), article_count: count ?? 0, updated_at: new Date().toISOString() }).eq("id", source.id);
      results.push({ id: source.id, name: source.name, inserted: inserted?.length ?? 0 });
    } catch (err) {
      results.push({ id: source.id, name: source.name, inserted: 0, error: String(err) });
    }
  }

  return NextResponse.json({ ok: true, results, ran_at: new Date().toISOString() });
}
