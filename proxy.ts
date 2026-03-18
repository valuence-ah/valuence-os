// ─── Proxy (formerly Middleware) ──────────────────────────────────────────────
// Runs on every request BEFORE it hits the page.
// Refreshes the user's Supabase auth session automatically (keeps them logged in).
// Redirects unauthenticated users to /auth/login.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          );
        },
      },
    }
  );

  // Refresh session — must be called before any auth checks
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Allow auth routes and public assets through
  const isAuthRoute = pathname.startsWith("/auth");
  const isApiRoute  = pathname.startsWith("/api");
  const isPublic    = pathname === "/";

  if (!user && !isAuthRoute && !isApiRoute && !isPublic) {
    // Not logged in → redirect to login
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/auth/login";
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && isAuthRoute) {
    // Already logged in → redirect to dashboard
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    return NextResponse.redirect(dashboardUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
