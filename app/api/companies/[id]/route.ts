// PATCH /api/companies/[id] — update company fields (admin client bypasses RLS)
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Auth — must be a logged-in user
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, unknown>;

  // Whitelist the fields that are allowed to be updated via this route
  const ALLOWED = [
    "name", "type", "website", "location_city", "location_country",
    "description", "linkedin_url", "pitch_deck_url",
  ];
  const updates: Record<string, unknown> = {};
  for (const key of ALLOWED) {
    if (Object.prototype.hasOwnProperty.call(body, key)) {
      updates[key] = body[key];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("companies")
    .update(updates)
    .eq("id", id)
    .select("id, name, type, website, location_city, location_country")
    .single();

  if (error) {
    console.error("[PATCH /api/companies/[id]]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
