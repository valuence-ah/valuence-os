// ─── All Companies /crm/companies ─────────────────────────────────────────────

import { createAdminClient } from "@/lib/supabase/admin";
import { Header } from "@/components/layout/header";
import { CompaniesViewClient } from "@/components/crm/companies-view-client";
import { FindLogosButton } from "@/components/crm/find-logos-button";
import type { Company } from "@/lib/types";

export const metadata = { title: "All Companies" };

export default async function AllCompaniesPage() {
  const supabase = createAdminClient();

  const { data: companies } = (await supabase
    .from("companies")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(10000)
  ) as unknown as { data: Company[] | null; error: unknown };

  return (
    <div className="flex flex-col h-full">
      <Header title="All Companies" subtitle={`${companies?.length ?? 0} total`} actions={<FindLogosButton />} />
      <CompaniesViewClient initialCompanies={companies ?? []} view="all" />
    </div>
  );
}
