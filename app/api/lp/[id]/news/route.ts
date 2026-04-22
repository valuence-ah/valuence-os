// ─── POST /api/lp/[id]/news ───────────────────────────────────────────────────
// Fetches recent news about an LP (family office, sovereign wealth fund, corporate, etc.)
// Uses getAiConfig("company_intelligence") so the prompt is fully configurable
// in Admin → AI Config → Company Intelligence — no hardcoded logic.
// Same template variables as /api/companies/[id]/intelligence.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAiConfig } from "@/lib/ai-config";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

type IntelItem = { headline: string; source: string; date: string; summary?: string; url?: string | null };

/** Replace {{variable}} placeholders in a template string. */
function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replaceAll(`{{${k}}}`, v),
    template
  );
}

// Default prompt (used when Admin has left user_prompt blank).
// Tuned for institutional investors: prefers 180-day news but doesn't
// hard-reject if Claude's knowledge doesn't extend to the cutoff date.
const DEFAULT_PROMPT = `You are a VC intelligence analyst tracking institutional investors. Provide up to 7 recent intelligence items about {{company_header}}.

{{context}}

Focus on: new fund raises or capital deployments, recent investments or commitments made, strategic partnerships, mandate changes, leadership changes, portfolio company announcements, published market commentary, regulatory or geopolitical developments affecting them.

Prefer news from the last 180 days (on or after {{cutoff_date}}). If limited recent news is available, include the most recent items you can confirm — use accurate dates and do not fabricate events or funding figures.

Return a JSON array ONLY (no markdown, no explanation):
[
  {
    "headline": "Short factual headline (max 12 words)",
    "source": "Source name (e.g. Bloomberg, FT, company press release)",
    "date": "YYYY-MM-DD or YYYY-MM or YYYY",
    "summary": "1–2 sentence factual summary.",
    "url": "https://... or null"
  }
]`;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();

  // Load AI config + company data in parallel
  const [cfg, { data: company }] = await Promise.all([
    getAiConfig("company_intelligence"),
    supabase
      .from("companies")
      .select("name, website, description, sectors, type, sub_type, location_city, location_country, tags")
      .eq("id", id)
      .single(),
  ]);

  if (!company) return NextResponse.json({ error: "LP not found" }, { status: 404 });

  // 180-day cutoff calculated dynamically from today
  const cutoff180 = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  // Build context block (same structure as company intelligence)
  const contextLines = [
    company.description ? `Description: ${company.description.slice(0, 300)}` : null,
    company.type        ? `Entity type: ${company.type}` : null,
    company.sub_type    ? `Sub-type: ${company.sub_type}` : null,
    company.sectors?.length ? `Focus areas: ${company.sectors.join(", ")}` : null,
    company.tags?.length    ? `Keywords: ${(company.tags as string[]).join(", ")}` : null,
    (company.location_city || company.location_country)
      ? `Location: ${[company.location_city, company.location_country].filter(Boolean).join(", ")}`
      : null,
  ].filter(Boolean);

  const context = contextLines.join("\n");

  // Template variables — same set as /api/companies/[id]/intelligence
  const templateVars: Record<string, string> = {
    company_name:   company.name,
    company_header: company.website
      ? `"${company.name}" (${company.website})`
      : `"${company.name}"`,
    website:        company.website ?? "",
    context,
    cutoff_date:    cutoff180,
  };

  const rawPrompt    = cfg.user_prompt?.trim() ? cfg.user_prompt : DEFAULT_PROMPT;
  const finalPrompt  = interpolate(rawPrompt, templateVars);
  const systemPrompt = cfg.system_prompt ??
    "You are a VC intelligence analyst tracking institutional investors. Return only valid JSON arrays as instructed.";

  const maxTokens = Math.max(cfg.max_tokens, 1024);

  try {
    const { text } = await generateText({
      model: anthropic(cfg.model as Parameters<typeof anthropic>[0]),
      maxTokens,
      temperature: cfg.temperature,
      system: systemPrompt,
      messages: [{ role: "user", content: finalPrompt }],
    });

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Model returned unexpected format" }, { status: 500 });
    }

    const raw: IntelItem[] = JSON.parse(jsonMatch[0]);
    const items = Array.isArray(raw)
      ? raw
          .filter(i => i.headline?.trim())
          .map(i => ({
            ...i,
            url: i.url && i.url !== "null" && i.url.startsWith("http") ? i.url : null,
          }))
      : [];

    return NextResponse.json({ items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
