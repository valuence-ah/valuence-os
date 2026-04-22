import { createAdminClient } from "@/lib/supabase/admin";
import { Header } from "@/components/layout/header";
import { StrategicViewClient } from "@/components/crm/strategic-view-client";
import type { Company } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strategic Partners" };

export default async function StrategicPage() {
  const supabase = createAdminClient();
  const { data: all } = (await supabase
    .from("companies")
    .select("*")
    .order("name", { ascending: true })
    .limit(10000)
  ) as unknown as { data: Company[] | null; error: unknown };

  // Strategic = corporate, ecosystem_partner, and legacy "strategic partner"
  const STRATEGIC_TYPES = new Set(["corporate", "ecosystem_partner", "ecosystem", "strategic partner", "strategic_partner", "eco partner", "eco_partner"]);
  const companies = (all ?? []).filter((c: Company) => {
    const t = (c.type ?? "").toLowerCase().trim();
    if (STRATEGIC_TYPES.has(t)) return true;
    const ts = c.types ?? [];
    return ts.some((x: string) => STRATEGIC_TYPES.has((x ?? "").toLowerCase().trim()));
  });

  return (
    <div className="flex flex-col h-full">
      <Header title="Strategic Partners" subtitle={`${companies?.length ?? 0} partners`} />
      <StrategicViewClient initialCompanies={companies ?? []} />
    </div>
  );
}
