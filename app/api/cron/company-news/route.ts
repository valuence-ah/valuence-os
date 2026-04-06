// POST /api/cron/company-news
// Vercel cron job — runs daily at 6am UTC
// Fetches news for all portfolio companies and stores in feed_articles tagged by company

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

export async function GET() {
  const supabase = await createClient();

  // Get all portfolio companies
  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, website")
    .eq("status", "portfolio")
    .limit(50);

  if (!companies?.length) {
    return NextResponse.json({ message: "No portfolio companies found" });
  }

  const exaKey = process.env.EXA_API_KEY;
  if (!exaKey) {
    return NextResponse.json({ message: "EXA_API_KEY not set" }, { status: 200 });
  }

  let totalSaved = 0;

  for (const company of companies) {
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
          numResults: 3,
          startPublishedDate: thirtyDaysAgo,
          useAutoprompt: true,
        }),
      });

      if (!exaRes.ok) continue;
      const exaData = await exaRes.json();
      const results = exaData.results ?? [];

      for (const r of results) {
        // Upsert into sourcing_signals by URL to avoid duplicates
        const { error } = await supabase
          .from("sourcing_signals")
          .upsert({
            title: r.title ?? "",
            url: r.url ?? "",
            summary: r.text?.substring(0, 500) ?? "",
            content: r.text?.substring(0, 2000) ?? "",
            source: "exa",
            signal_type: "news",
            published_date: r.publishedDate ?? new Date().toISOString(),
            company_id: company.id,
            company_name: company.name,
          }, { onConflict: "url", ignoreDuplicates: true });

        if (!error) totalSaved++;
      }
    } catch {
      // Continue for other companies
    }
  }

  return NextResponse.json({ success: true, totalSaved });
}
