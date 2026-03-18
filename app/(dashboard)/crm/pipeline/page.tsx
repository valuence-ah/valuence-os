// ─── Pipeline /crm/pipeline ───────────────────────────────────────────────────
// Startups tracked in the deal pipeline, with filters, sorting, and column customization.

import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { CompaniesViewClient } from "@/components/crm/companies-view-client";
import type { Company } from "@/lib/types";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage() {
  const supabase = await createClient();

  const { data: companies } = await (supabase
    .from("companies")
    .select("*")
    .eq("type", "startup")
    .order("updated_at", { ascending: false })
    as unknown as Promise<{ data: Company[] | null; error: unknown }>);

  return (
    <div className="flex flex-col h-full">
      <Header title="Pipeline" subtitle={`${companies?.length ?? 0} startups`} />
      <CompaniesViewClient initialCompanies={companies ?? []} view="pipeline" />
    </div>
  );
}
