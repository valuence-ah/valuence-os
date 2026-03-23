// ─── Company Description Generator /api/companies/generate-description ────────
// Generates a precise ~100-word company overview using Claude.
// Reads ALL uploaded decks and transcripts for full context.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { company_id } = await req.json();
  if (!company_id) return NextResponse.json({ error: "company_id required" }, { status: 400 });

  // Fetch company + ALL decks + ALL transcripts
  const [{ data: company }, { data: docs }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", company_id).single(),
    supabase
      .from("documents")
      .select("name, type, extracted_text, ai_summary")
      .eq("company_id", company_id)
      .in("type", ["deck", "transcript"])
      .order("created_at", { ascending: false }),
  ]);

  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  // Build document context — combine all deck and transcript text
  const decks = (docs ?? []).filter(d => d.type === "deck");
  const transcripts = (docs ?? []).filter(d => d.type === "transcript");

  const deckContext = decks.length > 0
    ? decks.map((d, i) =>
        `DECK ${i + 1}: ${d.name}\n${
          d.extracted_text
            ? d.extracted_text.slice(0, 8000)
            : d.ai_summary
            ? `Summary: ${d.ai_summary}`
            : "(no text extracted)"
        }`
      ).join("\n\n---\n\n")
    : "No deck uploaded.";

  const transcriptContext = transcripts.length > 0
    ? transcripts.map((t, i) =>
        `TRANSCRIPT ${i + 1}: ${t.name}\n${
          t.extracted_text
            ? t.extracted_text.slice(0, 5000)
            : "(no text extracted)"
        }`
      ).join("\n\n---\n\n")
    : "No transcripts uploaded.";

  const prompt = `You are a senior analyst at Valuence Ventures, an early-stage deeptech fund focused on cleantech and techbio. Produce a precise company overview of no more than 100 words.

INPUTS
Company: ${company.name}
Website: ${company.website ?? "not provided"}
Keywords: ${company.tags?.join(", ") ?? "not provided"}
HQ city: ${company.location_city ?? "not provided"}
Founded: ${company.founded_year ?? "not provided"}

PITCH DECK CONTENT (${decks.length} deck${decks.length !== 1 ? "s" : ""} uploaded):
${deckContext}

MEETING TRANSCRIPTS (${transcripts.length} transcript${transcripts.length !== 1 ? "s" : ""} uploaded):
${transcriptContext}

RESEARCH RULES
Review the deck first, then the transcripts, then the website. Supplement with reputable external sources only if details are missing.
Do not fabricate. If a detail cannot be confirmed, omit it.
Do not describe your research process. Output only the final result.

WRITING RULES
Single paragraph, strictly under 130 words.
Cover in this order: HQ city (city only), founding year, core technology, key differentiation (tied to keywords where relevant), primary markets or applications, and one concrete reason why the technology is significant.
Factual, investment-relevant, no marketing language. American English.

OUTPUT FORMAT
[paragraph under 130 words]
Assumptions: [one short clause only if an item was inferred -- omit this line entirely if nothing was inferred]`;

  try {
    const { text } = await generateText({
      model: anthropic("claude-opus-4-5"),
      maxTokens: 400,
      messages: [{ role: "user", content: prompt }],
    });

    const description = text.trim();

    // Save to companies table
    await supabase
      .from("companies")
      .update({ description })
      .eq("id", company_id);

    return NextResponse.json({ description });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
