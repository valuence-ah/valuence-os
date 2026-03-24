// ─── GET /api/feeds/articles?source_id=xxx&limit=200
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { searchParams } = new URL(req.url);
  const sourceId = searchParams.get("source_id");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 500);

  let query = supabase
    .from("feed_articles")
    .select("*")
    .order("published_at", { ascending: false })
    .limit(limit);

  if (sourceId) query = query.eq("source_id", sourceId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
