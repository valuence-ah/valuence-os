// GET /api/fireflies/status — connection check for admin panel

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { firefliesGetUser } from "@/lib/fireflies";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.FIREFLIES_API_KEY) {
    return NextResponse.json({ configured: false, message: "FIREFLIES_API_KEY is not set." });
  }

  try {
    const ff = await firefliesGetUser();
    return NextResponse.json({
      configured: true,
      message: `Connected — ${ff.name ?? ff.email} (${ff.num_transcripts ?? 0} transcripts)`,
    });
  } catch (err) {
    return NextResponse.json({
      configured: true,
      error: true,
      message: `API call failed: ${String(err).slice(0, 200)}`,
    });
  }
}
