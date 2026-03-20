// ─── Logo Finder ─────────────────────────────────────────────────────────────
// POST /api/logo-finder/run
// Finds logos for startups that have a website but no logo_url.
// Primary: Clearbit Logo API (free, covers most tech startups)
// Fallback: Claude Sonnet with web_search (requires ANTHROPIC_API_KEY)

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";

function extractDomain(website: string): string | null {
  try {
    const url = new URL(website.startsWith("http") ? website : `https://${website}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function tryClearbit(domain: string): Promise<string | null> {
  try {
    const url = `https://logo.clearbit.com/${domain}`;
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (res.ok) return url;
  } catch {}
  return null;
}

async function tryClaudeWebSearch(name: string, domain: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create(
      {
        model: "claude-sonnet-4-6",
        max_tokens: 512,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tools: [{ type: "web_search_20250305" as any, name: "web_search" }],
        system:
          'You are a brand asset researcher. Find an official company logo URL (PNG or SVG). Respond ONLY with valid JSON: {"logo_url": "https://...", "confidence": 85}',
        messages: [
          {
            role: "user",
            content: `Find the official logo URL for "${name}" (domain: ${domain}). Return JSON only.`,
          },
        ],
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { headers: { "anthropic-beta": "web-search-2025-03-05" } } as any
    );

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return null;
    const match = textBlock.text.match(/\{[\s\S]*?\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    if (parsed.confidence >= 70 && parsed.logo_url && parsed.logo_url !== "") {
      return parsed.logo_url as string;
    }
  } catch {
    // web_search beta not available or parse failed — skip
  }
  return null;
}

export async function POST(req: NextRequest) {
  const { limit = 25, companyId } = await req.json().catch(() => ({}));
  const supabase = createAdminClient();

  // Single company mode
  if (companyId) {
    const { data: company } = await supabase
      .from("companies")
      .select("id, name, website")
      .eq("id", companyId)
      .single();
    if (!company?.website) {
      return NextResponse.json({ success: false, message: "No website set for this company." });
    }
    const domain = extractDomain(company.website);
    if (!domain) return NextResponse.json({ success: false, message: "Could not parse domain." });
    let logoUrl = await tryClearbit(domain);
    if (!logoUrl) logoUrl = await tryClaudeWebSearch(company.name, domain);
    if (logoUrl) {
      await supabase.from("companies").update({ logo_url: logoUrl }).eq("id", company.id);
      return NextResponse.json({ success: true, logo_url: logoUrl });
    }
    return NextResponse.json({ success: false, message: "Logo not found." });
  }

  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, website")
    .eq("type", "startup")
    .is("logo_url", null)
    .not("website", "is", null)
    .limit(Math.min(Number(limit), 50));

  if (!companies?.length) {
    return NextResponse.json({
      success: true,
      processed: 0,
      updated: 0,
      results: [],
      message: "No startups missing logos.",
    });
  }

  const results: {
    name: string;
    logo_url?: string;
    method?: string;
    skipped?: boolean;
  }[] = [];

  for (const company of companies) {
    const domain = extractDomain(company.website!);
    if (!domain) {
      results.push({ name: company.name, skipped: true });
      continue;
    }

    let logoUrl = await tryClearbit(domain);
    let method = "clearbit";

    if (!logoUrl) {
      logoUrl = await tryClaudeWebSearch(company.name, domain);
      method = "claude";
    }

    if (logoUrl) {
      await supabase
        .from("companies")
        .update({ logo_url: logoUrl })
        .eq("id", company.id);
      results.push({ name: company.name, logo_url: logoUrl, method });
    } else {
      results.push({ name: company.name, skipped: true });
    }

    // Respect Clearbit rate limits
    await new Promise((r) => setTimeout(r, 120));
  }

  const updated = results.filter((r) => !r.skipped).length;
  return NextResponse.json({ success: true, processed: companies.length, updated, results });
}
