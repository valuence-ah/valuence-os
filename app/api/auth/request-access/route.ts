// ─── POST /api/auth/request-access ────────────────────────────────────────────
// Public endpoint — creates a Supabase auth user + pending profile + access request.
// The user can sign in immediately but will be blocked at the dashboard until
// an admin approves their request (profiles.approved = true).
// No auth required to call this endpoint.

import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

// ── Email helper (uses Resend if RESEND_API_KEY is set, silently skips if not) ─
async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Valuence OS <onboarding@resend.dev>",
        to,
        subject,
        html,
      }),
    });
  } catch (err) {
    console.warn("[request-access] email send failed:", err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { fullName, email, password, message } = await req.json();

    // ── Validate inputs ──────────────────────────────────────────────────────
    if (!fullName?.trim() || !email?.trim()) {
      return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName  = fullName.trim();
    const admin      = createAdminClient();

    // ── Check for duplicate requests ─────────────────────────────────────────
    const { data: existing } = await admin
      .from("access_requests")
      .select("id, status")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (existing?.status === "pending") {
      return NextResponse.json({ error: "A request for this email is already pending." }, { status: 409 });
    }
    if (existing?.status === "approved") {
      return NextResponse.json({ error: "This email has already been approved. Sign in at /auth/login." }, { status: 409 });
    }

    // ── Create Supabase auth user (email auto-confirmed, no verification email) ─
    // The user can sign in immediately but dashboard blocks until approved.
    const { data: authData, error: createError } = await admin.auth.admin.createUser({
      email:         cleanEmail,
      password,
      email_confirm: true, // skip email verification — admin approval is the gate
      user_metadata: { full_name: cleanName },
    });

    if (createError) {
      const alreadyExists =
        createError.message.toLowerCase().includes("already") ||
        createError.message.toLowerCase().includes("exists") ||
        createError.message.toLowerCase().includes("registered");

      if (alreadyExists) {
        return NextResponse.json(
          { error: "An account with this email already exists. Try signing in, or contact andrew@valuence.vc." },
          { status: 409 }
        );
      }
      console.error("[request-access] createUser error:", createError);
      return NextResponse.json({ error: "Failed to create account. Please try again." }, { status: 500 });
    }

    const userId = authData.user.id;

    // ── Create profile (approved: false — access blocked until admin approves) ─
    const initials = cleanName.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
    await admin.from("profiles").upsert({
      id:        userId,
      email:     cleanEmail,
      full_name: cleanName,
      role:      "analyst", // default role; admin can change when approving
      approved:  false,
      initials,
    }, { onConflict: "id" });

    // ── Insert or update access_request ──────────────────────────────────────
    if (existing) {
      // Re-request after rejection
      await admin.from("access_requests").update({
        full_name:    cleanName,
        message:      message?.trim() || null,
        status:       "pending",
        requested_at: new Date().toISOString(),
        reviewed_at:  null,
        reviewed_by:  null,
      }).eq("id", existing.id);
    } else {
      await admin.from("access_requests").insert({
        email:     cleanEmail,
        full_name: cleanName,
        message:   message?.trim() || null,
      });
    }

    // ── Notify admin ─────────────────────────────────────────────────────────
    await sendEmail({
      to:      "andrew@valuence.vc",
      subject: `🔔 Valuence OS — New Access Request from ${cleanName}`,
      html:    buildAdminNotificationHtml({ fullName: cleanName, email: cleanEmail, message }),
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[request-access] unexpected:", err);
    return NextResponse.json({ error: "Unexpected error." }, { status: 500 });
  }
}

function buildAdminNotificationHtml({
  fullName, email, message,
}: { fullName: string; email: string; message?: string }) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://valuence-os.vercel.app";
  return `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; padding: 32px; color: #1e293b;">
  <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 1px 4px rgba(0,0,0,0.06);">
    <div style="background: #0D3D38; padding: 24px 28px;">
      <p style="margin: 0; font-size: 13px; font-weight: 600; color: #5eead4; letter-spacing: 0.08em; text-transform: uppercase;">Valuence OS</p>
      <h1 style="margin: 6px 0 0; font-size: 20px; font-weight: 700; color: white;">New Access Request</h1>
    </div>
    <div style="padding: 28px;">
      <p style="margin: 0 0 20px; font-size: 15px; color: #475569;">
        A new user has registered and is requesting access to <strong>Valuence OS</strong>. Their account has been created but is pending your approval.
      </p>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 24px;">
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; color: #94a3b8; font-weight: 500; width: 110px;">Name</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; color: #1e293b; font-weight: 600;">${fullName}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; color: #94a3b8; font-weight: 500;">Email</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; color: #1e293b;">${email}</td>
        </tr>
        ${message ? `
        <tr>
          <td style="padding: 10px 0; color: #94a3b8; font-weight: 500; vertical-align: top;">Note</td>
          <td style="padding: 10px 0; color: #475569; font-style: italic;">"${message}"</td>
        </tr>` : ""}
      </table>
      <a href="${appUrl}/admin"
        style="display: inline-block; background: #0D3D38; color: white; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 24px; border-radius: 8px;">
        Approve in Admin Panel →
      </a>
    </div>
    <div style="padding: 16px 28px; background: #f8fafc; border-top: 1px solid #e2e8f0;">
      <p style="margin: 0; font-size: 12px; color: #94a3b8;">This notification was sent automatically by Valuence OS.</p>
    </div>
  </div>
</body>
</html>`;
}
