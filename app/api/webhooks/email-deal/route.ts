// ─── Webhook: Email-to-Deal-Flow ─────────────────────────────────────────────
// Called by Make.com when an email is forwarded to deals@valuence.vc.
// Make.com parses the email and POSTs structured data here.
// Creates company + contact if they don't exist, logs the email as an interaction.
// Header: x-webhook-secret

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, validateWebhookSecret } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  if (!validateWebhookSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    from_name,
    from_email,
    subject,
    email_body,
    date,
    company_name,       // Make.com / Claude extracts from email
    company_website,
    company_description,
    sectors,
    deck_url,           // attachment URL if Make.com found a deck
  } = body;

  if (!from_email) {
    return NextResponse.json({ error: "from_email is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // ── 1. Find or create company ──────────────────────────────────────────────
  let companyId: string | null = null;
  let isNewCompany = false;
  const nameToSearch = company_name || (from_email.split("@")[1] ?? "").replace(/\.(com|io|co|vc)$/, "");

  if (nameToSearch) {
    const { data: existingCompany } = await supabase
      .from("companies")
      .select("id")
      .ilike("name", `%${nameToSearch}%`)
      .limit(1)
      .maybeSingle();

    if (existingCompany) {
      companyId = existingCompany.id;
    } else {
      // Create new company from email domain
      const { data: newCompany } = await supabase
        .from("companies")
        .insert({
          name:        company_name || nameToSearch,
          type:        "startup",
          deal_status: "sourced",
          website:     company_website || null,
          description: company_description || null,
          sectors:     sectors || [],
          pitch_deck_url: deck_url || null,
          source:      "email",
        })
        .select("id")
        .single();

      companyId = newCompany?.id ?? null;
      isNewCompany = true;
    }
  }

  // ── 2. Find or create contact ──────────────────────────────────────────────
  let contactId: string | null = null;
  const emailLower = from_email.toLowerCase();

  const { data: existingContact } = await supabase
    .from("contacts")
    .select("id")
    .eq("email", emailLower)
    .maybeSingle();

  if (existingContact) {
    contactId = existingContact.id;
    // Update company link if missing
    if (companyId) {
      await supabase
        .from("contacts")
        .update({ company_id: companyId })
        .eq("id", contactId)
        .is("company_id", null);
    }
  } else {
    // Parse name
    const nameParts = (from_name || "").trim().split(" ");
    const firstName = nameParts[0] || emailLower.split("@")[0];
    const lastName  = nameParts.slice(1).join(" ") || "(unknown)";

    const { data: newContact } = await supabase
      .from("contacts")
      .insert({
        first_name:  firstName,
        last_name:   lastName,
        email:       emailLower,
        company_id:  companyId,
        type:        "founder",
        status:      "pending",  // goes into New Contacts staging
      })
      .select("id")
      .single();

    contactId = newContact?.id ?? null;
  }

  // ── 3. Log the email as an interaction ─────────────────────────────────────
  const { data: interaction } = await supabase
    .from("interactions")
    .insert({
      type:        "email",
      subject:     subject || "Inbound email",
      body:        email_body || null,
      date:        date ? new Date(date).toISOString() : new Date().toISOString(),
      company_id:  companyId,
      contact_ids: contactId ? [contactId] : [],
      sentiment:   "neutral",
    })
    .select("id")
    .single();

  // ── 4. If deck attached, save to documents ─────────────────────────────────
  if (deck_url && companyId) {
    await supabase.from("documents").insert({
      company_id: companyId,
      name:       "Pitch Deck (from email)",
      type:       "pitch_deck",
      file_url:   deck_url,
    });
    await supabase.from("companies").update({ pitch_deck_url: deck_url }).eq("id", companyId);
  }

  return NextResponse.json({
    success: true,
    company_id:     companyId,
    contact_id:     contactId,
    interaction_id: interaction?.id ?? null,
    is_new_company: isNewCompany,
  });
}
