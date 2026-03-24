// ─── POST /api/feeds/[id]/fetch
// Fetches the RSS feed for a given source, upserts new articles into feed_articles,
// updates article_count + last_fetched_at on the source.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Parser from "rss-parser";

const parser = new Parser({
  timeout: 10000,
  headers: {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml,*/*;q=0.8",
  },
});

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  // Load the feed source
  const { data: source, error: srcErr } = await supabase
    .from("feed_sources")
    .select("*")
    .eq("id", id)
    .single();

  if (srcErr || !source) {
    return NextResponse.json({ error: "Feed source not found" }, { status: 404 });
  }

  const feedUrl = source.feed_url || `${source.website_url.replace(/\/$/, "")}/feed`;

  // Parse the RSS feed
  let feed;
  try {
    feed = await parser.parseURL(feedUrl);
  } catch (err) {
    return NextResponse.json({ error: `Failed to fetch feed: ${String(err)}` }, { status: 502 });
  }

  if (!feed.items || feed.items.length === 0) {
    return NextResponse.json({ inserted: 0, message: "No items in feed" });
  }

  // Build article rows — apply keyword filter if source has keywords defined
  const keywords: string[] = source.keywords ?? [];
  const items = feed.items
    .filter((item) => {
      if (keywords.length === 0) return true;
      const text = `${item.title ?? ""} ${item.contentSnippet ?? ""}`.toLowerCase();
      return keywords.some((k: string) => text.includes(k.toLowerCase()));
    })
    .map((item) => ({
      source_id: id,
      title: item.title ?? "(no title)",
      url: item.link ?? item.guid ?? "",
      summary: item.contentSnippet?.slice(0, 500) ?? null,
      published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
      tags: [] as string[],
    }))
    .filter((a) => a.url); // must have a URL

  if (items.length === 0) {
    return NextResponse.json({ inserted: 0, message: "No matching items after keyword filter" });
  }

  // Upsert (skip duplicates by URL)
  const { data: inserted, error: insErr } = await supabase
    .from("feed_articles")
    .upsert(items, { onConflict: "url", ignoreDuplicates: true })
    .select("id");

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // Get updated count
  const { count } = await supabase
    .from("feed_articles")
    .select("id", { count: "exact", head: true })
    .eq("source_id", id);

  // Update source metadata
  await supabase
    .from("feed_sources")
    .update({
      last_fetched_at: new Date().toISOString(),
      article_count: count ?? 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  return NextResponse.json({
    inserted: inserted?.length ?? 0,
    total: count ?? 0,
    message: `Fetched ${inserted?.length ?? 0} new articles`,
  });
}
