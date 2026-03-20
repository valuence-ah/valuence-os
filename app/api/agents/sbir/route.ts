// ─── SBIR Agent API Route ─────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { runSbirAgent } from "@/lib/agents/sbir";

export const maxDuration = 60;

export async function POST() {
  try {
    const result = await runSbirAgent();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[/api/agents/sbir]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
