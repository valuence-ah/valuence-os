// ─── Limited Partners /crm/lps ────────────────────────────────────────────────

import { createAdminClient } from "@/lib/supabase/admin";
import { Header } from "@/components/layout/header";
import { LpViewClient } from "@/components/crm/lp-view-client";
import type { Company } from "@/lib/types";

export const dynamic  = "force-dynamic"; // always re-fetch — prevents stale initialCompanies on back-nav
export const metadata = { title: "Limited Partners" };

export default async function LpsPage() {
  const supabase = createAdminClient();

  const { data: all } = (await supabase
    .from("companies")
    .select("*")
    .order("name", { ascending: true })
    .limit(10000)
  ) as unknown as { data: Company[] | null; error: unknown };

  // Match both singular `type` field AND `types` array (same logic as admin filter)
  const companies = (all ?? []).filter((c: Company) => {
    const t = (c.type ?? "").toLowerCase();
    const ts = ((c.types as string[] | null) ?? []).map((x: string) => x.toLowerCase());
    return t.includes("limited partner") || ts.some((x: string) => x.includes("limited partner"));
  });

  return (
    <div className="flex flex-col h-full">
      <Header title="Limited Partners" subtitle={`${companies?.length ?? 0} LPs`} />
      <LpViewClient initialCompanies={companies ?? []} />
    </div>
  );
}
