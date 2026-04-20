// ─── POST /api/meetings/[id]/summarize ────────────────────────────────────────
// Calls Claude to produce a VC-focused summary. Falls back to fetching the
// transcript from Fireflies if it isn't stored locally.

import { NextResponse }        from "next/server";
import { createClient }        from "@/lib/supabase/server";
import { createAdminClient }   from "@/lib/supabase/admin";
import { generateText }        from "ai";
import { anthropic }           from "@ai-sdk/anthropic";
import { firefliesGetMeeting } from "@/lib/fireflies";

export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Auth
  const supabaseUser = await createClient();
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();

  // Fetch meeting row
  const { data: meeting, error: fetchErr } = await supabase
    .from("interactions")
    .select("id, subject, transcript_text, ai_summary, summary, body, action_items, attendees, date, duration_minutes, company_id, meeting_type, fireflies_id")
    .eq("id", id)
    .single();

  if (fetchErr || !meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  // ── Resolve transcript text ───────────────────────────────────────────────
  let transcriptText = (meeting.transcript_text as string | null) ?? "";

  // If transcript isn't stored locally, pull from Fireflies on-demand
  if (transcriptText.trim().length < 100 && meeting.fireflies_id) {
    try {
      const ffMeeting = await firefliesGetMeeting(meeting.fireflies_id as string);
      if (ffMeeting.transcript && ffMeeting.transcript.trim().length > 50) {
        transcriptText = ffMeeting.transcript;
        // Cache it back so we don't need to re-fetch next time
        await supabase
          .from("interactions")
          .update({ transcript_text: transcriptText })
          .eq("id", id);
      }
    } catch (err) {
      console.warn("[summarize] Fireflies fetch failed, continuing with fallback:", err);
    }
  }

  // ── Build the best available content to summarize ─────────────────────────
  const hasFullTranscript = transcriptText.trim().length > 100;

  const fallbackContent = [
    meeting.ai_summary,
    meeting.summary,
    meeting.body,
    (meeting.action_items as string[] | null)?.join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");

  const contentToSummarize = hasFullTranscript ? transcriptText : fallbackContent;

  if (!contentToSummarize || contentToSummarize.trim().length < 30) {
    return NextResponse.json(
      { error: "No transcript or summary content available to summarize." },
      { status: 400 }
    );
  }

  // ── Context ───────────────────────────────────────────────────────────────
  let companyName = "";
  if (meeting.company_id) {
    const { data: co } = await supabase
      .from("companies")
      .select("name")
      .eq("id", meeting.company_id as string)
      .single();
    companyName = (co?.name as string) ?? "";
  }

  const attendees = (meeting.attendees as Array<{ name?: string; email?: string }> | null) ?? [];
  const attendeeList = attendees.map(a => a.name ?? a.email ?? "Unknown").join(", ");

  // ── Prompt ────────────────────────────────────────────────────────────────
  const contentLabel = hasFullTranscript ? "TRANSCRIPT" : "MEETING NOTES / SUMMARY";
  const prompt = `You are a venture capital analyst at Valuence Ventures, an early-stage deeptech fund (cleantech, techbio, advanced materials, pre-seed & seed).

Summarize the following ${hasFullTranscript ? "meeting transcript" : "meeting notes"} as a concise internal analyst note focused on investment decisions.

Meeting details:
- Title: ${meeting.subject ?? "Untitled"}
- Company: ${companyName || "Unknown"}
- Date: ${meeting.date ? new Date(meeting.date as string).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Unknown"}
- Duration: ${meeting.duration_minutes ? `${meeting.duration_minutes} minutes` : "Unknown"}
- Attendees: ${attendeeList || "Unknown"}

Write the summary in this structure:
1. **Overview** (1–2 sentences: what this meeting was about and who attended)
2. **Key Discussion Points** (3–5 bullet points of the most important topics covered)
3. **Signals** (notable positives, concerns, or flags for the investment thesis — be specific)
4. **Next Steps** (concrete follow-up actions mentioned or implied, with owners if identifiable)

Be direct and analytical. Do not pad. Use plain language. Max 300 words.

${contentLabel}:
${contentToSummarize.slice(0, 14000)}`;

  // ── Call Claude ───────────────────────────────────────────────────────────
  let summaryText: string;
  try {
    const { text } = await generateText({
      model:       anthropic("claude-3-5-haiku-20241022"),
      prompt,
      maxTokens:   600,
      temperature: 0.3,
    });
    summaryText = text.trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[summarize] Claude error:", msg);
    return NextResponse.json({ error: `Claude error: ${msg}` }, { status: 502 });
  }

  // ── Write back ────────────────────────────────────────────────────────────
  const { error: updateErr } = await supabase
    .from("interactions")
    .update({ ai_summary: summaryText, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ai_summary: summaryText });
}
