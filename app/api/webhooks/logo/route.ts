// ─── Webhook: Logo Update for Companies ──────────────────────────────────────
// Called by Make.com after Claude finds a high-confidence logo URL.
// Make.com filters confidence >= 80 before calling this endpoint.
// Header: x-webhook-secret

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, validateWebhookSecret } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  if (!validateWebhookSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { company_id, logo_url, company_name } = body;

  if (!logo_url) {
    return NextResponse.json({ error: "logo_url is required" }, { status: 400 });
  }
  if (!company_id && !company_name) {
    return NextResponse.json({ error: "company_id or company_name is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Resolve company if only name provided
  let resolvedId = company_id;
  if (!resolvedId && company_name) {
    const { data: found } = await supabase
      .from("companies")
      .select("id")
      .ilike("name", company_name.trim())
      .limit(1)
      .single();
    if (!found) {
      return NextResponse.json({ error: `Company not found: ${company_name}` }, { status: 404 });
    }
    resolvedId = found.id;
  }

  const { error } = await supabase
    .from("companies")
    .update({ logo_url, updated_at: new Date().toISOString() })
    .eq("id", resolvedId);

  if (error) {
    console.error("[webhook/logo] Supabase error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, company_id: resolvedId });
}
