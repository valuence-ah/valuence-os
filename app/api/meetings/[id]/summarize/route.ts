// ─── POST /api/meetings/[id]/summarize ────────────────────────────────────────
// Produces a VC-focused Claude summary and writes it back to ai_summary.
//
// Content resolution order:
//  1. transcript_text  (Fireflies meetings — sentences stored on sync)
//  2. body             (uploaded transcripts — text extracted at upload time)
//  3. Fireflies API    (fetch live if fireflies_id present but transcript missing)
//  4. transcript_url   (raw file fetch — works for .txt / .vtt / .srt uploads)
//  5. ai_summary + summary fallback (summarise from existing notes)

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

  // Fetch meeting — include body (uploaded transcripts store text there)
  const { data: meeting, error: fetchErr } = await supabase
    .from("interactions")
    .select("id, subject, transcript_text, body, ai_summary, summary, action_items, attendees, date, duration_minutes, company_id, meeting_type, fireflies_id, transcript_url, source")
    .eq("id", id)
    .single();

  if (fetchErr || !meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  // ── 1. Try transcript_text (Fireflies sentence-by-sentence text) ─────────
  let content = ((meeting.transcript_text as string | null) ?? "").trim();

  // ── 2. Try body (uploaded transcript text) ────────────────────────────────
  if (content.length < 100) {
    const bodyText = ((meeting.body as string | null) ?? "").trim();
    if (bodyText.length > content.length) content = bodyText;
  }

  // ── 3. Fetch from Fireflies if fireflies_id present ───────────────────────
  if (content.length < 100 && meeting.fireflies_id) {
    try {
      const ff = await firefliesGetMeeting(meeting.fireflies_id as string);
      if (ff.transcript && ff.transcript.trim().length > 50) {
        content = ff.transcript.trim();
        // Cache locally so next call is instant
        await supabase
          .from("interactions")
          .update({ transcript_text: content })
          .eq("id", id);
      }
    } catch (err) {
      console.warn("[summarize] Fireflies fetch failed:", err);
    }
  }

  // ── 4. Fetch raw file from transcript_url (.txt / .vtt / .srt) ───────────
  if (content.length < 100 && meeting.transcript_url) {
    try {
      const fileRes = await fetch(meeting.transcript_url as string, {
        signal: AbortSignal.timeout(8000),
      });
      if (fileRes.ok) {
        const ct = fileRes.headers.get("content-type") ?? "";
        // Only decode plain text — skip PDFs (binary) and images
        if (ct.includes("text") || ct.includes("vtt") || ct.includes("srt")) {
          const raw = await fileRes.text();
          if (raw.trim().length > 100) content = raw.trim();
        }
      }
    } catch (err) {
      console.warn("[summarize] transcript_url fetch failed:", err);
    }
  }

  // ── 5. Fall back to existing summary/notes ────────────────────────────────
  if (content.length < 100) {
    const fallback = [
      meeting.ai_summary,
      meeting.summary,
      (meeting.action_items as string[] | null)?.join("\n"),
    ]
      .filter(Boolean)
      .join("\n\n")
      .trim();
    if (fallback.length > content.length) content = fallback;
  }

  if (content.length < 30) {
    return NextResponse.json(
      { error: "No readable transcript or summary found for this meeting. Try uploading a .txt or .vtt file instead of an image-based PDF." },
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

  const isFullTranscript = content.length > 500;

  // ── Prompt ────────────────────────────────────────────────────────────────
  const prompt = `You are a venture capital analyst at Valuence Ventures, an early-stage deeptech fund (cleantech, techbio, advanced materials, pre-seed & seed).

Summarize the following ${isFullTranscript ? "meeting transcript" : "meeting notes"} as a concise internal analyst note.

Meeting details:
- Title: ${meeting.subject ?? "Untitled"}
- Company: ${companyName || "Unknown"}
- Date: ${meeting.date ? new Date(meeting.date as string).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Unknown"}
- Duration: ${meeting.duration_minutes ? `${meeting.duration_minutes} minutes` : "Unknown"}
- Attendees: ${attendeeList || "Unknown"}

Write the summary using this structure:
1. **Overview** (1–2 sentences: what this meeting was about and who attended)
2. **Key Discussion Points** (3–5 bullet points of the most important topics covered)
3. **Signals** (notable positives, concerns, or flags for the investment thesis — be specific and direct)
4. **Next Steps** (concrete follow-up actions mentioned or implied, with owners if identifiable)

Be analytical. No filler phrases. Max 300 words.

${isFullTranscript ? "TRANSCRIPT" : "MEETING NOTES"}:
${content.slice(0, 14000)}`;

  // ── Call Claude ───────────────────────────────────────────────────────────
  let summaryText: string;
  try {
    const { text } = await generateText({
      model:       anthropic("claude-haiku-3-5"),
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

  // ── Save ──────────────────────────────────────────────────────────────────
  const { error: updateErr } = await supabase
    .from("interactions")
    .update({ ai_summary: summaryText, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ai_summary: summaryText });
}
