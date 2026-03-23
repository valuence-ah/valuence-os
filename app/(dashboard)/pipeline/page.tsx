// ─── Pipeline Page /pipeline ──────────────────────────────────────────────────
// Kanban-style deal pipeline view with drag-free stage columns.

import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { PipelineClient } from "@/components/pipeline/pipeline-client";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage() {
  const supabase = await createClient();

  const { data: deals } = await supabase
    .from("deals")
    .select("*, company:companies(id, name, sectors, stage, deal_status, location_city)")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col h-full">
      <Header title="Pipeline" subtitle="Deal flow from sourced to closed"  />
      <PipelineClient initialDeals={deals ?? []} />
    </div>
  );
}
