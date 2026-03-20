// ─── NSF Agent API Route ──────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { runNsfAgent } from "@/lib/agents/nsf";

export const maxDuration = 60;

export async function POST() {
  try {
    const result = await runNsfAgent();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[/api/agents/nsf]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
