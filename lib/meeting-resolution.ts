// ─── CRM Entity Resolution for Meetings ───────────────────────────────────────
// Extracts attendees/companies from Fellow meeting data and matches them
// against existing CRM records.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FellowAttendee } from "./fellow";

// ── Constants ──────────────────────────────────────────────────────────────────

const INTERNAL_DOMAIN = "valuence.vc";

const GENERIC_DOMAINS = new Set([
  "gmail.com", "outlook.com", "yahoo.com", "hotmail.com",
  "icloud.com", "me.com", "live.com", "msn.com", "aol.com",
  "proton.me", "protonmail.com",
]);

const NOISE_WORDS = new Set(["team", "intro", "founders", "vc", "capital"]);

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ContactMatch {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  type: string;
  company_id: string | null;
}

export interface CompanyMatch {
  id: string;
  name: string;
  type: string;
  website?: string | null;
}

export interface AttendeeResolution {
  attendee: FellowAttendee;
  contact: ContactMatch | null;
  confidence: "high" | "medium" | "low" | null;
  extracted_company_name: string | null;
  extracted_company_domain: string | null;
  is_generic_email: boolean;
}

export interface CompanyResolution {
  extracted_name: string | null;
  extracted_domain: string | null;
  company: CompanyMatch | null;
  confidence: "high" | "medium" | "low" | null;
}

export interface PendingResolutions {
  attendees: AttendeeResolution[];
  company: CompanyResolution | null;
  // Enrichment pipeline suggestion (added after initial sync by enrichment pass)
  suggestion?: {
    company_id: string;
    company_name?: string;
    confidence: "high" | "medium" | "low";
    matched_via: string;
  };
}

export type ResolutionStatus = "resolved" | "partial" | "unresolved" | "no_external" | "deferred";

export interface ResolutionResult {
  resolution_status: ResolutionStatus;
  pending_resolutions: PendingResolutions | null;
  company_id: string | null;
  contact_ids: string[];
}

// ── Jaro-Winkler Similarity ─────────────────────────────────────────────────

