// ─── Meetings Page /(dashboard)/meetings ─────────────────────────────────────
// Shows all ingested Fireflies meetings + uploaded transcripts.
// Backend: interactions WHERE type = 'meeting', ordered by date desc.

import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { MeetingsClient } from "@/components/meetings/meetings-client";
import type { Interaction, Company } from "@/lib/types";

type MeetingRow = Interaction & { company: Pick<Company, "id" | "name"> | null };

export default async function MeetingsPage() {
  const supabase = await createClient();

  const { data: meetings } = await supabase
    .from("interactions")
    .select("*, company:companies(id, name)")
    .eq("type", "meeting")
    .order("date", { ascending: false })
    .limit(200) as unknown as { data: MeetingRow[] | null };

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Meetings"
        subtitle="Fireflies transcripts and uploaded meeting notes"
      />
      <MeetingsClient meetings={meetings ?? []} />
    </div>
  );
}
