// ─── GET /api/resend/status ──────────────────────────────────────────────────
// Checks whether RESEND_API_KEY is configured and validates it by hitting
// the Resend /emails endpoint with a minimal "dry-run" style check.
// POST /api/resend/status — sends a real test email to the requesting admin.

import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ configured: false, message: "RESEND_API_KEY is not set." });
  }

  // Validate the key by listing domains (lightweight, read-only call)
  try {
    const res  = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.status === 401) {
      return NextResponse.json({ configured: true, valid: false, message: "API key is set but invalid (401 Unauthorized)." });
    }
    if (!res.ok) {
      return NextResponse.json({ configured: true, valid: false, message: `Resend returned HTTP ${res.status}.` });
    }
    return NextResponse.json({ configured: true, valid: true, message: "Connected to Resend — API key is valid." });
  } catch (err) {
    return NextResponse.json({ configured: true, valid: false, message: `Network error: ${err instanceof Error ? err.message : String(err)}` });
  }
}

export async function POST(req: NextRequest) {
  // Auth check — admin only
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role, email, full_name").eq("id", user.id).single();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "RESEND_API_KEY is not set." }, { status: 400 });
  }

  const { to } = await req.json() as { to?: string };
  const recipient = to || profile?.email || user.email;
  if (!recipient) {
    return NextResponse.json({ error: "No recipient email found." }, { status: 400 });
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:    "Valuence OS <onboarding@resend.dev>",
        to:      recipient,
        subject: "✅ Valuence OS — Resend test email",
        html: `
<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; padding: 32px; color: #1e293b;">
  <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0;">
    <div style="background: #0D3D38; padding: 24px 28px;">
      <p style="margin: 0; font-size: 13px; font-weight: 600; color: #5eead4; letter-spacing: 0.08em; text-transform: uppercase;">Valuence OS</p>
      <h1 style="margin: 6px 0 0; font-size: 20px; font-weight: 700; color: white;">Resend is working ✓</h1>
    </div>
    <div style="padding: 28px;">
      <p style="margin: 0 0 16px; font-size: 15px; color: #475569;">
        Hi <strong>${profile?.full_name ?? "Admin"}</strong>,
      </p>
      <p style="font-size: 14px; color: #64748b; margin: 0 0 16px;">
        This is a test email sent from <strong>Valuence OS</strong> to confirm that your Resend integration is correctly configured.
      </p>
      <p style="font-size: 12px; color: #94a3b8; margin: 0;">
        Sent at ${new Date().toUTCString()} · Admin panel → API Keys → Resend
      </p>
    </div>
  </div>
</body>
</html>`,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return NextResponse.json({ error: `Resend error ${res.status}: ${JSON.stringify(body)}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, to: recipient });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Network error." }, { status: 500 });
  }
}
