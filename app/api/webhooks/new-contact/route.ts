// ─── Webhook: New Contact from Email ─────────────────────────────────────────
// Called by Make.com when any inbound email arrives.
// Claude (in Make.com) extracts the contact info and POSTs here.
// Creates a PENDING contact that shows up in /crm/contacts/pending for review.
// Header: x-webhook-secret

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, validateWebhookSecret } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  if (!validateWebhookSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const {
    first_name,
    last_name,
    email,
    phone,
    linkedin_url,
    title,
    company_name,   // Make.com extracts this from email domain or signature
    notes,
  } = body;

  if (!email && !first_name) {
    return NextResponse.json({ error: "email or first_name is required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const emailLower = (email || "").toLowerCase();

  // Idempotency: skip if contact already exists
  if (emailLower) {
    const { data: existing } = await supabase
      .from("contacts")
      .select("id, status")
      .eq("email", emailLower)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({
        success: true,
        contact_id:  existing.id,
        is_duplicate: true,
        status:      existing.status,
      });
    }
  }

  // Try to find matching company by name
  let companyId: string | null = null;
  if (company_name) {
    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .ilike("name", `%${company_name}%`)
      .limit(1)
      .maybeSingle();
    companyId = company?.id ?? null;

    // If no company found, create a stub so the contact has something to link to
    if (!companyId) {
      const domain = emailLower.split("@")[1];
      const { data: newCompany } = await supabase
        .from("companies")
        .insert({
          name:   company_name,
          type:   "startup",
          source: "email",
          website: domain ? `https://${domain}` : null,
        })
        .select("id")
        .single();
      companyId = newCompany?.id ?? null;
    }
  }

  const { data: contact, error } = await supabase
    .from("contacts")
    .insert({
      first_name:  first_name || emailLower.split("@")[0],
      last_name:   last_name  || "(unknown)",
      email:       emailLower || null,
      phone:       phone      || null,
      linkedin_url: linkedin_url || null,
      title:       title      || null,
      company_id:  companyId,
      type:        "other",    // user sets the real type in the pending review UI
      status:      "pending",
      notes:       notes      || null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, contact_id: contact.id, is_duplicate: false });
}
