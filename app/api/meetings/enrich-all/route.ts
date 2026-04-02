// POST /api/meetings/enrich-all
// Runs the 4-signal enrichment pipeline on all unresolved / partial meetings.
// Called from the "Re-run Auto-Tagging" button in the Admin → Fellow panel.

import { NextResponse }               from "next/server";
import { createClient }               from "@/lib/supabase/server";
import { createAdminClient }          from "@/lib/supabase/admin";
import { enrichAllUnresolvedMeetings } from "@/lib/meeting-enrichment";

export const maxDuration = 120;

export async function POST() {
  const supabaseUser = await createClient();
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();

  const stats = await enrichAllUnresolvedMeetings(supabase);

  return NextResponse.json({ success: true, ...stats });
}
