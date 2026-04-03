// ─── GET /api/feeds/watchlist ─────────────────────────────────────────────────
// Returns all watchlist items. Gracefully returns [] if table doesn't exist yet.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feed_watchlist")
    .select("*")
    .order("name");

  if (error) {
    // Table may not exist yet (pre-migration) — return empty array gracefully
    return NextResponse.json([]);
  }
  return NextResponse.json(data ?? []);
}
