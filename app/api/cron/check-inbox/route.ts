// ─── Cron: Check Team Inboxes → New Contacts ─────────────────────────────────
// Runs every 15 minutes via Vercel Cron (see vercel.json).
// Reads inbox + sent items for EVERY mailbox in OUTLOOK_MAILBOXES (comma-sep).
// Skips noise, extracts contact info with Claude, creates pending contacts.
//
// Multi-user: just add new @valuence.vc addresses to OUTLOOK_MAILBOXES.
// All mailboxes share one client_credentials token (tenant-wide Mail.Read).
//
// Callable manually: POST /api/cron/check-inbox
// Required env vars:
//   MICROSOFT_TENANT_ID      — Azure AD Directory (tenant) ID
//   MICROSOFT_CLIENT_ID      — App registration client ID
//   MICROSOFT_CLIENT_SECRET  — App registration client secret
//   OUTLOOK_MAILBOXES        — comma-separated, e.g. "andrew@valuence.vc,partner@valuence.vc"
//                              defaults to "andrew@valuence.vc"

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getRecentEmails } from "@/lib/microsoft-graph";
import { createAdminClient } from "@/lib/supabase/admin";

// ── Config ────────────────────────────────────────────────────────────────────

// All @valuence.vc mailboxes to monitor — add new team members here via env var
const MAILBOXES: string[] = (
  process.env.OUTLOOK_MAILBOXES ?? "andrew@valuence.vc"
)
  .split(",")
  .map((m) => m.trim().toLowerCase())
  .filter(Boolean);

// Internal domain — never create contacts for @valuence.vc addresses
const INTERNAL_DOMAIN = "valuence.vc";

// Noise patterns — newsletters, automated senders, no-reply addresses
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

// ── Contact extraction ────────────────────────────────────────────────────────

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

// ── Candidate type ────────────────────────────────────────────────────────────

interface EmailCandidate {
  email: string;
  name: string;
  subject: string;
  bodyPreview: string;
  seenInMailbox: string;
  direction: "inbound" | "outbound";
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (
    !process.env.MICROSOFT_TENANT_ID ||
    !process.env.MICROSOFT_CLIENT_ID ||
    !process.env.MICROSOFT_CLIENT_SECRET
  ) {
    return NextResponse.json(
      {
        error: "Microsoft Graph not configured",
        setup:
          "Add MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET to Vercel env vars. " +
          "See: https://learn.microsoft.com/en-us/graph/auth-v2-service",
      },
      { status: 503 }
    );
  }

  const url = new URL(req.url);
  const since =
    url.searchParams.get("since") ??
    new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const supabase = createAdminClient();
  const perMailbox: Record<string, { inbox: number; sent: number; errors: string[] }> = {};
  const contactResults: { email: string; mailbox: string; action: string }[] = [];

  // Global dedup across all mailboxes in this cron run
  const processedThisRun = new Set<string>();

  for (const mailbox of MAILBOXES) {
    perMailbox[mailbox] = { inbox: 0, sent: 0, errors: [] };
    const candidates: EmailCandidate[] = [];

    // Inbox — contact is the sender
    try {
      const inbox = await getRecentEmails(mailbox, since, 50, "inbox");
      perMailbox[mailbox].inbox = inbox.length;
      for (const msg of inbox) {
        candidates.push({
          email: msg.from.emailAddress.address.toLowerCase(),
          name: msg.from.emailAddress.name ?? "",
          subject: msg.subject,
          bodyPreview: msg.bodyPreview,
          seenInMailbox: mailbox,
          direction: "inbound",
        });
      }
    } catch (err) {
      perMailbox[mailbox].errors.push(
        `inbox: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Sent items — contacts are the recipients
    try {
      const sent = await getRecentEmails(mailbox, since, 50, "sentItems");
      perMailbox[mailbox].sent = sent.length;
      for (const msg of sent) {
        for (const r of msg.toRecipients ?? []) {
          candidates.push({
            email: r.emailAddress.address.toLowerCase(),
            name: r.emailAddress.name ?? "",
            subject: msg.subject,
            bodyPreview: msg.bodyPreview,
            seenInMailbox: mailbox,
            direction: "outbound",
          });
        }
      }
    } catch (err) {
      perMailbox[mailbox].errors.push(
        `sent: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Process candidates
    for (const candidate of candidates) {
      if (shouldSkip(candidate.email)) continue;
      if (processedThisRun.has(candidate.email)) continue;
      processedThisRun.add(candidate.email);

      // Skip if already in DB
      const { data: existing } = await supabase
        .from("contacts")
        .select("id")
        .eq("email", candidate.email)
        .maybeSingle();

      if (existing) {
        contactResults.push({ email: candidate.email, mailbox, action: "already exists" });
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

      if (!companyId && contact.company_name) {
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
        .join(" · ");

      await supabase.from("contacts").insert({
        first_name: contact.first_name,
        last_name: contact.last_name,
        email: candidate.email,
        title: contact.title ?? null,
        company_id: companyId,
        type: "other",
        status: "pending",
        notes: sourceNote,
      });

      contactResults.push({ email: candidate.email, mailbox, action: "created" });
    }
  }

  return NextResponse.json({
    success: true,
    mailboxes_checked: MAILBOXES.length,
    mailboxes: perMailbox,
    contacts_processed: contactResults.length,
    results: contactResults,
  });
}
