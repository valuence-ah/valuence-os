// ─── Auth Callback Route ──────────────────────────────────────────────────────
// Supabase sends users here after they click the magic link in their email.
// This exchanges the one-time code for a session, then redirects to the dashboard.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code        = searchParams.get("code");
  const redirectTo  = searchParams.get("redirectTo") ?? "/dashboard";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll()         { return cookieStore.getAll(); },
          setAll(list)     { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); },
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
