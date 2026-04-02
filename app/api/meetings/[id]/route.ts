// PATCH /api/meetings/[id] — update subject, company_id, or contact_ids
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabaseUser = await createClient();
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    subject?: string;
    company_id?: string | null;
    contact_ids?: string[] | null;
  };

  const patch: Record<string, unknown> = {};
  if (body.subject      !== undefined) patch.subject      = body.subject;
  if (body.company_id   !== undefined) patch.company_id   = body.company_id;
  if (body.contact_ids  !== undefined) patch.contact_ids  = body.contact_ids;

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("interactions")
    .update(patch)
    .eq("id", params.id)
    .select("id, subject, company_id, contact_ids")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
