// ─── POST /api/lp/[id]/alignment ─────────────────────────────────────────────
// Generates an LP-specific intelligence brief:
//   1. Fund–LP alignment narrative (why Valuence fits THIS LP)
//   2. 1–2 portfolio company picks curated for this LP
//   3. 2–5 pipeline company picks curated for this LP
//
// Prompt is fully configurable in Admin → AI Config → LP Intelligence Snapshot.
// Template variables: {{lp_name}}, {{lp_profile}}, {{portfolio}}, {{pipeline}}
// Output must be JSON with alignment_summary, portfolio_picks, pipeline_picks.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAiConfig } from "@/lib/ai-config";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Replace {{variable}} placeholders in a template string. */
function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replaceAll(`{{${k}}}`, v),
    template
  );
}

// Default prompt (used when Admin has left user_prompt blank).
// Admin can override every word of this in AI Config → LP Intelligence Snapshot.
const DEFAULT_PROMPT = `You are an LP relations specialist at Valuence Ventures, an early-stage deeptech VC fund.

VALUENCE VENTURES THESIS:
We invest at the intersection of science and capital — backing founders commercialising breakthrough research in cleantech (energy transition, sustainable materials, carbon capture), techbio (synthetic biology, diagnostics, bioprocessing, ag-bio), and advanced materials (specialty polymers, composites, semiconductors). We write $500K–$2M checks at pre-seed and seed stage.

LP PROFILE — {{lp_name}}:
{{lp_profile}}

OUR PORTFOLIO (invested companies):
{{portfolio}}

OUR ACTIVE PIPELINE (companies under evaluation, not yet passed):
{{pipeline}}

Produce an LP intelligence brief for {{lp_name}}:

1. ALIGNMENT (2–3 sentences): Why is Valuence Ventures a strong fit for this LP? Reference their specific type, mandate, geography, or stated interests. Be concrete — no generic VC language.

2. PORTFOLIO PICKS (1–2 companies): Which of our portfolio companies would resonate most with this LP? For each, give one sentence tied to their mandate or interests.

3. PIPELINE PICKS (2–5 companies): Which active pipeline companies would interest this LP most? For each, give one sentence tied to their interests. Only pick companies that have a description. Never fabricate company names — only use companies listed above.

Return ONLY valid JSON (no markdown, no explanation):
{
  "alignment_summary": "2–3 sentence explanation of fund–LP fit",
  "portfolio_picks": [
    { "name": "Exact company name from list above", "reason": "One sentence why this fits the LP" }
  ],
  "pipeline_picks": [
    { "name": "Exact company name from list above", "reason": "One sentence why this fits the LP" }
  ]
}`;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();

  // Load AI config + LP details + portfolio + pipeline in parallel
  const [cfg, { data: lp }, { data: portfolio }, { data: pipeline }] = await Promise.all([
    getAiConfig("lp_intelligence"),
    supabase
      .from("companies")
      .select("name, type, sub_type, description, sectors, website, location_city, location_country, tags")
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
  const lpProfileLines = [
    lp.type       ? `Type: ${lp.type}` : null,
    lp.sub_type   ? `Sub-type: ${lp.sub_type}` : null,
    lp.description ? `About: ${lp.description.slice(0, 400)}` : null,
    lp.sectors?.length ? `Focus / mandate areas: ${lp.sectors.join(", ")}` : null,
    lp.tags?.length    ? `Tags: ${(lp.tags as string[]).join(", ")}` : null,
    (lp.location_city || lp.location_country)
      ? `Location: ${[lp.location_city, lp.location_country].filter(Boolean).join(", ")}`
      : null,
    lp.website ? `Website: ${lp.website}` : null,
  ].filter(Boolean);

  const lpProfile = lpProfileLines.length ? lpProfileLines.join("\n") : "No profile information available.";

  function companyList(cos: typeof portfolio): string {
    if (!cos || cos.length === 0) return "None.";
    return cos.map(c => {
      const sectors = (c.sectors ?? []).join(", ") || "N/A";
      const desc    = c.description ? c.description.slice(0, 200) : "(no description)";
      return `- ${c.name} (${sectors}, ${c.stage ?? "early-stage"}): ${desc}`;
    }).join("\n");
  }

  // Template variables — all available to the admin's prompt
  const templateVars: Record<string, string> = {
    lp_name:    lp.name,
    lp_profile: lpProfile,
    portfolio:  companyList(portfolio),
    pipeline:   companyList(pipeline),
  };

  const rawPrompt    = cfg.user_prompt?.trim() ? cfg.user_prompt : DEFAULT_PROMPT;
  const finalPrompt  = interpolate(rawPrompt, templateVars);
  const systemPrompt = cfg.system_prompt ??
    "You are an LP relations specialist. Return only valid JSON as instructed.";

  const maxTokens = Math.max(cfg.max_tokens, 1200);

  try {
    const { text } = await generateText({
      model: anthropic(cfg.model as Parameters<typeof anthropic>[0]),
      maxTokens,
      temperature: cfg.temperature,
      system: systemPrompt,
      messages: [{ role: "user", content: finalPrompt }],
    });

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
