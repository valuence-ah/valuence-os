// ─── POST /api/thesis-keywords/sync-pipeline ──────────────────────────────────
// Extracts keywords/sectors from non-Passed pipeline companies and inserts
// them into thesis_keywords with source = "pipeline".

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch non-Passed companies with keyword/sector data
  const { data: companies, error } = await supabase
    .from("companies")
    .select("tags, sectors, stage")
    .not("deal_status", "eq", "passed")
    .not("deal_status", "is", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const raw = new Set<string>();

  for (const co of companies ?? []) {
    for (const kw of co.tags ?? [])    if (kw?.trim()) raw.add(kw.trim().toLowerCase());
    for (const s  of co.sectors ?? []) if (s?.trim())  raw.add(s.trim().toLowerCase());
  }

  if (raw.size === 0) return NextResponse.json({ added: 0 });

  const rows = Array.from(raw).map(keyword => ({
    keyword,
    category: "general",
    source:   "pipeline",
    active:   true,
  }));

  const { data: inserted, error: insertError } = await supabase
    .from("thesis_keywords")
    .upsert(rows, { onConflict: "keyword", ignoreDuplicates: true })
    .select("id");

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ added: inserted?.length ?? 0 });
}
