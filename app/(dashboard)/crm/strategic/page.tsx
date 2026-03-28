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

  // Match both singular `type` field AND `types` array (same logic as admin filter)
  const companies = (all ?? []).filter((c: Company) => {
    const t = (c.type ?? "").toLowerCase();
    const ts = ((c.types as string[] | null) ?? []).map((x: string) => x.toLowerCase());
    return t.includes("strategic partner") || ts.some((x: string) => x.includes("strategic partner"));
  });

  return (
    <div className="flex flex-col h-full">
      <Header title="Strategic Partners" subtitle={`${companies?.length ?? 0} partners`} />
      <StrategicViewClient initialCompanies={companies ?? []} />
    </div>
  );
}
