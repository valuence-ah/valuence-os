// ─── POST /api/admin/invite-user ──────────────────────────────────────────────
// Admin-only: approves an access request, sends a Supabase invite email,
// and sends the user a branded confirmation email via Resend.

import { createClient }      from "@/lib/supabase/server";
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
        from: "Valuence OS <notifications@valuence.vc>",
        to,
        subject,
        html,
      }),
    });
  } catch (err) {
    console.warn("[invite-user] confirmation email failed:", err);
  }
}

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

  // Send Supabase invite email (this is the sign-in link email)
  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, role },
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/callback?redirectTo=/dashboard`,
  });

  const alreadyRegistered =
    inviteError &&
    (inviteError.message.toLowerCase().includes("already been registered") ||
     inviteError.message.toLowerCase().includes("already registered") ||
     inviteError.message.toLowerCase().includes("already exists"));

  if (inviteError && !alreadyRegistered) {
    console.error("[invite-user]", inviteError);
    return NextResponse.json({ error: inviteError.message }, { status: 500 });
  }

  // If user already exists, look them up by email and update their role
  if (alreadyRegistered) {
    const { data: existingUsers } = await admin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);
    if (existingUser) {
      await admin.from("profiles").update({ role }).eq("id", existingUser.id);
    }
  }

  // Mark request approved
  await admin.from("access_requests").update({
    status:      "approved",
    reviewed_at: new Date().toISOString(),
    reviewed_by: user.id,
  }).eq("id", requestId);

  // ── Send branded confirmation email to the new user ──────────────────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://valuence-os.vercel.app";
  const roleLabel: Record<string, string> = {
    admin:     "Admin",
    partner:   "Partner",
    principal: "Principal",
    analyst:   "Analyst",
  };

  await sendEmail({
    to: email,
    subject: "✅ You've been granted access to Valuence OS",
    html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; padding: 32px; color: #1e293b;">
  <div style="max-width: 520px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 1px 4px rgba(0,0,0,0.06);">
    <div style="background: #0D3D38; padding: 24px 28px;">
      <p style="margin: 0; font-size: 13px; font-weight: 600; color: #5eead4; letter-spacing: 0.08em; text-transform: uppercase;">Valuence Ventures</p>
      <h1 style="margin: 6px 0 0; font-size: 20px; font-weight: 700; color: white;">Access Approved</h1>
    </div>
    <div style="padding: 28px;">
      <p style="margin: 0 0 16px; font-size: 15px; color: #475569;">
        Hi <strong>${fullName}</strong>,
      </p>
      <p style="margin: 0 0 20px; font-size: 15px; color: #475569;">
        Your access request for <strong>Valuence OS</strong> has been approved. You've been added as a <strong>${roleLabel[role] ?? role}</strong>.
      </p>
      ${alreadyRegistered
        ? `<p style="margin: 0 0 24px; font-size: 14px; color: #64748b;">
            Since you already have an account, you can sign in directly with your existing credentials.
          </p>`
        : `<p style="margin: 0 0 8px; font-size: 14px; color: #64748b;">
            You should receive a separate sign-in link from Supabase. If it hasn't arrived, check your spam folder or contact Andrew.
          </p>
          <p style="margin: 0 0 24px; font-size: 14px; color: #64748b;">
            Once signed in, you'll have access to the fund's CRM, pipeline, portfolio, and AI intelligence tools.
          </p>`
      }
      <a href="${appUrl}/auth/login"
        style="display: inline-block; background: #0D3D38; color: white; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 24px; border-radius: 8px;">
        Sign in to Valuence OS →
      </a>
    </div>
    <div style="padding: 16px 28px; background: #f8fafc; border-top: 1px solid #e2e8f0;">
      <p style="margin: 0; font-size: 12px; color: #94a3b8;">Questions? Reach out to Andrew at andrew@valuence.vc</p>
    </div>
  </div>
</body>
</html>`,
  });

  void inviteData; // suppress unused variable warning
  return NextResponse.json({ ok: true });
}
