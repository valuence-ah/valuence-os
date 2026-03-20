// ─── Ecosystem /crm/ecosystem ─────────────────────────────────────────────────
// Government bodies and other ecosystem organisations.

import { createAdminClient } from "@/lib/supabase/admin";
import { Header } from "@/components/layout/header";
import { CompaniesViewClient } from "@/components/crm/companies-view-client";
import type { Company } from "@/lib/types";

export const metadata = { title: "Ecosystem" };

export default async function EcosystemPage() {
  const supabase = createAdminClient();

  const { data: companies } = (await supabase
    .from("companies")
    .select("*")
    .contains("types", ["other"])
    .order("name", { ascending: true })
    .limit(10000)
  ) as unknown as { data: Company[] | null; error: unknown };

  return (
    <div className="flex flex-col h-full">
      <Header title="Ecosystem" subtitle={`${companies?.length ?? 0} organisations`} />
      <CompaniesViewClient initialCompanies={companies ?? []} view="other" />
    </div>
  );
}
