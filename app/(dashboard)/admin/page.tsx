// ─── Admin Spreadsheet Page ───────────────────────────────────────────────────
// Server component — fetches initial data and passes to the client grid.
// Only accessible to users with role 'admin' or 'partner'.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminClient } from "@/components/admin/admin-client";
import type { Company, Contact } from "@/lib/types";

export default async function AdminPage() {
  const supabase = await createClient();

  // Check auth
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  // Check role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "partner"].includes(profile.role)) {
    redirect("/dashboard");
  }

  // Fetch companies (all fields, up to 5000)
  const { data: companies } = await supabase
    .from("companies")
    .select("*")
    .order("name", { ascending: true })
    .limit(5000);

  // Fetch contacts with joined company name (up to 10000)
  const { data: contacts } = await supabase
    .from("contacts")
    .select("*, company:companies(name)")
    .order("last_name", { ascending: true })
    .limit(10000);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
      <AdminClient
        initialCompanies={(companies as Company[]) ?? []}
        initialContacts={(contacts as (Contact & { company: { name: string } | null })[]) ?? []}
      />
    </div>
  );
}
