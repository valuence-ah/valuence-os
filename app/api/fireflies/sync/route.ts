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

// ── Meeting type categorization ───────────────────────────────────────────────
function categorizeMeeting(title: string): string {
  const t = title.toLowerCase();
  if (t.includes("board") || t.includes("bod")) return "board_meeting";
  if (t.includes("ic ") || t.includes("investment committee")) return "ic_meeting";
  if (t.includes(" lp ") || t.includes("limited partner") || t.includes("fundrais")) return "lp_meeting";
  if (t.includes("intro") || t.includes("introduction")) return "intro_call";
  if (t.includes("due diligence") || t.includes(" dd ") || t.includes("diligence")) return "due_diligence";
  if (t.includes("follow up") || t.includes("follow-up") || t.includes("catchup") || t.includes("catch-up")) return "follow_up";
  if (t.includes("pitch") || t.includes("demo")) return "pitch";
  if (t.includes("partner") || t.includes("strategic")) return "strategic_call";
  return "general";
}

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

  // PDF saves are fire-and-forget — do not block the sync response
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

    const meetingType = categorizeMeeting(title);
    const { data: inserted, error } = await supabase
      .from("interactions")
      .insert({
        type:                "meeting",
        meeting_type:        meetingType,
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
        contact_id:          resolution.contact_ids[0] ?? null,
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

      // Update last_interaction_date for all linked contacts
      if (resolution.contact_ids.length) {
        const meetingDate = new Date(date).toISOString();
        await supabase
          .from("contacts")
          .update({ last_interaction_date: meetingDate })
          .in("id", resolution.contact_ids);
      }

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

  // Fire-and-forget all PDF saves — don't block the sync response
  let pdfsSaved = 0;
  for (const p of pdfPromises) {
    void p.catch(err => console.error("[sync] PDF save failed:", (err as Error).message));
  }
  pdfsSaved = pdfPromises.length;

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
