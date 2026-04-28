// ─── POST /api/auth/check-approval ────────────────────────────────────────────
// Public endpoint — checks whether an email has an approved profile.
// Used by the login page before sending a magic link, so unapproved users
// are blocked before a Supabase session is even created.

import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json() as { email?: string };
    if (!email?.trim()) {
      return NextResponse.json({ approved: false, reason: "no_email" });
    }

    const admin = createAdminClient();

    // Check profiles table for an approved entry with this email
    const { data: profile } = await admin
      .from("profiles")
      .select("approved, role")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();

    if (profile?.approved) {
      return NextResponse.json({ approved: true });
    }

    // Check if there's a pending or rejected access request
    const { data: request } = await admin
      .from("access_requests")
      .select("status")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();

    if (request?.status === "pending") {
      return NextResponse.json({ approved: false, reason: "pending" });
    }

    if (request?.status === "rejected") {
      return NextResponse.json({ approved: false, reason: "rejected" });
    }

    // No profile and no request — unknown user
    return NextResponse.json({ approved: false, reason: "unknown" });
  } catch (err) {
    console.error("[check-approval]", err);
    // On error, fail closed (deny access)
    return NextResponse.json({ approved: false, reason: "error" });
  }
}
