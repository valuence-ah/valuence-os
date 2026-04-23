// â”€â”€â”€ Cron: Check Team Inboxes â†’ New Contacts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Runs every hour via Vercel Cron (see vercel.json). Requires Pro plan.
// Parameters are read live from agent_configs (agent_name = 'outlook') in Supabase,
// so any changes in Admin â†’ API Config â†’ Outlook take effect on the next run.
//
// Callable manually: POST /api/cron/check-inbox
// Required env vars:
//   MICROSOFT_GRAPH_TENANT_ID      â€” Azure AD Directory (tenant) ID
//   MICROSOFT_GRAPH_CLIENT_ID      â€” App registration client ID
//   MICROSOFT_GRAPH_CLIENT_SECRET  â€” App registration client secret

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getRecentEmails } from "@/lib/microsoft-graph";
import { createAdminClient } from "@/lib/supabase/admin";

// â”€â”€ Config defaults (overridden by agent_configs DB row) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const DEFAULT_MAILBOXES  = (process.env.OUTLOOK_MAILBOXES ?? "andrew@valuence.vc")
  .split(",").map(m => m.trim().toLowerCase()).filter(Boolean);
const DEFAULT_LOOKBACK   = 25;   // hours â€” covers a full daily run + 1-hour buffer
const DEFAULT_MAX        = 50;   // emails per mailbox per folder
const DEFAULT_AUTO_CO    = true; // auto-create company stubs

// Internal domain â€” never create contacts for @valuence.vc addresses
const INTERNAL_DOMAIN = "valuence.vc";

// Noise patterns â€” newsletters, automated senders, no-reply addresses
const SKIP_PATTERNS = [
  /no.?reply/i,
  /noreply/i,
  /donotreply/i,
  /newsletter/i,
  /notifications?@/i,
  /updates?@/i,
  /alerts?@/i,
  /support@/i,
  /mailer-daemon/i,
  /postmaster/i,
  /bounce/i,
  /unsubscribe/i,
  /linkedin\.com/i,
  /twitter\.com/i,
  /calendly\.com/i,
];

function shouldSkip(email: string): boolean {
  const lower = email.toLowerCase();
  if (lower.endsWith(`@${INTERNAL_DOMAIN}`)) return true;
  return SKIP_PATTERNS.some((p) => p.test(lower));
}

// â”€â”€ Contact extraction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface ExtractedContact {
  first_name: string;
  last_name: string;
  email: string;
  company_name?: string;
  title?: string;
  notes?: string;
}

async function extractContact(
  senderName: string,
  senderEmail: string,
  subject: string,
  bodyPreview: string
): Promise<ExtractedContact> {
  const client = new Anthropic();
  const prompt = `Extract contact information from this email metadata. Return ONLY valid JSON, nothing else.

Sender name: ${senderName}
Sender email: ${senderEmail}
Subject: ${subject}
Body preview: ${bodyPreview}

Return JSON:
{
  "first_name": "...",
  "last_name": "...",
  "email": "${senderEmail}",
  "company_name": "company name if clear, otherwise null",
  "title": "job title if mentioned, otherwise null",
  "notes": "one sentence about context, or null"
}`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("No text response");
  const match = text.text.match(/\{[\s\S]*?\}/);
  if (!match) throw new Error("No JSON in response");
  return JSON.parse(match[0]) as ExtractedContact;
}

// â”€â”€ Candidate type â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface EmailCandidate {
  email: string;
  name: string;
  subject: string;
  bodyPreview: string;
  seenInMailbox: string;
  direction: "inbound" | "outbound";
  emailDate: string; // ISO â€” used to update last_contact_date on existing contacts
}

// Generic/placeholder names Claude sometimes hallucinates when sender name is empty
const GENERIC_NAMES = new Set(["new contact", "unknown", "unknown contact", "no name", "n/a", "none", "", "null"]);

function isValidName(first: string, last: string): boolean {
  const full = `${first} ${last}`.trim().toLowerCase();
  return full.length > 0 && !GENERIC_NAMES.has(full) && !GENERIC_NAMES.has(first.toLowerCase());
}

