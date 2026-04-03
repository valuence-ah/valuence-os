// ─── GET /api/feeds/counts ────────────────────────────────────────────────────
// Returns exact article counts per bucket for the stat tiles.
// Uses head:true COUNT queries — no data transferred, just counts.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();

  const [fund, startup, ma, total] = await Promise.all([
    supabase
      .from("feed_articles")
      .select("id", { count: "exact", head: true })
      .eq("bucket", "fund_raise"),
    supabase
      .from("feed_articles")
      .select("id", { count: "exact", head: true })
      .eq("bucket", "startup_round"),
    supabase
      .from("feed_articles")
      .select("id", { count: "exact", head: true })
      .eq("bucket", "ma_partnership"),
    supabase
      .from("feed_articles")
      .select("id", { count: "exact", head: true }),
  ]);

  return NextResponse.json({
    fund_raise:    fund.count    ?? 0,
    startup_round: startup.count ?? 0,
    ma_partnership: ma.count     ?? 0,
    uncategorized:  Math.max(0, (total.count ?? 0) - (fund.count ?? 0) - (startup.count ?? 0) - (ma.count ?? 0)),
    total:          total.count  ?? 0,
  });
}
