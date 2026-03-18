// ─── IC Memos /memos ──────────────────────────────────────────────────────────

import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { MemosClient } from "@/components/memos/memos-client";

export const metadata = { title: "IC Memos" };

export default async function MemosPage() {
  const supabase = await createClient();

  const { data: memos } = await supabase
    .from("ic_memos")
    .select("*, company:companies(id, name, type, sectors)")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col h-full">
      <Header title="IC Memos" subtitle="Investment committee memos — AI-generated, human-reviewed" />
      <MemosClient initialMemos={memos ?? []} />
    </div>
  );
}
