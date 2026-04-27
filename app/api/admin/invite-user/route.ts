// ─── POST /api/admin/invite-user ──────────────────────────────────────────────
// Admin-only: approves an access request and sends a Supabase invite email.

import { createClient }      from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // Auth check — must be admin
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { requestId, email, fullName, role } = await req.json();
  if (!requestId || !email || !fullName || !role) {
    return NextResponse.json({ error: "Missing fields." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Send Supabase invite email
  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, role },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/callback?redirectTo=/dashboard`,
  });

  if (inviteError) {
    console.error("[invite-user]", inviteError);
    return NextResponse.json({ error: inviteError.message }, { status: 500 });
  }

  // Mark request approved
  await admin.from("access_requests").update({
    status:      "approved",
    reviewed_at: new Date().toISOString(),
    reviewed_by: user.id,
  }).eq("id", requestId);

  return NextResponse.json({ ok: true });
}
