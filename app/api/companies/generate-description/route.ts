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

  // Fetch config + company + deck and transcript documents
  const [{ data: company }, { data: docs }, { data: ints }, { data: aiConfig }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", company_id).single(),
    supabase
      .from("documents")
      .select("name, type, storage_path, mime_type, extracted_text")
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
    supabase.from("ai_configs").select("*").eq("name", "company_description").single(),
  ]);

  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const decks = (docs ?? []).filter(d => d.type === "deck" && d.storage_path);
  const transcriptDocs = (docs ?? []).filter(d => d.type === "transcript");
  const pdfTranscripts = transcriptDocs.filter(t => t.storage_path && t.mime_type === "application/pdf");
  const textTranscripts = transcriptDocs.filter(t => t.extracted_text);

  // Build transcript text context from already-extracted text
  const transcriptText = [
    ...textTranscripts.map(t => t.extracted_text?.slice(0, 3000)).filter(Boolean),
    ...(ints ?? []).map(i => i.body?.slice(0, 2000)).filter(Boolean),
  ].join("\n\n---\n\n");

  // Use DB prompt template, fall back to hardcoded default
  const promptTemplate = (aiConfig as { user_prompt?: string } | null)?.user_prompt ||
    `You are a senior analyst at Valuence Ventures. Produce a precise company overview of no more than 100 words. Single paragraph, strictly under 130 words. Cover: HQ city, founding year, core technology, differentiation, markets, significance. Factual, no marketing language.`;

  const prompt = `INPUTS
Company: {{company_name}}
Website: {{website}}
Keywords: {{keywords}}
HQ city: {{hq_city}}
Founded: {{founded_year}}
{{transcript_text}}

${promptTemplate}`
    .replace("{{company_name}}", company.name)
    .replace("{{website}}", company.website ?? "not provided")
    .replace("{{keywords}}", company.tags?.join(", ") ?? "not provided")
    .replace("{{hq_city}}", company.location_city ?? "not provided")
    .replace("{{founded_year}}", String(company.founded_year ?? "not provided"))
    .replace("{{transcript_text}}", transcriptText ? `MEETING TRANSCRIPT EXCERPTS:\n${transcriptText}` : "");

  // Build message content — attach each deck PDF as a URL for Claude to read directly
  type ContentPart =
    | { type: "text"; text: string }
    | { type: "file"; data: URL; mimeType: string };

  const content: ContentPart[] = [];

  for (const deck of decks.slice(0, 3)) {
    const { data: { publicUrl } } = supabase.storage.from("decks").getPublicUrl(deck.storage_path!);
    content.push({ type: "file", data: new URL(publicUrl), mimeType: "application/pdf" });
  }

  // PDF transcripts — pass as URL; text transcripts are already in the prompt
  for (const t of pdfTranscripts.slice(0, 2)) {
    const { data: { publicUrl } } = supabase.storage.from("transcripts").getPublicUrl(t.storage_path!);
    content.push({ type: "file", data: new URL(publicUrl), mimeType: "application/pdf" });
  }

  content.push({ type: "text", text: prompt });

  try {
    const cfg = aiConfig as { model: string; max_tokens: number; temperature: number; system_prompt: string | null } | null;
    const { text } = await generateText({
      model: anthropic((cfg?.model ?? "claude-4-opus-20250514") as Parameters<typeof anthropic>[0]),
      maxTokens: cfg?.max_tokens ?? 400,
      temperature: cfg?.temperature ?? 0.3,
      ...(cfg?.system_prompt ? { system: cfg.system_prompt } : {}),
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
