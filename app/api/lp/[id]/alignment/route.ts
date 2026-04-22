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

2. PORTFOLIO PICKS (1–2 companies): Select 1–2 companies from the portfolio list above that best match this LP's mandate. Base your selection on company name and sector — a description is not required. For each pick, write one sentence of rationale tied to the LP's interests.

3. PIPELINE PICKS (3–5 companies): Select 3–5 companies from the pipeline list above that would interest this LP. Base selection on sector and stage alignment — a description is not required. For each pick, write one sentence of rationale. Never fabricate company names — only use names exactly as they appear in the lists above.

IMPORTANT: You MUST populate portfolio_picks and pipeline_picks. Do not return empty arrays unless the lists above literally say "None."

Return ONLY valid JSON (no markdown, no explanation):
{
  "alignment_summary": "2–3 sentence explanation of fund–LP fit",
  "portfolio_picks": [
    { "name": "Exact company name from portfolio list", "reason": "One sentence why this fits the LP" }
  ],
  "pipeline_picks": [
    { "name": "Exact company name from pipeline list", "reason": "One sentence why this fits the LP" }
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
      .select("id, name, sectors, stage, description")
      .eq("deal_status", "portfolio")
      .eq("type", "startup")
      .order("name")
      .limit(10),
    supabase
      .from("companies")
      .select("id, name, sectors, stage, description, deal_status")
      .not("deal_status", "in", '("passed","exited","portfolio")')
      .not("deal_status", "is", null)
      .eq("type", "startup")
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
      const sectors = (c.sectors ?? []).join(", ") || "unknown sector";
      const parts   = [`${c.name} (${sectors}, ${c.stage ?? "early-stage"})`];
      if (c.description) parts.push(c.description.slice(0, 200));
      return `- ${parts.join(": ")}`;
    }).join("\n");
  }

  // Template variables — all available to the admin's prompt
  const templateVars: Record<string, string> = {
    lp_name:    lp.name,
    lp_profile: lpProfile,
    portfolio:  companyList(portfolio),
    pipeline:   companyList(pipeline),
  };

  // Debug: log what we found so Vercel logs show the data
  console.log("[lp/alignment] portfolio count:", portfolio?.length ?? 0, "| pipeline count:", pipeline?.length ?? 0);
  console.log("[lp/alignment] portfolio list:\n", companyList(portfolio));
  console.log("[lp/alignment] pipeline list:\n", companyList(pipeline).slice(0, 500));

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

    // Log raw output so server logs show exactly what Claude returned
    console.log("[lp/alignment] raw response:", text.slice(0, 600));

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[lp/alignment] no JSON found in:", text.slice(0, 300));
      return NextResponse.json({ error: "Model returned unexpected format — no JSON object found" }, { status: 500 });
    }

    const result = JSON.parse(jsonMatch[0]) as {
      alignment_summary?: string;
      portfolio_picks?: { name: string; reason: string }[];
      pipeline_picks?:  { name: string; reason: string }[];
    };

    console.log("[lp/alignment] parsed picks — portfolio:", result.portfolio_picks?.length ?? 0,
      "pipeline:", result.pipeline_picks?.length ?? 0);

    // Enrich picks with id/sector/stage/description.
    // Uses case-insensitive trimmed match so Claude's slight casing
    // differences ("TechBio" vs "techbio") don't silently drop picks.
    function enrich(
      picks: { name: string; reason: string }[] | undefined,
      source: typeof portfolio
    ) {
      return (picks ?? []).map(pick => {
        const needle = pick.name.toLowerCase().trim();
        const co = source?.find(c => c.name.toLowerCase().trim() === needle);
        return {
          id:          co?.id          ?? null,
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
