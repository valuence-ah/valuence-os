// ─── POST /api/portfolio/intelligence ────────────────────────────────────────
// Generates M&A acquirer candidates, pilot partners, or competitors for a
// portfolio company using Claude, based on company details + LP/fund network.
// Body: { company_id, type: "ma_acquirer" | "pilot_partner" | "competitor" }

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  const kpi = kpisResult.data;
  const milestones = milestonesResult.data ?? [];
  const lpNames = (lpResult.data ?? []).map(l => l.name).join(", ");

  const typeDescriptions: Record<string, string> = {
    ma_acquirer: "potential M&A acquirers who would want to acquire or partner with this company",
    pilot_partner: "potential pilot/commercial partners who would want to run pilots or buy from this company",
    competitor: "direct competitors and competitive threats the company faces",
  };

  const typeInstruction = typeDescriptions[type] ?? typeDescriptions.ma_acquirer;

  const kpiContext = kpi
    ? `KPIs (${kpi.period}): MRR $${kpi.mrr ?? "N/A"}, Burn $${kpi.monthly_burn ?? "N/A"}/mo, Runway ${kpi.runway_months ?? "N/A"}mo, ${kpi.customers ?? "N/A"} customers, ${kpi.pilots_active ?? "N/A"} active pilots.`
    : "No KPI data available.";

  const milestoneContext = milestones.length
    ? `Milestones: ${milestones.map(m => `${m.title} [${m.status}]`).join("; ")}`
    : "";

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1500,
    system: `You are a VC intelligence analyst at Valuence Ventures, a deeptech fund focused on cleantech, biotech, and advanced materials. Generate actionable intelligence for portfolio companies. Return ONLY valid JSON, no markdown fences.`,
    messages: [{
      role: "user",
      content: `Generate 4 ${typeInstruction} for this portfolio company.

Company: ${company.name}
Sectors: ${(company.sectors ?? []).join(", ")}
Stage: ${company.stage ?? "N/A"}
Sub-type: ${company.sub_type ?? "N/A"}
Description: ${company.description ?? "No description"}

${kpiContext}
${milestoneContext}

Valuence LP network (potential warm connections): ${lpNames || "None available"}

For each entry, return:
{
  "results": [
    {
      "entity_name": "Company or organization name",
      "description": "1-2 sentences on why this is a relevant ${type.replace("_", " ")} and what the angle is",
      "fit_level": "high" | "medium" | "low",
      "warmth": "warm" | "lp_connection" | "cold"
    }
  ]
}

For warmth:
- "lp_connection": entity name appears in or is connected to the LP network above
- "warm": you know there's a likely existing relationship or overlap
- "cold": no known connection

Be specific and realistic. Focus on ${(company.sectors ?? []).join("/")} sector players.`,
    }],
  });

  const aiText = response.content[0].type === "text" ? response.content[0].text : "";
  let parsed: { results?: Array<{ entity_name: string; description: string; fit_level: string; warmth: string }> };

  try {
    parsed = JSON.parse(aiText.replace(/```json|```/g, "").trim());
  } catch {
    return NextResponse.json({ error: "AI parsing failed" }, { status: 500 });
  }

  const results = parsed.results ?? [];

  // Delete old AI-generated entries of this type, then insert fresh
  await supabase
    .from("portfolio_intelligence")
    .delete()
    .eq("company_id", company_id)
    .eq("type", type)
    .eq("source", "ai");

  if (results.length) {
    await supabase.from("portfolio_intelligence").insert(
      results.map(r => ({
        company_id,
        type,
        entity_name: r.entity_name,
        description: r.description,
        fit_level: r.fit_level,
        warmth: r.warmth,
        source: "ai",
        last_refreshed: new Date().toISOString(),
      }))
    );
  }

  return NextResponse.json({ results, count: results.length });
}
