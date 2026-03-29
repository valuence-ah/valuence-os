// ─── Company Portfolio Intelligence /api/companies/[id]/intelligence ────────
// Uses Claude to surface recent signals, news, and milestones about a company.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

export const maxDuration = 30;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createAdminClient();

  const { data: company } = await supabase
    .from("companies")
    .select("name, website, description, sectors, sub_type, location_city, location_country, tags")
    .eq("id", id)
    .single();

  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const context = [
    company.description ? `Description: ${company.description.slice(0, 300)}` : null,
    company.sectors?.length ? `Sector: ${company.sectors.join(", ")}` : null,
    company.sub_type ? `Sub-sector: ${company.sub_type}` : null,
    (company.location_city || company.location_country)
      ? `Location: ${[company.location_city, company.location_country].filter(Boolean).join(", ")}`
      : null,
    company.tags?.length ? `Keywords: ${(company.tags as string[]).join(", ")}` : null,
  ].filter(Boolean).join("\n");

  const prompt = `You are a VC intelligence analyst. Provide 5–7 intelligence items about "${company.name}"${company.website ? ` (${company.website})` : ""}.

${context}

Focus on: funding rounds, partnerships, product launches, scientific publications, grants, regulatory milestones, team changes, market developments, or competitive signals.

Return a JSON array ONLY (no markdown, no explanation):
[
  {
    "headline": "Short factual headline (max 12 words)",
    "source": "Source name (e.g. TechCrunch, NIH, company blog)",
    "date": "YYYY or YYYY-MM or YYYY-MM-DD",
    "summary": "1–2 sentence factual summary.",
    "url": null
  }
]

If you lack recent data, include items about known facts (founding, key technology, notable team members). Do not fabricate specific dates or funding amounts you are unsure of.`;

  try {
    const { text } = await generateText({
      model: anthropic("claude-opus-4-5"),
      maxTokens: 1200,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    });

    // Extract JSON from the response
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return NextResponse.json({ items: [] });

    const items = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ items: Array.isArray(items) ? items : [] });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
