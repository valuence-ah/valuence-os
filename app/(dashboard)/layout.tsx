// ─── Dashboard Layout ─────────────────────────────────────────────────────────
// Wraps all protected pages (everything under /dashboard, /crm, etc.)
// Auth check runs server-side; MobileNavContext is provided via client wrapper.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MobileNavProvider } from "@/components/layout/mobile-nav-provider";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <MobileNavProvider>
        {children}
      </MobileNavProvider>
    </div>
  );
}
