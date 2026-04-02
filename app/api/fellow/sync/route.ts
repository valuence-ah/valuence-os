// ─── Fellow Manual Sync /api/fellow/sync ─────────────────────────────────────
// Fetches meetings from Fellow API, runs CRM entity resolution, stores in DB.
// Called from "Sync Fellow" button on meetings page.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  fellowListMeetings, fellowGetTranscript, fellowGetActionItems, fellowGetNotes,
  getMeetingTitle, getMeetingDuration, getMeetingDate,
} from "@/lib/fellow";
import { resolveEntitiesForMeeting } from "@/lib/meeting-resolution";

export const maxDuration = 120;

export async function POST() {
  const supabaseUser = await createClient();
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.FELLOW_API_KEY) {
    return NextResponse.json({ error: "FELLOW_API_KEY not configured" }, { status: 503 });
  }

  const supabase = createAdminClient();

  let meetings;
  try {
    meetings = await fellowListMeetings(30);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }

  let imported = 0;
  let skipped = 0;
  let resolved = 0;
  let needsReview = 0;
  let internal = 0;

  for (const m of meetings) {
    // Skip malformed entries (missing required id)
    if (!m?.id) { skipped++; continue; }

    // Idempotency check
    const { data: existing } = await supabase
      .from("interactions")
      .select("id")
      .eq("fellow_id", m.id)
      .maybeSingle();
    if (existing) { skipped++; continue; }

    const title = getMeetingTitle(m);
    const date = getMeetingDate(m);
    const duration = getMeetingDuration(m);
    const attendees = m.attendees ?? [];

    // Fetch additional data in parallel
    const [transcript, actionItemsRaw, notesRaw] = await Promise.all([
      m.transcript ? Promise.resolve(m.transcript) : fellowGetTranscript(m.id),
      m.action_items?.length ? Promise.resolve(m.action_items) : fellowGetActionItems(m.id),
      fellowGetNotes(m.id),
    ]);

    // Summary from Fellow AI or notes
    const aiSummary = m.ai_summary ?? m.summary
      ?? notesRaw.map(n => n.content ?? n.text ?? "").filter(Boolean).join("\n\n")
      ?? null;

    // Normalize action items
    const safeActionItems = Array.isArray(actionItemsRaw) ? actionItemsRaw : [];
    const actionItemStrings: string[] = safeActionItems.map(ai =>
      typeof ai === "string" ? ai : ai.description
    ).filter(Boolean);

    // CRM entity resolution
    const resolution = await resolveEntitiesForMeeting(title, attendees, supabase);

    // Insert interaction
    const { error } = await supabase.from("interactions").insert({
      type: "meeting",
      subject: title,
      body: aiSummary,
      summary: aiSummary,
      ai_summary: aiSummary,
      transcript_text: transcript ?? null,
      action_items: actionItemStrings,
      attendees: attendees.length ? attendees : null,
      duration_minutes: duration,
      date: new Date(date).toISOString(),
      company_id: resolution.company_id,
      contact_ids: resolution.contact_ids.length ? resolution.contact_ids : null,
      fellow_id: m.id,
      source: "fellow",
      resolution_status: resolution.resolution_status,
      pending_resolutions: resolution.pending_resolutions ?? null,
      sentiment: "neutral",
      created_by: user.id,
    });

    if (!error) {
      imported++;

      // Update company dates
      if (resolution.company_id) {
        const dateStr = new Date(date).toISOString().split("T")[0];
        await supabase.from("companies")
          .update({ last_contact_date: dateStr, last_meeting_date: dateStr })
          .eq("id", resolution.company_id);
      }

      // Track resolution stats
      switch (resolution.resolution_status) {
        case "resolved":    resolved++; break;
        case "partial":     needsReview++; break;
        case "unresolved":  needsReview++; break;
        case "no_external": internal++; break;
      }
    }
  }

  return NextResponse.json({
    success: true,
    imported,
    skipped,
    total: meetings.length,
    resolved,
    needsReview,
    internal,
  });
}
