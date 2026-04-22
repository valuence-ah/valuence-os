// ─── POST /api/lp/outreach-draft ─────────────────────────────────────────────
// Drafts a personalised LP outreach email.
// Full prompt is loaded from Admin → AI Config → LP Outreach Email.
// Template variables: {{sender_name}}, {{contact_name}}, {{contact_title}},
//   {{lp_name}}, {{lp_type}}, {{stage}}, {{location}}, {{relationship_score}},
//   {{ticket_score}}, {{geo_score}}, {{sector_score}}, {{last_interaction}}, {{ask}}

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getAiConfig } from "@/lib/ai-config";

/** Replace {{variable}} placeholders in a template string. */
function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replaceAll(`{{${k}}}`, v),
    template
  );
}

/** Returns a stage-appropriate suggested ask. */
function suggestedAsk(stage: string | undefined): string {
  switch (stage) {
    case "Committed":            return "confirm the final commitment and wire timeline";
    case "Due Diligence":        return "schedule a DDQ walkthrough call";
    case "Discussion in Process":return "schedule a follow-up meeting to discuss terms and next steps";
    case "Materials Sent":       return "share any questions on the materials so we can arrange a call";
    case "Meeting Done":         return "set up a follow-up call to discuss mandate fit in detail";
    case "Meeting Scheduled":    return "confirm the upcoming meeting agenda";
    default:                     return "schedule a 30-minute introductory call";
  }
}

export async function POST(req: NextRequest) {
  try {
    const { company, contact, interactions, mandateScores, stage, senderName } = await req.json();

    const cfg = await getAiConfig("lp_outreach_draft");
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const lastInteraction = interactions?.[0];
    const contactName  = contact ? `${contact.first_name ?? ""} ${contact.last_name ?? ""}`.trim() : "LP Contact";
    const contactTitle = contact?.title ? ` (${contact.title})` : "";

    const lastInteractionStr = lastInteraction
      ? `${lastInteraction.date} — ${lastInteraction.subject ?? lastInteraction.type}${
          lastInteraction.body ? `: "${lastInteraction.body.slice(0, 150)}"` : ""
        }`
      : "No prior interactions — this is a cold outreach";

    const location = [company.location_city, company.location_country].filter(Boolean).join(", ") || "Unknown";

    const templateVars: Record<string, string> = {
      sender_name:        senderName ?? "a partner",
      contact_name:       contactName,
      contact_title:      contactTitle,
      lp_name:            company.name ?? "the LP",
      lp_type:            company.lp_type ?? "Not set",
      stage:              stage ?? "Initial Meeting",
      location,
      relationship_score: String(mandateScores?.stageScore  ?? 20),
      ticket_score:       String(mandateScores?.ticketScore  ?? 30),
      geo_score:          String(mandateScores?.geoScore     ?? 50),
      sector_score:       String(mandateScores?.sectorScore  ?? 50),
      last_interaction:   lastInteractionStr,
      ask:                suggestedAsk(stage),
    };

    const prompt       = interpolate(cfg.user_prompt, templateVars);
    const systemPrompt = cfg.system_prompt ?? "You are an LP relations specialist. Write professional, concise, personalised emails.";

    const message = await anthropic.messages.create({
      model:      cfg.model,
      max_tokens: cfg.max_tokens,
      temperature: cfg.temperature,
      system:     systemPrompt,
      messages:   [{ role: "user", content: prompt }],
    });

    const draft = message.content[0].type === "text" ? message.content[0].text : "";
    return NextResponse.json({ draft });
  } catch (err: unknown) {
    console.error("outreach-draft error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
