// ─── Browser / Client-side Supabase client ───────────────────────────────────
// Use this inside React components marked with "use client"
// It reads the auth cookie automatically and keeps the session alive.

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
