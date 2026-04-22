// ─── POST /api/portfolio/intelligence ────────────────────────────────────────
// Generates M&A acquirer candidates, pilot partners, or competitors for a
// portfolio company using Claude + web search for real-time intelligence.
// Body: { company_id, type: "ma_acquirer" | "pilot_partner" | "competitor" }

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { getAiConfig } from "@/lib/ai-config";

export const dynamic = "force-dynamic";
export const maxDuration = 90; // Web search adds latency

// ── M&A Acquirer prompts ─────────────────────────────────────────────────────

const MA_SYSTEM_PROMPT = `You are a senior M&A intelligence analyst advising Valuence Ventures, an early-stage deeptech VC fund investing in cleantech, biotech, and advanced materials at pre-seed and seed. You identify the most likely corporate acquirers for specific portfolio companies.

STRICT RULES:
1. Every candidate MUST be a real, named corporation. Never output categories like "Large pharma companies" or "Major chemical companies."
2. Each rationale MUST start with a verifiable fact: a named acquisition, a named product division, or a specific strategic announcement. If uncertain, use "reportedly" or "has signaled interest in."
3. Do NOT fabricate acquisition amounts, dates, or deal names. If you do not know a specific deal, describe the strategic logic instead.
4. Each rationale is MAXIMUM 50 words. Start with the concrete fact, not an opinion.
5. Think like an investment banker: why would THIS buyer specifically pay a premium for THIS company's technology, team, or IP?

BAD rationale: "Strong strategic fit with good synergies in the advanced materials sector."
GOOD rationale: "Their Specialty Solutions division lost market share in barrier coatings since 2024. Nabaco's nano-coating platform fills this gap at 40% lower cost, and their Ludwigshafen plant could scale production immediately."

Return ONLY valid JSON array, no markdown fences.`;

// ── Pilot Partner prompts ────────────────────────────────────────────────────

const PILOT_SYSTEM_PROMPT = `You are a business development intelligence analyst advising Valuence Ventures, an early-stage deeptech VC fund (cleantech, biotech, advanced materials, pre-seed/seed). You identify the most valuable pilot and commercial partners for portfolio companies.

STRICT RULES:
1. Every candidate MUST be a real, named organization (corporation, hospital, university, government agency, or institution).
2. Think from the PARTNER's perspective: what specific operational problem do they have that this company solves? What is costing them money, time, or competitive position right now?
3. The pilot description must be concrete enough that a founder could use it to write a cold email. Not "could partner on innovation" but "Test coating performance on their 747 nacelle maintenance line at their Everett facility."
4. Each rationale is MAXIMUM 50 words.
5. Cross-reference the LP network. If a potential partner is connected to an LP or is an LP, flag it explicitly.
6. Prioritize partners that can: validate product performance, generate early revenue, accelerate regulatory or technical validation, become a scaled buyer or channel, improve odds of follow-on financing, or act as a reference customer.

AVOID these generic rationales:
- "Could be a good pilot partner"
- "Large company in the sector"
- "May benefit from innovation"
- "Interested in sustainability"
- "Looking for new technologies"

BAD: "Leading mining company that could benefit from new extraction technologies."
GOOD: "Operates 12 copper mines in Chile with declining ore grades (avg 0.5% Cu). Spends $200M/yr on acid. Bioleaching pilot at Escondida could validate 30% acid reduction at their lowest-grade pit."

Return ONLY valid JSON array, no markdown fences.`;

// ── Competitor prompt ────────────────────────────────────────────────────────

