// ─── Middleware ────────────────────────────────────────────────────────────────
// Runs on every request BEFORE it hits the page. Responsibilities:
//   1. Refresh the Supabase session (required by @supabase/ssr — without this,
//      sessions expire and users get logged out unexpectedly).
//   2. Redirect unauthenticated users to /auth/login for protected routes.
//   3. Redirect already-authenticated users away from /auth/login only
//      (request-access, pending, reset-password are always accessible).

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Auth routes accessible to EVERYONE (logged in or not)
const OPEN_AUTH_PATHS = new Set([
  "/auth/login",
  "/auth/callback",
  "/auth/request-access",
  "/auth/pending",
  "/auth/reset-password",
]);

// Auth routes to redirect AWAY from if already logged in
const LOGIN_ONLY_PATHS = new Set([
  "/auth/login",
  "/auth/callback",
]);

export async function middleware(request: NextRequest) {
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
            supabaseResponse.cookies.set(
              name,
              value,
              options as Parameters<typeof supabaseResponse.cookies.set>[2]
            )
          );
        },
      },
    }
  );

  // IMPORTANT: always call getUser() — this refreshes the session cookie.
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Always let through: API routes, Next.js internals, static assets
  const isSystem =
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/manifest") ||
    pathname.startsWith("/sw.js");

  if (isSystem) return supabaseResponse;

  // Open auth paths — accessible to everyone
  if (OPEN_AUTH_PATHS.has(pathname)) {
    // If already logged in and hitting the login page, redirect to dashboard
    if (user && LOGIN_ONLY_PATHS.has(pathname)) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return supabaseResponse;
  }

  // Root "/" — let the root page.tsx handle the redirect logic
  if (pathname === "/") return supabaseResponse;

  // Everything else requires authentication
  if (!user) {
    const loginUrl = new URL("/auth/login", request.url);
    if (/^\/[^/\\]/.test(pathname)) {
      loginUrl.searchParams.set("redirectTo", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Match all paths except Next.js internals and static files
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
