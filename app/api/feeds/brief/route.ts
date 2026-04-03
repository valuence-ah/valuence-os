// ─── GET /api/feeds/brief ─────────────────────────────────────────────────────
// Returns curated articles for the Daily Intelligence Brief.
// ?type=relevant  — articles with relevance_score >= 2, not dismissed
//                   falls back to recent articles if none are categorized yet
// ?type=dismissed — articles dismissed today (?since=ISO)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type  = searchParams.get("type") ?? "relevant";
  const since = searchParams.get("since");

  if (type === "relevant") {
    // Try to get AI-categorized articles first
    try {
      const { data, error } = await supabase
        .from("feed_articles")
        .select("*")
        .gte("relevance_score", 2)
        .eq("dismissed", false)
        .order("relevance_score", { ascending: false })
        .order("published_at", { ascending: false })
        .limit(30);

      if (!error && data && data.length > 0) {
        return NextResponse.json({ articles: data, fallback: false });
      }
    } catch {
      // Column might not exist yet — fall through to fallback
    }

    // Fallback: return recent articles regardless of categorization status
    try {
      const { data: fallbackData } = await supabase
        .from("feed_articles")
        .select("*")
        .order("published_at", { ascending: false })
        .limit(20);

      return NextResponse.json({ articles: fallbackData ?? [], fallback: true });
    } catch {
      return NextResponse.json({ articles: [], fallback: true });
    }
  }

  if (type === "dismissed") {
    try {
      let query = supabase
        .from("feed_articles")
        .select("id, title, ai_why_relevant")
        .eq("dismissed", true)
        .order("published_at", { ascending: false })
        .limit(10);

      if (since) {
        query = query.gte("published_at", since);
      }

      const { data, error } = await query;
      if (error) return NextResponse.json([], { status: 200 });
      return NextResponse.json(data ?? []);
    } catch {
      return NextResponse.json([]);
    }
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}
