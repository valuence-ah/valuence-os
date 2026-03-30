// ─── Cron: Check Andrew's Inbox → New Contacts ───────────────────────────────
// Runs every 15 minutes via Vercel Cron (see vercel.json).
// Fetches emails received in the last hour from andrew@valuence.vc,
// skips noise (no-reply, newsletters), extracts contact info with Claude,
// and creates pending contacts in Supabase.
//
// Also callable manually via: POST /api/cron/check-inbox
// Requires: MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getRecentEmails } from "@/lib/microsoft-graph";
import { createAdminClient } from "@/lib/supabase/admin";

const ANDREW_MAILBOX = "andrew@valuence.vc";

// Patterns to skip (newsletters, no-reply, marketing, internal)
const SKIP_PATTERNS = [
  /no.?reply/i,
  /noreply/i,
  /donotreply/i,
  /newsletter/i,
  /notifications?@/i,
  /updates?@/i,
  /alerts?@/i,
  /support@/i,
  /hello@valuence/i,
  /andrew@valuence/i,
];

function shouldSkip(email: string, name: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(email) || p.test(name));
}

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

  const prompt = `Extract contact information from this email metadata. Return ONLY valid JSON.

Sender name: ${senderName}
Sender email: ${senderEmail}
Subject: ${subject}
Body preview: ${bodyPreview}

Return JSON:
{
  "first_name": "...",
  "last_name": "...",
  "email": "${senderEmail}",
  "company_name": "... or null",
  "title": "... or null",
  "notes": "one sentence about what they emailed about, or null"
}`;

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("No text response from Claude");

  const match = text.text.match(/\{[\s\S]*?\}/);
  if (!match) throw new Error("No JSON in Claude response");

  return JSON.parse(match[0]) as ExtractedContact;
}

export async function POST(req: NextRequest) {
  // Verify Vercel cron secret or authenticated user
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Allow Vercel Cron or manual call with optional ?since= param
  const url = new URL(req.url);
  const since =
    url.searchParams.get("since") ??
    new Date(Date.now() - 60 * 60 * 1000).toISOString(); // default: last 1 hour

  let emails;
  try {
    emails = await getRecentEmails(ANDREW_MAILBOX, since, 50);
  } catch (err) {
    const msg = String(err);
    if (msg.includes("not configured")) {
      return NextResponse.json(
        {
          error: "Microsoft Graph not configured",
          setup:
            "Add MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET to .env.local. See: https://learn.microsoft.com/en-us/graph/auth-v2-service",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const supabase = createAdminClient();
  const results: { email: string; action: string }[] = [];

  for (const msg of emails) {
    const senderEmail = msg.from.emailAddress.address.toLowerCase();
    const senderName = msg.from.emailAddress.name ?? "";

    if (shouldSkip(senderEmail, senderName)) {
      results.push({ email: senderEmail, action: "skipped (noise)" });
      continue;
    }

    // Check if contact already exists
    const { data: existing } = await supabase
      .from("contacts")
      .select("id")
      .eq("email", senderEmail)
      .maybeSingle();

    if (existing) {
      results.push({ email: senderEmail, action: "already exists" });
      continue;
    }

    // Extract contact info with Claude
    let contact: ExtractedContact;
    try {
      contact = await extractContact(
        senderName,
        senderEmail,
        msg.subject,
        msg.bodyPreview
      );
    } catch {
      // Fallback: use raw email data
      const nameParts = senderName.trim().split(" ");
      contact = {
        first_name: nameParts[0] || senderEmail.split("@")[0],
        last_name: nameParts.slice(1).join(" ") || "(unknown)",
        email: senderEmail,
        company_name: undefined,
        title: undefined,
        notes: `Emailed: ${msg.subject}`,
      };
    }

    // Find or create company stub
    let companyId: string | null = null;
    if (contact.company_name) {
      const { data: company } = await supabase
        .from("companies")
        .select("id")
        .ilike("name", `%${contact.company_name}%`)
        .limit(1)
        .maybeSingle();

      companyId = company?.id ?? null;

      if (!companyId) {
        const domain = senderEmail.split("@")[1];
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
    }

    await supabase.from("contacts").insert({
      first_name: contact.first_name,
      last_name: contact.last_name,
      email: senderEmail,
      title: contact.title ?? null,
      company_id: companyId,
      type: "other",
      status: "pending",
      notes: contact.notes ?? null,
    });

    results.push({ email: senderEmail, action: "created" });
  }

  return NextResponse.json({
    success: true,
    checked: emails.length,
    results,
  });
}
