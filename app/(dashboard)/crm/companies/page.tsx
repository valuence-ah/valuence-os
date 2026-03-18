// ─── Companies List Page /crm/companies ──────────────────────────────────────
// Filterable, searchable table of all companies (startups, LPs, corporates, etc.)
// "Add Company" button opens a modal form.

import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { CompaniesClient } from "@/components/crm/companies-client";

export const metadata = { title: "Companies" };

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; status?: string; q?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("companies")
    .select("*")
    .order("updated_at", { ascending: false });

  if (params.type)   query = query.eq("type", params.type);
  if (params.status) query = query.eq("deal_status", params.status);

  const { data: companies } = await query;

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Companies"
        subtitle={`${companies?.length ?? 0} total`}
      />
      {/* Pass data to the client component which handles search + add modal */}
      <CompaniesClient initialCompanies={companies ?? []} initialFilter={params.type ?? "all"} />
    </div>
  );
}
