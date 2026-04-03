// ─── Funds /crm/funds ─────────────────────────────────────────────────────────

import { createAdminClient } from "@/lib/supabase/admin";
import { Header } from "@/components/layout/header";
import { FundsViewClient } from "@/components/crm/funds-view-client";
import type { Company } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Funds" };

export default async function FundsPage() {
  const supabase = createAdminClient();

  // Filter at DB level: match type = "investor"/"fund" OR types array contains those values
  const { data: companies } = (await supabase
    .from("companies")
    .select("*")
    .or('type.ilike.%investor%,type.ilike.%fund%,types.cs.{investor},types.cs.{fund}')
    .order("name", { ascending: true })
    .limit(1000)
  ) as unknown as { data: Company[] | null; error: unknown };

  return (
    <div className="flex flex-col h-full">
      <Header title="Funds" subtitle={`${companies?.length ?? 0} co-investors and funds tracked`} />
      <FundsViewClient initialCompanies={companies ?? []} />
    </div>
  );
}
