// ─── IC Memo Generation API /api/memos/generate ──────────────────────────────
// Generates a full IC memo using Claude. Called from the pipeline UI.

import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { generateMemo } from "@/lib/memo-generator";

export async function POST(req: NextRequest) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { company_id } = await req.json();
  if (!company_id) return NextResponse.json({ error: "company_id required" }, { status: 400 });

  try {
    const memo = await generateMemo(supabase, company_id, user.id);
    return NextResponse.json({ data: memo });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
