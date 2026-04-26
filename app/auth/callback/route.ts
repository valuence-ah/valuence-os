// ─── Auth Callback Route ──────────────────────────────────────────────────────
// Handles three Supabase email flows:
//   1. Magic link sign-in  → redirects to /dashboard (or ?redirectTo)
//   2. Password reset       → redirects to /auth/reset-password
//   3. Email confirmation   → redirects to /dashboard
//
// The `redirectTo` query param is sanitised to same-origin relative paths only
// to prevent open-redirect attacks.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const type = searchParams.get("type"); // "recovery" for password-reset emails

  // Sanitize redirectTo: only accept same-origin relative paths (e.g. /crm/pipeline).
  // Reject absolute URLs, protocol-relative URLs (//evil.com), and empty strings
  // to prevent open redirect attacks.
  const rawRedirect = searchParams.get("redirectTo") ?? "";
  const redirectTo =
    rawRedirect && /^\/[^/\\]/.test(rawRedirect) ? rawRedirect :
    type === "recovery" ? "/auth/reset-password" :
    "/dashboard";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll()         { return cookieStore.getAll(); },
          setAll(list: { name: string; value: string; options?: object }[]) { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2])); },
        },
      }
    );
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  }

  // Something went wrong — send back to login with error
  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
}
