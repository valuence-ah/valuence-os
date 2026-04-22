import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getAiConfig } from "@/lib/ai-config";

export async function POST(req: NextRequest) {
  try {
    const { company, contacts, interactions, mandateScores, coinvestInterest, coinvestSector, owner } = await req.json();

    const cfg = await getAiConfig("lp_prep_brief");
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const lastInteractions = (interactions ?? []).slice(0, 3).map((i: any) =>
      `• ${i.date} [${i.type}]: ${i.subject ?? i.type} ${i.body ? `— "${i.body.slice(0, 200)}"` : ""}`
    ).join("\n") || "No interactions recorded yet.";

    const contactsList = (contacts ?? []).map((c: any) =>
      `${c.first_name} ${c.last_name}${c.title ? ` (${c.title})` : ""}${c.email ? ` <${c.email}>` : ""}`
    ).join(", ") || "No contacts on file";

    const daysSinceLastTouch = interactions?.[0]?.date
      ? Math.round((Date.now() - new Date(interactions[0].date).getTime()) / 86_400_000)
      : null;

    const prompt = `You are a senior analyst at Valuence, a VC fund focused on early-stage cleantech and techbio.
Generate a concise 1-page LP meeting prep brief. Be specific, actionable, and honest about risks.

── LP PROFILE ──────────────────────────────────────────
Name: ${company.name}
LP Type: ${company.lp_type ?? "Not set"}
Stage: ${company.lp_stage ?? "Not set"}
Commitment Goal: ${company.commitment_goal ? `$${(company.commitment_goal / 1_000_000).toFixed(1)}M` : "Not set"}
Location: ${[company.location_city, company.location_country].filter(Boolean).join(", ") || "Unknown"}
Relationship Owner: ${owner ?? "Unassigned"}
Key Contacts: ${contactsList}
Co-invest Interest: ${coinvestInterest ?? "Not set"}${coinvestSector ? ` (${coinvestSector})` : ""}

── MANDATE ALIGNMENT ────────────────────────────────────
Relationship Strength: ${mandateScores?.stageScore ?? "N/A"}%
Ticket Size Fit: ${mandateScores?.ticketScore ?? "N/A"}%
Geographic Alignment: ${mandateScores?.geoScore ?? "N/A"}%
Sector Focus: ${mandateScores?.sectorScore ?? "N/A"}%

── RECENT TOUCHPOINTS ───────────────────────────────────
${lastInteractions}
${daysSinceLastTouch !== null ? `Days since last interaction: ${daysSinceLastTouch}` : ""}

── FUND II THESIS ────────────────────────────────────────
Valuence Fund II targets early-stage cleantech & techbio companies with global commercialization potential.
Fund size: $200M target. Check size: $2–5M per company. Focus: decarbonization, biotech convergence, climate tech.

── OUTPUT FORMAT ─────────────────────────────────────────
Write a brief with these EXACT sections (use bold headers):

**What This LP Cares About**
[2-3 bullets based on LP type, sector alignment, prior conversations, geographic context]

**Where The Relationship Stands**
[Health score (Green/Amber/Red), stage assessment, days in stage if known, last interaction summary]

**Recommended Talking Points**
[3-4 specific angles that match their mandate to Valuence's cleantech/techbio thesis]

**Blockers to Flag**
[Honest list of gaps: ticket size fit, DDQ status, geographic alignment issues, any competitor fund dynamics]

**Suggested Ask For This Meeting**
[Specific, stage-appropriate ask — e.g., "Request first close commitment of $Xm", "Submit DDQ materials", "Confirm co-invest interest in Techbio portfolio companies"]`;

    const fullPrompt = cfg.user_prompt ? `${prompt}\n\nAdditional instructions: ${cfg.user_prompt}` : prompt;
    const message = await anthropic.messages.create({
      model: cfg.model,
      max_tokens: cfg.max_tokens,
      temperature: cfg.temperature,
      ...(cfg.system_prompt ? { system: cfg.system_prompt } : {}),
      messages: [{ role: "user", content: fullPrompt }],
    });

    const brief = message.content[0].type === "text" ? message.content[0].text : "";
    return NextResponse.json({ brief });
  } catch (err: any) {
    console.error("prep-brief error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
