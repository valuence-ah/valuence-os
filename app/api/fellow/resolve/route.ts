// ─── Fellow Meeting Resolve /api/fellow/resolve ───────────────────────────────
// Saves manually confirmed CRM resolutions from the Resolution Modal.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

interface ResolvedContact {
  existing_id?: string;
  first_name?: string;
  last_name?: string;
  email: string;
  title?: string;
  type?: string;
  company_id?: string;
}

interface ResolvedCompany {
  existing_id?: string;
  name?: string;
  website?: string;
  type?: string;
  location_city?: string;
  location_country?: string;
}

interface PipelineEntry {
  stage?: string;
  priority?: string;
}

interface ResolveBody {
  meeting_id: string;
  contacts: ResolvedContact[];
  company: ResolvedCompany | null;
  pipeline: PipelineEntry | null;
}

export async function POST(req: NextRequest) {
  const supabaseUser = await createClient();
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as ResolveBody;
  const { meeting_id, contacts, company, pipeline } = body;

  const supabase = createAdminClient();

  // ── Resolve / create company ──────────────────────────────────────────────────
  let companyId = company?.existing_id ?? null;

  if (!companyId && company?.name) {
    const { data: created, error } = await supabase
      .from("companies")
      .insert({
        name: company.name,
        website: company.website ?? null,
        type: company.type ?? "startup",
        location_city: company.location_city ?? null,
        location_country: company.location_country ?? null,
        status: "active",
        created_by: user.id,
      })
      .select("id")
      .single();
    if (!error && created) {
      companyId = created.id as string;
      // Update website_domain
      if (company.website) {
        const domain = company.website
          .replace(/^https?:\/\/(www\.)?/, "")
          .split("/")[0]
          .toLowerCase();
        await supabase.from("companies").update({ website_domain: domain }).eq("id", companyId);
      }
    }
  }

  // ── Resolve / create contacts ─────────────────────────────────────────────────
  const contactIds: string[] = [];

  for (const c of contacts) {
    let contactId = c.existing_id ?? null;

    if (!contactId && c.first_name && c.email) {
      const { data: created, error } = await supabase
        .from("contacts")
        .insert({
          first_name: c.first_name,
          last_name: c.last_name ?? "",
          email: c.email,
          title: c.title ?? null,
          type: c.type ?? "other",
          company_id: companyId,
          source: "meeting_sync",
          status: "active",
          created_by: user.id,
        })
        .select("id")
        .single();
      if (!error && created) contactId = created.id as string;
    } else if (contactId && companyId) {
      // Update company link if missing
      await supabase
        .from("contacts")
        .update({ company_id: companyId })
        .eq("id", contactId)
        .is("company_id", null);
    }

    if (contactId) {
      contactIds.push(contactId);
      // Upsert meeting_contacts junction
      await supabase.from("meeting_contacts").upsert({
        meeting_id,
        contact_id: contactId,
        role: "attendee",
        is_internal: false,
        match_confidence: c.existing_id ? "high" : "manual",
      }, { onConflict: "meeting_id,contact_id" });
    }
  }

  // ── Handle pipeline ───────────────────────────────────────────────────────────
  if (pipeline && companyId) {
    // Get meeting date for last_contact
    const { data: mtg } = await supabase
      .from("interactions")
      .select("date")
      .eq("id", meeting_id)
      .maybeSingle();
    const dateStr = mtg?.date
      ? new Date(mtg.date as string).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];

    await supabase.from("companies").update({
      deal_status: "active_deal",
      last_contact_date: dateStr,
      last_meeting_date: dateStr,
    }).eq("id", companyId);
  }

  // ── Mark meeting as resolved ──────────────────────────────────────────────────
  const { error: updateErr } = await supabase
    .from("interactions")
    .update({
      resolution_status: "resolved",
      company_id: companyId,
      contact_ids: contactIds.length ? contactIds : null,
    })
    .eq("id", meeting_id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ success: true, companyId, contactIds });
}
