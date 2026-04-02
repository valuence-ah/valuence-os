// PATCH /api/contacts/[id] — update a contact (partial update)
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json() as Record<string, unknown>;

  // Allowlist of patchable fields to prevent over-posting
  const allowed = [
    "first_name", "last_name", "email", "phone", "title", "type",
    "linkedin_url", "location_city", "location_country", "notes",
    "relationship_strength", "company_id", "last_contact_date", "tags",
  ];
  const patch: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) patch[key] = body[key];
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No patchable fields provided" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("contacts")
    .update(patch)
    .eq("id", id)
    .select("*, company:companies(id, name, type, deal_status, website)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
