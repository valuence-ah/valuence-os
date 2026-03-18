// ─── Webhook: Fireflies Transcript ───────────────────────────────────────────
// Called by Make.com after a Fireflies meeting is processed.
// Make.com fetches the transcript from Fireflies, then POSTs here.
// Header: x-webhook-secret

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, validateWebhookSecret } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  if (!validateWebhookSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    meeting_id,         // Fireflies meeting ID (for idempotency)
    title,
    date,
    transcript,         // full transcript text
    summary,            // { overview: string, action_items: string[] }
    participants,       // [{ name, email }]
    company_id,         // Make.com resolves this by matching participant emails
  } = body;

  if (!meeting_id) {
    return NextResponse.json({ error: "meeting_id is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Idempotency: skip if we already have this meeting
  const { data: existing } = await supabase
    .from("interactions")
    .select("id")
    .eq("fireflies_id", meeting_id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ success: true, interaction_id: existing.id, duplicate: true });
  }

  // Try to resolve company_id from participant emails if not provided
  let resolvedCompanyId = company_id ?? null;
  const participantEmails: string[] = (participants ?? []).map((p: { email?: string }) => p.email).filter(Boolean);

  if (!resolvedCompanyId && participantEmails.length > 0) {
    const { data: matchedContact } = await supabase
      .from("contacts")
      .select("company_id")
      .in("email", participantEmails)
      .not("company_id", "is", null)
      .limit(1)
      .maybeSingle();
    resolvedCompanyId = matchedContact?.company_id ?? null;
  }

  // Resolve contact IDs from participant emails
  let contactIds: string[] = [];
  if (participantEmails.length > 0) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, email")
      .in("email", participantEmails);
    contactIds = contacts?.map((c: { id: string }) => c.id) ?? [];
  }

  // Save the interaction
  const { data: interaction, error } = await supabase
    .from("interactions")
    .insert({
      type:            "meeting",
      subject:         title || "Fireflies Meeting",
      body:            summary?.overview || null,
      transcript_text: transcript || null,
      summary:         summary?.overview || null,
      action_items:    summary?.action_items || [],
      date:            date ? new Date(date).toISOString() : new Date().toISOString(),
      company_id:      resolvedCompanyId,
      contact_ids:     contactIds.length > 0 ? contactIds : null,
      fireflies_id:    meeting_id,
      sentiment:       "neutral",
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update company's last_contact_date
  if (resolvedCompanyId) {
    await supabase
      .from("companies")
      .update({ last_contact_date: new Date().toISOString().split("T")[0] })
      .eq("id", resolvedCompanyId);
  }

  return NextResponse.json({ success: true, interaction_id: interaction.id });
}
