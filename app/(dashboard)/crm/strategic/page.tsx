// ─── Companies (Strategic Partners) /crm/strategic ───────────────────────────
// Ecosystem partners and corporates.

import { createAdminClient } from "@/lib/supabase/admin";
import { Header } from "@/components/layout/header";
import { CompaniesViewClient } from "@/components/crm/companies-view-client";
import type { Company } from "@/lib/types";

export const metadata = { title: "Strategic" };

export default async function StrategicPage() {
  const supabase = createAdminClient();

  const { data: companies } = (await supabase
    .from("companies")
    .select("*")
    .contains("types", ["strategic partner"])
    .order("name", { ascending: true })
    .limit(10000)
  ) as unknown as { data: Company[] | null; error: unknown };

  return (
    <div className="flex flex-col h-full">
      <Header title="Strategic" subtitle={`${companies?.length ?? 0} partners`} />
      <CompaniesViewClient initialCompanies={companies ?? []} view="strategic" />
    </div>
  );
}