// â”€â”€ Route handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hasMsConfig =
    (process.env.MICROSOFT_GRAPH_TENANT_ID ?? process.env.MICROSOFT_TENANT_ID) &&
    (process.env.MICROSOFT_GRAPH_CLIENT_ID ?? process.env.MICROSOFT_CLIENT_ID) &&
    (process.env.MICROSOFT_GRAPH_CLIENT_SECRET ?? process.env.MICROSOFT_CLIENT_SECRET);

  if (!hasMsConfig) {
    return NextResponse.json(
      {
        error: "Microsoft Graph not configured",
        setup:
          "Add MICROSOFT_GRAPH_TENANT_ID, MICROSOFT_GRAPH_CLIENT_ID, MICROSOFT_GRAPH_CLIENT_SECRET to Vercel env vars. " +
          "See: https://learn.microsoft.com/en-us/graph/auth-v2-service",
      },
      { status: 503 }
    );
  }

  const supabase = createAdminClient();

  // â”€â”€ Load live config from DB (falls back to defaults if row doesn't exist) â”€â”€
  const { data: configRow } = await supabase
    .from("agent_configs")
    .select("config")
    .eq("agent_name", "outlook")
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbCfg: Record<string, any> = configRow?.config ?? {};

  const MAILBOXES: string[] = Array.isArray(dbCfg.mailboxes) && dbCfg.mailboxes.length
    ? dbCfg.mailboxes.map((m: string) => m.trim().toLowerCase()).filter(Boolean)
    : DEFAULT_MAILBOXES;

  const lookbackHours: number   = typeof dbCfg.lookbackHours === "number" ? dbCfg.lookbackHours : DEFAULT_LOOKBACK;
  const maxPerMailbox: number   = typeof dbCfg.maxPerMailbox  === "number" ? dbCfg.maxPerMailbox  : DEFAULT_MAX;
  const autoCreateCo: boolean   = typeof dbCfg.autoCreateCompanies === "boolean" ? dbCfg.autoCreateCompanies : DEFAULT_AUTO_CO;
  const extraSkip: string[]     = Array.isArray(dbCfg.additionalSkipPatterns) ? dbCfg.additionalSkipPatterns : [];
  const extraSkipRx             = extraSkip.map((p: string) => new RegExp(p, "i"));

  const url = new URL(req.url);
  const since =
    url.searchParams.get("since") ??
    new Date(Date.now() - lookbackHours * 60 * 60 * 1000).toISOString();

  const perMailbox: Record<string, { inbox: number; errors: string[] }> = {};
  const contactResults: { email: string; mailbox: string; action: string }[] = [];

  // Global dedup across all mailboxes in this cron run
  const processedThisRun = new Set<string>();

  console.log("[check-inbox] config:", JSON.stringify({ MAILBOXES, lookbackHours, maxPerMailbox, since }));

  for (const mailbox of MAILBOXES) {
    perMailbox[mailbox] = { inbox: 0, errors: [] };
    const candidates: EmailCandidate[] = [];

    // Inbox â€” contact is the sender (inbound only)
    try {
      console.log(`[check-inbox] fetching inbox for ${mailbox} since ${since}`);
      const inbox = await getRecentEmails(mailbox, since, maxPerMailbox, "inbox");
      console.log(`[check-inbox] inbox fetched: ${inbox.length} emails`);
      perMailbox[mailbox].inbox = inbox.length;
      for (const msg of inbox) {
        candidates.push({
          email: msg.from.emailAddress.address.toLowerCase(),
          name: msg.from.emailAddress.name ?? "",
          subject: msg.subject,
          bodyPreview: msg.bodyPreview,
          seenInMailbox: mailbox,
          direction: "inbound",
          emailDate: msg.receivedDateTime ?? new Date().toISOString(),
        });
      }
    } catch (err) {
      perMailbox[mailbox].errors.push(
        `inbox: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Process candidates
    for (const candidate of candidates) {
      if (shouldSkip(candidate.email)) continue;
      if (extraSkipRx.some(rx => rx.test(candidate.email))) continue;
      if (processedThisRun.has(candidate.email)) continue;
      processedThisRun.add(candidate.email);

      // Skip if already in DB â€” but update last_contact_date
      const { data: existing } = await supabase
        .from("contacts")
        .select("id, last_contact_date, company_id")
        .eq("email", candidate.email)
        .maybeSingle();

      if (existing) {
        // Only update if this email is more recent than the stored date
        const currentDate = existing.last_contact_date ? new Date(existing.last_contact_date) : null;
        const emailDate   = new Date(candidate.emailDate);
        if (!currentDate || emailDate > currentDate) {
          await supabase
            .from("contacts")
            .update({ last_contact_date: candidate.emailDate })
            .eq("id", existing.id);
          // Also update the company's last_contact_date
          if (existing.company_id) {
            await supabase
              .from("companies")
              .update({ last_contact_date: candidate.emailDate })
              .eq("id", existing.company_id);
          }
        }
        contactResults.push({ email: candidate.email, mailbox, action: "updated last_contact" });
        continue;
      }

      // Extract with Claude, fall back to raw data on error
      let contact: ExtractedContact;
      try {
        contact = await extractContact(
          candidate.name,
          candidate.email,
          candidate.subject,
          candidate.bodyPreview
        );
      } catch {
        const parts = candidate.name.trim().split(" ");
        contact = {
          first_name: parts[0] || candidate.email.split("@")[0],
          last_name: parts.slice(1).join(" ") || "",
          email: candidate.email,
          notes: `${candidate.direction === "outbound" ? "Emailed by" : "Emailed"} ${mailbox}: ${candidate.subject}`,
        };
      }

      // Skip if Claude returned a generic/invalid name and we have no real name to fall back to
      if (!isValidName(contact.first_name ?? "", contact.last_name ?? "")) {
        const emailPrefix = candidate.email.split("@")[0];
        contact.first_name = emailPrefix;
        contact.last_name  = "";
      }

      // Find or create company stub
      let companyId: string | null = null;
      const domain = candidate.email.split("@")[1];

      if (contact.company_name) {
        // Try matching by name first
        const { data: byName } = await supabase
          .from("companies")
          .select("id")
          .ilike("name", `%${contact.company_name}%`)
          .limit(1)
          .maybeSingle();
        companyId = byName?.id ?? null;
      }

      if (!companyId && domain) {
        // Try matching by website domain
        const { data: byDomain } = await supabase
          .from("companies")
          .select("id")
          .ilike("website", `%${domain}%`)
          .limit(1)
          .maybeSingle();
        companyId = byDomain?.id ?? null;
      }

      if (!companyId && contact.company_name && autoCreateCo) {
        // Create new company stub
        const { data: newCo } = await supabase
          .from("companies")
          .insert({
            name: contact.company_name,
            type: "startup",
            source: "email",
            website: domain ? `https://${domain}` : null,
          })
          .select("id")
          .single();
        companyId = newCo?.id ?? null;
      }

      const sourceNote = [
        contact.notes,
        `Sourced from ${mailbox} (${candidate.direction})`,
      ]
        .filter(Boolean)
        .join(" Â· ");

      const { error: insertError } = await supabase.from("contacts").insert({
        first_name: contact.first_name  ?? "",
        last_name:  contact.last_name   ?? "",
        email:      candidate.email,
        title:      contact.title ?? null,
        company_id: companyId,
        type:       "Other",      // must match DB enum (capital O)
        status:     "pending",
        last_contact_date: candidate.emailDate,
        notes:      sourceNote,
      });

      if (insertError) {
        console.error("[check-inbox] insert failed:", insertError.message, "for", candidate.email);
        contactResults.push({ email: candidate.email, mailbox, action: `insert_error: ${insertError.message}` });
      } else {
        // Update the company's last_contact_date when we create a new contact
        if (companyId) {
          await supabase
            .from("companies")
            .update({ last_contact_date: candidate.emailDate })
            .eq("id", companyId);
        }
        contactResults.push({ email: candidate.email, mailbox, action: "created" });
      }
    }
  }

  const totalFetched = Object.values(perMailbox).reduce((s, m) => s + m.inbox, 0);
  const totalSkipped = totalFetched - contactResults.length - processedThisRun.size + processedThisRun.size;
  const allErrors    = Object.entries(perMailbox)
    .flatMap(([mb, v]) => v.errors.map(e => `${mb}: ${e}`));

  return NextResponse.json({
    success: true,
    config_used: { mailboxes: MAILBOXES, lookbackHours, maxPerMailbox, autoCreateCompanies: autoCreateCo },
    mailboxes_checked: MAILBOXES.length,
    emails_fetched: totalFetched,
    contacts_processed: contactResults.length,
    errors: allErrors,
    mailboxes: perMailbox,
    results: contactResults,
  });
}

