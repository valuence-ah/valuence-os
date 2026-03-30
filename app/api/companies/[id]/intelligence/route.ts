// ─── Company Intelligence /api/companies/[id]/intelligence ───────────────────
// Uses Claude to surface intelligence items about a company.
// Enriches context with saved Exa signals + interactions from DB.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAiConfig } from "@/lib/ai-config";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

export const maxDuration = 45;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();

  // Load AI config + company data in parallel
  const [cfg, { data: company }] = await Promise.all([
    getAiConfig("exa_research"),
    supabase
      .from("companies")
      .select("name, website, description, sectors, sub_type, location_city, location_country, tags, stage")
      .eq("id", id)
      .single(),
  ]);

  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  // Pull saved Exa signals for this company (top 10 by relevance)
  const { data: signals } = await supabase
    .from("sourcing_signals")
    .select("title, summary, source, published_date, url")
    .eq("company_id", id)
    .order("relevance_score", { ascending: false })
    .limit(10);

  // Pull recent meeting interactions (for extra context)
  const { data: interactions } = await supabase
    .from("interactions")
    .select("type, subject, summary, date")
    .eq("company_id", id)
    .in("type", ["meeting", "call"])
    .order("date", { ascending: false })
    .limit(5);

  // Build context block
  const contextLines = [
    company.description ? `Description: ${company.description.slice(0, 300)}` : null,
    company.stage       ? `Stage: ${company.stage}` : null,
    company.sectors?.length ? `Sectors: ${company.sectors.join(", ")}` : null,
    company.sub_type    ? `Sub-sector: ${company.sub_type}` : null,
    (company.location_city || company.location_country)
      ? `Location: ${[company.location_city, company.location_country].filter(Boolean).join(", ")}`
      : null,
    company.tags?.length ? `Keywords: ${(company.tags as string[]).join(", ")}` : null,
  ].filter(Boolean);

  if (signals?.length) {
    contextLines.push(
      "\nSaved signals from Exa:",
      ...signals.map(s =>
        `• ${s.title ?? "(no title)"}${s.published_date ? ` (${s.published_date})` : ""}${s.summary ? ` — ${s.summary.slice(0, 120)}` : ""}`
      )
    );
  }

  if (interactions?.length) {
    contextLines.push(
      "\nRecent meetings/calls:",
      ...interactions.map(i =>
        `• ${i.date ? i.date.slice(0, 10) : "?"} — ${i.subject ?? i.type}${i.summary ? `: ${i.summary.slice(0, 100)}` : ""}`
      )
    );
  }

  const context = contextLines.join("\n");

  const basePrompt = `You are a VC intelligence analyst. Provide 5–7 intelligence items about "${company.name}"${company.website ? ` (${company.website})` : ""}.

${context}

Focus on: funding rounds, partnerships, product launches, scientific publications, grants, regulatory milestones, team changes, market developments, or competitive signals.

Return a JSON array ONLY (no markdown, no explanation):
[
  {
    "headline": "Short factual headline (max 12 words)",
    "source": "Source name (e.g. TechCrunch, NIH, company blog, Exa signal)",
    "date": "YYYY or YYYY-MM or YYYY-MM-DD",
    "summary": "1–2 sentence factual summary.",
    "url": null
  }
]

If you lack recent data, include items about known facts (founding, key technology, notable team members). Do not fabricate specific dates or funding amounts you are unsure of.`;

  const finalPrompt = cfg.user_prompt
    ? `${basePrompt}\n\nAdditional instructions: ${cfg.user_prompt}`
    : basePrompt;

  const systemPrompt = cfg.system_prompt ??
    "You are a VC intelligence analyst. Return only valid JSON arrays as instructed.";

  try {
    const { text } = await generateText({
      model: anthropic(cfg.model as Parameters<typeof anthropic>[0]),
      maxTokens: cfg.max_tokens,
      temperature: cfg.temperature,
      system: systemPrompt,
      messages: [{ role: "user", content: finalPrompt }],
    });

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return NextResponse.json({ items: [] });

    const items = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ items: Array.isArray(items) ? items : [] });
  } catch (err) {
    console.error("[intelligence] Error:", err);
    return NextResponse.json({ items: [] });
  }
}
