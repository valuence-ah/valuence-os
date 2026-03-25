// ─── Contact Company Matcher /api/contacts/match-company ─────────────────────
// Receives { email } and returns the best matching company from Supabase,
// falling back to a Claude claude-haiku-4-5 suggestion if no DB match is found.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

export const maxDuration = 30;

const PERSONAL_DOMAINS = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "icloud.com",
  "me.com",
  "protonmail.com",
]);

async function searchCompanyInDB(
  supabase: Awaited<ReturnType<typeof createClient>>,
  domain: string,
  root: string
): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase
    .from("companies")
    .select("id, name")
    .or(`website.ilike.%${domain}%,name.ilike.%${root}%`)
    .limit(1)
    .maybeSingle();

  if (data) return { id: data.id, name: data.name };
  return null;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const email: string | undefined = body?.email;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  // 1. Extract domain and root
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  const root = domain.split(".")[0] ?? "";

  // 2. Skip personal domains
  if (PERSONAL_DOMAINS.has(domain)) {
    return NextResponse.json({
      match: null,
      suggestion: null,
      source: "personal_domain",
    });
  }

  // 3. Search DB by domain / root
  const dbMatch = await searchCompanyInDB(supabase, domain, root);
  if (dbMatch) {
    return NextResponse.json({
      match: dbMatch,
      suggestion: null,
      source: "database",
    });
  }

  // 4. Call Claude haiku to identify company from domain
  let suggestion: string | null = null;
  try {
    const { text } = await generateText({
      model: anthropic("claude-haiku-4-5"),
      maxTokens: 50,
      messages: [
        {
          role: "user",
          content: `What company owns the email domain "${domain}"? Reply with just the company name (no punctuation, no explanation). If unknown, reply "unknown".`,
        },
      ],
    });
    const cleaned = text.trim().replace(/['".,!?]+$/, "");
    if (cleaned && cleaned.toLowerCase() !== "unknown") {
      suggestion = cleaned;
    }
  } catch {
    // Claude call failed — continue without suggestion
  }

  if (!suggestion) {
    return NextResponse.json({ match: null, suggestion: null, source: "no_match" });
  }

  // 5. Try DB search again with Claude's suggestion
  const suggestionRoot = suggestion.split(/\s+/)[0] ?? suggestion;
  const aiMatch = await searchCompanyInDB(supabase, domain, suggestionRoot);
  if (aiMatch) {
    return NextResponse.json({
      match: aiMatch,
      suggestion,
      source: "ai_then_database",
    });
  }

  // 6. Return suggestion without a DB match
  return NextResponse.json({
    match: null,
    suggestion,
    source: "ai_suggestion",
  });
}
