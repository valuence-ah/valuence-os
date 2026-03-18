// ─── CRM Limited Partners Page /crm/lps ──────────────────────────────────────
// Shows all LP organisations tracked in the CRM (type = "lp").

import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { CompaniesClient } from "@/components/crm/companies-client";

export const metadata = { title: "Limited Partners" };

export default async function LpsPage() {
  const supabase = await createClient();

  const { data: companies } = await supabase
    .from("companies")
    .select("*")
    .eq("type", "lp")
    .order("updated_at", { ascending: false });

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Limited Partners"
        subtitle={`${companies?.length ?? 0} LPs tracked`}
      />
      <CompaniesClient
        initialCompanies={companies ?? []}
        initialFilter="lp"
      />
    </div>
  );
}
