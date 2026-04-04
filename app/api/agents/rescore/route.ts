// ─── Re-score All Existing Signals ───────────────────────────────────────────
// POST /api/agents/rescore
// Re-scores every sourcing signal using the deterministic 0–10 rubric.
// Also fills in the funding_stage column for all existing signals.
// Run once after deploying the new scoring system.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deterministicScoreSignal, type RawSignal } from "@/lib/sourcing-agents";
import type { SignalSource } from "@/lib/types";

export const maxDuration = 300; // allow up to 5 minutes for large datasets

export async function POST() {
  const supabase = createAdminClient();

  // Fetch all signals
  const { data: signals, error } = await supabase
    .from("sourcing_signals")
    .select("id, source, signal_type, title, url, content, summary, published_date, geography, technology_category")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const rows = signals ?? [];
  let updated = 0;
  let failed = 0;

  // Process in batches of 50 to avoid timeout
  const BATCH_SIZE = 50;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    const updates = batch.map(row => {
      const rawSignal: RawSignal = {
        source: (row.source ?? "other") as SignalSource,
        signal_type: (row.signal_type ?? "other") as RawSignal["signal_type"],
        title: row.title ?? "",
        url: row.url ?? "",
        content: row.content ?? row.summary ?? row.title ?? "",
        published_date: row.published_date ?? undefined,
        geography: row.geography ?? undefined,
        technology_category: row.technology_category ?? undefined,
      };

      const { score, fundingStage } = deterministicScoreSignal(rawSignal);
      return { id: row.id, relevance_score: score, funding_stage: fundingStage };
    });

    // Update each signal
    for (const upd of updates) {
      const { error: updateError } = await supabase
        .from("sourcing_signals")
        .update({ relevance_score: upd.relevance_score, funding_stage: upd.funding_stage })
        .eq("id", upd.id);

      if (updateError) {
        failed++;
      } else {
        updated++;
      }
    }
  }

  return NextResponse.json({
    success: true,
    total: rows.length,
    updated,
    failed,
    message: `Re-scored ${updated} signals using deterministic 0–10 rubric. ${failed} failed.`,
  });
}
