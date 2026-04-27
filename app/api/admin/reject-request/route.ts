// ─── POST /api/admin/reject-request ───────────────────────────────────────────

import { createClient }      from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { requestId } = await req.json();
  if (!requestId) return NextResponse.json({ error: "Missing requestId." }, { status: 400 });

  const admin = createAdminClient();
  await admin.from("access_requests").update({
    status:      "rejected",
    reviewed_at: new Date().toISOString(),
    reviewed_by: user.id,
  }).eq("id", requestId);

  return NextResponse.json({ ok: true });
}
