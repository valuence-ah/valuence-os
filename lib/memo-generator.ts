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

  const cfg = aiConfig as { model?: string; max_tokens?: number; temperature?: number; system_prompt?: string | null; user_prompt?: string | null } | null;

  // Default system prompt if none configured in Admin -> AI Config
  const defaultSystemPrompt = `You are a senior venture capital analyst at Valuence Ventures, a deeptech fund focused on cleantech, techbio, and advanced materials at pre-seed and seed stage.

Write a comprehensive IC (Investment Committee) memo based on the provided company data, meeting notes, transcripts, and deck. Be analytical, objective, and specific. Use Valuence's focus areas to evaluate fit.

Return ONLY a valid JSON object with these exact keys (no markdown, no extra text):
{
  "title": "string",
  "company_overview": "string (2-3 paragraphs: what the company does, why now, why Valuence)",
  "problem_statement": "string (1-2 paragraphs)",
  "technology": "string",
  "industry_sector": "string",
  "competitive_analysis": "string (competitive landscape, moat)",
  "team": "string (founders backgrounds, relevant expertise)",
  "path_success": "string (unicorn potential, milestones, customer profile and scalability)",
  "exit_analysis": "string (list 4-8 acquirers; for each: name, 1-2 bullet strategic rationale)",
  "risks_mitigation": "string (address all 7 risk categories from the writing rules)",
  "financials": "string (current financials, use of proceeds)",
  "go_right": "string (what can go massively right)",
  "top_reasons_invest": "string (Strong Rationale for Investing)",
  "top_reasons_pass": "string (strong rationale for NOT investing; candid, evidence-based)",
  "evaluation_score": "string (Tech Evaluation and Scores)",
  "recommendation": "invest" | "pass" | "more_diligence" | "pending"
}`;

  const systemPrompt = cfg?.system_prompt ?? defaultSystemPrompt;

  const { text } = await generateText({
    model: anthropic((cfg?.model ?? "claude-sonnet-4-6") as Parameters<typeof anthropic>[0]),
    maxTokens: cfg?.max_tokens ?? 12000,
    temperature: cfg?.temperature ?? 0.3,
    system: systemPrompt,
    messages: [{ role: "user", content: messageContent }],
  });

  // Strip markdown code fences Claude sometimes wraps around JSON
  const clean = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  // Find the outermost {...} in case Claude prepended/appended text
  const jsonStart = clean.indexOf("{");
  const jsonEnd   = clean.lastIndexOf("}");
  const jsonStr   = jsonStart !== -1 && jsonEnd !== -1 ? clean.slice(jsonStart, jsonEnd + 1) : clean;

  let s: Record<string, string>;
  try {
    s = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Claude returned invalid JSON. Preview: ${clean.slice(0, 300)}`);
  }

  // ── Map Claude's response fields → DB columns ──────────────────────────────
  // Handles both the new system prompt keys and the old legacy keys gracefully.
  const { data: memo, error } = await supabase
    .from("ic_memos")
    .insert({
      company_id,
      title:               s.title || `${company.name} — IC Memo`,

      // ── New columns (matching user's AI Config system prompt) ──────────────
      company_overview:    s.company_overview    ?? s.executive_summary   ?? null,
      problem_statement:   s.problem_statement   ?? s.problem_solution    ?? null,
      technology:          s.technology          ?? null,
      industry_sector:     s.industry_sector     ?? s.market_opportunity  ?? null,
      competitive_analysis:s.competitive_analysis ?? s.competition        ?? null,
      team:                s.team                ?? null,
      path_success:        s.path_success        ?? null,
      exit_analysis:       s.exit_analysis       ?? null,
      risks_mitigation:    s.risks_mitigation    ?? s.risks               ?? null,
      financials:          s.financials          ?? null,
      go_right:            s.go_right            ?? s.investment_thesis   ?? null,
      top_reasons_invest:  s.top_reasons_invest  ?? null,
      top_reasons_pass:    s.top_reasons_pass    ?? null,
      evaluation_score:    s.evaluation_score    ?? null,
      recommendation:      s.recommendation      ?? "pending",

      // ── Legacy columns kept for backward compat ────────────────────────────
      executive_summary:   s.company_overview    ?? s.executive_summary   ?? null,
      problem_solution:    s.problem_statement   ?? s.problem_solution    ?? null,
      market_opportunity:  s.industry_sector     ?? s.market_opportunity  ?? null,
      competition:         s.competitive_analysis ?? s.competition        ?? null,
      risks:               s.risks_mitigation    ?? s.risks               ?? null,
      investment_thesis:   s.go_right            ?? s.investment_thesis   ?? null,

      status:     "draft",
      created_by: created_by ?? null,
      regenerated_by: created_by ?? null,
      regenerated_at: new Date().toISOString(),
    })
    .select("*, company:companies(id, name, type, sectors)")
    .single();

  if (error) throw new Error(error.message);
  return memo;
}
