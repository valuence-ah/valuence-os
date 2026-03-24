import { createAdminClient } from "@/lib/supabase/admin";
import { Header } from "@/components/layout/header";
import { StrategicViewClient } from "@/components/crm/strategic-view-client";
import type { Company } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strategic Partners" };

export default async function StrategicPage() {
  const supabase = createAdminClient();
  const { data: companies } = (await supabase
    .from("companies")
    .select("*")
    .contains("types", ["strategic partner"])
    .order("name", { ascending: true })
    .limit(10000)
  ) as unknown as { data: Company[] | null; error: unknown };

  return (
    <div className="flex flex-col h-full">
      <Header title="Strategic Partners" subtitle={`${companies?.length ?? 0} partners`} />
      <StrategicViewClient initialCompanies={companies ?? []} />
    </div>
  );
}