export function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const len1 = s1.length, len2 = s2.length;
  if (!len1 || !len2) return 0;

  const matchDist = Math.max(Math.floor(Math.max(len1, len2) / 2) - 1, 0);
  const s1Matches = new Array<boolean>(len1).fill(false);
  const s2Matches = new Array<boolean>(len2).fill(false);
  let matches = 0, transpositions = 0;

  for (let i = 0; i < len1; i++) {
    const start = Math.max(0, i - matchDist);
    const end   = Math.min(i + matchDist + 1, len2);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = s2Matches[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;

  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export function isInternalEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${INTERNAL_DOMAIN}`);
}

export function isGenericDomain(domain: string): boolean {
  return GENERIC_DOMAINS.has(domain.toLowerCase());
}

export function domainFromEmail(email: string): string | null {
  const parts = email.split("@");
  return parts.length === 2 ? parts[1].toLowerCase() : null;
}

/** Convert a domain like "acme-bio.co.jp" → "Acme Bio" */
export function domainToCompanyName(domain: string): string {
  const root = domain.split(".")[0];
  return root
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Extract company name from meeting title using common VC meeting patterns.
 * Returns a cleaned company name or null if no pattern matches.
 */
export function extractCompanyFromTitle(title: string): string | null {
  const t = title.trim();

  // Patterns in priority order:
  const patterns: RegExp[] = [
    // "Valuence Ventures <> X"
    /valuence\s+ventures?\s*<>\s*(.+)/i,
    // "Valuence <> X" or "X <> Valuence"
    /valuence\s*<>\s*(.+)/i,
    /(.+?)\s*<>\s*valuence(?:\s+ventures?)?/i,
    // Generic "<> " patterns (X <> Y — extract non-valuence side)
    /^([^<>]+?)\s*<>\s*[^<>]+$/i,  // take left side when no Valuence
    // "X - intro/update/call/…"
    /^(.+?)\s*[-–—]\s*(?:intro|introductory|introduction|diligence|update|debrief|follow[\s-]?up|check[\s-]?in|call|meeting|sync)(?:\s|$)/i,
    // "Call re X" / "Call with X"
    /^call\s+re\s+(.+)/i,
    // "Meeting with X" / "Intro with X" / "Call with X"
    /^(?:meeting|call|intro|chat|sync)\s+with\s+(.+?)(?:\s*[-–|].*)?$/i,
    // "X Series-A/B/C"
    /^(.+?)\s+series[\s-][a-c]/i,
    // "X update" / "X intro" / "X diligence" (X is the company before keyword)
    /^(.+?)\s+(?:update|intro|diligence|overview|pitch|review)(?:\s|$)/i,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) {
      return cleanExtracted(m[1]);
    }
  }

  return null;
}

/** Remove noise words and trailing punctuation from an extracted company name. */
function cleanExtracted(raw: string): string | null {
  let s = raw.trim().replace(/[,;:.!?]+$/, "");  // strip trailing punctuation

  // Remove noise words only if they're not the whole string
  const words = s.split(/\s+/);
  if (words.length > 1) {
    const filtered = words.filter(w => !NOISE_WORDS.has(w.toLowerCase()));
    if (filtered.length > 0) s = filtered.join(" ");
  }

  s = s.trim();
  return s.length >= 2 ? s : null;
}

/**
 * Match an extracted company name against a list of known companies.
 * Returns the best match with confidence level, or null.
 */
export function matchCompanyName(
  extracted: string,
  companies: { id: string; name: string; website_domain: string | null }[]
): { company_id: string; confidence: "high" | "medium" | "low" } | null {
  const norm = (s: string) => s.toLowerCase().trim();
  const e = norm(extracted);

  // 1. Exact case-insensitive match → HIGH
  const exact = companies.find(c => norm(c.name) === e);
  if (exact) return { company_id: exact.id, confidence: "high" };

  // 2. Contains match (min 5 chars) → MEDIUM
  if (e.length >= 5) {
    const contains = companies.find(c => {
      const cn = norm(c.name);
      return (cn.includes(e) || e.includes(cn)) && cn.length >= 5;
    });
    if (contains) return { company_id: contains.id, confidence: "medium" };
  }

  // 3. Jaro-Winkler > 0.82 → LOW
  let bestScore = 0;
  let bestMatch: (typeof companies)[0] | null = null;
  for (const c of companies) {
    const score = jaroWinkler(e, norm(c.name));
    if (score > bestScore) { bestScore = score; bestMatch = c; }
  }
  if (bestScore > 0.82 && bestMatch) {
    return { company_id: bestMatch.id, confidence: "low" };
  }

  return null;
}

// ── Core Resolution Logic ──────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function resolveEntitiesForMeeting(
  meetingTitle: string,
  attendees: FellowAttendee[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>
): Promise<ResolutionResult> {
  // Filter to external attendees only
  const external = attendees.filter(
    (a) => a.email && !isInternalEmail(a.email)
  );

  if (external.length === 0) {
    return {
      resolution_status: "no_external",
      pending_resolutions: null,
      company_id: null,
      contact_ids: [],
    };
  }

  const attendeeResolutions: AttendeeResolution[] = [];
  const contactIds: string[] = [];
  let anyMatch = false;
  let allHigh = true;

  for (const att of external) {
    const email = att.email?.toLowerCase() ?? "";
    const domain = domainFromEmail(email);
    const isGeneric = domain ? isGenericDomain(domain) : true;
    const extractedDomain = (!isGeneric && domain) ? domain : null;
    const extractedName = extractedDomain ? domainToCompanyName(extractedDomain) : null;

    let contact: ContactMatch | null = null;
    let confidence: "high" | "medium" | "low" | null = null;

    // 1. Exact email match → HIGH
    if (email) {
      const { data } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, email, type, company_id")
        .eq("email", email)
        .maybeSingle();
      if (data) {
        contact = data as ContactMatch;
        confidence = "high";
        contactIds.push(data.id as string);
        anyMatch = true;
      }
    }

    // 2. Name match (case-insensitive) → MEDIUM
    if (!contact && att.name) {
      const nameParts = att.name.trim().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(" ") || null;
      if (firstName) {
        const q = supabase
          .from("contacts")
          .select("id, first_name, last_name, email, type, company_id")
          .ilike("first_name", firstName);
        if (lastName) q.ilike("last_name", lastName);
        const { data: rows } = await q.limit(1);
        if (rows?.[0]) {
          contact = rows[0] as ContactMatch;
          confidence = "medium";
          contactIds.push(rows[0].id as string);
          anyMatch = true;
          allHigh = false;
        }
      }
    }

    if (!contact) allHigh = false;

    attendeeResolutions.push({
      attendee: att,
      contact,
      confidence,
      extracted_company_name: extractedName,
      extracted_company_domain: extractedDomain,
      is_generic_email: isGeneric,
    });
  }

  // ── Company resolution ────────────────────────────────────────────────────────

  const titleCompany = extractCompanyFromTitle(meetingTitle);
  const domainsFromAttendees = attendeeResolutions
    .filter((r) => r.extracted_company_domain)
    .map((r) => r.extracted_company_domain as string);

  const primaryDomain = domainsFromAttendees[0] ?? null;
  const primaryName = titleCompany ?? attendeeResolutions[0]?.extracted_company_name ?? null;

  let companyRes: CompanyResolution | null = null;
  let companyId: string | null = null;

  // Check if any HIGH-confidence contact already has a company_id
  const highContactWithCompany = attendeeResolutions
    .find((r) => r.confidence === "high" && r.contact?.company_id);
  if (highContactWithCompany?.contact?.company_id) {
    const { data: co } = await supabase
      .from("companies")
      .select("id, name, type, website")
      .eq("id", highContactWithCompany.contact.company_id)
      .maybeSingle();
    if (co) {
      companyId = co.id as string;
      companyRes = {
        extracted_name: primaryName,
        extracted_domain: primaryDomain,
        company: co as CompanyMatch,
        confidence: "high",
      };
      allHigh = true;
    }
  }

  // Domain match
  if (!companyRes && primaryDomain) {
    const { data: rows } = await supabase
      .from("companies")
      .select("id, name, type, website")
      .or(`website_domain.eq.${primaryDomain},website.ilike.%${primaryDomain}%`)
      .limit(1);
    if (rows?.[0]) {
      companyId = rows[0].id as string;
      companyRes = {
        extracted_name: primaryName,
        extracted_domain: primaryDomain,
        company: rows[0] as CompanyMatch,
        confidence: "high",
      };
      anyMatch = true;
    }
  }

  // Name match
  if (!companyRes && primaryName) {
    const { data: rows } = await supabase
      .from("companies")
      .select("id, name, type, website")
      .ilike("name", `%${primaryName}%`)
      .limit(1);
    if (rows?.[0]) {
      companyId = rows[0].id as string;
      companyRes = {
        extracted_name: primaryName,
        extracted_domain: primaryDomain,
        company: rows[0] as CompanyMatch,
        confidence: "medium",
      };
      anyMatch = true;
      allHigh = false;
    }
  }

  // No company found — store extracted hints for manual resolution
  if (!companyRes && (primaryName || primaryDomain)) {
    companyRes = {
      extracted_name: primaryName,
      extracted_domain: primaryDomain,
      company: null,
      confidence: null,
    };
    allHigh = false;
  }

  // ── Determine resolution_status ───────────────────────────────────────────────

  let resolution_status: ResolutionStatus;
  if (!anyMatch && !companyRes?.company) {
    resolution_status = "unresolved";
  } else if (allHigh && companyRes?.confidence === "high") {
    resolution_status = "resolved";
  } else {
    resolution_status = "partial";
  }

  return {
    resolution_status,
    pending_resolutions: {
      attendees: attendeeResolutions,
      company: companyRes,
    },
    company_id: companyId,
    contact_ids: [...new Set(contactIds)],
  };
}
