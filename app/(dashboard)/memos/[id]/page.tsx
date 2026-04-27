// ─── IC Memo Detail Page /memos/[id] ──────────────────────────────────────────
// Full read/edit view of a single IC memo.

import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { notFound } from "next/navigation";
import { MemoDetailClient } from "@/components/memos/memo-detail-client";
import type { IcMemo } from "@/lib/types";

export default async function MemoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: memo } = await (supabase
    .from("ic_memos")
    .select("*, company:companies(id, name, type, sectors, description, website), created_by_profile:profiles!created_by(id, full_name, initials), regenerated_by_profile:profiles!regenerated_by(id, full_name, initials)")
    .eq("id", id)
    .single() as unknown as Promise<{ data: (IcMemo & { company: { id: string; name: string; type: string; sectors: string[] | null; description: string | null; website: string | null } | null; created_by_profile?: { id: string; full_name: string | null; initials: string | null } | null; regenerated_by_profile?: { id: string; full_name: string | null; initials: string | null } | null }) | null; error: unknown }>);

  if (!memo) notFound();

  return (
    <div className="flex flex-col h-full">
      <Header
        title={memo.title}
        subtitle={`${memo.company?.name ?? "—"} · ${memo.status}`}
      />
      <MemoDetailClient memo={memo} />
    </div>
  );
}
