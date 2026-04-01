import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { PortfolioClient } from "@/components/portfolio/portfolio-client";
import type { Company, KpiEntry } from "@/lib/types";

export const metadata = { title: "Portfolio" };

export default async function PortfolioPage() {
  const supabase = await createClient();

  const { data: portfolioCompanies } = await (supabase
    .from("companies")
    .select("*")
    .eq("deal_status", "portfolio")
    .order("name") as unknown as Promise<{ data: Company[] | null; error: unknown }>);

  const ids = portfolioCompanies?.map(c => c.id) ?? [];

  const { data: kpiEntries } = ids.length > 0
    ? await (supabase
        .from("kpi_entries")
        .select("*")
        .in("company_id", ids)
        .order("period_end", { ascending: false }) as unknown as Promise<{ data: KpiEntry[] | null; error: unknown }>)
    : { data: [] as KpiEntry[] };

  // Group latest KPIs by company (first entry per name = most recent due to ordering)
  const latestKpis: Record<string, Record<string, { value: number; unit: string | null }>> = {};
  kpiEntries?.forEach(e => {
    if (!latestKpis[e.company_id]) latestKpis[e.company_id] = {};
    if (!latestKpis[e.company_id][e.name]) {
      latestKpis[e.company_id][e.name] = { value: e.value, unit: e.unit };
    }
  });

  const companies = (portfolioCompanies ?? []).map(c => ({
    ...c,
    latestKpis: latestKpis[c.id] ?? {},
  }));

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Portfolio"
        subtitle={`${companies.length} portfolio companies`}
      />
      <PortfolioClient companies={companies} />
    </div>
  );
}
