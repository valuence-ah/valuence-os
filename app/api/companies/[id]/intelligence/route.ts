// ─── Company Intelligence /api/companies/[id]/intelligence ───────────────────
// Uses Claude to surface intelligence items about a company.
// Enriches context with saved Exa signals + interactions from DB.
// Prompt is fully editable in Admin → AI Config → Company Intelligence.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getAiConfig } from "@/lib/ai-config";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

export const maxDuration = 45;

type IntelItem = { headline: string; source: string; date: string; summary?: string; url?: string | null };

/** Replace {{variable}} placeholders in a template string. */
function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replaceAll(`{{${k}}}`, v),
    template
  );
}

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
      .select("name, website, description, sectors, sub_type, location_city, location_country, tags, stage")
      .eq("id", id)
      .single(),
  ]);

  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  // Pull saved Exa signals for this company — last 180 days only
  const cutoff180 = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: signals } = await supabase
    .from("sourcing_signals")
    .select("title, summary, source, published_date, url")
    .eq("company_id", id)
    .gte("published_date", cutoff180)
    .order("relevance_score", { ascending: false })
    .limit(10);

  // Pull recent meeting interactions (for extra context)
  const { data: interactions } = await supabase
    .from("interactions")
    .select("type, subject, summary, date")
    .eq("company_id", id)
    .in("type", ["meeting", "call"])
    .order("date", { ascending: false })
    .limit(5);

  // Build context block
  const contextLines = [
    company.description ? `Description: ${company.description.slice(0, 300)}` : null,
    company.stage       ? `Stage: ${company.stage}` : null,
    company.sectors?.length ? `Sectors: ${company.sectors.join(", ")}` : null,
    company.sub_type    ? `Sub-sector: ${company.sub_type}` : null,
    (company.location_city || company.location_country)
      ? `Location: ${[company.location_city, company.location_country].filter(Boolean).join(", ")}`
      : null,
    company.tags?.length ? `Keywords: ${(company.tags as string[]).join(", ")}` : null,
  ].filter(Boolean);

  if (signals?.length) {
    contextLines.push(
      "\nRecent signals (use these as your primary source — include the exact url field):",
      ...signals.map((s, idx) =>
        `[${idx}] title: ${s.title ?? "(no title)"} | date: ${s.published_date ?? "unknown"} | source: ${s.source ?? "Exa"} | url: ${s.url ?? "null"} | summary: ${s.summary ? s.summary.slice(0, 150) : ""}`
      )
    );
  }

  if (interactions?.length) {
    contextLines.push(
      "\nRecent meetings/calls:",
      ...interactions.map(i =>
        `• ${i.date ? i.date.slice(0, 10) : "?"} — ${i.subject ?? i.type}${i.summary ? `: ${i.summary.slice(0, 100)}` : ""}`
      )
    );
  }

  const context = contextLines.join("\n");

  // ── Hardcoded default prompt (used when Admin has left user_prompt blank) ───
  const defaultPrompt = `You are a VC intelligence analyst. Provide up to 7 intelligence items about {{company_header}}.

{{context}}

STRICT RULES:
1. Only include news/events from the last 180 days (on or after {{cutoff_date}}). Reject anything older.
2. Prioritise the "Recent signals" listed above — use their exact url, source, and date.
3. For signal-based items, copy the url exactly from the signal list. Do NOT set url to null if a url was provided.
4. If you have no signals and cannot confirm an item is within the last 180 days from your knowledge, do NOT include it. Return fewer items rather than fabricating or including old news.
5. Never invent dates or funding amounts.

Focus on: funding rounds, partnerships, product launches, scientific publications, grants, regulatory milestones, team changes, market developments, competitive signals.

Return a JSON array ONLY (no markdown, no explanation):
[
  {
    "headline": "Short factual headline (max 12 words)",
    "source": "Source name (e.g. TechCrunch, NIH, company blog)",
    "date": "YYYY-MM-DD or YYYY-MM or YYYY",
    "summary": "1–2 sentence factual summary.",
    "url": "https://... or null"
  }
]`;

  // ── Template variables available in the Admin prompt editor ─────────────────
  const templateVars: Record<string, string> = {
    company_name:   company.name,
    company_header: company.website
      ? `"${company.name}" (${company.website})`
      : `"${company.name}"`,
    website:        company.website ?? "",
    context,
    cutoff_date:    cutoff180,
  };

  // If the Admin has written a custom prompt, use it as the full template.
  // Otherwise fall back to the hardcoded default.
  const rawPrompt = cfg.user_prompt?.trim() ? cfg.user_prompt : defaultPrompt;
  const finalPrompt = interpolate(rawPrompt, templateVars);

  const systemPrompt = cfg.system_prompt ??
    "You are a VC intelligence analyst. Return only valid JSON arrays as instructed.";

  // Use at least 2048 tokens — 1024 can truncate mid-JSON with 7 items
  const maxTokens = Math.max(cfg.max_tokens, 2048);

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
      console.error("[intelligence] No JSON array in response:", text.slice(0, 200));
      return NextResponse.json({ error: "Model returned unexpected format" }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const raw: IntelItem[] = Array.isArray(parsed) ? parsed : [];

    // Sanitise: drop items with no headline; convert string "null" URLs to real null
    const items = raw
      .filter(item => item.headline?.trim())
      .map(item => ({
        ...item,
        url: item.url && item.url !== "null" && item.url.startsWith("http")
          ? item.url
          : null,
      }));

    return NextResponse.json({ items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[intelligence] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
