// ─── Shared IC Memo Generator ─────────────────────────────────────────────────
// Used by both /api/memos/generate (user-triggered) and
// /api/webhooks/generate-memo (automation).

import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
export async function generateMemo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  company_id: string,
  created_by?: string | null,
  extraContext?: string          // optional: deck content, transcript text, etc.
) {
  // Gather all company data
  const [
    { data: company },
    { data: contacts },
    { data: interactions },
    { data: deals },
    { data: documents },
    { data: aiConfig },
  ] = await Promise.all([
    supabase.from("companies").select("*").eq("id", company_id).single(),
    supabase.from("contacts").select("*").eq("company_id", company_id),
    supabase.from("interactions").select("*").eq("company_id", company_id).order("date", { ascending: false }).limit(20),
    supabase.from("deals").select("*").eq("company_id", company_id),
    supabase.from("documents").select("name, type, storage_path, mime_type, ai_summary, extracted_text").eq("company_id", company_id).order("created_at", { ascending: false }),
    supabase.from("ai_configs").select("*").eq("name", "ic_memo").single(),
  ]);

  if (!company) throw new Error("Company not found");

  const context = `
COMPANY: ${company.name}
Type: ${company.type} | Stage: ${company.stage || "—"} | Sectors: ${company.sectors?.join(", ") || "—"}
Location: ${[company.location_city, company.location_country].filter(Boolean).join(", ") || "—"}
Website: ${company.website || "—"}
Founded: ${company.founded_year || "—"}
Employees: ${company.employee_count || "—"}
Total Raised: ${company.funding_raised ? `$${(company.funding_raised / 1e6).toFixed(1)}M` : "—"}
Description: ${company.description || "—"}
Key Words: ${company.tags?.join(", ") || "—"}
Notes: ${company.notes || "—"}

TEAM / CONTACTS (${contacts?.length ?? 0}):
${contacts?.map((c: { first_name: string; last_name: string; title?: string; type: string }) => `- ${c.first_name} ${c.last_name} — ${c.title || c.type}`).join("\n") || "None"}

INTERACTIONS / MEETINGS (${interactions?.length ?? 0}):
${interactions?.slice(0, 10).map((i: { date: string; type: string; subject?: string; body?: string; summary?: string; action_items?: string[]; transcript_text?: string }) =>
  `[${new Date(i.date).toLocaleDateString()}] ${i.type.toUpperCase()}: ${i.subject || ""}
  ${i.body?.slice(0, 500) || ""}
  ${i.transcript_text ? "TRANSCRIPT (excerpt): " + i.transcript_text.slice(0, 1000) : ""}
  ${i.summary ? "Summary: " + i.summary : ""}
  ${i.action_items?.length ? "Actions: " + i.action_items.join("; ") : ""}`.trim()
).join("\n\n") || "None"}

DEAL INFO:
${deals?.map((d: { stage: string; investment_amount?: number; instrument?: string; valuation_cap?: number }) =>
  `Stage: ${d.stage} | Amount: ${d.investment_amount ? `$${d.investment_amount.toLocaleString()}` : "—"} | Instrument: ${d.instrument || "—"} | Cap: ${d.valuation_cap ? `$${(d.valuation_cap / 1e6).toFixed(1)}M` : "—"}`
).join("\n") || "No deal data"}

DOCUMENTS:
${documents?.map((d: { name: string; type: string; ai_summary?: string; extracted_text?: string }) =>
  `[${d.type.toUpperCase()}] ${d.name}${d.ai_summary ? `\nSummary: ${d.ai_summary}` : ""}${d.extracted_text ? `\nContent:\n${d.extracted_text.slice(0, 6000)}` : ""}`
).join("\n\n---\n\n") || "None uploaded"}
${extraContext ? `\nADDITIONAL CONTEXT:\n${extraContext.slice(0, 3000)}` : ""}`;

  // Attach deck PDFs as URLs for Claude to read directly (no text extraction needed)
  type ContentPart =
    | { type: "text"; text: string }
    | { type: "file"; data: URL; mimeType: string };

  const messageContent: ContentPart[] = [];
  const deckDocs = (documents ?? []).filter((d: { type: string; storage_path?: string }) => d.type === "deck" && d.storage_path);
  for (const deck of deckDocs.slice(0, 3)) {
    const { data: { publicUrl } } = supabase.storage.from("decks").getPublicUrl(deck.storage_path);
    messageContent.push({ type: "file", data: new URL(publicUrl), mimeType: "application/pdf" });
  }
  // PDF transcripts — pass as URL so Claude can read them directly
  const pdfTranscripts = (documents ?? []).filter((d: { type: string; storage_path?: string; mime_type?: string }) =>
    d.type === "transcript" && d.storage_path && d.mime_type === "application/pdf"
  );
  for (const t of pdfTranscripts.slice(0, 2)) {
    const { data: { publicUrl } } = supabase.storage.from("transcripts").getPublicUrl(t.storage_path);
    messageContent.push({ type: "file", data: new URL(publicUrl), mimeType: "application/pdf" });
  }
  messageContent.push({ type: "text", text: `Write an IC memo for this company:\n\n${context}` });

  const cfg = aiConfig as { model?: string; max_tokens?: number; temperature?: number; system_prompt?: string | null } | null;
  const systemPrompt = cfg?.system_prompt ?? `You are a senior venture capital analyst at Valuence Ventures, a deeptech fund focused on cleantech, techbio, and advanced materials at pre-seed and seed stage.

Write a comprehensive IC (Investment Committee) memo based on the provided company data, meeting notes, transcripts, and deck. Be analytical, objective, and specific. Use Valuence's focus areas to evaluate fit.

Return ONLY a valid JSON object with these exact keys (no markdown, no extra text):
{
  "title": "string",
  "executive_summary": "string (2-3 paragraphs: what the company does, why now, why Valuence)",
  "problem_solution": "string",
  "market_opportunity": "string",
  "business_model": "string",
  "traction": "string (metrics, customers, milestones)",
  "team": "string (founders backgrounds, relevant expertise)",
  "competition": "string (competitive landscape, moat)",
  "risks": "string (top 3-5 risks)",
  "financials": "string (current financials, use of proceeds)",
  "investment_thesis": "string (why invest now, fit with Valuence thesis)",
  "recommendation": "invest" | "pass" | "more_diligence" | "pending"
}`;

  const { text } = await generateText({
    model: anthropic((cfg?.model ?? "claude-opus-4-5") as Parameters<typeof anthropic>[0]),
    maxTokens: cfg?.max_tokens ?? 16000,
    temperature: cfg?.temperature ?? 0.3,
    system: systemPrompt,
    messages: [{ role: "user", content: messageContent }],
  });

  const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

  let sections: Record<string, string>;
  try {
    sections = JSON.parse(clean);
  } catch {
    throw new Error(`Failed to parse Claude response: ${text.slice(0, 200)}`);
  }

  const { data: memo, error } = await supabase
    .from("ic_memos")
    .insert({
      company_id,
      title:              sections.title || `${company.name} — IC Memo`,
      executive_summary:  sections.executive_summary,
      problem_solution:   sections.problem_solution,
      market_opportunity: sections.market_opportunity,
      business_model:     sections.business_model,
      traction:           sections.traction,
      team:               sections.team,
      competition:        sections.competition,
      risks:              sections.risks,
      financials:         sections.financials,
      investment_thesis:  sections.investment_thesis,
      recommendation:     sections.recommendation ?? "pending",
      status:             "draft",
      created_by:         created_by ?? null,
    })
    .select("*, company:companies(id, name, type, sectors)")
    .single();

  if (error) throw new Error(error.message);
  return memo;
}
