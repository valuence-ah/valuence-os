// ─── PATCH /api/feeds/[id] — update a feed source (active toggle, name, etc.)
// ─── DELETE /api/feeds/[id] — delete a feed source + its articles

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const body = await req.json();

  // If updating article-specific fields, update feed_articles table
  const articleFields = ["is_read", "is_starred", "saved", "dismissed", "matched_company_ids"];
  if (articleFields.some(f => f in body)) {
    const { data, error } = await supabase
      .from("feed_articles")
      .update(body)
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // Otherwise update feed_sources
  const { data, error } = await supabase
    .from("feed_sources")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { error } = await supabase.from("feed_sources").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
