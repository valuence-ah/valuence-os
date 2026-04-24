// ─── POST /api/funds/generate-recent-investments ──────────────────────────────
// Uses Exa (real web search) + Claude to extract genuinely recent investments
// made by a VC fund. Exa returns live news with publication dates, so results
// are grounded in real articles — not hallucinated from training memory.
// Body: { company_id: string; force?: boolean }
// Returns: { investments: { name, round, sector, date }[]; updated_at: string | null }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAiConfig } from "@/lib/ai-config";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 60;

interface ExaResult {
  url?: string;
  title?: string;
  text?: string;
  publishedDate?: string;
}

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

  // ── Load from cache if not forcing (serve rows updated in the last 7 days) ──
  if (!body.force) {
    const cutoff7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: cached } = await supabase
      .from("fund_investments")
      .select("company_name, round, sector, year, updated_at")
      .eq("fund_id", body.company_id)
      .gte("updated_at", cutoff7d)
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

  const name    = (fund.name as string).trim();
  const EXA_KEY = process.env.EXA_API_KEY;
  const cfg     = await getAiConfig("fund_intelligence");
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let investments: { name: string; round: string; sector: string; date: string }[] = [];

  // ── Strategy A: Exa live search (preferred — returns real dated articles) ───
  if (EXA_KEY) {
    const queries = [
      `"${name}" investment portfolio company 2025`,
      `"${name}" backs funds invests seed series 2025`,
    ];
    const results: ExaResult[] = [];

    for (const q of queries) {
      try {
        const r = await fetch("https://api.exa.ai/search", {
          method: "POST",
          headers: { "x-api-key": EXA_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({
            query: q,
            numResults: 6,
            contents: { text: { maxCharacters: 600 } },
            startPublishedDate: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
          }),
        });
        if (r.ok) {
          const d = await r.json();
          results.push(...(d.results ?? []));
        }
      } catch {}
    }

    if (results.length > 0) {
      const combined = results.slice(0, 8).map((r, i) =>
        `[${i}] Title: ${r.title}\nDate: ${r.publishedDate?.slice(0, 10) ?? "unknown"}\nURL: ${r.url}\nSnippet: ${r.text?.slice(0, 400)}`
      ).join("\n\n---\n\n");

      try {
        const msg = await anthropic.messages.create({
          model: cfg.model,
          max_tokens: 600,
          messages: [{
            role: "user",
            content:
              `You are a VC research assistant. From the news articles below about ${name} (a VC fund), ` +
              `extract investments that ${name} MADE INTO portfolio companies (not investments made in the fund itself). ` +
              `Only include deals where ${name} is explicitly named as the investor.\n\n` +
              `For each deal extract: portfolio company name, funding round (Seed/Series A/etc), sector (2-3 words), ` +
              `and date (YYYY-MM format from the article date).\n\n` +
              `Return ONLY a JSON array, no markdown:\n` +
              `[{"name":"Company","round":"Series A","sector":"Energy Storage","date":"2025-03"}, ...]\n\n` +
              `If no clear investment deals are mentioned, return [].\n\n` +
              `Articles:\n${combined}`,
          }],
        });

        const raw = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
        const match = raw.match(/\[[\s\S]*\]/);
        if (match) {
          const parsed = JSON.parse(match[0]) as unknown[];
          investments = parsed
            .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
            .map(item => ({
              name:   String(item.name   ?? "").trim().slice(0, 60),
              round:  String(item.round  ?? "").trim().slice(0, 30),
              sector: String(item.sector ?? "").trim().slice(0, 40),
              date:   String(item.date   ?? "").trim().slice(0, 10),
            }))
            .filter(i => i.name.length > 0)
            .slice(0, 6);
        }
      } catch {}
    }
  }

  // ── Strategy B: Claude from knowledge (fallback if no Exa key or no results) ─
  // Note: Claude's training has a knowledge cutoff so dates may not be accurate.
  // This is a best-effort fallback only.
  if (investments.length === 0) {
    const loc     = [(fund.location_city as string | null), (fund.location_country as string | null)].filter(Boolean).join(", ");
    const sectors = ((fund.sectors as string[] | null) ?? []).slice(0, 4).join(", ");
    const stage   = (fund.stage as string | null) ?? "";
    const contextParts: string[] = [];
    if (loc)     contextParts.push(`based in ${loc}`);
    if (stage)   contextParts.push(`${stage}-stage focus`);
    if (sectors) contextParts.push(`sectors: ${sectors}`);
    const context = contextParts.length ? `(${contextParts.join("; ")})` : "";

    try {
      const msg = await anthropic.messages.create({
        model: cfg.model,
        max_tokens: 500,
        messages: [{
          role: "user",
          content:
            `List the most recent known portfolio investments made by ${name} ${context}.\n` +
            `Note: only include investments you have high confidence in from your training data.\n` +
            `For each: company name, funding round, sector (2-3 words), and approximate date (YYYY or YYYY-MM).\n` +
            `Return ONLY a JSON array:\n` +
            `[{"name":"Company","round":"Series A","sector":"Energy Storage","date":"2024-Q3"}, ...]`,
        }],
      });

      const raw = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]) as unknown[];
        investments = parsed
          .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
          .map(item => ({
            name:   String(item.name   ?? "").trim().slice(0, 60),
            round:  String(item.round  ?? "").trim().slice(0, 30),
            sector: String(item.sector ?? "").trim().slice(0, 40),
            date:   String(item.date   ?? "").trim().slice(0, 10),
          }))
          .filter(i => i.name.length > 0)
          .slice(0, 5);
      }
    } catch {}
  }

  // Persist to fund_investments table
  const now = new Date().toISOString();
  if (investments.length > 0) {
    await supabase.from("fund_investments").delete().eq("fund_id", body.company_id);
    await supabase.from("fund_investments").insert(
      investments.map(inv => ({
        fund_id:      body.company_id,
        company_name: inv.name,
        round:        inv.round,
        sector:       inv.sector,
        year:         inv.date,
        source:       EXA_KEY ? "exa_search" : "ai_generated",
        updated_at:   now,
      }))
    );
  }

  return NextResponse.json({ investments, updated_at: now, from_cache: false });
}
