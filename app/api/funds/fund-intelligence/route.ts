// ─── POST /api/funds/fund-intelligence ────────────────────────────────────────
// Generates a fund-specific intelligence brief:
//   1. Focus analysis — what this fund actually invests in right now
//   2. Co-invest angle — how Valuence fits alongside this fund
//   3. Portfolio picks — our companies relevant to this fund's thesis
//   4. Pipeline picks — our pipeline companies this fund could co-invest in
//
// Prompt is fully configurable in Admin → AI Config → Fund Intelligence.
// Template variables: {{fund_name}}, {{fund_profile}}, {{recent_investments}},
//                     {{portfolio}}, {{pipeline}}
// Output must be JSON with focus_analysis, co_invest_angle,
//                          portfolio_picks, pipeline_picks.

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

export async function POST(req: NextRequest) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { company_id?: string };
  if (!body.company_id) {
    return NextResponse.json({ error: "company_id required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Load AI config + fund details + recent investments + portfolio + pipeline in parallel
  const [cfg, { data: fund }, { data: recentInvestments }, { data: portfolio }, { data: pipeline }] = await Promise.all([
    getAiConfig("fund_intelligence"),
    supabase
      .from("companies")
      .select("name, type, description, sectors, stage, website, location_city, location_country, tags")
      .eq("id", body.company_id)
      .single(),
    supabase
      .from("fund_investments")
      .select("company_name, round, sector, year")
      .eq("fund_id", body.company_id)
      .order("year", { ascending: false })
      .limit(10),
    supabase
      .from("companies")
      .select("id, name, sectors, stage, description, website")
      .eq("deal_status", "portfolio")
      .eq("type", "startup")
      .order("name")
      .limit(10),
    supabase
      .from("companies")
      .select("id, name, sectors, stage, description, deal_status, website")
      .not("deal_status", "in", '("passed","exited","portfolio")')
      .not("deal_status", "is", null)
      .eq("type", "startup")
      .order("updated_at", { ascending: false })
      .limit(15),
  ]);

  if (!fund) return NextResponse.json({ error: "Fund not found" }, { status: 404 });

  // Build fund profile block
  const profileLines = [
    fund.type        ? `Type: ${fund.type}` : null,
    fund.description ? `About: ${fund.description.slice(0, 400)}` : null,
    fund.sectors?.length ? `Focus / sectors: ${(fund.sectors as string[]).join(", ")}` : null,
    fund.stage       ? `Stage focus: ${fund.stage}` : null,
    fund.tags?.length ? `Tags: ${(fund.tags as string[]).join(", ")}` : null,
    (fund.location_city || fund.location_country)
      ? `Location: ${[fund.location_city, fund.location_country].filter(Boolean).join(", ")}`
      : null,
    fund.website ? `Website: ${fund.website}` : null,
  ].filter(Boolean);

  const fundProfile = profileLines.length ? profileLines.join("\n") : "No profile information available.";

  // Format recent investments
  function formatRecentInvestments(
    inv: { company_name: string; round: string; sector: string; year: string }[] | null
  ): string {
    if (!inv || inv.length === 0) return "No recent investments recorded.";
    return inv.map(i => {
      const parts = [i.company_name];
      if (i.round)  parts.push(i.round);
      if (i.sector) parts.push(i.sector);
      if (i.year)   parts.push(i.year);
      return `- ${parts.join(" · ")}`;
    }).join("\n");
  }

  // Format portfolio/pipeline company lists
  function companyList(
    cos: { id: string; name: string; sectors?: string[] | null; stage?: string | null; description?: string | null }[] | null
  ): string {
    if (!cos || cos.length === 0) return "None.";
    return cos.map(c => {
      const sectors = (c.sectors ?? []).join(", ") || "unknown sector";
      const parts   = [`${c.name} (${sectors}, ${c.stage ?? "early-stage"})`];
      if (c.description) parts.push(c.description.slice(0, 150));
      return `- ${parts.join(": ")}`;
    }).join("\n");
  }

  const templateVars: Record<string, string> = {
    fund_name:           fund.name,
    fund_profile:        fundProfile,
    recent_investments:  formatRecentInvestments(recentInvestments as { company_name: string; round: string; sector: string; year: string }[] | null),
    portfolio:           companyList(portfolio),
    pipeline:            companyList(pipeline),
  };

  console.log("[fund-intelligence] fund:", fund.name, "| recent investments:", recentInvestments?.length ?? 0);

  const rawPrompt    = cfg.user_prompt?.trim() ? cfg.user_prompt : "";
  if (!rawPrompt) {
    return NextResponse.json({ error: "No prompt configured for fund_intelligence" }, { status: 500 });
  }
  const finalPrompt  = interpolate(rawPrompt, templateVars);
  const systemPrompt = cfg.system_prompt ?? "You are a VC fund analyst. Return only valid JSON as instructed.";
  const maxTokens    = Math.max(cfg.max_tokens, 1200);

  try {
    const { text } = await generateText({
      model: anthropic(cfg.model as Parameters<typeof anthropic>[0]),
      maxTokens,
      temperature: cfg.temperature,
      system: systemPrompt,
      messages: [{ role: "user", content: finalPrompt }],
    });

    console.log("[fund-intelligence] raw response:", text.slice(0, 400));

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("[fund-intelligence] no JSON found in:", text.slice(0, 300));
      return NextResponse.json({ error: "Model returned unexpected format" }, { status: 500 });
    }

    const result = JSON.parse(jsonMatch[0]) as {
      focus_analysis?:  string;
      co_invest_angle?: string;
      portfolio_picks?: { name: string; reason: string }[];
      pipeline_picks?:  { name: string; reason: string }[];
    };

    // Enrich picks with id/sector/stage from DB
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
          website:     (co as { website?: string | null } | undefined)?.website ?? null,
        };
      });
    }

    return NextResponse.json({
      focus_analysis:  result.focus_analysis  ?? "",
      co_invest_angle: result.co_invest_angle ?? "",
      portfolio_picks: enrich(result.portfolio_picks, portfolio),
      pipeline_picks:  enrich(result.pipeline_picks,  pipeline),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
