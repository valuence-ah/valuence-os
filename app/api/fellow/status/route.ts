import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspace = process.env.FELLOW_WORKSPACE;
  const apiKey    = process.env.FELLOW_API_KEY;

  if (!workspace) {
    return NextResponse.json({ configured: false, message: "FELLOW_WORKSPACE is not set." });
  }
  if (!apiKey) {
    return NextResponse.json({ configured: false, message: "FELLOW_API_KEY is not set." });
  }

  // Lightweight check: GET /me — confirms workspace + key are valid
  try {
    const res = await fetch(`https://${workspace}.fellow.app/api/v1/me`, {
      headers: { "X-API-KEY": apiKey, Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json({
        configured: true,
        error: true,
        message: `API returned ${res.status}: ${text.slice(0, 200)}`,
      });
    }

    const data = await res.json() as { user?: { full_name?: string; email?: string }; workspace?: { name?: string } };
    const name = data.workspace?.name ?? workspace;
    const who  = data.user?.full_name ?? data.user?.email ?? "";
    return NextResponse.json({
      configured: true,
      message: `Connected — ${name}${who ? ` (${who})` : ""}`,
    });
  } catch (err) {
    return NextResponse.json({
      configured: true,
      error: true,
      message: `Request failed: ${String(err)}`,
    });
  }
}
