// ─── POST /api/feeds/[id]/fetch
// Fetches the RSS feed for a given source using native fetch() (not parseURL)
// so we can send proper browser headers that bypass bot-blocking (e.g. FinSMEs 403).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Parser from "rss-parser";

// Parser only used for parseString() — HTTP is handled manually via fetch()
const parser = new Parser();

const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
  "Referer": "https://www.google.com/",
};

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

  // Fetch the XML ourselves with browser-like headers
  let xmlText: string;
  try {
    const res = await fetch(feedUrl, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Failed to fetch feed: Error: Status code ${res.status}` }, { status: 502 });
    }
    xmlText = await res.text();
  } catch (err) {
    return NextResponse.json({ error: `Failed to fetch feed: ${String(err)}` }, { status: 502 });
  }

  // Parse XML string (no HTTP involved)
  let feed;
  try {
    feed = await parser.parseString(xmlText);
  } catch (err) {
    return NextResponse.json({ error: `Failed to parse feed XML: ${String(err)}` }, { status: 502 });
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
    .filter((a) => a.url);

  if (items.length === 0) {
    return NextResponse.json({ inserted: 0, message: "No matching items after keyword filter" });
  }

  const { data: inserted, error: insErr } = await supabase
    .from("feed_articles")
    .upsert(items, { onConflict: "url", ignoreDuplicates: true })
    .select("id");

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const { count } = await supabase
    .from("feed_articles")
    .select("id", { count: "exact", head: true })
    .eq("source_id", id);

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
