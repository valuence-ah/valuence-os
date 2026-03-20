// ─── arXiv Agent API Route ────────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { runArxivAgent } from "@/lib/agents/arxiv";

export const maxDuration = 60;

export async function POST() {
  try {
    const result = await runArxivAgent();
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[/api/agents/arxiv]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
