// ─── PATCH /api/feeds/[id] — update a feed source (active toggle, name, etc.)
// ─── DELETE /api/feeds/[id] — delete a feed source + its articles

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Allowlisted fields for feed_sources updates (prevents mass assignment)
const ALLOWED_SOURCE_FIELDS = ["name", "url", "active", "category", "update_frequency", "max_articles"] as const;

// Allowlisted fields for feed_articles updates
const ALLOWED_ARTICLE_FIELDS = ["is_read", "is_starred", "saved", "dismissed", "matched_company_ids"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  // Require authenticated session
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // If updating article-specific fields, update feed_articles table
  const isArticleUpdate = (ALLOWED_ARTICLE_FIELDS as readonly string[]).some(f => f in body);
  if (isArticleUpdate) {
    // Build allowlisted patch for articles
    const patch: Record<string, unknown> = {};
    for (const key of ALLOWED_ARTICLE_FIELDS) {
      if (key in body) patch[key] = body[key as keyof typeof body];
    }
    const { data, error } = await supabase
      .from("feed_articles")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  // Otherwise update feed_sources — only allow known fields (prevents mass assignment)
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const key of ALLOWED_SOURCE_FIELDS) {
    if (key in body) patch[key] = body[key as keyof typeof body];
  }

  const { data, error } = await supabase
    .from("feed_sources")
    .update(patch)
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

  // Require authenticated session
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("feed_sources").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
