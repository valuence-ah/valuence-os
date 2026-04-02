// ─── Meetings Page /(dashboard)/meetings ─────────────────────────────────────
// Shows all Fellow-synced meetings and uploaded transcripts.

import { createAdminClient } from "@/lib/supabase/admin";
import { Header } from "@/components/layout/header";
import { MeetingsClient } from "@/components/meetings/meetings-client";
import type { Interaction, Company } from "@/lib/types";

type MeetingRow = Interaction & { company: Pick<Company, "id" | "name" | "type"> | null };

export default async function MeetingsPage() {
  const supabase = createAdminClient();

  const { data: meetings } = await supabase
    .from("interactions")
    .select("*, company:companies(id, name, type)")
    .eq("type", "meeting")
    .order("date", { ascending: false })
    .limit(300) as unknown as { data: MeetingRow[] | null };

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Meetings"
        subtitle="Fellow-synced meetings with CRM intelligence"
      />
      <MeetingsClient meetings={meetings ?? []} />
    </div>
  );
}
