// ─── POST /api/auth/request-access ────────────────────────────────────────────
// Public endpoint — inserts a pending access request. No auth required.

import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { fullName, email, message } = await req.json();
    if (!fullName?.trim() || !email?.trim()) {
      return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Check if already requested or already a user
    const { data: existing } = await supabase
      .from("access_requests")
      .select("id, status")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();

    if (existing) {
      if (existing.status === "pending") {
        return NextResponse.json({ error: "A request for this email is already pending." }, { status: 409 });
      }
      if (existing.status === "approved") {
        return NextResponse.json({ error: "This email has already been approved. Check your inbox for a sign-in link." }, { status: 409 });
      }
      // rejected → allow re-request by updating the record
      await supabase
        .from("access_requests")
        .update({ full_name: fullName.trim(), message: message?.trim() || null, status: "pending", requested_at: new Date().toISOString(), reviewed_at: null, reviewed_by: null })
        .eq("id", existing.id);
      return NextResponse.json({ ok: true });
    }

    const { error } = await supabase.from("access_requests").insert({
      email:     email.trim().toLowerCase(),
      full_name: fullName.trim(),
      message:   message?.trim() || null,
    });

    if (error) {
      console.error("[request-access]", error);
      return NextResponse.json({ error: "Failed to submit request. Please try again." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[request-access] unexpected:", err);
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}
