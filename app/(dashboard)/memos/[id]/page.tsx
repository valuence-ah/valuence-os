// ─── IC Memo Detail Page /memos/[id] ──────────────────────────────────────────
// Full read/edit view of a single IC memo.

import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { notFound } from "next/navigation";
import { MemoDetailClient } from "@/components/memos/memo-detail-client";

export default async function MemoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: memo } = await supabase
    .from("ic_memos")
    .select("*, company:companies(id, name, type, sectors, description, website)")
    .eq("id", id)
    .single();

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
