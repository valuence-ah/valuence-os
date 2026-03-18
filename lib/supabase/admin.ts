// ─── Supabase Admin Client ────────────────────────────────────────────────────
// Uses the service role key to bypass Row Level Security.
// ONLY use this in server-side API routes (webhooks, server actions).
// NEVER expose this client to the browser.

import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Validate the shared webhook secret sent by Make.com in the x-webhook-secret header */
export function validateWebhookSecret(req: Request): boolean {
  const incoming = req.headers.get("x-webhook-secret") ??
    new URL(req.url).searchParams.get("secret");
  const expected = process.env.WEBHOOK_SECRET;
  if (!expected) return false; // secret not configured → reject all
  return incoming === expected;
}
