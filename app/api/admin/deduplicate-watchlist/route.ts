// ─── POST /api/admin/deduplicate-watchlist ────────────────────────────────────
// Finds duplicate watchlist entries (same name, case-insensitive), merges their
// keywords into the entry with the most keywords, and deletes the rest.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST() {
  const supabase = createAdminClient();

  const { data: items, error } = await supabase
    .from("feed_watchlist")
    .select("id, name, keywords, type, notify, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // Group by lowercased name
  const groups = new Map<string, typeof items>();
  for (const item of items ?? []) {
    const key = (item.name ?? "").toLowerCase().trim();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  }

  let merged = 0;
  let deleted = 0;

  for (const [, group] of groups) {
    if (group.length <= 1) continue;

    // Keep the entry with the most keywords (or earliest created_at as tiebreaker)
    const sorted = group.sort((a, b) =>
      (b.keywords?.length ?? 0) - (a.keywords?.length ?? 0)
    );
    const keeper = sorted[0];
    const rest = sorted.slice(1);

    // Merge all keywords
    const allKeywords = Array.from(
      new Set(group.flatMap(g => g.keywords ?? []))
    );

    // Update keeper with merged keywords
    await supabase
      .from("feed_watchlist")
      .update({ keywords: allKeywords })
      .eq("id", keeper.id);

    // Delete duplicates
    for (const dup of rest) {
      await supabase.from("feed_watchlist").delete().eq("id", dup.id);
      deleted++;
    }
    merged++;
  }

  return NextResponse.json({
    success: true,
    groups_deduplicated: merged,
    entries_deleted: deleted,
    message: `Merged ${merged} duplicate group(s), deleted ${deleted} duplicate entries.`,
  });
}
