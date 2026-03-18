// ─── Browser / Client-side Supabase client ───────────────────────────────────
// Use this inside React components marked with "use client"
// It reads the auth cookie automatically and keeps the session alive.

import { createBrowserClient } from "@supabase/ssr";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createClient(): ReturnType<typeof createBrowserClient<any>> {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
