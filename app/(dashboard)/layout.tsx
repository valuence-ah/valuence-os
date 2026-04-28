// ─── Dashboard Layout ─────────────────────────────────────────────────────────
// Wraps all protected pages (everything under /dashboard, /crm, etc.)
// Two-step auth check runs server-side:
//   1. Must be authenticated (has a Supabase session)
//   2. Profile must be approved by an admin
// Unapproved users are redirected to /auth/pending instead of the dashboard.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MobileNavProvider } from "@/components/layout/mobile-nav-provider";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Step 1 — must be signed in
  if (!user) {
    redirect("/auth/login");
  }

  // Step 2 — profile must exist and be approved
  const { data: profile } = await supabase
    .from("profiles")
    .select("approved")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.approved) {
    redirect("/auth/pending");
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <MobileNavProvider>
        {children}
      </MobileNavProvider>
    </div>
  );
}
