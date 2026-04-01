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
}

export type ResolutionStatus = "resolved" | "partial" | "unresolved" | "no_external" | "deferred";

export interface ResolutionResult {
  resolution_status: ResolutionStatus;
  pending_resolutions: PendingResolutions | null;
  company_id: string | null;
  contact_ids: string[];
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
  // Strip TLDs: remove everything from first dot after root
  const root = domain.split(".")[0];
  // Split on hyphens/underscores, capitalize each word
  return root
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Extract company name from meeting title using common patterns. */
export function extractCompanyFromTitle(title: string): string | null {
  const patterns: RegExp[] = [
    /^(?:meeting|call|intro|chat|sync)\s+with\s+(.+?)(?:\s*[-–|].*)?$/i,
    /^(.+?)\s*[-–]\s*(?:intro|introductory|diligence|update|debrief|follow[- ]?up|check[- ]?in)/i,
    /^call\s*[-–]\s*.+?\s*@\s*(.+?)(?:\s*[-–|].*)?$/i,
  ];
  for (const re of patterns) {
    const m = title.match(re);
    if (m?.[1]) return m[1].trim();
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

  // Collect candidate domains and names
  const titleCompany = extractCompanyFromTitle(meetingTitle);
  const domainsFromAttendees = attendeeResolutions
    .filter((r) => r.extracted_company_domain)
    .map((r) => r.extracted_company_domain as string);

  // Use first non-generic domain as primary
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
      allHigh = true; // company resolved
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
