// ─── Memo Print Page — /print/memos/[id] ──────────────────────────────────────
// Standalone, no sidebar/nav. All sections pre-expanded. Auto-triggers print.
// Open in new tab from the memo detail page via "Export PDF" button.

import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { IcMemo } from "@/lib/types";
import { MemoPrintClient } from "@/components/memos/memo-print-client";

export default async function MemoPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: memo } = await (supabase
    .from("ic_memos")
    .select("*, company:companies(id, name, type, sectors, description, website)")
    .eq("id", id)
    .single() as unknown as Promise<{
    data: (IcMemo & {
      company: {
        id: string;
        name: string;
        type: string;
        sectors: string[] | null;
        description: string | null;
        website: string | null;
      } | null;
    }) | null;
    error: unknown;
  }>);

  if (!memo) notFound();

  return <MemoPrintClient memo={memo} />;
}
