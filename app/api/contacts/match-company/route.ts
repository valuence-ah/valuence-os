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

// Domains where the first segment is NOT the company name
// (e.g. mpa.gov.sg → root "mpa" is valid, but "gov" in gov.uk is not)
const INSTITUTIONAL_SECOND_LEVELS = new Set(["gov", "edu", "ac", "mil", "sch", "nhs", "org"]);

function isInstitutionalDomain(domain: string): boolean {
  const parts = domain.split(".");
  // e.g. mpa.gov.sg → parts[1] = "gov"
  return parts.length >= 3 && INSTITUTIONAL_SECOND_LEVELS.has(parts[1]);
}

async function searchCompanyInDB(
  supabase: Awaited<ReturnType<typeof createClient>>,
  domain: string,
  root: string
): Promise<{ id: string; name: string } | null> {
  // 1. Exact website domain match first — most reliable signal
  const { data: websiteMatch } = await supabase
    .from("companies")
    .select("id, name")
    .or(`website.ilike.%${domain}%,website_domain.ilike.%${domain}%`)
    .limit(1)
    .maybeSingle();

  if (websiteMatch) return { id: websiteMatch.id, name: websiteMatch.name };

  // 2. Name match — only for non-institutional domains AND roots ≥ 5 chars
  // (guards against short roots like "mpa" matching "impact", "company", etc.)
  const skipNameMatch = isInstitutionalDomain(domain) || root.length < 5;
  if (skipNameMatch) return null;

  const { data: nameMatch } = await supabase
    .from("companies")
    .select("id, name")
    .ilike("name", `${root}%`)   // starts-with, not contains — more precise
    .limit(1)
    .maybeSingle();

  if (nameMatch) return { id: nameMatch.id, name: nameMatch.name };
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

  // 5. Try DB search again with Claude's suggestion (use full first word, min 3 chars)
  const suggestionRoot = suggestion.split(/\s+/)[0] ?? suggestion;
  const aiMatch = suggestionRoot.length >= 3
    ? await searchCompanyInDB(supabase, domain, suggestionRoot)
    : null;
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
