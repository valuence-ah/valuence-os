// ─── Sourcing Intelligence /sourcing ─────────────────────────────────────────
// Lists all signals from arXiv, SBIR, NSF, USPTO, Crunchbase, news, etc.
// Signals are auto-ingested by background jobs (built in later phases).

import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { SourcingClient } from "@/components/sourcing/sourcing-client";

export const metadata = { title: "Sourcing" };

export default async function SourcingPage() {
  const supabase = await createClient();

  const { data: signals } = await supabase
    .from("sourcing_signals")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="flex flex-col h-full">
      <Header title="Sourcing Intelligence" subtitle="Signals from arXiv, SBIR, NSF, USPTO, news & more" />
      <SourcingClient initialSignals={signals ?? []} />
    </div>
  );
}
