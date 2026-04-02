// ─── POST /api/funds/generate-recent-investments ──────────────────────────────
// Uses Claude Haiku to generate a list of recent investments made by a VC fund,
// based on the fund's name, location, focus, and any available context.
// Body: { company_id: string; force?: boolean }
// Returns: { investments: { name, round, sector, date }[]; updated_at: string | null }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;
const MODEL = "claude-haiku-4-5";

export async function POST(req: NextRequest) {
  // Auth check
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { company_id?: string; force?: boolean };
  if (!body.company_id) {
    return NextResponse.json({ error: "company_id required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // ── Load from cache if not forcing ───────────────────────────────────────────
  if (!body.force) {
    const { data: cached } = await supabase
      .from("fund_investments")
      .select("company_name, round, sector, year, updated_at")
      .eq("fund_id", body.company_id)
      .order("company_name");

    if (cached && cached.length > 0) {
      const updatedAt = (cached[0] as { updated_at: string }).updated_at;
      return NextResponse.json({
        investments: cached.map((r: { company_name: string; round: string; sector: string; year: string }) => ({
          name: r.company_name,
          round: r.round,
          sector: r.sector,
          date: r.year,
        })),
        updated_at: updatedAt,
        from_cache: true,
      });
    }
  }

  // Fetch fund details
  const { data: fund } = await supabase
    .from("companies")
    .select("id, name, location_city, location_country, stage, sectors, description, website")
    .eq("id", body.company_id)
    .single();

  if (!fund?.name) return NextResponse.json({ investments: [], updated_at: null });

  const name      = (fund.name as string).trim();
  const locParts  = [(fund.location_city as string | null), (fund.location_country as string | null)].filter(Boolean);
  const loc       = locParts.join(", ");
  const sectors   = ((fund.sectors as string[] | null) ?? []).slice(0, 4).join(", ");
  const stage     = (fund.stage as string | null) ?? "";
  const desc      = (fund.description as string | null) ?? "";

  const contextParts: string[] = [];
  if (loc)     contextParts.push(`based in ${loc}`);
  if (stage)   contextParts.push(`${stage}-stage focus`);
  if (sectors) contextParts.push(`sectors: ${sectors}`);
  if (desc)    contextParts.push(`about: ${desc}`);

  const context = contextParts.length ? `(${contextParts.join("; ")})` : "";

  const prompt =
    `List 4 real or highly plausible recent portfolio investments made by ${name} ${context}.\n` +
    `For each, provide: company name, funding round (e.g. Seed, Series A), primary sector (2-3 words), and year.\n` +
    `Return ONLY a JSON array — no markdown, no explanation:\n` +
    `[{"name":"Company","round":"Series A","sector":"Energy Storage","date":"2023"}, ...]`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });

    const raw = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
    if (!raw) return NextResponse.json({ investments: [], updated_at: null });

    // Extract JSON array from response (in case Claude wraps it in prose)
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return NextResponse.json({ investments: [], updated_at: null });

    const parsed = JSON.parse(match[0]) as unknown[];

    // Validate and sanitize each item
    const investments = parsed
      .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
      .map(item => ({
        name:   String(item.name   ?? "").trim().slice(0, 60),
        round:  String(item.round  ?? "").trim().slice(0, 30),
        sector: String(item.sector ?? "").trim().slice(0, 40),
        date:   String(item.date   ?? "").trim().slice(0, 10),
      }))
      .filter(i => i.name.length > 0)
      .slice(0, 5);

    // Persist to fund_investments table
    const now = new Date().toISOString();
    if (investments.length > 0) {
      // Delete existing rows for this fund then insert fresh
      await supabase.from("fund_investments").delete().eq("fund_id", body.company_id);
      await supabase.from("fund_investments").insert(
        investments.map(inv => ({
          fund_id:      body.company_id,
          company_name: inv.name,
          round:        inv.round,
          sector:       inv.sector,
          year:         inv.date,
          source:       "ai_generated",
          updated_at:   now,
        }))
      );
    }

    return NextResponse.json({ investments, updated_at: now, from_cache: false });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error(`generate-recent-investments error for ${name}:`, reason);
    return NextResponse.json({ investments: [], updated_at: null, error: reason });
  }
}
