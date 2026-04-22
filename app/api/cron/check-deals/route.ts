// ─── Cron: Check deals@valuence.vc → Deal Flow Parser ────────────────────────
// Runs every 15 minutes via Vercel Cron (see vercel.json).
// Fetches emails from deals@valuence.vc inbox,
// uses Claude to extract company/deal info, creates/updates company in Supabase.
//
// Also callable manually via: POST /api/cron/check-deals
// Requires: MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getRecentEmails } from "@/lib/microsoft-graph";
import { createAdminClient } from "@/lib/supabase/admin";

const DEALS_MAILBOX = "deals@valuence.vc";

interface ParsedDeal {
  company_name: string | null;
  company_website: string | null;
  company_description: string | null;
  sectors: string[];
  founder_name: string | null;
  founder_email: string | null;
  deck_url: string | null;
}

async function parseDealEmail(
  fromName: string,
  fromEmail: string,
  subject: string,
  body: string
): Promise<ParsedDeal> {
  const client = new Anthropic();

  const prompt = `Parse this pitch/deal email and extract company info. Return ONLY valid JSON.

From: ${fromName} <${fromEmail}>
Subject: ${subject}
Body:
${body.slice(0, 3000)}

Return JSON:
{
  "company_name": "startup name or null",
  "company_website": "URL or null",
  "company_description": "1-2 sentence description or null",
  "sectors": ["array", "of", "sectors"],
  "founder_name": "founder full name or null",
  "founder_email": "founder email or null",
  "deck_url": "URL to pitch deck if mentioned in body, or null"
}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("No Claude response");

  const match = text.text.match(/\{[\s\S]*?\}/);
  if (!match) throw new Error("No JSON in response");

  return JSON.parse(match[0]) as ParsedDeal;
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const since =
    url.searchParams.get("since") ??
    new Date(Date.now() - 60 * 60 * 1000).toISOString();

  let emails;
  try {
    emails = await getRecentEmails(DEALS_MAILBOX, since, 20);
  } catch (err) {
    const msg = String(err);
    if (msg.includes("not configured")) {
      return NextResponse.json(
        {
          error: "Microsoft Graph not configured",
          setup:
            "Add MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET to .env.local",
        },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const supabase = createAdminClient();
  const results: { subject: string; action: string; company?: string }[] = [];

  for (const msg of emails) {
    const fromEmail = msg.from.emailAddress.address.toLowerCase();
    const fromName = msg.from.emailAddress.name ?? "";

    let parsed: ParsedDeal;
    try {
      parsed = await parseDealEmail(fromName, fromEmail, msg.subject, msg.body.content);
    } catch {
      results.push({ subject: msg.subject, action: "parse failed" });
      continue;
    }

    const searchName =
      parsed.company_name ||
      (fromEmail.split("@")[1] ?? "").replace(/\.(com|io|co|vc)$/, "");

    // Find or create company
    let companyId: string | null = null;
    let isNew = false;

    if (searchName) {
      const { data: existing } = await supabase
        .from("companies")
        .select("id")
        .ilike("name", `%${searchName}%`)
        .limit(1)
        .maybeSingle();

      if (existing) {
        companyId = existing.id;
        // Update with new deck if present
        if (parsed.deck_url) {
          await supabase
            .from("companies")
            .update({ pitch_deck_url: parsed.deck_url })
            .eq("id", companyId);
        }
      } else {
        const { data: newCo } = await supabase
          .from("companies")
          .insert({
            name: parsed.company_name || searchName,
            type: "startup",
            deal_status: "sourced",
            website: parsed.company_website ?? null,
            description: parsed.company_description ?? null,
            sectors: parsed.sectors ?? [],
            pitch_deck_url: parsed.deck_url ?? null,
            source: "email",
          })
          .select("id")
          .single();
        companyId = newCo?.id ?? null;
        isNew = true;
      }
    }

    // Find or create contact (founder)
    const contactEmail = (parsed.founder_email || fromEmail).toLowerCase();
    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id")
      .eq("email", contactEmail)
      .maybeSingle();

    if (!existingContact) {
      const nameParts = (parsed.founder_name || fromName).trim().split(" ");
      await supabase.from("contacts").insert({
        first_name: nameParts[0] || contactEmail.split("@")[0],
        last_name: nameParts.slice(1).join(" ") || "(unknown)",
        email: contactEmail,
        company_id: companyId,
        type: "founder",
        status: "pending",
      });
    } else if (companyId) {
      await supabase
        .from("contacts")
        .update({ company_id: companyId })
        .eq("id", existingContact.id)
        .is("company_id", null);
    }

    // Log as interaction
    await supabase.from("interactions").insert({
      type: "email",
      subject: msg.subject,
      body: msg.bodyPreview,
      date: new Date(msg.receivedDateTime).toISOString(),
      company_id: companyId,
      sentiment: "neutral",
    });

    // Save deck to documents table
    if (parsed.deck_url && companyId) {
      await supabase.from("documents").insert({
        company_id: companyId,
        name: "Pitch Deck (from email)",
        type: "pitch_deck",
        file_url: parsed.deck_url,
      });
    }

    results.push({
      subject: msg.subject,
      action: isNew ? "company created" : "company updated",
      company: parsed.company_name ?? searchName,
    });
  }

  return NextResponse.json({ success: true, checked: emails.length, results });
}
