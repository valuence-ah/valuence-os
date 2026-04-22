// ─── POST /api/lp/prep-brief ─────────────────────────────────────────────────
// Generates a 1-page LP meeting prep brief.
// Full prompt is loaded from Admin → AI Config → LP Meeting Brief.
// Template variables: {{lp_name}}, {{lp_type}}, {{stage}}, {{commitment_goal}},
//   {{location}}, {{owner}}, {{contacts}}, {{relationship_score}}, {{ticket_score}},
//   {{geo_score}}, {{sector_score}}, {{interactions}}, {{coinvest}}, {{days_since_touch}}

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

export async function POST(req: NextRequest) {
  try {
    const { company, contacts, interactions, mandateScores, coinvestInterest, coinvestSector, owner } = await req.json();

    const cfg = await getAiConfig("lp_prep_brief");
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Build formatted interactions block (last 3)
    const lastInteractions = (interactions ?? []).slice(0, 3).map((i: Record<string, unknown>) =>
      `• ${i.date} [${i.type}]: ${i.subject ?? i.type}${i.body ? ` — "${String(i.body).slice(0, 200)}"` : ""}`
    ).join("\n") || "No interactions recorded yet.";

    // Build contacts list
    const contactsList = (contacts ?? []).map((c: Record<string, unknown>) =>
      `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() +
      (c.title  ? ` (${c.title})`  : "") +
      (c.email  ? ` <${c.email}>`  : "")
    ).join(", ") || "No contacts on file";

    // Days since last touchpoint
    const daysSinceLastTouch = interactions?.[0]?.date
      ? Math.round((Date.now() - new Date(String(interactions[0].date)).getTime()) / 86_400_000)
      : null;

    // Commitment goal formatted
    const commitmentGoal = company.commitment_goal
      ? `$${(Number(company.commitment_goal) / 1_000_000).toFixed(1)}M`
      : "Not set";

    // Co-invest string
    const coinvest = coinvestInterest
      ? `${coinvestInterest}${coinvestSector ? ` (${coinvestSector})` : ""}`
      : "Not set";

    const location = [company.location_city, company.location_country].filter(Boolean).join(", ") || "Unknown";

    const templateVars: Record<string, string> = {
      lp_name:            company.name ?? "LP",
      lp_type:            company.lp_type  ?? "Not set",
      stage:              company.lp_stage  ?? "Not set",
      commitment_goal:    commitmentGoal,
      location,
      owner:              owner ?? "Unassigned",
      contacts:           contactsList,
      relationship_score: String(mandateScores?.stageScore  ?? "N/A"),
      ticket_score:       String(mandateScores?.ticketScore  ?? "N/A"),
      geo_score:          String(mandateScores?.geoScore     ?? "N/A"),
      sector_score:       String(mandateScores?.sectorScore  ?? "N/A"),
      interactions:       lastInteractions,
      coinvest,
      days_since_touch:   daysSinceLastTouch !== null ? String(daysSinceLastTouch) : "Unknown",
    };

    const prompt       = interpolate(cfg.user_prompt, templateVars);
    const systemPrompt = cfg.system_prompt ?? "You are a senior VC analyst. Generate precise, actionable LP meeting briefs.";

    const message = await anthropic.messages.create({
      model:       cfg.model,
      max_tokens:  cfg.max_tokens,
      temperature: cfg.temperature,
      system:      systemPrompt,
      messages:    [{ role: "user", content: prompt }],
    });

    const brief = message.content[0].type === "text" ? message.content[0].text : "";
    return NextResponse.json({ brief });
  } catch (err: unknown) {
    console.error("prep-brief error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
