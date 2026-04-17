// ─── All Companies /crm/companies ─────────────────────────────────────────────

import { createAdminClient } from "@/lib/supabase/admin";
import { Header } from "@/components/layout/header";
import { CompaniesViewClient } from "@/components/crm/companies-view-client";
import type { Company } from "@/lib/types";

export const metadata = { title: "All Companies" };

export default async function AllCompaniesPage() {
  const supabase = createAdminClient();

  const [{ data: companies }, { data: allContacts }] = await Promise.all([
    supabase
      .from("companies")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(10000) as unknown as Promise<{ data: Company[] | null; error: unknown }>,
    // Fetch all active contacts so we can compute per-company counts client-side
    supabase
      .from("contacts")
      .select("company_id")
      .eq("status", "active")
      .not("company_id", "is", null) as unknown as Promise<{ data: { company_id: string }[] | null; error: unknown }>,
  ]);

  // Build a count map: { [company_id]: number }
  const contactCountMap: Record<string, number> = {};
  for (const c of allContacts ?? []) {
    if (c.company_id) {
      contactCountMap[c.company_id] = (contactCountMap[c.company_id] ?? 0) + 1;
    }
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="All Companies" subtitle={`${companies?.length ?? 0} total`} />
      <CompaniesViewClient
        initialCompanies={companies ?? []}
        view="all"
        contactCountMap={contactCountMap}
      />
    </div>
  );
}
