// ─── Funds /crm/funds ─────────────────────────────────────────────────────────

import { createAdminClient } from "@/lib/supabase/admin";
import { Header } from "@/components/layout/header";
import { FundsViewClient } from "@/components/crm/funds-view-client";
import type { Company } from "@/lib/types";

export const metadata = { title: "Funds" };

export default async function FundsPage() {
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
    return t.includes("investor") || ts.some((x: string) => x.includes("investor"));
  });

  return (
    <div className="flex flex-col h-full">
      <Header title="Funds" subtitle={`${companies?.length ?? 0} funds`} />
      <FundsViewClient initialCompanies={companies ?? []} />
    </div>
  );
}
