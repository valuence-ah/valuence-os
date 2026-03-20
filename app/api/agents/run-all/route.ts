// ─── Run All Agents API Route ─────────────────────────────────────────────────
// Runs all 3 sourcing agents in parallel. Used by the daily Vercel Cron.
import { NextResponse } from "next/server";
import { runArxivAgent } from "@/lib/agents/arxiv";
import { runSbirAgent } from "@/lib/agents/sbir";
import { runNsfAgent } from "@/lib/agents/nsf";

export const maxDuration = 120;

interface AgentResult {
  fetched: number;
  saved: number;
  error?: string;
}

export async function POST() {
  const [arxivSettled, sbirSettled, nsfSettled] = await Promise.allSettled([
    runArxivAgent(),
    runSbirAgent(),
    runNsfAgent(),
  ]);

  const arxiv: AgentResult =
    arxivSettled.status === "fulfilled"
      ? arxivSettled.value
      : { fetched: 0, saved: 0, error: String(arxivSettled.reason) };

  const sbir: AgentResult =
    sbirSettled.status === "fulfilled"
      ? sbirSettled.value
      : { fetched: 0, saved: 0, error: String(sbirSettled.reason) };

  const nsf: AgentResult =
    nsfSettled.status === "fulfilled"
      ? nsfSettled.value
      : { fetched: 0, saved: 0, error: String(nsfSettled.reason) };

  return NextResponse.json({
    success: true,
    results: { arxiv, sbir, nsf },
  });
}
