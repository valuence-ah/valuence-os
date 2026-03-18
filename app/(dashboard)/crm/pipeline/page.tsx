// ─── CRM Pipeline Page /crm/pipeline ─────────────────────────────────────────
// Split-pane view: company list on the left, full detail on the right.

import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { PipelineClient } from "@/components/crm/pipeline-client";

export const metadata = { title: "Pipeline" };

export default async function CrmPipelinePage() {
  const supabase = await createClient();

  // Fetch all startups, ordered by most recently updated
  const { data: companies } = await supabase
    .from("companies")
    .select("*")
    .eq("type", "startup")
    .order("updated_at", { ascending: false });

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Pipeline"
        subtitle={`${companies?.length ?? 0} startups monitored`}
      />
      {/* PipelineClient takes over the full remaining height */}
      <PipelineClient initialCompanies={companies ?? []} />
    </div>
  );
}
