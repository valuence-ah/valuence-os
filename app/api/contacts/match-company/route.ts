// ─── Contact Company Matcher /api/contacts/match-company ─────────────────────
//
// Matching pipeline (3 steps, in order):
//
//   STEP 1 — Domain lookup
//     Check whether the email domain (e.g. "mpa.gov.sg") is already stored
//     against any company in the database via website / website_domain fields.
//     No guessing, no substring tricks — exact domain substring match only.
//
//   STEP 2 — Claude identifies the company (only if step 1 found nothing)
//     Ask Claude Haiku what organisation owns that domain. Claude has broad
//     knowledge of corporate and government domains worldwide.
//
//   STEP 3 — DB name match on Claude's answer (only if step 2 returned a name)
//     Search the database for a company whose name starts with the first word
//     of Claude's answer. If found → return that company as the match.
//     If not found → return the Claude suggestion so the UI can offer
//     "Create company: Maritime Port Authority of Singapore".

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
  "live.com",
  "msn.com",
]);

// ── STEP 0: Peer-contact lookup ────────────────────────────────────────────────
// Finds an existing contact with the same email domain that is already assigned
// to a company. When several colleagues share the same domain (e.g. @nabacoinc.com)
// and at least one is already linked, this is the most reliable signal.
async function findCompanyByPeerContact(
  supabase: Awaited<ReturnType<typeof createClient>>,
  domain: string
): Promise<{ id: string; name: string } | null> {
  // Find a contact whose email ends with @<domain> and has a company_id
  const { data: contacts } = await supabase
    .from("contacts")
    .select("company_id")
    .ilike("email", `%@${domain}`)
    .not("company_id", "is", null)
    .limit(1);

  const companyId = contacts?.[0]?.company_id as string | null;
  if (!companyId) return null;

  const { data: company } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", companyId)
    .maybeSingle();

  return company ? { id: company.id, name: company.name } : null;
}

// ── STEP 1: Domain lookup ─────────────────────────────────────────────────────
// Checks whether any company in the DB has this domain in their website or
// website_domain field. No name guessing — only domain-based matching.
async function findCompanyByDomain(
  supabase: Awaited<ReturnType<typeof createClient>>,
  domain: string
): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase
    .from("companies")
    .select("id, name")
    .or(`website.ilike.%${domain}%,website_domain.ilike.%${domain}%`)
    .limit(1)
    .maybeSingle();

  return data ? { id: data.id, name: data.name } : null;
}

// ── STEP 3: DB name lookup using Claude's answer ───────────────────────────────
// Called only after Claude has identified the company name. Searches by name
// using a starts-with match (more precise than contains).
async function findCompanyByName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyName: string
): Promise<{ id: string; name: string } | null> {
  // Try the full name first, then fall back to just the first word
  const attempts = [
    companyName,
    companyName.split(/\s+/)[0] ?? companyName,
  ].filter((v, i, a) => a.indexOf(v) === i); // deduplicate

  for (const term of attempts) {
    if (term.length < 3) continue;
    const { data } = await supabase
      .from("companies")
      .select("id, name")
      .ilike("name", `${term}%`)
      .limit(1)
      .maybeSingle();
    if (data) return { id: data.id, name: data.name };
  }
  return null;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const email: string | undefined = body?.email;

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const domain = email.split("@")[1]?.toLowerCase() ?? "";

  // Skip personal / freemail domains — no company affiliation possible
  if (PERSONAL_DOMAINS.has(domain)) {
    return NextResponse.json({ match: null, suggestion: null, source: "personal_domain" });
  }

  // ── STEP 0: Peer-contact lookup (most reliable — same domain already linked) ─
  const peerMatch = await findCompanyByPeerContact(supabase, domain);
  if (peerMatch) {
    return NextResponse.json({ match: peerMatch, suggestion: null, source: "peer_contact" });
  }

  // ── STEP 1: Domain lookup ──────────────────────────────────────────────────
  const domainMatch = await findCompanyByDomain(supabase, domain);
  if (domainMatch) {
    return NextResponse.json({ match: domainMatch, suggestion: null, source: "domain_match" });
  }

  // ── STEP 2: Claude identifies the organisation that owns this domain ────────
  let suggestion: string | null = null;
  try {
    const { text } = await generateText({
      model: anthropic("claude-haiku-4-5"),
      maxTokens: 60,
      messages: [
        {
          role: "user",
          content: `What organisation or company owns the email domain "${domain}"? Reply with just the organisation name — no punctuation, no explanation. If you don't know, reply "unknown".`,
        },
      ],
    });
    const cleaned = text.trim().replace(/['".,!?]+$/, "");
    if (cleaned && cleaned.toLowerCase() !== "unknown") {
      suggestion = cleaned;
    }
  } catch {
    // Claude unavailable — continue without suggestion
  }

  if (!suggestion) {
    return NextResponse.json({ match: null, suggestion: null, source: "no_match" });
  }

  // ── STEP 3: Search DB for the company Claude named ─────────────────────────
  const nameMatch = await findCompanyByName(supabase, suggestion);
  if (nameMatch) {
    return NextResponse.json({ match: nameMatch, suggestion, source: "claude_then_db" });
  }

  // No DB match — return Claude's suggestion so the UI can offer "Create company"
  return NextResponse.json({ match: null, suggestion, source: "claude_suggestion" });
}
