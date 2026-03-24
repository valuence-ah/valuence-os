// ─── GET /api/feeds  — list all feed sources
// ─── POST /api/feeds — create a new feed source

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feed_sources")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const body = await req.json();
  const { name, website_url, feed_url, type = "rss", keywords = [] } = body;

  if (!name || !website_url) {
    return NextResponse.json({ error: "name and website_url are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("feed_sources")
    .insert({ name, website_url, feed_url: feed_url || null, type, keywords })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
