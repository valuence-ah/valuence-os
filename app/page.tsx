// ─── Root page "/" ────────────────────────────────────────────────────────────
// Immediately redirects to /dashboard (for logged-in users) or /auth/login.
// The middleware handles the actual auth check; this is just a fallback redirect.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  } else {
    redirect("/auth/login");
  }
}
