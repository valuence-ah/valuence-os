// ─── Limited Partners /crm/lps ────────────────────────────────────────────────

import { createAdminClient } from "@/lib/supabase/admin";
import { Header } from "@/components/layout/header";
import { LpViewClient } from "@/components/crm/lp-view-client";
import type { Company } from "@/lib/types";

export const dynamic  = "force-dynamic"; // always re-fetch — prevents stale initialCompanies on back-nav
export const metadata = { title: "Limited Partners" };

export default async function LpsPage() {
  const supabase = createAdminClient();

  // Fetch all companies and filter client-side to handle all LP type variants reliably
  const { data: allCompanies } = (await supabase
    .from("companies")
    .select("*")
    .order("name", { ascending: true })
    .limit(5000)
  ) as unknown as { data: Company[] | null; error: unknown };

  const LP_TYPES = new Set(["lp", "limited partner", "limited_partner"]);
  const companies = (allCompanies ?? []).filter(c => {
    const t = (c.type ?? "").toLowerCase().trim();
    if (LP_TYPES.has(t)) return true;
    const ts = c.types ?? [];
    return ts.some((v: string) => LP_TYPES.has((v ?? "").toLowerCase().trim()));
  });

  return (
    <div className="flex flex-col h-full">
      <Header title="Limited Partners" subtitle={`${companies?.length ?? 0} LPs`} />
      <LpViewClient initialCompanies={companies ?? []} />
    </div>
  );
}
