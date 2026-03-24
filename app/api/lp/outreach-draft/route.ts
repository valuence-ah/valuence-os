import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { company, contact, interactions, mandateScores, stage, senderName } = await req.json();

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const lastInteraction = interactions?.[0];
    const contactName = contact
      ? `${contact.first_name} ${contact.last_name}`
      : "LP Contact";
    const contactTitle = contact?.title ?? "";

    const prompt = `You are ${senderName ?? "a partner"} at Valuence, a VC fund focused on early-stage cleantech and techbio.
Draft a personalized outreach email to ${contactName}${contactTitle ? ` (${contactTitle})` : ""} at ${company.name}.

Context:
- Stage: ${stage ?? "Initial Meeting"}
- LP Type: ${company.lp_type ?? "Unknown"}
- Location: ${[company.location_city, company.location_country].filter(Boolean).join(", ") || "Unknown"}
- Mandate alignment: Relationship ${mandateScores?.stageScore ?? 20}%, Ticket size ${mandateScores?.ticketScore ?? 30}%, Geographic ${mandateScores?.geoScore ?? 50}%, Sector ${mandateScores?.sectorScore ?? 50}%
- Last interaction: ${lastInteraction ? `${lastInteraction.date} — ${lastInteraction.subject ?? lastInteraction.type}${lastInteraction.body ? `: "${lastInteraction.body.slice(0, 150)}"` : ""}` : "No prior interactions — this is a cold outreach"}

Write a short, professional email that:
1. Starts with a subject line: "Subject: [subject]"
2. Opens with a warm, personal hook referencing prior context (if any) or a relevant observation about their mandate
3. In 2-3 sentences, makes a specific connection between their investment mandate and Valuence Fund II (cleantech / techbio, $200M target, $2-5M checks)
4. Makes a clear, stage-appropriate ask (${stage === "Committed" ? "confirm final commitment" : stage === "Due Diligence" ? "schedule DDQ walkthrough" : stage === "Discussion in Process" ? "schedule next meeting to discuss terms" : "schedule an introductory call"})
5. Professional sign-off with name

Keep the total email under 180 words. Avoid generic VC language. Be specific and genuine.`;

    const message = await anthropic.messages.create({
      model: "claude-opus-4-5",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });

    const draft = message.content[0].type === "text" ? message.content[0].text : "";
    return NextResponse.json({ draft });
  } catch (err: any) {
    console.error("outreach-draft error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
