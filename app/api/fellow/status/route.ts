import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fellowListMeetings } from "@/lib/fellow";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.FELLOW_API_KEY) {
    return NextResponse.json({ configured: false, message: "FELLOW_API_KEY is not set." });
  }

  // Try a lightweight call — fetch just 1 meeting to verify the key works
  try {
    await fellowListMeetings(1);
    return NextResponse.json({ configured: true, message: "Connected to Fellow API." });
  } catch (err) {
    return NextResponse.json({
      configured: true,
      error: true,
      message: `Key is set but API call failed: ${String(err)}`,
    });
  }
}
