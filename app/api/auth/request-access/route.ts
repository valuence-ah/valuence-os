// ─── POST /api/auth/request-access ────────────────────────────────────────────
// Public endpoint — inserts a pending access request. No auth required.
// After a successful insert, sends an email notification to the admin.

import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest, NextResponse } from "next/server";

// ── Email helper (uses Resend if RESEND_API_KEY is set, silently skips if not) ─
async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return; // skip gracefully if not configured
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Valuence OS <notifications@valuence.vc>",
        to,
        subject,
        html,
      }),
    });
  } catch (err) {
    // Email failures should never break the main flow
    console.warn("[request-access] email send failed:", err);
  }
}

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

      // Notify admin of re-request
      await sendEmail({
        to: "andrew@valuence.vc",
        subject: `🔔 Valuence OS — New Access Request from ${fullName.trim()}`,
        html: buildAdminNotificationHtml({ fullName: fullName.trim(), email: email.trim(), message }),
      });

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

    // ── Notify admin (Andrew) that a new access request was submitted ─────────
    await sendEmail({
      to: "andrew@valuence.vc",
      subject: `🔔 Valuence OS — New Access Request from ${fullName.trim()}`,
      html: buildAdminNotificationHtml({ fullName: fullName.trim(), email: email.trim(), message }),
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
        A new user has requested access to <strong>Valuence OS</strong>. Review and approve or reject them from the Admin panel.
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
        Review Request in Admin Panel →
      </a>
    </div>
    <div style="padding: 16px 28px; background: #f8fafc; border-top: 1px solid #e2e8f0;">
      <p style="margin: 0; font-size: 12px; color: #94a3b8;">This notification was sent automatically by Valuence OS. Only you receive this email.</p>
    </div>
  </div>
</body>
</html>`;
}
