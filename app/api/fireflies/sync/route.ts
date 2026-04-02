// ─── Fireflies Sync /api/fireflies/sync ───────────────────────────────────────
// Fetches meetings from Fireflies, runs CRM entity resolution, stores in DB.
// Called from the "Sync" button on the Meetings page.

import { NextResponse }                from "next/server";
import { createAdminClient }           from "@/lib/supabase/admin";
import { createClient }                from "@/lib/supabase/server";
import {
  firefliesListMeetings,
  getMeetingTitle, getMeetingDuration, getMeetingDate,
} from "@/lib/fireflies";
import { resolveEntitiesForMeeting }   from "@/lib/meeting-resolution";
import { enrichAllUnresolvedMeetings } from "@/lib/meeting-enrichment";

export const maxDuration = 120;

export async function POST() {
  const supabaseUser = await createClient();
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.FIREFLIES_API_KEY) {
    return NextResponse.json({ error: "FIREFLIES_API_KEY not configured" }, { status: 503 });
  }

  const supabase = createAdminClient();

  let meetings;
  try {
    meetings = await firefliesListMeetings(30);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }

  let imported    = 0;
  let skipped     = 0;
  let resolved    = 0;
  let needsReview = 0;
  let internal    = 0;

  for (const m of meetings) {
    if (!m?.id) { skipped++; continue; }

    // Idempotency — skip if already imported by fireflies_id
    const { data: existing } = await supabase
      .from("interactions")
      .select("id")
      .eq("fireflies_id", m.id)
      .maybeSingle();
    if (existing) { skipped++; continue; }

    const title     = getMeetingTitle(m);
    const date      = getMeetingDate(m);
    const duration  = getMeetingDuration(m);
    const attendees = m.attendees ?? [];

    // CRM entity resolution
    const resolution = await resolveEntitiesForMeeting(title, attendees, supabase);

    const { error } = await supabase.from("interactions").insert({
      type:                "meeting",
      subject:             title,
      body:                m.ai_summary,
      summary:             m.ai_summary,
      ai_summary:          m.ai_summary,
      transcript_text:     m.transcript ?? null,
      action_items:        m.action_items.length ? m.action_items : null,
      attendees:           attendees.length ? attendees : null,
      duration_minutes:    duration,
      date:                new Date(date).toISOString(),
      company_id:          resolution.company_id,
      contact_ids:         resolution.contact_ids.length ? resolution.contact_ids : null,
      fireflies_id:        m.id,
      source:              "fireflies",
      resolution_status:   resolution.resolution_status,
      pending_resolutions: resolution.pending_resolutions ?? null,
      sentiment:           "neutral",
      created_by:          user.id,
    });

    if (!error) {
      imported++;

      if (resolution.company_id) {
        const dateStr = new Date(date).toISOString().split("T")[0];
        await supabase.from("companies")
          .update({ last_contact_date: dateStr, last_meeting_date: dateStr })
          .eq("id", resolution.company_id);
      }

      switch (resolution.resolution_status) {
        case "resolved":    resolved++;    break;
        case "partial":     needsReview++; break;
        case "unresolved":  needsReview++; break;
        case "no_external": internal++;    break;
      }
    }
  }

  // Enrichment pass — auto-tag any still-unresolved meetings
  const enrichStats = await enrichAllUnresolvedMeetings(supabase);

  return NextResponse.json({
    success: true,
    imported,
    skipped,
    total:       meetings.length,
    resolved:    resolved    + enrichStats.resolved,
    needsReview: needsReview + enrichStats.needsReview,
    internal,
    enriched:    enrichStats.resolved,
  });
}
