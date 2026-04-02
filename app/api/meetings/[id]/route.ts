// PATCH /api/meetings/[id] — update subject, company_id, contact_ids, or archived
// DELETE /api/meetings/[id] — delete a meeting interaction
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabaseUser = await createClient();
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    subject?:     string;
    company_id?:  string | null;
    contact_ids?: string[] | null;
    archived?:    boolean;
  };

  const patch: Record<string, unknown> = {};
  if (body.subject      !== undefined) patch.subject      = body.subject;
  if (body.company_id   !== undefined) patch.company_id   = body.company_id;
  if (body.contact_ids  !== undefined) patch.contact_ids  = body.contact_ids;
  if (body.archived     !== undefined) patch.archived     = body.archived;

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  const supabase = createAdminClient();

  // ── If archiving, also record the external ID so sync won't reimport it ───
  if (body.archived === true) {
    const { data: mtg } = await supabase
      .from("interactions")
      .select("fireflies_id, source")
      .eq("id", id)
      .maybeSingle();

    const externalId = (mtg as { fireflies_id?: string | null; source?: string | null } | null)?.fireflies_id;
    if (externalId) {
      await supabase
        .from("archived_external_meetings")
        .upsert(
          { external_id: externalId, source: "fireflies", archived_by: user.id },
          { onConflict: "external_id" }
        );
    }
  }

  const { data, error } = await supabase
    .from("interactions")
    .update(patch)
    .eq("id", id)
    .select("id, subject, company_id, contact_ids, archived")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabaseUser = await createClient();
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();
  const { error } = await supabase
    .from("interactions")
    .delete()
    .eq("id", id)
    .eq("type", "meeting");

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
