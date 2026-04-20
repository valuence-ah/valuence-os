// ─── POST /api/meetings/[id]/summarize ────────────────────────────────────────
// Reads the raw transcript for a meeting, calls Claude to produce a
// VC-focused summary, then writes it back to interactions.ai_summary.

import { NextResponse }      from "next/server";
import { createClient }      from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateText }      from "ai";
import { anthropic }         from "@ai-sdk/anthropic";

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

  // Fetch the meeting
  const { data: meeting, error: fetchErr } = await supabase
    .from("interactions")
    .select("id, subject, transcript_text, ai_summary, attendees, date, duration_minutes, company_id, meeting_type")
    .eq("id", id)
    .single();

  if (fetchErr || !meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  const transcript = meeting.transcript_text as string | null;
  if (!transcript || transcript.trim().length < 50) {
    return NextResponse.json({ error: "No transcript available to summarize" }, { status: 400 });
  }

  // Fetch company name for context
  let companyName = "";
  if (meeting.company_id) {
    const { data: co } = await supabase
      .from("companies")
      .select("name")
      .eq("id", meeting.company_id as string)
      .single();
    companyName = (co?.name as string) ?? "";
  }

  // Format attendees
  const attendees = (meeting.attendees as Array<{ name?: string; email?: string }> | null) ?? [];
  const attendeeList = attendees
    .map(a => a.name ?? a.email ?? "Unknown")
    .join(", ");

  // Build the prompt
  const prompt = `You are a venture capital analyst at Valuence Ventures, an early-stage deeptech fund (cleantech, techbio, advanced materials, pre-seed & seed).

Summarize the following meeting transcript in the style of a concise internal VC analyst note. Focus on what matters for investment decisions.

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

Be direct and analytical. Do not pad. Use plain language — no filler phrases like "the meeting covered" or "it was discussed that". Max 300 words.

TRANSCRIPT:
${transcript.slice(0, 12000)}`;

  // Call Claude
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

  // Write back to DB
  const { error: updateErr } = await supabase
    .from("interactions")
    .update({ ai_summary: summaryText, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ai_summary: summaryText });
}
