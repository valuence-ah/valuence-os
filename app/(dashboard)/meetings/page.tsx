// ─── Meetings Page /(dashboard)/meetings ─────────────────────────────────────
export const metadata = { title: "Meetings" };

import { createAdminClient } from "@/lib/supabase/admin";
import { Header } from "@/components/layout/header";
import { MeetingsClient } from "@/components/meetings/meetings-client";
import type { Interaction, Company, Profile } from "@/lib/types";

type MeetingRow = Interaction & { company: Pick<Company, "id" | "name" | "type"> | null; host_profile?: Pick<Profile, "id" | "full_name" | "initials"> | null };

export default async function MeetingsPage() {
  const supabase = createAdminClient();

  const [{ data: meetings }, { data: archivedMeetings }, { data: companies }, { data: teamMembers }] = await Promise.all([
    supabase
      .from("interactions")
      .select("*, company:companies(id, name, type), host_profile:profiles!host_user_id(id, full_name, initials)")
      .eq("type", "meeting")
      .eq("archived", false)
      .order("date", { ascending: false })
      .limit(300) as unknown as Promise<{ data: MeetingRow[] | null }>,

    supabase
      .from("interactions")
      .select("*, company:companies(id, name, type), host_profile:profiles!host_user_id(id, full_name, initials)")
      .eq("type", "meeting")
      .eq("archived", true)
      .order("date", { ascending: false })
      .limit(100) as unknown as Promise<{ data: MeetingRow[] | null }>,

    supabase
      .from("companies")
      .select("id, name, type")
      .order("name") as unknown as Promise<{ data: Pick<Company, "id" | "name" | "type">[] | null }>,

    supabase
      .from("profiles")
      .select("id, full_name, email, initials")
      .order("full_name") as unknown as Promise<{ data: Pick<Profile, "id" | "full_name" | "initials"> & { email: string }[] | null }>,
  ]);

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Meetings"
        subtitle="Fireflies-synced meetings with CRM intelligence"
      />
      <MeetingsClient
        meetings={meetings ?? []}
        archivedMeetings={archivedMeetings ?? []}
        companies={companies ?? []}
        teamMembers={(teamMembers ?? []) as { id: string; full_name: string | null; email: string; initials: string | null }[]}
      />
    </div>
  );
}
