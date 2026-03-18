// ─── Portfolio Monitoring /portfolio ──────────────────────────────────────────

import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";
import { BarChart3, TrendingUp, TrendingDown } from "lucide-react";

export const metadata = { title: "Portfolio" };

export default async function PortfolioPage() {
  const supabase = await createClient();

  const { data: portfolioCompanies } = await supabase
    .from("companies")
    .select("*")
    .eq("deal_status", "portfolio")
    .order("name");

  // Get latest KPIs for portfolio companies
  const { data: kpiEntries } = await supabase
    .from("kpi_entries")
    .select("*")
    .in("company_id", portfolioCompanies?.map(c => c.id) ?? [])
    .order("period_end", { ascending: false });

  // Group latest KPIs by company
  const latestKpis: Record<string, Record<string, { value: number; unit: string | null }>> = {};
  kpiEntries?.forEach(e => {
    if (!latestKpis[e.company_id]) latestKpis[e.company_id] = {};
    if (!latestKpis[e.company_id][e.name]) {
      latestKpis[e.company_id][e.name] = { value: e.value, unit: e.unit };
    }
  });

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Portfolio"
        subtitle={`${portfolioCompanies?.length ?? 0} active portfolio companies`}
      />
      <main className="flex-1 overflow-auto p-6 space-y-4">

        {portfolioCompanies?.length === 0 ? (
          <div className="card p-12 text-center">
            <BarChart3 className="mx-auto text-slate-300 mb-3" size={40} />
            <p className="text-slate-500 font-medium">No portfolio companies yet</p>
            <p className="text-slate-400 text-sm mt-1">Mark companies as "Portfolio" in CRM to track them here.</p>
            <Link href="/crm/companies" className="mt-4 inline-block px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500">
              Go to CRM →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {portfolioCompanies?.map(company => {
              const kpis = latestKpis[company.id] ?? {};
              return (
                <Link
                  key={company.id}
                  href={`/crm/companies/${company.id}`}
                  className="card p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">{company.name}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">{company.sectors?.slice(0,2).join(", ") ?? "—"}</p>
                    </div>
                    <span className="badge bg-green-100 text-green-700">Portfolio</span>
                  </div>

                  {/* Key metrics */}
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-100">
                    {[
                      { label: "MRR",     key: "Monthly Recurring Revenue" },
                      { label: "Burn",    key: "Burn Rate" },
                      { label: "Runway",  key: "Runway" },
                    ].map(({ label, key }) => (
                      <div key={key}>
                        <p className="text-xs text-slate-400">{label}</p>
                        <p className="text-sm font-semibold text-slate-800">
                          {kpis[key]
                            ? `${kpis[key].unit === "$" ? "$" : ""}${kpis[key].value.toLocaleString()}${kpis[key].unit !== "$" ? ` ${kpis[key].unit ?? ""}` : ""}`
                            : "—"}
                        </p>
                      </div>
                    ))}
                  </div>

                  {company.last_contact_date && (
                    <p className="text-xs text-slate-400 mt-3">Last contact: {formatDate(company.last_contact_date)}</p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
