// ─── POST /api/lp/[id]/news ───────────────────────────────────────────────────
// Fetches LIVE news about an LP using Exa.ai web search.
//
// PRIMARY PATH (EXA_API_KEY configured):
//   1. Runs 3 parallel Exa searches tailored for institutional investors
//   2. Merges & deduplicates results, takes top 8 most recent
//   3. Claude writes a 1–2 sentence summary for each real article
//   4. Returns items with real URLs, real publication dates, and real sources
//
// FALLBACK PATH (EXA_API_KEY not configured, or Exa returns nothing):
//   Falls back to Claude-only generation using company_intelligence AI config.
//
// Returns: { items: NewsItem[], source: "exa" | "claude" }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAiConfig } from "@/lib/ai-config";
import Anthropic from "@anthropic-ai/sdk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ExaResult {
  url?:           string;
  title?:         string;
  text?:          string;
  score?:         number;
  publishedDate?: string;
}

interface ExaResponse {
  results?: ExaResult[];
}

export type NewsItem = {
  headline: string;
  source:   string;
  date:     string;
  summary:  string;
  url:      string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Map URL domain → readable publication name. */
function sourceFromUrl(url: string): string {
  try {
    const domain = new URL(url).hostname.replace(/^www\./, "");
    const KNOWN: Record<string, string> = {
      "bloomberg.com":               "Bloomberg",
      "ft.com":                      "Financial Times",
      "reuters.com":                 "Reuters",
      "wsj.com":                     "Wall Street Journal",
      "cnbc.com":                    "CNBC",
      "techcrunch.com":              "TechCrunch",
      "businesstimes.com.sg":        "Business Times SG",
      "straitstimes.com":            "Straits Times",
      "techinasia.com":              "Tech in Asia",
      "theedgesingapore.com":        "The Edge Singapore",
      "dealstreetasia.com":          "DealStreetAsia",
      "fortune.com":                 "Fortune",
      "forbes.com":                  "Forbes",
      "axios.com":                   "Axios",
      "pitchbook.com":               "PitchBook",
      "crunchbase.com":              "Crunchbase",
      "sifted.eu":                   "Sifted",
      "privateequitywire.co.uk":     "PE Wire",
      "privateequityinternational.com": "PEI",
      "altassets.net":               "AltAssets",
      "institutionalinvestor.com":   "Institutional Investor",
      "pensions-investments.com":    "Pensions & Investments",
      "swfinstitute.org":            "SWF Institute",
      "globalcapital.com":           "GlobalCapital",
      "asianinvestor.net":           "Asian Investor",
    };
    return KNOWN[domain] ?? domain;
  } catch {
    return "Web";
  }
}

/** Format an Exa publishedDate ISO string → YYYY-MM-DD. */
function formatExaDate(dateStr: string | undefined): string {
  if (!dateStr) return "";
  try { return new Date(dateStr).toISOString().slice(0, 10); }
  catch { return (dateStr ?? "").slice(0, 10); }
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();

  // Load AI config + LP details in parallel
  const [cfg, { data: company }] = await Promise.all([
    getAiConfig("company_intelligence"),
    supabase
      .from("companies")
      .select("name, website, description, sectors, type, sub_type, location_city, location_country, tags")
      .eq("id", id)
      .single(),
  ]);

  if (!company) return NextResponse.json({ error: "LP not found" }, { status: 404 });

  const EXA_API_KEY = process.env.EXA_API_KEY;

  // ── PRIMARY: EXA-POWERED NEWS ──────────────────────────────────────────────
  if (EXA_API_KEY) {
    const name   = company.name;
    const lpType = company.sub_type ?? company.type ?? "";

    // Search within the last 18 months (Exa real date filter)
    const since = new Date(Date.now() - 18 * 30 * 24 * 60 * 60 * 1000).toISOString();

    // 3 tailored queries for institutional investors
    const queries = [
      `"${name}" news investment fund 2025`,
      `"${name}" portfolio commitment capital allocation`,
      `"${name}" ${lpType} strategy announcement`,
    ];

    const exaHeaders = {
      "x-api-key":    EXA_API_KEY,
      "Content-Type": "application/json",
    };

    console.log(`[lp/news] Running ${queries.length} Exa searches for "${name}"`);

    // Run all Exa searches in parallel
    const settled = await Promise.allSettled(
      queries.map(query =>
        fetch("https://api.exa.ai/search", {
          method:  "POST",
          headers: exaHeaders,
          body: JSON.stringify({
            query,
            numResults:          5,
            startPublishedDate:  since,
            contents: { text: { maxCharacters: 600 } },
          }),
        })
          .then(r => r.ok ? (r.json() as Promise<ExaResponse>) : Promise.resolve({ results: [] as ExaResult[] }))
          .then(d => (d.results ?? []) as ExaResult[])
          .catch(err => { console.error("[lp/news] Exa query error:", err); return [] as ExaResult[]; })
      )
    );

    // Merge and deduplicate by URL
    const seen = new Set<string>();
    const allResults: ExaResult[] = [];
    for (const r of settled) {
      if (r.status !== "fulfilled") continue;
      for (const item of r.value) {
        if (!item.url || !item.title) continue;
        if (seen.has(item.url)) continue;
        seen.add(item.url);
        allResults.push(item);
      }
    }

    console.log(`[lp/news] Exa returned ${allResults.length} unique results for "${name}"`);

    // Sort by most recent publishedDate, take top 8
    const topResults = allResults
      .sort((a, b) => {
        const ta = a.publishedDate ? new Date(a.publishedDate).getTime() : 0;
        const tb = b.publishedDate ? new Date(b.publishedDate).getTime() : 0;
        return tb - ta;
      })
      .slice(0, 8);

    if (topResults.length > 0) {
      // Claude summarises each real article in a single batch call
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

      const articlesPayload = topResults.map((r, i) => ({
        index:   i,
        title:   r.title,
        snippet: (r.text ?? "").slice(0, 500),
      }));

      const summaries: Record<number, string> = {};

      try {
        const msg = await anthropic.messages.create({
          model:       cfg.model,
          max_tokens:  Math.max(cfg.max_tokens, 1024),
          temperature: cfg.temperature,
          system: `You are a VC analyst summarising news articles about institutional investors (family offices, sovereign wealth funds, pension funds, endowments, corporate VCs).
For each article, write ONE concise sentence (max 25 words) that captures the key fact or development — what happened and why it matters.
Be factual. Do not invent information not present in the article.
Return ONLY a JSON array — no markdown, no prose: [{"index":0,"summary":"..."},...]`,
          messages: [{
            role:    "user",
            content: `Summarise these ${topResults.length} news articles about ${name}:\n${JSON.stringify(articlesPayload, null, 2)}`,
          }],
        });

        const raw      = msg.content[0].type === "text" ? msg.content[0].text : "[]";
        const jsonText = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
        const parsed   = JSON.parse(jsonText) as { index: number; summary: string }[];
        for (const p of parsed) {
          if (typeof p.index === "number" && typeof p.summary === "string") {
            summaries[p.index] = p.summary;
          }
        }
      } catch (err) {
        console.error("[lp/news] Claude summarisation error:", err);
        // Fallback: use the raw article snippet
      }

      // Build final news items
      const items: NewsItem[] = topResults.map((r, i) => ({
        headline: (r.title ?? "").slice(0, 120),
        source:   sourceFromUrl(r.url!),
        date:     formatExaDate(r.publishedDate),
        summary:  summaries[i] ?? (r.text ?? "").slice(0, 200),
        url:      r.url ?? null,
      }));

      console.log(`[lp/news] Returning ${items.length} Exa items for "${name}"`);
      return NextResponse.json({ items, source: "exa" });
    }

    // Exa returned results but all were filtered — fall through to Claude
    console.log(`[lp/news] Exa returned 0 usable results for "${name}", falling back to Claude`);
  }

  // ── FALLBACK: CLAUDE-ONLY GENERATION ──────────────────────────────────────
  // Used when EXA_API_KEY is not set, or Exa returned no results.
  console.log(`[lp/news] Using Claude fallback for "${company.name}"`);

  const cutoff180 = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const contextLines = [
    company.description ? `Description: ${company.description.slice(0, 300)}` : null,
    company.type        ? `Entity type: ${company.type}` : null,
    company.sub_type    ? `Sub-type: ${company.sub_type}` : null,
    company.sectors?.length ? `Focus areas: ${company.sectors.join(", ")}` : null,
    (company.location_city || company.location_country)
      ? `Location: ${[company.location_city, company.location_country].filter(Boolean).join(", ")}`
      : null,
  ].filter(Boolean).join("\n");

  const companyHeader = company.website
    ? `"${company.name}" (${company.website})`
    : `"${company.name}"`;

  const fallbackPrompt = `You are a VC intelligence analyst tracking institutional investors. Provide up to 7 recent intelligence items about ${companyHeader}.

${contextLines}

Focus on: new fund raises or capital deployments, recent investments or commitments made, strategic partnerships, mandate changes, leadership changes, portfolio company announcements, published market commentary, regulatory or geopolitical developments affecting them.

Prefer news from the last 180 days (on or after ${cutoff180}). If limited recent news is available, include the most recent items you can confirm — use accurate dates and do not fabricate events or funding figures.

Return a JSON array ONLY (no markdown, no explanation):
[{"headline":"Short factual headline (max 12 words)","source":"Source name (e.g. Bloomberg, FT)","date":"YYYY-MM-DD or YYYY-MM or YYYY","summary":"1–2 sentence factual summary.","url":"https://... or null"}]`;

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await anthropic.messages.create({
      model:       cfg.model,
      max_tokens:  Math.max(cfg.max_tokens, 1024),
      temperature: cfg.temperature,
      system:      cfg.system_prompt ?? "You are a VC intelligence analyst tracking institutional investors. Return only valid JSON arrays as instructed.",
      messages:    [{ role: "user", content: fallbackPrompt }],
    });

    const text      = msg.content[0].type === "text" ? msg.content[0].text : "[]";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return NextResponse.json({ items: [], source: "claude" });

    const raw: NewsItem[] = JSON.parse(jsonMatch[0]);
    const items = Array.isArray(raw)
      ? raw
          .filter(i => i.headline?.trim())
          .map(i => ({
            ...i,
            url: i.url && i.url !== "null" && String(i.url).startsWith("http") ? i.url : null,
          }))
      : [];

    return NextResponse.json({ items, source: "claude" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
