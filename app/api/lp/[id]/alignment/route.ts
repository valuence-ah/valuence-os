// ─── POST /api/lp/[id]/alignment ─────────────────────────────────────────────
// Generates an LP-specific intelligence brief:
//   1. Fund–LP alignment narrative (why Valuence is a good fit for THIS LP)
//   2. 1–2 portfolio companies curated to interest this LP
//   3. 2–5 pipeline companies curated to interest this LP

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();

  // Fetch LP + portfolio + pipeline in parallel
  const [{ data: lp }, { data: portfolio }, { data: pipeline }] = await Promise.all([
    supabase
      .from("companies")
      .select("name, type, description, sectors, website, location_city, location_country, tags, sub_type")
      .eq("id", id)
      .single(),
    supabase
      .from("companies")
      .select("name, sectors, stage, description")
      .eq("status", "portfolio")
      .order("name")
      .limit(10),
    supabase
      .from("companies")
      .select("name, sectors, stage, description, status")
      .not("status", "in", '("passed","exited","portfolio")')
      .not("status", "is", null)
      .order("updated_at", { ascending: false })
      .limit(15),
  ]);

  if (!lp) return NextResponse.json({ error: "LP not found" }, { status: 404 });

  // Build LP profile block
  const lpLines = [
    `Name: ${lp.name}`,
    lp.type       ? `Type: ${lp.type}` : null,
    lp.sub_type   ? `Sub-type: ${lp.sub_type}` : null,
    lp.description ? `About: ${lp.description.slice(0, 400)}` : null,
    lp.sectors?.length ? `Focus / mandate areas: ${lp.sectors.join(", ")}` : null,
    lp.tags?.length    ? `Tags: ${(lp.tags as string[]).join(", ")}` : null,
    (lp.location_city || lp.location_country)
      ? `Location: ${[lp.location_city, lp.location_country].filter(Boolean).join(", ")}`
      : null,
    lp.website ? `Website: ${lp.website}` : null,
  ].filter(Boolean).join("\n");

  function companyList(cos: typeof portfolio): string {
    if (!cos || cos.length === 0) return "None.";
    return cos.map(c => {
      const sectors = (c.sectors ?? []).join(", ") || "N/A";
      const desc = c.description ? c.description.slice(0, 200) : "No description";
      return `- ${c.name} (${sectors}, ${c.stage ?? "early-stage"}): ${desc}`;
    }).join("\n");
  }

  const prompt = `You are an LP relations specialist at Valuence Ventures, an early-stage deeptech VC fund.

VALUENCE VENTURES THESIS:
We invest at the intersection of science and capital — backing founders commercialising breakthrough research in:
• Cleantech: energy transition, sustainable materials, carbon capture
• Techbio: synthetic biology, diagnostics, bioprocessing, ag-bio
• Advanced materials: specialty polymers, composites, semiconductors
We write $500K–$2M checks at pre-seed and seed stage.

LP PROFILE:
${lpLines}

OUR PORTFOLIO (invested companies):
${companyList(portfolio)}

OUR ACTIVE PIPELINE (companies under evaluation, not yet passed):
${companyList(pipeline)}

Your task: produce an LP intelligence brief for this specific LP.

1. ALIGNMENT (2–3 sentences): Why is Valuence Ventures a strong match for ${lp.name}? Reference their specific type, strategic mandate, geography, or stated interests. Be concrete — avoid generic VC language.

2. PORTFOLIO PICKS (1–2 companies): Which of our portfolio companies would resonate most with this LP? For each, give a one-sentence reason tied to their mandate or interests.

3. PIPELINE PICKS (2–5 companies): Which active pipeline companies would be most interesting to share with this LP? For each, give a one-sentence reason tied to their interests. Only pick companies with a description.

If portfolio or pipeline is empty, return an empty array for those fields. Never fabricate company names — only use companies listed above.

Return ONLY valid JSON (no markdown, no explanation):
{
  "alignment_summary": "2-3 sentence explanation of fund-LP fit",
  "portfolio_picks": [
    { "name": "Exact company name from list", "reason": "One sentence why this fits the LP" }
  ],
  "pipeline_picks": [
    { "name": "Exact company name from list", "reason": "One sentence why this fits the LP" }
  ]
}`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map(b => b.text)
      .join("");

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Model returned unexpected format" }, { status: 500 });
    }

    const result = JSON.parse(jsonMatch[0]) as {
      alignment_summary?: string;
      portfolio_picks?: { name: string; reason: string }[];
      pipeline_picks?:  { name: string; reason: string }[];
    };

    // Enrich picks with sector / stage / description from source lists
    function enrich(
      picks: { name: string; reason: string }[] | undefined,
      source: typeof portfolio
    ) {
      return (picks ?? []).map(pick => {
        const co = source?.find(c => c.name === pick.name);
        return {
          name:        pick.name,
          reason:      pick.reason,
          sectors:     co?.sectors     ?? [],
          stage:       co?.stage       ?? null,
          description: co?.description ?? null,
        };
      });
    }

    return NextResponse.json({
      alignment_summary: result.alignment_summary ?? "",
      portfolio_picks:   enrich(result.portfolio_picks, portfolio),
      pipeline_picks:    enrich(result.pipeline_picks,  pipeline),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
