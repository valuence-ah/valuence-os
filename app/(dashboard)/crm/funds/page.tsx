// ─── CRM Funds Page /crm/funds ────────────────────────────────────────────────
// Shows all VC funds, family offices, and co-investors tracked in the CRM
// (type = "fund").

import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { CompaniesClient } from "@/components/crm/companies-client";

export const metadata = { title: "Funds" };

export default async function FundsPage() {
  const supabase = await createClient();

  const { data: companies } = await supabase
    .from("companies")
    .select("*")
    .eq("type", "fund")
    .order("updated_at", { ascending: false });

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Funds"
        subtitle={`${companies?.length ?? 0} funds tracked`}
      />
      <CompaniesClient
        initialCompanies={companies ?? []}
        initialFilter="fund"
      />
    </div>
  );
}
