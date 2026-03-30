// ─── Exa Sourcing Agent API Route ────────────────────────────────────────────
import { NextResponse } from "next/server";
import { runExaSourcingAgent } from "@/lib/agents/exa-sourcing";

export const maxDuration = 60;

export async function POST() {
  try {
    const result = await runExaSourcingAgent();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[/api/agents/exa]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
