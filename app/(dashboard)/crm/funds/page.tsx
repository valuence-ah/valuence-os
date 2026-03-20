// ─── Funds /crm/funds ─────────────────────────────────────────────────────────

import { createAdminClient } from "@/lib/supabase/admin";
import { Header } from "@/components/layout/header";
import { CompaniesViewClient } from "@/components/crm/companies-view-client";
import type { Company } from "@/lib/types";

export const metadata = { title: "Funds" };

export default async function FundsPage() {
  const supabase = createAdminClient();

  const { data: companies } = (await supabase
    .from("companies")
    .select("*")
    .eq("type", "fund")
    .order("name", { ascending: true })
    .limit(10000)
  ) as unknown as { data: Company[] | null; error: unknown };

  return (
    <div className="flex flex-col h-full">
      <Header title="Funds" subtitle={`${companies?.length ?? 0} funds`} />
      <CompaniesViewClient initialCompanies={companies ?? []} view="funds" />
    </div>
  );
}
