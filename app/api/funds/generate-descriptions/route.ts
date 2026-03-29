// ─── POST /api/funds/generate-descriptions ────────────────────────────────────
// Generates a <30 word description for every investor company using Claude Haiku.
// Processes all funds in one request (sequential Haiku calls, ~30s for 100 funds).
// Body (all optional):
//   company_id  — restrict to a single fund
//   force       — regenerate even if description already exists (default: true)
//
// Safe to call multiple times.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 300;

const MODEL = "claude-haiku-4-5-20251001";

function buildPrompt(name: string, loc: string, stage: string, sectors: string[], website: string): string {
  const parts: string[] = [];
  if (loc) parts.push(`based in ${loc}`);
  if (stage) parts.push(`${stage}-stage focus`);
  if (sectors.length) parts.push(`sectors: ${sectors.slice(0, 3).join(", ")}`);
  const context = parts.length ? ` (${parts.join("; ")})` : "";
  const siteHint = website ? ` Website: ${website}.` : "";
  return (
    `Write a factual, professional one-sentence description of ${name}${context} in under 28 words.` +
    siteHint +
    ` Describe the type of investor and their investment focus. No filler like "is a leading" or "is a prominent". Output only the description, no quotes.`
  );
}

export async function POST(req: NextRequest) {
  // Auth check
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as {
    company_id?: string;
    force?: boolean;
  };

  // force defaults to true — always regenerate to fix wrong descriptions
  const force = body.force !== false;
  const supabase = createAdminClient();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // ── Fetch target companies ─────────────────────────────────────────────────
  const selectFields = "id, name, type, types, stage, sectors, description, website, location_city, location_country";

  let rows: Record<string, unknown>[] = [];

  if (body.company_id) {
    const { data } = await supabase.from("companies").select(selectFields).eq("id", body.company_id);
    rows = (data ?? []) as Record<string, unknown>[];
  } else {
    // Fetch all companies, filter to investors in JS (handles both `type` and `types`)
    const { data, error } = await supabase
      .from("companies")
      .select(selectFields)
      .order("name", { ascending: true })
      .limit(2000);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    rows = ((data ?? []) as Record<string, unknown>[]).filter((c) => {
      const t = ((c.type as string) ?? "").toLowerCase();
      const ts = ((c.types as string[] | null) ?? []).map((x: string) => x.toLowerCase());
      return t.includes("investor") || ts.some((x: string) => x.includes("investor"));
    });
  }

  // Skip already-described unless force=true
  const toProcess = force ? rows : rows.filter((c) => !(c.description as string | null)?.trim());
  const skipped = rows.length - toProcess.length;

  const results: { name: string; status: "ok" | "error" | "skipped"; description?: string; reason?: string }[] = [];
  let success = 0;
  let failed = 0;

  for (const c of toProcess) {
    try {
      const name = (c.name as string) ?? "Unknown Fund";
      const loc = [(c.location_city as string | null), (c.location_country as string | null)].filter(Boolean).join(", ");
      const sectors = (c.sectors as string[] | null) ?? [];
      const stage = (c.stage as string | null) ?? "";
      const website = (c.website as string | null) ?? "";

      const prompt = buildPrompt(name, loc, stage, sectors, website);

      const msg = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 100,
        messages: [{ role: "user", content: prompt }],
      });

      const raw = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
      if (!raw) throw new Error("Empty response from Claude");

      // Hard cap at 30 words
      const words = raw.split(/\s+/);
      const description = words.slice(0, 30).join(" ").replace(/['"]+/g, "");

      await supabase.from("companies").update({ description }).eq("id", c.id as string);
      results.push({ name, status: "ok", description });
      success++;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const name = (c.name as string) ?? "?";
      console.error(`generate-descriptions error for ${name}:`, reason);
      results.push({ name, status: "error", reason });
      failed++;
    }
  }

  return NextResponse.json({
    total_investors: rows.length,
    skipped,
    processed: toProcess.length,
    success,
    failed,
    results,
  });
}
