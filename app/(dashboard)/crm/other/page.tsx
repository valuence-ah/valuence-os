// ─── Other /crm/other ─────────────────────────────────────────────────────────
// Government bodies and other organisations.

import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { CompaniesViewClient } from "@/components/crm/companies-view-client";
import type { Company } from "@/lib/types";

export const metadata = { title: "Other" };

export default async function OtherPage() {
  const supabase = await createClient();

  const { data: companies } = (await supabase
    .from("companies")
    .select("*")
    .in("type", ["government", "other"])
    .order("name", { ascending: true })
  ) as unknown as { data: Company[] | null; error: unknown };

  return (
    <div className="flex flex-col h-full">
      <Header title="Other" subtitle={`${companies?.length ?? 0} companies`} />
      <CompaniesViewClient initialCompanies={companies ?? []} view="other" />
    </div>
  );
}
