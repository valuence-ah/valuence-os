// ─── Meeting Enrichment Pipeline ─────────────────────────────────────────────
// Runs 4 signals in priority order to auto-tag Fellow meetings with a company_id.
//
// Signal 1 — Email domain match:  attendee email domain → companies.website_domain
// Signal 2 — Title parsing:       extractCompanyFromTitle → matchCompanyName (fuzzy)
// Signal 3 — Clearbit logo API:   attendee email domain → clearbit.com/v1/companies/domain
// Signal 4 — Outlook calendar:    Microsoft Graph calendarView → JW match attendees / body
//
// Returns on the first HIGH-confidence hit. Accumulates to return best MEDIUM/LOW.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Interaction } from "./types";
import {
  extractCompanyFromTitle,
  matchCompanyName,
  domainFromEmail,
  isGenericDomain,
  isInternalEmail,
} from "./meeting-resolution";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EnrichmentResult {
  company_id:  string | null;
  confidence:  "high" | "medium" | "low" | null;
  matched_via: string | null;
}

interface CompanyRow {
  id:             string;
  name:           string;
  website_domain: string | null;
}

// ── Signal helpers ────────────────────────────────────────────────────────────

/** Signal 1: attendee email domain → companies.website_domain (exact) */
async function signal1_emailDomain(
  attendees: { email?: string | null }[],
  supabase: SupabaseClient
): Promise<EnrichmentResult | null> {
  const externalDomains = attendees
    .map(a => a.email ? domainFromEmail(a.email) : null)
    .filter((d): d is string => !!d && !isGenericDomain(d));

  if (!externalDomains.length) return null;

  // Try each domain, return first hit
  for (const domain of externalDomains) {
    const { data } = await supabase
      .from("companies")
      .select("id, name, website_domain")
      .or(`website_domain.eq.${domain},website.ilike.%${domain}%`)
      .limit(1)
      .maybeSingle();

    if (data) {
      return { company_id: data.id, confidence: "high", matched_via: `email_domain:${domain}` };
    }
  }
  return null;
}

/** Signal 2: title parsing → fuzzy company name match */
async function signal2_titleParsing(
  title: string,
  allCompanies: CompanyRow[]
): Promise<EnrichmentResult | null> {
  const extracted = extractCompanyFromTitle(title);
  if (!extracted) return null;

  const match = matchCompanyName(extracted, allCompanies);
  if (!match) return null;

  return {
    company_id:  match.company_id,
    confidence:  match.confidence,
    matched_via: `title_parse:${extracted}`,
  };
}

/** Signal 3: Clearbit company lookup via attendee email domain */
async function signal3_clearbit(
  attendees: { email?: string | null }[],
  allCompanies: CompanyRow[]
): Promise<EnrichmentResult | null> {
  const externalDomains = attendees
    .map(a => a.email ? domainFromEmail(a.email) : null)
    .filter((d): d is string => !!d && !isGenericDomain(d));

  if (!externalDomains.length) return null;

  for (const domain of externalDomains) {
    try {
      const res = await fetch(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(domain)}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) continue;

      const results = await res.json() as Array<{ name?: string; domain?: string }>;
      const first = results?.[0];
      if (!first?.name) continue;

      // Try to match the Clearbit company name against our CRM
      const match = matchCompanyName(first.name, allCompanies);
      if (match && match.confidence !== "low") {
        return {
          company_id:  match.company_id,
          confidence:  "medium",
          matched_via: `clearbit:${first.name}`,
        };
      }
    } catch {
      // Clearbit is best-effort — silently skip on error
    }
  }
  return null;
}

