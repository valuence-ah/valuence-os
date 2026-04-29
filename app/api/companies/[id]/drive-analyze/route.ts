// ─── Company Data Room AI Analysis ───────────────────────────────────────────
// POST: Analyze a company's synced documents using Claude.
// Uses already-extracted text from the documents table — does NOT try to
// access Drive URLs directly (Claude cannot do that).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { getAiConfig } from "@/lib/ai-config";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  // Load company info
  const { data: company } = await admin
    .from("companies")
    .select("name, sectors, stage, description, notes")
    .eq("id", id)
    .single();
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  // Load all extracted documents for this company
  const { data: docs } = await admin
    .from("documents")
    .select("name, type, extracted_text, created_at")
    .eq("company_id", id)
    .not("extracted_text", "is", null)
    .gt("extracted_text", "")
    .order("created_at", { ascending: false });

  if (!docs?.length) {
    return NextResponse.json({
      error: "No documents with extracted text found for this company. Use 'Sync to AI' or 'Extract Uploaded PDFs' first.",
    }, { status: 400 });
  }

  // Build document context (up to 6000 chars per doc)
  const docContext = docs.map(d =>
    `### ${d.name} (${d.type})\n${(d.extracted_text ?? "").slice(0, 6000)}`
  ).join("\n\n---\n\n");

  const prompt = `You are a senior investment analyst at Valuence Ventures reviewing a company's data room.

Company: ${company.name}
Sector: ${(company.sectors as string[] | null)?.join(", ") ?? "Unknown"}
Stage: ${company.stage ?? "Unknown"}
Description: ${company.description ?? "—"}
Notes: ${company.notes ?? "—"}

The following documents have been extracted from their data room (${docs.length} document${docs.length !== 1 ? "s" : ""}):

${docContext}

---

Based on the document content above, provide a concise investment-grade analysis:

1. **Summary**: What does this company do and what stage are they at based on the documents?
2. **Key Strengths**: What stands out positively from the materials?
3. **Key Risks / Gaps**: What's missing, unclear, or concerning?
4. **Due Diligence Checklist**: What should we request or verify next?
5. **Readiness Score**: Rate their fundraising readiness 1–10 with a brief rationale.

Be specific — reference actual content from the documents. Keep it sharp and actionable.`;

  try {
    const cfg = await getAiConfig("company_intelligence");
    const { text } = await generateText({
      model: anthropic(cfg.model as Parameters<typeof anthropic>[0]),
      maxTokens: cfg.max_tokens,
      temperature: cfg.temperature,
      system: cfg.system_prompt ?? undefined,
      messages: [{ role: "user", content: prompt }],
    });

    return NextResponse.json({ analysis: text, docs_analyzed: docs.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
