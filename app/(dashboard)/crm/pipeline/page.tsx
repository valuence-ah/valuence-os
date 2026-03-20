// ─── Pipeline /crm/pipeline ───────────────────────────────────────────────────
// Split-pane view: left = scrollable startup list, right = full company detail.
// Includes the Valuence AI floating chat widget for pipeline intelligence.

import { createAdminClient } from "@/lib/supabase/admin";
import { Header } from "@/components/layout/header";
import { PipelineClient } from "@/components/crm/pipeline-client";
import { PipelineChatWidget } from "@/components/crm/pipeline-chat-widget";
import { FindLogosButton } from "@/components/crm/find-logos-button";
import type { Company } from "@/lib/types";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage() {
  const supabase = createAdminClient();

  const { data: companies } = (await supabase
    .from("companies")
    .select("*")
    .contains("types", ["startup"])
    .order("updated_at", { ascending: false })
    .limit(10000)
  ) as unknown as { data: Company[] | null; error: unknown };

  return (
    <div className="flex flex-col h-full">
      <Header title="Pipeline" subtitle={`${companies?.length ?? 0} startups`} actions={<FindLogosButton />} />
      <PipelineClient initialCompanies={companies ?? []} />
      {/* Floating Valuence AI chat — position: fixed, renders above page content */}
      <PipelineChatWidget />
    </div>
  );
}
