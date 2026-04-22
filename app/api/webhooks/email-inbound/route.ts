// ─── Inbound Email Webhook (Postmark) ────────────────────────────────────────
// Handles emails forwarded through Postmark Inbound Parsing.
// Routes by recipient:
//   → andrew@valuence.vc   → extract contact, save as pending
//   → deals@valuence.vc    → parse pitch, create/update company + deck
//
// Setup:
//   1. Sign up at postmarkapp.com → Servers → Inbound
//   2. Copy your inbound address (e.g. xyz@inbound.postmarkapp.com)
//   3. In Outlook: Settings → Rules → forward all mail to that address
//   4. In Postmark: set Webhook URL to:
//      https://your-app.vercel.app/api/webhooks/email-inbound
//      (optionally protect with: Settings → Webhook → Basic Auth)
//
// No env vars required beyond ANTHROPIC_API_KEY (already set).

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient, validateWebhookSecret } from "@/lib/supabase/admin";

// ── Postmark payload shape ────────────────────────────────────────────────────
interface PostmarkEmail {
  From: string;
  FromName: string;
  FromFull: { Email: string; Name: string };
  To: string;
  OriginalRecipient?: string;
  Subject: string;
  TextBody: string;
  HtmlBody?: string;
  Date: string;
  Attachments?: { Name: string; Content: string; ContentType: string }[];
}

// ── Noise filter (skip newsletters, no-reply, etc.) ────────────────────────
const SKIP_RE = /no.?reply|noreply|donotreply|newsletter|notifications?@|updates?@|alerts?@|marketing@|bounce@/i;
function isNoise(email: string, name: string) {
  return SKIP_RE.test(email) || SKIP_RE.test(name);
}

const client = new Anthropic();

// ── Contact extraction (andrew@valuence.vc emails) ────────────────────────
async function extractContactInfo(msg: PostmarkEmail) {
  const prompt = `Extract contact info from this email. Return ONLY valid JSON.

From: ${msg.FromName} <${msg.From}>
Subject: ${msg.Subject}
Body: ${(msg.TextBody ?? "").slice(0, 1000)}

JSON:
{
  "first_name": "...",
  "last_name": "...",
  "email": "${msg.From}",
  "company_name": "... or null",
  "title": "... or null",
  "notes": "one sentence about why they emailed, or null"
}`;

  const res = await client.messages.create({
    model: "claude-haiku-3-5",
    max_tokens: 256,
    messages: [{ role: "user", content: prompt }],
  });

  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("no text");
  const m = text.text.match(/\{[\s\S]*?\}/);
  if (!m) throw new Error("no json");
  return JSON.parse(m[0]) as {
    first_name: string;
    last_name: string;
    email: string;
    company_name?: string;
    title?: string;
    notes?: string;
  };
}

