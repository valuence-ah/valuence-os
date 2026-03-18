// ─── LP Tracker /lp ───────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { LpClient } from "@/components/lp/lp-client";

export const metadata = { title: "LP Tracker" };

export default async function LpPage() {
  const supabase = await createClient();

  const { data: relationships } = await supabase
    .from("lp_relationships")
    .select("*, company:companies(id, name, aum, lp_type, location_country), contact:contacts(id, first_name, last_name, email)")
    .order("updated_at", { ascending: false });

  // LP companies list for adding new
  const { data: lpCompanies } = await supabase
    .from("companies")
    .select("id, name, aum, lp_type")
    .eq("type", "lp")
    .order("name");

  return (
    <div className="flex flex-col h-full">
      <Header title="LP Tracker" subtitle="Fundraising pipeline and LP relationship management" />
      <LpClient initialRelationships={relationships ?? []} lpCompanies={lpCompanies ?? []} />
    </div>
  );
}
