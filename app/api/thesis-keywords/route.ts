// ─── /api/thesis-keywords ─────────────────────────────────────────────────────
// GET    — list all keywords (optional ?active=true, ?category=X)
// POST   — add a keyword { keyword, category }
// PATCH  — update a keyword { id, active?, category? }
// DELETE — remove a keyword ?id=X

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const active   = searchParams.get("active");
  const category = searchParams.get("category");

  let query = supabase
    .from("thesis_keywords")
    .select("*")
    .order("category", { ascending: true })
    .order("keyword",  { ascending: true });

  if (active === "true")  query = query.eq("active", true);
  if (active === "false") query = query.eq("active", false);
  if (category)           query = query.eq("category", category);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: { keyword?: string; category?: string } = await req.json().catch(() => ({}));
  const keyword  = body.keyword?.trim();
  const category = body.category?.trim() || "general";

  if (!keyword) return NextResponse.json({ error: "keyword is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("thesis_keywords")
    .insert({ keyword, category, source: "manual" })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body: { id?: string; active?: boolean; category?: string } = await req.json().catch(() => ({}));
  if (!body.id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (typeof body.active   !== "undefined") updates.active   = body.active;
  if (typeof body.category !== "undefined") updates.category = body.category;

  const { data, error } = await supabase
    .from("thesis_keywords")
    .update(updates)
    .eq("id", body.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("thesis_keywords").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
