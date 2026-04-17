// ─── Proxy (Next.js 16+ replacement for middleware.ts) ────────────────────────
// Runs on every request BEFORE it hits the page. Responsibilities:
//   1. Refresh the Supabase session (required by @supabase/ssr — without this,
//      sessions expire and users get logged out unexpectedly).
//   2. Redirect unauthenticated users to /auth/login, preserving the original
//      path in ?redirectTo so they land back there after sign-in.
//   3. Redirect already-authenticated users away from /auth/* pages.
//
// Note: layout.tsx also has an auth guard as defense-in-depth.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Paths that don't require authentication
const PUBLIC_PATHS = new Set(["/auth/login", "/auth/callback"]);

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

  // IMPORTANT: always call getUser() — this is what refreshes the session.
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Let auth pages, API routes, and static assets through without a session check
  const isPublic =
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon");

  if (!user && !isPublic) {
    // Not logged in → redirect to login, preserving destination
    const loginUrl = new URL("/auth/login", request.url);
    // Only preserve same-origin relative paths (prevents open redirect)
    if (pathname !== "/" && /^\/[^/\\]/.test(pathname)) {
      loginUrl.searchParams.set("redirectTo", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  if (user && PUBLIC_PATHS.has(pathname)) {
    // Already logged in → skip auth pages, go to dashboard
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Match all paths except Next.js internals and static files
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
