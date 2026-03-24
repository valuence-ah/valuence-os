// ─── GET /api/feeds/fetch-all
// Called by Vercel Cron every 6 hours. Fetches all active feed sources.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Parser from "rss-parser";

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml,*/*;q=0.8",
  },
});

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const supabase = await createClient();

  // Load all active sources
  const { data: sources, error } = await supabase
    .from("feed_sources")
    .select("*")
    .eq("active", true);

  if (error || !sources) {
    return NextResponse.json({ error: "Failed to load sources" }, { status: 500 });
  }

  const results: { id: string; name: string; inserted: number; error?: string }[] = [];

  for (const source of sources) {
    const feedUrl = source.feed_url || `${source.website_url.replace(/\/$/, "")}/feed`;
    try {
      const feed = await parser.parseURL(feedUrl);
      const keywords: string[] = source.keywords ?? [];

      const items = (feed.items ?? [])
        .filter((item) => {
          if (keywords.length === 0) return true;
          const text = `${item.title ?? ""} ${item.contentSnippet ?? ""}`.toLowerCase();
          return keywords.some((k: string) => text.includes(k.toLowerCase()));
        })
        .map((item) => ({
          source_id: source.id,
          title: item.title ?? "(no title)",
          url: item.link ?? item.guid ?? "",
          summary: item.contentSnippet?.slice(0, 500) ?? null,
          published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
          tags: [] as string[],
        }))
        .filter((a) => a.url);

      const { data: inserted } = await supabase
        .from("feed_articles")
        .upsert(items, { onConflict: "url", ignoreDuplicates: true })
        .select("id");

      const { count } = await supabase
        .from("feed_articles")
        .select("id", { count: "exact", head: true })
        .eq("source_id", source.id);

      await supabase
        .from("feed_sources")
        .update({ last_fetched_at: new Date().toISOString(), article_count: count ?? 0, updated_at: new Date().toISOString() })
        .eq("id", source.id);

      results.push({ id: source.id, name: source.name, inserted: inserted?.length ?? 0 });
    } catch (err) {
      results.push({ id: source.id, name: source.name, inserted: 0, error: String(err) });
    }
  }

  return NextResponse.json({ ok: true, results, ran_at: new Date().toISOString() });
}
