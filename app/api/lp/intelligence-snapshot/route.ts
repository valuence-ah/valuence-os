// ─── POST /api/lp/intelligence-snapshot ──────────────────────────────────────
// Generates an LP-ready narrative from the fund's current portfolio and active
// pipeline. Prompt is fully configurable via Admin → AI Config → LP Intelligence.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAiConfig } from "@/lib/ai-config";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_SYSTEM = `You are a venture fund analyst at Valuence Ventures, an early-stage deeptech fund investing in cleantech, techbio, and advanced materials at pre-seed and seed. You prepare concise, LP-ready briefings.`;

const DEFAULT_PROMPT = `Prepare a brief intelligence snapshot for an LP meeting based on the fund's current state.

PORTFOLIO COMPANIES (invested):
{{portfolio}}

ACTIVE PIPELINE (top deals, not passed):
{{pipeline}}

Write 2–3 focused paragraphs for an LP meeting:
1. **Portfolio**: What the portfolio companies do, what sectors/technologies are represented, and any notable milestones or traction.
2. **Pipeline**: The most compelling active deals and why they fit the Valuence thesis (deeptech, defensible IP, clear market need).
3. **Themes**: 1–2 cross-cutting themes or trends visible across portfolio + pipeline that signal fund momentum.

Be specific and factual. Name companies. Avoid generic VC jargon. Write as if briefing a sophisticated LP who wants substance, not buzzwords.`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminSupabase = createAdminClient();

  // Fetch portfolio (status=portfolio, limit 3) and active pipeline (limit 6) in parallel
  const [{ data: portfolio }, { data: pipeline }] = await Promise.all([
    adminSupabase
      .from("companies")
      .select("name, sectors, stage, description")
      .eq("status", "portfolio")
      .order("name")
      .limit(3),
    adminSupabase
      .from("companies")
      .select("name, sectors, stage, description, status")
      .not("status", "in", '("passed","exited","portfolio")')
      .not("status", "is", null)
      .order("updated_at", { ascending: false })
      .limit(6),
  ]);

  // Build readable context blocks
  function companyBlock(cos: typeof portfolio): string {
    if (!cos || cos.length === 0) return "None yet.";
    return cos.map(c => {
      const sectors = (c.sectors ?? []).join(", ") || "N/A";
      const stage   = c.stage || "early-stage";
      const desc    = c.description ? c.description.substring(0, 200) : "No description.";
      return `- ${c.name} (${sectors}, ${stage}): ${desc}`;
    }).join("\n");
  }

  const portfolioBlock = companyBlock(portfolio);
  const pipelineBlock  = companyBlock(pipeline);

  // Load config from DB, fall back to defaults
  const cfg = await getAiConfig("lp_intelligence");
  const systemPrompt = cfg.system_prompt ?? DEFAULT_SYSTEM;

  const rawPrompt = cfg.user_prompt?.trim() ? cfg.user_prompt : DEFAULT_PROMPT;
  const finalPrompt = rawPrompt
    .replaceAll("{{portfolio}}", portfolioBlock)
    .replaceAll("{{pipeline}}", pipelineBlock);

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: cfg.model,
    max_tokens: cfg.max_tokens ?? 1200,
    temperature: cfg.temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: finalPrompt }],
  });

  const narrative = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("");

  return NextResponse.json({ narrative, portfolio_count: portfolio?.length ?? 0, pipeline_count: pipeline?.length ?? 0 });
}
