// ─── Reddit Sourcing Agent API Route ─────────────────────────────────────────
import { NextResponse } from "next/server";
import { runRedditAgent } from "@/lib/agents/reddit";

export const maxDuration = 60;

export async function POST() {
  try {
    const result = await runRedditAgent();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[/api/agents/reddit]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
