// ─── Company Description Generator /api/companies/generate-description ────────
// Generates a precise ~100-word company overview using Claude.
// Passes deck PDFs directly to Claude via URL — no text extraction needed.

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

  // Fetch company + deck and transcript documents
  const [{ data: company }, { data: docs }, { data: ints }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", company_id).single(),
    supabase
      .from("documents")
      .select("name, type, storage_path, extracted_text")
      .eq("company_id", company_id)
      .in("type", ["deck", "transcript"])
      .order("created_at", { ascending: false }),
    supabase
      .from("interactions")
      .select("subject, body, type")
      .eq("company_id", company_id)
      .eq("type", "meeting")
      .not("body", "is", null)
      .order("date", { ascending: false })
      .limit(5),
  ]);

  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const decks = (docs ?? []).filter(d => d.type === "deck" && d.storage_path);
  const transcriptDocs = (docs ?? []).filter(d => d.type === "transcript");

  // Build transcript text context (fast — already extracted)
  const transcriptText = [
    ...transcriptDocs.map(t => t.extracted_text?.slice(0, 3000)).filter(Boolean),
    ...(ints ?? []).map(i => i.body?.slice(0, 2000)).filter(Boolean),
  ].join("\n\n---\n\n");

  const prompt = `You are a senior analyst at Valuence Ventures, an early-stage deeptech fund focused on cleantech and techbio. Produce a precise company overview of no more than 100 words.

INPUTS
Company: ${company.name}
Website: ${company.website ?? "not provided"}
Keywords: ${company.tags?.join(", ") ?? "not provided"}
HQ city: ${company.location_city ?? "not provided"}
Founded: ${company.founded_year ?? "not provided"}
${transcriptText ? `\nMEETING TRANSCRIPT EXCERPTS:\n${transcriptText}` : ""}

RESEARCH RULES
Review the deck(s) first, then transcripts, then the website. Supplement with reputable external sources only if details are missing.
Do not fabricate. If a detail cannot be confirmed, omit it.
Do not describe your research process. Output only the final result.

WRITING RULES
Single paragraph, strictly under 130 words.
Cover in this order: HQ city (city only), founding year, core technology, key differentiation (tied to keywords where relevant), primary markets or applications, and one concrete reason why the technology is significant.
Factual, investment-relevant, no marketing language. American English.

OUTPUT FORMAT
[paragraph under 130 words]
Assumptions: [one short clause only if an item was inferred -- omit this line entirely if nothing was inferred]`;

  // Build message content — attach each deck PDF as a URL for Claude to read directly
  type ContentPart =
    | { type: "text"; text: string }
    | { type: "file"; data: URL; mimeType: string };

  const content: ContentPart[] = [];

  for (const deck of decks.slice(0, 3)) {
    const { data: { publicUrl } } = supabase.storage.from("decks").getPublicUrl(deck.storage_path!);
    content.push({ type: "file", data: new URL(publicUrl), mimeType: "application/pdf" });
  }

  content.push({ type: "text", text: prompt });

  try {
    const { text } = await generateText({
      model: anthropic("claude-opus-4-5"),
      maxTokens: 400,
      messages: [{ role: "user", content }],
    });

    const description = text.trim();

    await supabase.from("companies").update({ description }).eq("id", company_id);

    return NextResponse.json({ description });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
