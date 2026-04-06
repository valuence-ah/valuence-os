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

  // 1. Search sourcing_signals for company-tagged news
  const { data: signals } = await supabase
    .from("sourcing_signals")
    .select("id, title, url, summary, source, published_date")
    .or(`company_id.eq.${companyId},title.ilike.%${company.name}%`)
    .in("signal_type", ["news"])
    .order("published_date", { ascending: false })
    .limit(10);

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

  // 2. Exa API search for company news
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
          query: `"${company.name}" news funding startup`,
          numResults: 5,
          startPublishedDate: thirtyDaysAgo,
          useAutoprompt: true,
          contents: {
            summary: { query: `${company.name} news` },
          },
        }),
      });

      if (exaRes.ok) {
        const exaData = await exaRes.json();
        const results = exaData.results ?? [];
        for (const r of results) {
          // Deduplicate by URL
          if (!articles.find(a => a.url === r.url)) {
            articles.push({
              id: r.id ?? r.url,
              title: r.title ?? "",
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

  // Sort by date, newest first
  articles.sort((a, b) =>
    new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
  );

  return NextResponse.json({ articles: articles.slice(0, 10) });
}