// ── Deal extraction (deals@valuence.vc emails) ────────────────────────────
async function extractDealInfo(msg: PostmarkEmail) {
  const prompt = `Parse this pitch email. Return ONLY valid JSON.

From: ${msg.FromName} <${msg.From}>
Subject: ${msg.Subject}
Body: ${(msg.TextBody ?? "").slice(0, 3000)}

JSON:
{
  "company_name": "startup name or null",
  "company_website": "URL or null",
  "company_description": "1-2 sentences or null",
  "sectors": ["array"],
  "founder_name": "full name or null",
  "founder_email": "email or null",
  "deck_url": "URL if mentioned in email body, else null"
}`;

  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [{ role: "user", content: prompt }],
  });

  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("no text");
  const m = text.text.match(/\{[\s\S]*?\}/);
  if (!m) throw new Error("no json");
  return JSON.parse(m[0]) as {
    company_name: string | null;
    company_website: string | null;
    company_description: string | null;
    sectors: string[];
    founder_name: string | null;
    founder_email: string | null;
    deck_url: string | null;
  };
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!validateWebhookSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as PostmarkEmail;

  const fromEmail = (body.From ?? "").toLowerCase();
  const fromName = body.FromName ?? "";
  const recipient = (body.OriginalRecipient ?? body.To ?? "").toLowerCase();

  if (!fromEmail) {
    return NextResponse.json({ error: "No From address" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // ── Route: andrew@valuence.vc → New Contact ────────────────────────────
  if (recipient.includes("andrew@valuence")) {
    if (isNoise(fromEmail, fromName)) {
      return NextResponse.json({ skipped: true, reason: "noise" });
    }

    // Idempotency
    const { data: exists } = await supabase
      .from("contacts")
      .select("id")
      .eq("email", fromEmail)
      .maybeSingle();

    if (exists) {
      return NextResponse.json({ success: true, contact_id: exists.id, duplicate: true });
    }

    let extracted;
    try {
      extracted = await extractContactInfo(body);
    } catch {
      const parts = fromName.trim().split(" ");
      extracted = {
        first_name: parts[0] || fromEmail.split("@")[0],
        last_name: parts.slice(1).join(" ") || "(unknown)",
        email: fromEmail,
        notes: `Emailed Andrew: ${body.Subject}`,
      };
    }

    let companyId: string | null = null;
    if (extracted.company_name) {
      const { data: co } = await supabase
        .from("companies")
        .select("id")
        .ilike("name", `%${extracted.company_name}%`)
        .limit(1)
        .maybeSingle();
      companyId = co?.id ?? null;

      if (!companyId) {
        const domain = fromEmail.split("@")[1];
        const { data: newCo } = await supabase
          .from("companies")
          .insert({ name: extracted.company_name, type: "startup", source: "email", website: domain ? `https://${domain}` : null })
          .select("id")
          .single();
        companyId = newCo?.id ?? null;
      }
    }

    const { data: contact } = await supabase
      .from("contacts")
      .insert({
        first_name: extracted.first_name,
        last_name: extracted.last_name,
        email: fromEmail,
        title: extracted.title ?? null,
        company_id: companyId,
        type: "other",
        status: "pending",
        notes: extracted.notes ?? null,
      })
      .select("id")
      .single();

    // Log inbound email as an interaction, linked to company + contact
    if (contact?.id) {
      const emailDate = body.Date ? new Date(body.Date).toISOString() : new Date().toISOString();
      await supabase.from("interactions").insert({
        type: "email",
        subject: body.Subject,
        body: body.TextBody?.slice(0, 2000) ?? null,
        date: emailDate,
        company_id: companyId,
        contact_id: contact.id,
        contact_ids: [contact.id],
        sentiment: "neutral",
      });
      // Update contact's last_interaction_date and company's last_contact_date
      await supabase.from("contacts").update({ last_interaction_date: emailDate }).eq("id", contact.id);
      if (companyId) {
        await supabase.from("companies").update({ last_contact_date: emailDate }).eq("id", companyId);
      }
    }

    return NextResponse.json({ success: true, contact_id: contact?.id });
  }

  // ── Route: deals@valuence.vc → Deal Flow Parser ───────────────────────
  if (recipient.includes("deals@valuence")) {
    let parsed;
    try {
      parsed = await extractDealInfo(body);
    } catch {
      return NextResponse.json({ error: "Claude parse failed" }, { status: 500 });
    }

    const searchName =
      parsed.company_name ||
      (fromEmail.split("@")[1] ?? "").replace(/\.(com|io|co|vc)$/, "");

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
        if (parsed.deck_url) {
          await supabase.from("companies").update({ pitch_deck_url: parsed.deck_url }).eq("id", companyId);
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

    // Contact (founder)
    const contactEmail = (parsed.founder_email || fromEmail).toLowerCase();
    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id")
      .eq("email", contactEmail)
      .maybeSingle();

    let contactId: string | null = existingContact?.id ?? null;
    if (!existingContact) {
      const parts = (parsed.founder_name || fromName).trim().split(" ");
      const { data: newContact } = await supabase.from("contacts").insert({
        first_name: parts[0] || contactEmail.split("@")[0],
        last_name: parts.slice(1).join(" ") || "(unknown)",
        email: contactEmail,
        company_id: companyId,
        type: "founder",
        status: "pending",
      }).select("id").single();
      contactId = newContact?.id ?? null;
    }

    // Log interaction, linked to company + contact
    const dealEmailDate = body.Date ? new Date(body.Date).toISOString() : new Date().toISOString();
    await supabase.from("interactions").insert({
      type: "email",
      subject: body.Subject,
      body: body.TextBody?.slice(0, 2000) ?? null,
      date: dealEmailDate,
      company_id: companyId,
      contact_id: contactId ?? null,
      contact_ids: contactId ? [contactId] : null,
      sentiment: "neutral",
    });
    if (contactId) {
      await supabase.from("contacts").update({ last_interaction_date: dealEmailDate }).eq("id", contactId);
    }
    if (companyId) {
      await supabase.from("companies").update({ last_contact_date: dealEmailDate }).eq("id", companyId);
    }

    // Save deck
    if (parsed.deck_url && companyId) {
      await supabase.from("documents").insert({
        company_id: companyId,
        name: "Pitch Deck (from email)",
        type: "pitch_deck",
        file_url: parsed.deck_url,
      });
    }

    return NextResponse.json({ success: true, company: parsed.company_name, is_new: isNew });
  }

  return NextResponse.json({ skipped: true, reason: "Unrecognised recipient" });
}
