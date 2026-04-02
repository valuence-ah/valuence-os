// ─── POST /api/meetings/backfill-transcripts ─────────────────────────────────
// Generates and saves PDFs for all resolved meetings that don't yet have a
// company_documents row. Processes in batches of 5 with a 500ms delay between
// batches to avoid overloading storage.

import { NextResponse }          from "next/server";
import { createAdminClient }     from "@/lib/supabase/admin";
import { createClient }          from "@/lib/supabase/server";
import { saveMeetingTranscript } from "@/lib/save-meeting-transcript";
import type { Interaction }      from "@/lib/types";

export const maxDuration = 300; // 5 minutes

const BATCH_SIZE  = 5;
const BATCH_DELAY = 500; // ms

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST() {
  // Auth check
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();

  // 1. Find all resolved meetings that don't have a company_documents row yet
  //    We look for interactions with source="fireflies" (or fellow), with a company_id,
  //    that are NOT in company_documents.
  const { data: allMeetings, error } = await supabase
    .from("interactions")
    .select("id, type, subject, body, summary, ai_summary, transcript_text, transcript_url, action_items, attendees, duration_minutes, date, company_id, contact_ids, fireflies_id, fellow_id, source, resolution_status, pending_resolutions, sentiment, created_by, created_at, updated_at, archived")
    .eq("type", "meeting")
    .not("company_id", "is", null)
    .order("date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!allMeetings?.length) {
    return NextResponse.json({ saved: 0, skipped: 0, errors: 0, message: "No meetings found" });
  }

  // 2. Find existing document meeting_ids to skip
  const { data: existingDocs } = await supabase
    .from("company_documents" as "documents")
    .select("meeting_id")
    .eq("document_type", "meeting_transcript")
    .not("meeting_id", "is", null);

  const existingMeetingIds = new Set<string>(
    (existingDocs ?? [])
      .map((d: { meeting_id: string | null }) => d.meeting_id)
      .filter(Boolean) as string[]
  );

  // 3. Filter to only meetings without a PDF yet
  const pending = allMeetings.filter(m => !existingMeetingIds.has(m.id));

  if (!pending.length) {
    return NextResponse.json({ saved: 0, skipped: allMeetings.length, errors: 0, message: "All meetings already have PDFs" });
  }

  let saved  = 0;
  let errors = 0;

  // 4. Process in batches
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (m) => {
        try {
          const { data: co } = await supabase
            .from("companies")
            .select("name")
            .eq("id", m.company_id as string)
            .single();

          if (!co?.name) { errors++; return; }

          const meetingRecord: Interaction = {
            id:                  m.id,
            type:                m.type as "meeting",
            subject:             m.subject,
            body:                m.body,
            summary:             m.summary,
            ai_summary:          m.ai_summary,
            transcript_text:     m.transcript_text,
            transcript_url:      m.transcript_url ?? null,
            action_items:        m.action_items,
            attendees:           m.attendees as Interaction["attendees"],
            duration_minutes:    m.duration_minutes,
            date:                m.date,
            company_id:          m.company_id,
            contact_ids:         m.contact_ids,
            fireflies_id:        m.fireflies_id,
            fellow_id:           m.fellow_id,
            source:              m.source,
            resolution_status:   m.resolution_status as Interaction["resolution_status"],
            pending_resolutions: m.pending_resolutions,
            sentiment:           m.sentiment as Interaction["sentiment"],
            created_by:          m.created_by,
            created_at:          m.created_at,
            updated_at:          m.updated_at,
            archived:            m.archived ?? false,
          };

          const result = await saveMeetingTranscript(supabase, meetingRecord, co.name as string);
          if (result.success) { saved++; } else { errors++; }
        } catch {
          errors++;
        }
      })
    );

    // Delay between batches (not after the last one)
    if (i + BATCH_SIZE < pending.length) {
      await sleep(BATCH_DELAY);
    }
  }

  return NextResponse.json({
    saved,
    skipped:  allMeetings.length - pending.length,
    errors,
    total:    pending.length,
    message:  `Backfill complete: ${saved} PDFs saved, ${errors} errors`,
  });
}
