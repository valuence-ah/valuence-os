// ─── Company Data Room AI Analysis ───────────────────────────────────────────
// POST: Analyze a company's Google Drive data room using Claude.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: company } = await supabase
    .from("companies")
    .select("*")
    .eq("id", id)
    .single();
  if (!company) return NextResponse.json({ error: "Company not found" }, { status: 404 });

  const { folderUrl } = await req.json();

  const prompt = `You are analyzing a company's data room for an investment team at Valuence Ventures.

Company: ${company.name}
Industry: ${(company.sectors as string[] | null)?.join(", ") ?? "Unknown"}
Stage: ${company.stage ?? "Unknown"}
Description: ${company.description ?? "Unknown"}

Data room folder URL: ${folderUrl as string}

Based on the company information and stage, provide a concise data room analysis:

1. **Data Room Assessment**: Given this company's stage and sector, what materials would you expect to find in their data room?
2. **Key Materials to Look For**: Which important documents should be present (pitch deck, financials, cap table, product demo, tech specs, customer references, etc.)?
3. **Due Diligence Checklist**: What should the investment team request or verify?
4. **Readiness Score**: Rate their likely fundraising readiness 1-10 based on stage/sector context, with brief explanation
5. **Recommended Next Steps**: What should the investment team do next?

Keep it concise and actionable. Focus on what matters for a ${company.stage ?? "early-stage"} company in ${(company.sectors as string[] | null)?.join("/") ?? "this sector"}.`;

  try {
    const { text } = await generateText({
      model: anthropic("claude-opus-4-5"),
      maxTokens: 1000,
      messages: [{ role: "user", content: prompt }],
    });

    return NextResponse.json({ analysis: text });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
