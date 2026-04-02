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
import { saveMeetingTranscript }       from "@/lib/save-meeting-transcript";
import type { Interaction }            from "@/lib/types";

export const maxDuration = 120;

export async function POST() {
  const supabaseUser = await createClient();
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.FIREFLIES_API_KEY) {
    return NextResponse.json({ error: "FIREFLIES_API_KEY not configured" }, { status: 503 });
  }

  const supabase = createAdminClient();

  // ── Fetch archived external IDs upfront ────────────────────────────────────
  const { data: archivedRows } = await supabase
    .from("archived_external_meetings")
    .select("external_id")
    .eq("source", "fireflies");
  const archivedSet = new Set<string>(
    (archivedRows ?? []).map((r: { external_id: string }) => r.external_id)
  );

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

  // PDF promises — fire-and-forget, settled before we return
  const pdfPromises: Promise<void>[] = [];

  for (const m of meetings) {
    if (!m?.id) { skipped++; continue; }

    // ── Block archived meetings from re-importing ───────────────────────────
    if (archivedSet.has(m.id)) { skipped++; continue; }

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

    const { data: inserted, error } = await supabase
      .from("interactions")
      .insert({
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
        transcript_url:      m.transcript_url ?? null,
        source:              "fireflies",
        resolution_status:   resolution.resolution_status,
        pending_resolutions: resolution.pending_resolutions ?? null,
        sentiment:           "neutral",
        created_by:          user.id,
      })
      .select("id")
      .single();

    if (!error && inserted) {
      imported++;

      const companyId = resolution.company_id;

      if (companyId) {
        const dateStr = new Date(date).toISOString().split("T")[0];
        await supabase.from("companies")
          .update({ last_contact_date: dateStr, last_meeting_date: dateStr })
          .eq("id", companyId);

        // ── Auto-save PDF for every resolved meeting (summary, transcript, or both) ──
        const meetingRecord: Interaction = {
          id:                  (inserted as { id: string }).id,
          type:                "meeting",
          subject:             title,
          body:                m.ai_summary,
          summary:             m.ai_summary,
          ai_summary:          m.ai_summary,
          transcript_text:     m.transcript ?? null,
          transcript_url:      m.transcript_url ?? null,
          action_items:        m.action_items.length ? m.action_items : null,
          attendees:           attendees.length ? (attendees as Interaction["attendees"]) : null,
          duration_minutes:    duration,
          date:                new Date(date).toISOString(),
          company_id:          companyId,
          contact_ids:         resolution.contact_ids.length ? resolution.contact_ids : null,
          fireflies_id:        m.id,
          fellow_id:           null,
          source:              "fireflies",
          resolution_status:   resolution.resolution_status,
          pending_resolutions: resolution.pending_resolutions ?? null,
          sentiment:           "neutral",
          created_by:          user.id,
          created_at:          new Date().toISOString(),
          updated_at:          new Date().toISOString(),
          archived:            false,
        };

        // Fetch company name for PDF header, works for all entity types (pipeline, fund, LP, strategic)
        const pdfWork = async (): Promise<void> => {
          try {
            const { data: co } = await supabase
              .from("companies")
              .select("name")
              .eq("id", companyId)
              .single();
            if (co?.name) {
              await saveMeetingTranscript(supabase, meetingRecord, co.name as string);
            }
          } catch (err) {
            console.error("[sync] PDF save error:", err);
          }
        };
        pdfPromises.push(pdfWork());
      }

      switch (resolution.resolution_status) {
        case "resolved":    resolved++;    break;
        case "partial":     needsReview++; break;
        case "unresolved":  needsReview++; break;
        case "no_external": internal++;    break;
      }
    }
  }

  // Settle all PDF saves before responding
  const pdfResults = await Promise.allSettled(pdfPromises);
  const pdfsSaved  = pdfResults.filter(r => r.status === "fulfilled").length;

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
    pdfsSaved,
  });
}