const COMPETITOR_SYSTEM_PROMPT = `You are a competitive intelligence analyst at Valuence Ventures. Identify direct competitors and competitive threats. Be specific about what makes them competitive and how they differ.

STRICT RULES:
1. Only name real companies (not categories)
2. Include their funding stage and notable investors if known
3. Explain specifically how their approach differs from the portfolio company
4. Threat level: "high" if same technology same market, "medium" if adjacent approach same market, "low" if same technology different market

Return ONLY valid JSON array, no markdown fences.`;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { company_id, type } = await request.json() as { company_id: string; type: string };

  if (!company_id || !type) {
    return NextResponse.json({ error: "company_id and type required" }, { status: 400 });
  }

  // Fetch company details, latest KPIs, milestones in parallel
  const [companyResult, kpisResult, milestonesResult, lpResult] = await Promise.all([
    supabase.from("companies").select("name, sectors, stage, description, sub_type").eq("id", company_id).single(),
    supabase.from("portfolio_kpis").select("*").eq("company_id", company_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("portfolio_milestones").select("title, status, target_date").eq("company_id", company_id).order("created_at", { ascending: false }).limit(5),
    supabase.from("companies").select("name").eq("type", "limited partner").order("name").limit(20),
  ]);

  const company = companyResult.data;
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  // Guard: require a meaningful description
  if (!company.description || company.description.length < 30) {
    return NextResponse.json({
      error: `Cannot generate intelligence for ${company.name} because the company description is missing or too short. Please add a detailed description (what the company does, what technology they use, what problem they solve) in the Portfolio detail panel first.`,
    }, { status: 400 });
  }

  console.log(`[intelligence] Generating ${type} for: ${company.name} (${company_id})`);

  const kpi = kpisResult.data;
  const milestones = milestonesResult.data ?? [];
  const lpNames = (lpResult.data ?? []).map(l => l.name).join(", ");

  const kpiContext = kpi
    ? `KPIs (${kpi.period}): MRR $${kpi.mrr ?? "N/A"}, Burn $${kpi.monthly_burn ?? "N/A"}/mo, Runway ${kpi.runway_months ?? "N/A"}mo, ${kpi.customers ?? "N/A"} customers, ${kpi.pilots_active ?? "N/A"} active pilots.`
    : "No KPI data available.";

  const milestoneContext = milestones.length
    ? `Milestones: ${milestones.map(m => `${m.title} [${m.status}]`).join("; ")}`
    : "";

  // ── Build type-specific prompts ──────────────────────────────────────────────

  let systemPrompt: string;
  let userPrompt: string;

  if (type === "ma_acquirer") {
    systemPrompt = MA_SYSTEM_PROMPT;
    userPrompt = `Identify 4 corporations most likely to acquire ${company.name}.

COMPANY PROFILE:
- Name: ${company.name}
- Core technology: ${company.description}
- Sectors: ${(company.sectors ?? []).join(", ") || "Not specified"}
- Stage: ${company.stage || "Early-stage"}
- Sub-type: ${company.sub_type || "N/A"}
${kpiContext}
${milestoneContext}

LP NETWORK (potential warm intro paths): ${lpNames || "None specified"}

For EACH acquirer, return ALL of these fields:

[
  {
    "entity_name": "Corporation Name (real company only)",
    "fit_level": "high | medium | low",
    "description": "Maximum 50 words. Start with a concrete fact. Why would this buyer pay a premium for ${company.name}?",
    "evidence_type": "direct_acquisition | adjacent_acquisition | strategic_overlap | announced_interest",
    "business_unit": "The specific division, business unit, or subsidiary that would house this acquisition",
    "geography_relevance": "How the buyer's geographic presence matters to this deal",
    "timing_view": "near_term | mid_term | long_term",
    "strategic_value": "One of: fills pipeline gap | expands product line | new modality access | reduces input cost | improves distribution economics | accelerates geographic entry | strengthens manufacturing capability | strengthens regulatory capability | acqui-hire for technical team | defensive acquisition against competitor",
    "warmth": "warm | lp_connection | cold"
  }
]

FIT LEVEL:
- "high": acquired in EXACT technology area in last 5 years, OR publicly announced strategic initiative to build/buy in this space
- "medium": acquired in ADJACENT area, OR business unit with clear product overlap
- "low": general sector overlap only

TIMING VIEW:
- "near_term" (0-2 years): active M&A program, recent acquisitions in space, or known mandate
- "mid_term" (2-5 years): building organically but may accelerate via acquisition
- "long_term" (5+ years): strategic logic clear but not yet active in M&A for this space

Sort by fit_level (high first), then timing_view (near_term first). Each entry MUST be a different corporation.`;

  } else if (type === "pilot_partner") {
    systemPrompt = PILOT_SYSTEM_PROMPT;
    userPrompt = `Identify 4 ideal pilot or commercial partners for ${company.name}.

COMPANY PROFILE:
- Name: ${company.name}
- Core technology: ${company.description}
- Sectors: ${(company.sectors ?? []).join(", ") || "Not specified"}
- Stage: ${company.stage || "Early-stage"}
- Sub-type: ${company.sub_type || "N/A"}
${kpiContext}
${milestoneContext}

LP NETWORK (warm intro paths): ${lpNames || "None specified"}
If any LP or LP-connected entity is relevant as a partner, flag warmth as "lp_connection" and explain the connection.

THE KEY QUESTION: Who has a specific, expensive, urgent problem that ${company.name}'s technology solves TODAY?

For EACH partner, return ALL of these fields:

[
  {
    "entity_name": "Organization Name (real organization only)",
    "fit_level": "high | medium | low",
    "warmth": "warm | lp_connection | cold",
    "partner_type": "pilot | commercial | channel | strategic | manufacturing",
    "specific_problem": "What specific operational problem does this partner have? Be concrete: declining yields, regulatory pressure, cost overruns, supply chain risk. Maximum 30 words.",
    "use_case": "How would ${company.name}'s technology solve this problem? What product or capability would they use? Maximum 30 words.",
    "pilot_description": "What would a pilot look like? Name a specific facility, production line, use case, or trial design. Maximum 40 words.",
    "success_criteria": "What measurable outcome makes this pilot a success? Name a specific metric. Maximum 20 words.",
    "description": "Maximum 50 words. Combine above into a compelling rationale. Start with the partner's problem.",
    "partner_value": "One of: validates product performance | generates early revenue | accelerates regulatory validation | accelerates technical validation | becomes scaled buyer | becomes channel partner | improves follow-on financing odds | acts as reference customer | provides manufacturing scale | provides market access"
  }
]

FIT LEVEL:
- "high": active, documented initiative to solve the exact problem this company addresses
- "medium": would clearly benefit but no public evidence of active search
- "low": general sector relevance, plausible but speculative

Sort by fit_level (high first), then warmth (warm first). Include at least one non-corporate partner (hospital, university, government lab, utility) if relevant.`;

  } else {
    // competitor
    systemPrompt = COMPETITOR_SYSTEM_PROMPT;
    userPrompt = `Identify 4 direct competitors and competitive threats for ${company.name}.

COMPANY PROFILE:
- Name: ${company.name}
- Core technology: ${company.description}
- Sectors: ${(company.sectors ?? []).join(", ") || "Not specified"}
- Stage: ${company.stage || "Early-stage"}
${kpiContext}
${milestoneContext}

For each competitor, explain their specific technology approach vs ${company.name}'s, their funding and notable backers, and why they are a direct threat.

Return JSON array:
[
  {
    "entity_name": "Company Name",
    "description": "Under 50 words. How they compete: their approach, funding stage, and key differentiator vs ${company.name}.",
    "fit_level": "high | medium | low",
    "warmth": "cold"
  }
]

Sort by fit_level (high = direct competitor first).`;
  }

  // ── Call Claude with web search ──────────────────────────────────────────────

  const configKey = type === "ma_acquirer"
    ? "ma_intelligence"
    : type === "competitor"
    ? "competitor_intelligence"
    : "pilot_intelligence";
  const cfg = await getAiConfig(configKey);

  // Allow full prompt override from Admin AI Config
  // Variables available: {{company_name}}, {{description}}, {{sectors}}, {{stage}}, {{kpi_context}}, {{milestones}}
  if (cfg.user_prompt?.trim()) {
    const vars: Record<string, string> = {
      company_name: company.name,
      description:  company.description ?? "",
      sectors:      (company.sectors ?? []).join(", ") || "Not specified",
      stage:        company.stage || "Early-stage",
      kpi_context:  kpiContext,
      milestones:   milestoneContext,
      lp_names:     lpNames,
    };
    userPrompt = Object.entries(vars).reduce(
      (s, [k, v]) => s.replaceAll(`{{${k}}}`, v),
      cfg.user_prompt
    );
  }
  if (cfg.system_prompt) systemPrompt = cfg.system_prompt;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: cfg.model,
    max_tokens: cfg.max_tokens ?? 2500,
    temperature: cfg.temperature,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: [{ type: "web_search_20250305" as any, name: "web_search" }] as any,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  // Extract only text blocks (web search produces tool_use / tool_result blocks too)
  const aiText = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map(block => block.text)
    .join("");

  // Parse — try to find a JSON array anywhere in the text
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any[];
  try {
    // Strip markdown fences then try full parse first
    const cleaned = aiText.replace(/```json|```/g, "").trim();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: unknown = JSON.parse(cleaned);
    if (Array.isArray(raw)) {
      parsed = raw;
    } else if (raw && typeof raw === "object" && "results" in raw) {
      parsed = (raw as { results: unknown[] }).results ?? [];
    } else {
      // Last resort: find the array with regex
      const match = aiText.match(/\[[\s\S]*\]/);
      parsed = match ? JSON.parse(match[0]) : [];
    }
  } catch {
    // Last resort: find the array with regex
    try {
      const match = aiText.match(/\[[\s\S]*\]/);
      parsed = match ? JSON.parse(match[0]) : [];
    } catch {
      console.error("[intelligence] AI parsing failed. Raw text:", aiText.substring(0, 500));
      return NextResponse.json({ error: "AI parsing failed" }, { status: 500 });
    }
  }

  // ── Delete old AI entries, insert fresh structured results ───────────────────

  await supabase
    .from("portfolio_intelligence")
    .delete()
    .eq("company_id", company_id)
    .eq("type", type)
    .eq("source", "ai");

  if (parsed.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = parsed.map((c: any) => {
      const base = {
        company_id,
        type,
        entity_name: c.entity_name ?? "Unknown",
        description: c.description ?? null,
        fit_level: c.fit_level ?? "medium",
        warmth: c.warmth ?? "cold",
        source: "ai",
        last_refreshed: new Date().toISOString(),
      };

      if (type === "ma_acquirer") {
        return {
          ...base,
          evidence_type: c.evidence_type ?? null,
          business_unit: c.business_unit ?? null,
          geography_relevance: c.geography_relevance ?? null,
          timing_view: c.timing_view ?? null,
          strategic_value: c.strategic_value ?? null,
        };
      } else if (type === "pilot_partner") {
        return {
          ...base,
          partner_type: c.partner_type ?? null,
          specific_problem: c.specific_problem ?? null,
          use_case: c.use_case ?? null,
          pilot_description: c.pilot_description ?? null,
          success_criteria: c.success_criteria ?? null,
          partner_value: c.partner_value ?? null,
        };
      }
      return base;
    });

    await supabase.from("portfolio_intelligence").insert(rows);
  }

  console.log(`[intelligence] Done for: ${company.name} — inserted ${parsed.length} results`);

  return NextResponse.json({ results: parsed, count: parsed.length });
}