/** Signal 4: Outlook calendar — match attendees / body text against CRM */
async function signal4_outlookCalendar(
  meeting: Pick<Interaction, "date" | "subject">,
  allCompanies: CompanyRow[]
): Promise<EnrichmentResult | null> {
  if (!process.env.GRAPH_CLIENT_ID || !process.env.GRAPH_TENANT_ID) return null;
  if (!meeting.date || !meeting.subject) return null;

  try {
    const { findOutlookEvent } = await import("@/lib/microsoft-graph");
    const ev = await findOutlookEvent(meeting.date, meeting.subject ?? "");
    if (!ev) return null;

    // 4a. Match attendee email domains
    for (const att of ev.attendees) {
      if (!att.email) continue;
      const domain = domainFromEmail(att.email);
      if (!domain || isGenericDomain(domain) || isInternalEmail(att.email)) continue;

      const found = allCompanies.find(c =>
        c.website_domain === domain ||
        (c.website_domain && att.email.endsWith(c.website_domain))
      );
      if (found) {
        return { company_id: found.id, confidence: "medium", matched_via: `graph_calendar_attendee:${domain}` };
      }
    }

    // 4b. Company name match in body text
    if (ev.bodyText) {
      const match = matchCompanyName(ev.bodyText.slice(0, 400), allCompanies);
      if (match && match.confidence !== "low") {
        return { company_id: match.company_id, confidence: "low", matched_via: "graph_calendar_body" };
      }
    }
  } catch (err) {
    console.warn("[enrichMeeting] signal4_outlookCalendar:", err);
  }
  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run the 4-signal enrichment pipeline for a single meeting.
 * Returns on first HIGH match; accumulates for MEDIUM/LOW.
 */
export async function enrichMeeting(
  meeting: Pick<Interaction, "id" | "subject" | "date" | "attendees">,
  allCompanies: CompanyRow[],
  supabase: SupabaseClient
): Promise<EnrichmentResult> {
  const attendees = (meeting.attendees ?? []).filter(
    a => a.email && !isInternalEmail(a.email)
  );

  // Signal 1 — email domain (HIGH = return immediately)
  const s1 = await signal1_emailDomain(attendees, supabase);
  if (s1?.confidence === "high") return s1;

  // Signal 2 — title parsing (may return high/medium/low)
  const s2 = await signal2_titleParsing(meeting.subject ?? "", allCompanies);
  if (s2?.confidence === "high") return s2;

  // Signal 3 — Clearbit
  const s3 = await signal3_clearbit(attendees, allCompanies);
  if (s3?.confidence === "high") return s3;

  // Signal 4 — Outlook calendar
  const s4 = await signal4_outlookCalendar(meeting, allCompanies);
  if (s4?.confidence === "high") return s4;

  // Return best non-null result from lower-confidence signals
  const candidates = [s1, s2, s3, s4].filter((r): r is EnrichmentResult => r !== null);
  const mediums = candidates.filter(r => r.confidence === "medium");
  if (mediums.length) return mediums[0];

  const lows = candidates.filter(r => r.confidence === "low");
  if (lows.length) return lows[0];

  return { company_id: null, confidence: null, matched_via: null };
}

// ── Batch enrichment ──────────────────────────────────────────────────────────

export interface BatchEnrichmentResult {
  processed: number;
  resolved:  number;
  needsReview: number;
  unresolved: number;
  errors: number;
}

/**
 * Enriches all meetings whose resolution_status is "unresolved" or "partial".
 * Updates company_id and resolution_status in Supabase.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function enrichAllUnresolvedMeetings(
  supabase: SupabaseClient
): Promise<BatchEnrichmentResult> {
  const stats: BatchEnrichmentResult = {
    processed: 0, resolved: 0, needsReview: 0, unresolved: 0, errors: 0,
  };

  // Fetch all unresolved/partial meetings
  const { data: meetings, error: fetchErr } = await supabase
    .from("interactions")
    .select("id, subject, date, attendees, resolution_status, pending_resolutions, company_id")
    .in("resolution_status", ["unresolved", "partial"])
    .eq("type", "meeting")
    .order("date", { ascending: false })
    .limit(200);

  if (fetchErr || !meetings?.length) return stats;

  // Fetch all companies once for matching
  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, website_domain")
    .limit(2000);

  const allCompanies: CompanyRow[] = (companies ?? []).map(c => ({
    id:             c.id as string,
    name:           c.name as string,
    website_domain: c.website_domain as string | null,
  }));

  for (const meeting of meetings) {
    stats.processed++;
    try {
      const result = await enrichMeeting(
        {
          id:        meeting.id as string,
          subject:   meeting.subject as string | null,
          date:      meeting.date as string,
          attendees: meeting.attendees as Interaction["attendees"],
        },
        allCompanies,
        supabase
      );

      // Determine new resolution_status
      let newStatus: "resolved" | "partial" | "unresolved";
      if (result.confidence === "high") {
        newStatus = "resolved";
        stats.resolved++;
      } else if (result.confidence === "medium" || result.confidence === "low") {
        newStatus = "partial";
        stats.needsReview++;
      } else {
        newStatus = "unresolved";
        stats.unresolved++;
      }

      // Build updated pending_resolutions with suggestion
      const pendingResolutions = {
        ...(meeting.pending_resolutions as object ?? {}),
        ...(result.company_id ? {
          suggestion: {
            company_id:   result.company_id,
            confidence:   result.confidence,
            matched_via:  result.matched_via,
          },
        } : {}),
      };

      await supabase
        .from("interactions")
        .update({
          company_id:          result.company_id ?? meeting.company_id ?? null,
          resolution_status:   newStatus,
          pending_resolutions: pendingResolutions,
        })
        .eq("id", meeting.id);

      // Update company dates if we found a company
      if (result.company_id) {
        const dateStr = (meeting.date as string).slice(0, 10);
        await supabase
          .from("companies")
          .update({ last_contact_date: dateStr, last_meeting_date: dateStr })
          .eq("id", result.company_id);
      }
    } catch (err) {
      console.warn("[enrichAllUnresolvedMeetings] error on meeting", meeting.id, err);
      stats.errors++;
    }
  }

  return stats;
}
