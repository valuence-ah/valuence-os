// ─── POST /api/lp/[id]/news ───────────────────────────────────────────────────
// Fetches recent news about an LP (family office, sovereign wealth, corporate, etc.)
// Uses a prompt tuned for institutional investors — no strict 180-day cutoff,
// broader 1–2 year lookback so Claude's training data can contribute.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: company } = await supabase
    .from("companies")
    .select("name, website, description, sectors, type, location_city, location_country, tags")
    .eq("id", id)
    .single();

  if (!company) return NextResponse.json({ error: "LP not found" }, { status: 404 });

  const contextLines = [
    company.description ? `About: ${company.description.slice(0, 400)}` : null,
    company.type        ? `Entity type: ${company.type}` : null,
    company.sectors?.length ? `Focus areas / sectors: ${company.sectors.join(", ")}` : null,
    company.tags?.length    ? `Keywords: ${(company.tags as string[]).join(", ")}` : null,
    (company.location_city || company.location_country)
      ? `Location: ${[company.location_city, company.location_country].filter(Boolean).join(", ")}`
      : null,
    company.website ? `Website: ${company.website}` : null,
  ].filter(Boolean).join("\n");

  const prompt = `You are an investment research analyst tracking institutional investors. Provide up to 7 recent notable updates about "${company.name}"${company.website ? ` (${company.website})` : ""}.

${contextLines}

Focus on: new fund raises or capital deployments, recent investments or commitments made, strategic partnerships or mandate changes, leadership changes, portfolio company announcements, published market commentary or reports, regulatory or geopolitical developments affecting them.

Include news from the last 1–2 years based on your knowledge. Use the actual year/month of events — do not fabricate dates. If you are uncertain about a date, use the year only (e.g. "2024"). Include fewer items rather than inventing facts.

Return a JSON array ONLY — no markdown, no explanation:
[
  {
    "headline": "Short factual headline (max 12 words)",
    "source": "Source name (e.g. Bloomberg, FT, company press release)",
    "date": "YYYY-MM or YYYY",
    "summary": "1–2 sentence factual summary.",
    "url": null
  }
]`;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-3-5",
      max_tokens: 1500,
      temperature: 0.2,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map(b => b.text)
      .join("");

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Model returned unexpected format" }, { status: 500 });
    }

    const raw = JSON.parse(jsonMatch[0]);
    const items = Array.isArray(raw)
      ? raw.filter((i) => i.headline?.trim())
      : [];

    return NextResponse.json({ items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
