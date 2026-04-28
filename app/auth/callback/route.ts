// ─── Auth Callback Route ──────────────────────────────────────────────────────
// Handles three Supabase email flows:
//   1. Admin invite   → sets approved = true (admin_invited flag in metadata)
//   2. Magic link     → approved = false until admin approves
//   3. Password reset → redirects to /auth/reset-password
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

  // Sanitize redirectTo: only accept same-origin relative paths.
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
          setAll(list: { name: string; value: string; options?: object }[]) {
            list.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2])
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      try {
        const { data: { user: authedUser } } = await supabase.auth.getUser();
        if (authedUser) {
          const { data: existingProfile } = await supabase
            .from("profiles")
            .select("id, approved")
            .eq("id", authedUser.id)
            .maybeSingle();

          if (!existingProfile) {
            // New profile — only pre-approve if the admin explicitly invited this user
            const adminInvited = authedUser.user_metadata?.admin_invited === true;
            await supabase.from("profiles").insert({
              id:          authedUser.id,
              email:       authedUser.email!,
              full_name:   authedUser.user_metadata?.full_name ?? null,
              role:        authedUser.user_metadata?.role ?? "analyst",
              approved:    adminInvited,
              approved_at: adminInvited ? new Date().toISOString() : null,
            });
          }
          // If profile exists (pre-created by invite-user API), leave it as-is.
        }
      } catch (profileErr) {
        console.error("[callback] profile upsert:", profileErr);
      }

      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`);
}
