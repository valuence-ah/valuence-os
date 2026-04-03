// ─── GET /api/feeds/articles ──────────────────────────────────────────────────
// Supports filtering by bucket, sectors, stage, relevance_tag, source,
// full-text search, and cursor-based pagination via offset.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);

  const sourceId     = searchParams.get("source_id");
  const bucket       = searchParams.get("bucket");
  const stage        = searchParams.get("stage");
  const relevanceTag = searchParams.get("relevance_tag");
  const q            = searchParams.get("q");
  const sectorsParam = searchParams.get("sectors"); // comma-separated
  const sortBy       = searchParams.get("sort");    // "newest" | "amount"
  const limit        = Math.min(parseInt(searchParams.get("limit") ?? "30", 10), 200);
  const offset       = parseInt(searchParams.get("offset") ?? "0", 10);

  // Build order — amount sort uses deal_amount_usd DESC, falling back to published_at
  let query = supabase
    .from("feed_articles")
    .select("*")
    .limit(limit)
    .range(offset, offset + limit - 1);

  if (sortBy === "amount") {
    query = query
      .order("deal_amount_usd", { ascending: false, nullsFirst: false })
      .order("published_at",    { ascending: false });
  } else {
    // Default: newest first
    query = query.order("published_at", { ascending: false });
  }

  if (sourceId)     query = query.eq("source_id", sourceId);
  if (bucket)       query = query.eq("bucket", bucket);
  if (stage)        query = query.eq("deal_stage", stage);
  if (q?.trim())    query = query.or(`title.ilike.%${q.trim()}%,summary.ilike.%${q.trim()}%`);

  if (sectorsParam) {
    const sectors = sectorsParam.split(",").map(s => s.trim()).filter(Boolean);
    if (sectors.length) {
      query = query.overlaps("sectors", sectors);
    }
  }

  if (relevanceTag) {
    query = query.contains("relevance_tags", [relevanceTag]);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
