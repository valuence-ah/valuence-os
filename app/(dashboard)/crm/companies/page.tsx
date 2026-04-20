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
      .order("name", { ascending: true })
      .limit(10000) as unknown as Promise<{ data: Company[] | null; error: unknown }>,
    // Fetch active contacts with names so we can show avatar icons per company
    supabase
      .from("contacts")
      .select("company_id, first_name, last_name, is_primary_contact")
      .eq("status", "active")
      .not("company_id", "is", null) as unknown as Promise<{ data: { company_id: string; first_name: string | null; last_name: string | null; is_primary_contact: boolean | null }[] | null; error: unknown }>,
  ]);

  // Build a details map: { [company_id]: [{ first_name, last_name }] }
  // Primary contacts first, then limit to 4 per company
  const contactDetailsMap: Record<string, { first_name: string | null; last_name: string | null }[]> = {};
  for (const c of (allContacts ?? []).sort((a, b) => (b.is_primary_contact ? 1 : 0) - (a.is_primary_contact ? 1 : 0))) {
    if (c.company_id) {
      if (!contactDetailsMap[c.company_id]) contactDetailsMap[c.company_id] = [];
      if (contactDetailsMap[c.company_id].length < 4) {
        contactDetailsMap[c.company_id].push({ first_name: c.first_name, last_name: c.last_name });
      }
    }
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="All Companies" subtitle={`${companies?.length ?? 0} total`} />
      <CompaniesViewClient
        initialCompanies={companies ?? []}
        view="all"
        contactDetailsMap={contactDetailsMap}
      />
    </div>
  );
}
