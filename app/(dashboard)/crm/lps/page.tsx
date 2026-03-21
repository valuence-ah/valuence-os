// ─── Limited Partners /crm/lps ────────────────────────────────────────────────

import { createAdminClient } from "@/lib/supabase/admin";
import { Header } from "@/components/layout/header";
import { LpViewClient } from "@/components/crm/lp-view-client";
import type { Company } from "@/lib/types";

export const metadata = { title: "Limited Partners" };

export default async function LpsPage() {
  const supabase = createAdminClient();

  const { data: companies } = (await supabase
    .from("companies")
    .select("*")
    .contains("types", ["limited partner"])
    .order("name", { ascending: true })
    .limit(10000)
  ) as unknown as { data: Company[] | null; error: unknown };

  return (
    <div className="flex flex-col h-full">
      <Header title="Limited Partners" subtitle={`${companies?.length ?? 0} LPs`} />
      <LpViewClient initialCompanies={companies ?? []} />
    </div>
  );
}
