// ─── Webhook: Generate IC Memo ────────────────────────────────────────────────
// Called by Make.com when a deck or transcript is uploaded to a company.
// Body: { company_id, deck_url?, transcript? }
// Header: x-webhook-secret

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, validateWebhookSecret } from "@/lib/supabase/admin";
import { generateMemo } from "@/lib/memo-generator";

export async function POST(req: NextRequest) {
  if (!validateWebhookSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { company_id, deck_url, transcript } = body;

  if (!company_id) {
    return NextResponse.json({ error: "company_id is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // If a deck URL was provided, update the company record
  if (deck_url) {
    await supabase.from("companies").update({ pitch_deck_url: deck_url }).eq("id", company_id);
    await supabase.from("documents").insert({
      company_id,
      name: "Pitch Deck",
      type: "pitch_deck",
      file_url: deck_url,
    });
  }

  // If a transcript was provided, save it as a meeting interaction
  if (transcript && transcript.length > 50) {
    await supabase.from("interactions").insert({
      company_id,
      type: "meeting",
      subject: "Meeting Transcript (auto-imported)",
      body: transcript.slice(0, 2000),
      transcript_text: transcript,
      date: new Date().toISOString(),
      sentiment: "neutral",
    });
  }

  try {
    const memo = await generateMemo(supabase, company_id, null, transcript);
    return NextResponse.json({ success: true, memo_id: memo.id, recommendation: memo.recommendation });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
