// ─── Dashboard Layout ─────────────────────────────────────────────────────────
// Wraps all protected pages (everything under /dashboard, /crm, etc.)
// Renders the sidebar on the left and a scrollable main content area on the right.
// Server component: checks auth and redirects unauthenticated users.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Fixed sidebar */}
      <Sidebar />

      {/* Main content area — offset by sidebar width */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden" style={{ marginLeft: "var(--sidebar-width, 240px)" }}>
        {children}
      </div>
    </div>
  );
}
