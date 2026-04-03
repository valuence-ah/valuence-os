import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { PortfolioClient } from "@/components/portfolio/portfolio-client";
import type { Company } from "@/lib/types";

export const metadata = { title: "Portfolio" };

export default async function PortfolioPage() {
  const supabase = await createClient();

  // Fetch portfolio companies sorted by runway (shortest first), nulls last
  const { data: portfolioCompanies } = await (supabase
    .from("companies")
    .select("*")
    .eq("deal_status", "portfolio")
    .order("runway_months", { ascending: true, nullsFirst: false }) as unknown as Promise<{ data: Company[] | null }>);

  const companies = portfolioCompanies ?? [];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Portfolio"
        subtitle={`${companies.length} portfolio companies`}
      />
      <PortfolioClient companies={companies} />
    </div>
  );
}
