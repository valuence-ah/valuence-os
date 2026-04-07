// GET /api/portfolio/company-news?company_id=xxx
// Returns recent news articles about a portfolio company.
// 1. Searches feed_articles table for articles mentioning the company (by matched_company_ids OR title ilike)
// 2. Also calls Exa API to get recent news about the company by name
// 3. Returns deduplicated articles sorted by date, newest first

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("company_id");
  if (!companyId) {
    return NextResponse.json({ error: "company_id required" }, { status: 400 });
  }

  const supabase = await createClient();

  // Get company details
  const { data: company } = await supabase
    .from("companies")
    .select("name, website")
    .eq("id", companyId)
    .single();

  if (!company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const articles: Array<{
    id: string;
    title: string;
    url: string;
    summary: string;
    source: string;
    published_at: string;
  }> = [];

  // 1. Search sourcing_signals tagged explicitly to this company (last 30 days only)
  // NOTE: No partial-title matching — only exact company_id matches to avoid false positives
  const thirtyDaysAgoISO = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: signals } = await supabase
    .from("sourcing_signals")
    .select("id, title, url, summary, source, published_date")
    .eq("company_id", companyId)
    .in("signal_type", ["news"])
    .gte("published_date", thirtyDaysAgoISO)
    .order("published_date", { ascending: false })
    .limit(15);

  for (const a of signals ?? []) {
    articles.push({
      id: a.id,
      title: a.title ?? "",
      url: a.url ?? "",
      summary: a.summary ?? "",
      source: a.source ?? "Feed",
      published_at: a.published_date ?? new Date().toISOString(),
    });
  }

  // 2. Exa API search for company news (exact name, last 30 days)
  const exaKey = process.env.EXA_API_KEY;
  if (exaKey && company.name) {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
      const exaRes = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": exaKey,
        },
        body: JSON.stringify({
          query: `"${company.name}"`,
          numResults: 8,
          startPublishedDate: thirtyDaysAgo,
          useAutoprompt: false,
          contents: {
            summary: { query: `${company.name} latest news` },
          },
        }),
      });

      if (exaRes.ok) {
        const exaData = await exaRes.json();
        const results = exaData.results ?? [];
        const nameLower = company.name.toLowerCase();
        for (const r of results) {
          const title: string = r.title ?? "";
          // Only include if the exact company name appears in the title
          if (!title.toLowerCase().includes(nameLower)) continue;
          // Deduplicate by URL
          if (!articles.find(a => a.url === r.url)) {
            articles.push({
              id: r.id ?? r.url,
              title,
              url: r.url ?? "",
              summary: r.summary ?? r.text?.substring(0, 200) ?? "",
              source: new URL(r.url).hostname.replace(/^www\./, ""),
              published_at: r.publishedDate ?? new Date().toISOString(),
            });
          }
        }
      }
    } catch {
      // Exa optional — silent fail
    }
  }

  // Normalize URL for dedup (strip UTM params, trailing slashes, protocol differences)
  function normalizeUrl(url: string): string {
    try {
      const u = new URL(url);
      // Remove common tracking params
      ["utm_source","utm_medium","utm_campaign","utm_term","utm_content","ref","source","fbclid","gclid"].forEach(p => u.searchParams.delete(p));
      return u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/$/, "") + u.search;
    } catch { return url; }
  }

  // Normalize title for similarity dedup (lowercase, remove punctuation, collapse whitespace)
  function normalizeTitle(t: string): string {
    return t.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  }

  // Deduplicate: first by normalized URL, then by title similarity (>= 70% word overlap)
  const seenUrls = new Set<string>();
  const seenTitles: string[] = [];
  const deduplicated = articles.filter(a => {
    const nu = normalizeUrl(a.url);
    if (seenUrls.has(nu)) return false;
    seenUrls.add(nu);

    const nt = normalizeTitle(a.title);
    const ntWords = new Set(nt.split(" ").filter(w => w.length > 3));
    const isDupe = seenTitles.some(existing => {
      const exWords = new Set(existing.split(" ").filter(w => w.length > 3));
      if (!ntWords.size || !exWords.size) return false;
      const intersection = [...ntWords].filter(w => exWords.has(w)).length;
      const overlap = intersection / Math.min(ntWords.size, exWords.size);
      return overlap >= 0.7;
    });
    if (isDupe) return false;
    seenTitles.push(nt);
    return true;
  });

  // Sort by date, newest first
  deduplicated.sort((a, b) =>
    new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
  );

  return NextResponse.json({ articles: deduplicated.slice(0, 10) });
}
