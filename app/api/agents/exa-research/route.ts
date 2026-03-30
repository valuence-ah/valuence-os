// ─── Exa Research API Route ───────────────────────────────────────────────────
// Runs Exa.ai searches for a company, extracts insights with Claude Haiku,
// and saves signals + optionally updates the company description.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAiConfig } from "@/lib/ai-config";

export const maxDuration = 60;

interface ExaResult {
  id?: string;
  url?: string;
  title?: string;
  text?: string;
  score?: number;
  publishedDate?: string;
}

interface ExaResponse {
  results?: ExaResult[];
}

interface ClaudeResearch {
  description_update?: string;
  recent_funding?: string;
  tech_highlights?: string;
  news_summary?: string;
}

export async function POST(req: NextRequest) {
  const EXA_API_KEY = process.env.EXA_API_KEY;
  if (!EXA_API_KEY) {
    return NextResponse.json(
      { error: "EXA_API_KEY not configured" },
      { status: 503 }
    );
  }

  const body = await req.json() as { company_id?: string };
  const { company_id } = body;
  if (!company_id) {
    return NextResponse.json({ error: "company_id is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const cfg = await getAiConfig("exa_research");

  // 1. Fetch company from Supabase
  const { data: company, error: companyError } = await supabase
    .from("companies")
    .select("id, name, website, description, sectors")
    .eq("id", company_id)
    .single();

  if (companyError || !company) {
    return NextResponse.json({ error: "Company not found" }, { status: 404 });
  }

  const { name, description, sectors } = company as {
    id: string;
    name: string;
    website: string | null;
    description: string | null;
    sectors: string[] | null;
  };

  // 2. Run 2 Exa searches
  const exaHeaders = {
    "x-api-key": EXA_API_KEY,
    "Content-Type": "application/json",
  };

  const searchQueries = [
    `${name} funding OR seed round OR Series A`,
    `${name} technology research product`,
  ];

  const allResults: ExaResult[] = [];

  for (const query of searchQueries) {
    try {
      const res = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: exaHeaders,
        body: JSON.stringify({
          query,
          numResults: 5,
          contents: { text: { maxCharacters: 800 } },
        }),
      });

      if (!res.ok) {
        console.error(`[Exa] HTTP ${res.status} for query: ${query}`);
        continue;
      }

      const data = (await res.json()) as ExaResponse;
      const results = data.results ?? [];
      allResults.push(...results);
    } catch (err) {
      console.error(`[Exa] Error for query "${query}":`, err);
    }
  }

  // 3. Pass combined text to Claude Haiku for extraction
  let research: ClaudeResearch = {};

  if (allResults.length > 0) {
    const combinedText = allResults
      .map((r, i) => `[${i + 1}] ${r.title ?? ""}\n${r.text ?? ""}`)
      .join("\n\n---\n\n")
      .slice(0, 8000);

    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const message = await anthropic.messages.create({
        model: cfg.model,
        max_tokens: cfg.max_tokens,
        system: cfg.system_prompt ?? `You are a VC analyst extracting structured insights about a company.
Return ONLY valid JSON with these fields:
{
  "description_update": "1-2 sentence description of what the company does",
  "recent_funding": "any recent funding rounds or investments mentioned",
  "tech_highlights": "key technology or product highlights",
  "news_summary": "brief summary of recent news"
}
If information is not available for a field, use null. No markdown. No prose outside JSON.`,
        messages: [
          {
            role: "user",
            content: `Company: ${name}
Sectors: ${(sectors ?? []).join(", ")}

Research findings:
${combinedText}`,
          },
        ],
      });

      const rawText =
        message.content[0].type === "text" ? message.content[0].text : "{}";
      const jsonText = rawText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();

      try {
        research = JSON.parse(jsonText) as ClaudeResearch;
      } catch {
        research = {};
      }
    } catch (err) {
      console.error("[Exa research] Claude error:", err);
    }
  }

  // 4. Update company description if needed
  if (research.description_update && !description) {
    await supabase
      .from("companies")
      .update({ description: research.description_update })
      .eq("id", company_id);
  }

  // 5. Save each Exa result as a sourcing_signal
  let signals_saved = 0;

  const signalRows = allResults
    .filter((r) => r.url)
    .map((r) => ({
      source: "exa" as const,
      signal_type: "news" as const,
      title: r.title ?? r.url ?? "Exa result",
      url: r.url ?? "",
      content: (r.text ?? "").slice(0, 5000),
      summary: r.title ?? null,
      relevance_score: typeof r.score === "number" ? Math.max(0, Math.min(1, r.score)) : null,
      sector_tags: sectors ?? [],
      authors: [],
      published_date: r.publishedDate ? r.publishedDate.slice(0, 10) : null,
      company_id,
      status: "new" as const,
    }));

  if (signalRows.length > 0) {
    // Deduplicate by URL
    const urls = signalRows.map((r) => r.url).filter(Boolean);
    const { data: existing } = await supabase
      .from("sourcing_signals")
      .select("url")
      .in("url", urls);

    const existingUrls = new Set(
      (existing ?? []).map((r: { url: string | null }) => r.url).filter(Boolean)
    );

    const toInsert = signalRows.filter((r) => !existingUrls.has(r.url));

    if (toInsert.length > 0) {
      const { data, error } = await supabase
        .from("sourcing_signals")
        .insert(toInsert)
        .select("id");

      if (!error) {
        signals_saved = data?.length ?? 0;
      } else {
        console.error("[Exa research] Insert error:", error);
      }
    }
  }

  // 6. Return result
  return NextResponse.json({
    success: true,
    company_id,
    signals_saved,
    research,
  });
}
