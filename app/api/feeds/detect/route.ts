// ─── POST /api/feeds/detect
// Given a website URL, attempts to auto-detect the RSS feed URL.
// Tries common paths (/feed, /rss, /atom, /rss.xml, /feed.xml) and
// looks for <link rel="alternate"> tags in the homepage HTML.

import { NextRequest, NextResponse } from "next/server";
import Parser from "rss-parser";

const parser = new Parser({ timeout: 6000 });

const COMMON_PATHS = [
  "/feed",
  "/rss",
  "/feed.xml",
  "/rss.xml",
  "/atom.xml",
  "/feeds/posts/default",
  "/?feed=rss2",
];

async function tryFeedUrl(url: string): Promise<boolean> {
  try {
    const feed = await parser.parseURL(url);
    return (feed.items?.length ?? 0) > 0 || !!feed.title;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const { url } = await req.json();
  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });

  const base = url.replace(/\/$/, "");

  // 1. Try common paths
  for (const path of COMMON_PATHS) {
    const candidate = `${base}${path}`;
    if (await tryFeedUrl(candidate)) {
      return NextResponse.json({ feed_url: candidate, method: "common_path" });
    }
  }

  // 2. Try scraping the homepage for <link rel="alternate" type="application/rss+xml">
  try {
    const res = await fetch(base, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ValuenceOS/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    const html = await res.text();
    const match = html.match(
      /<link[^>]+type=["']application\/(rss|atom)\+xml["'][^>]+href=["']([^"']+)["']/i
    ) || html.match(
      /<link[^>]+href=["']([^"']+)["'][^>]+type=["']application\/(rss|atom)\+xml["']/i
    );
    if (match) {
      const href = match[2] || match[1];
      const feedUrl = href.startsWith("http") ? href : `${base}${href.startsWith("/") ? "" : "/"}${href}`;
      if (await tryFeedUrl(feedUrl)) {
        return NextResponse.json({ feed_url: feedUrl, method: "html_link" });
      }
    }
  } catch {
    // ignore fetch errors
  }

  return NextResponse.json({ feed_url: null, method: "not_found" });
}
