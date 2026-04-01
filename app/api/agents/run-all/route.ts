// ─── Run All Agents API Route ─────────────────────────────────────────────────
// Runs all sourcing agents in parallel. Used by the daily Vercel Cron.
import { NextResponse } from "next/server";
import { runArxivAgent } from "@/lib/agents/arxiv";
import { runSbirAgent } from "@/lib/agents/sbir";
import { runNsfAgent } from "@/lib/agents/nsf";
import { runExaSourcingAgent } from "@/lib/agents/exa-sourcing";
import { runUsptoAgent } from "@/lib/agents/uspto";
import { runSemanticScholarAgent } from "@/lib/agents/semantic-scholar";
import { runNihReporterAgent } from "@/lib/agents/nih-reporter";
import { runNrelAgent } from "@/lib/agents/nrel";

export const maxDuration = 300;

interface AgentResult {
  fetched: number;
  saved: number;
  error?: string;
}

function settle(r: PromiseSettledResult<{ fetched: number; saved: number }>): AgentResult {
  return r.status === "fulfilled"
    ? r.value
    : { fetched: 0, saved: 0, error: String((r as PromiseRejectedResult).reason) };
}

export async function POST() {
  const [arxiv, sbir, nsf, exa, uspto, semanticScholar, nih, nrel] =
    (await Promise.allSettled([
      runArxivAgent(),
      runSbirAgent(),
      runNsfAgent(),
      runExaSourcingAgent(),
      runUsptoAgent(),
      runSemanticScholarAgent(),
      runNihReporterAgent(),
      runNrelAgent(),
    ])).map(settle);

  const totalSaved =
    (arxiv.saved ?? 0) + (sbir.saved ?? 0) + (nsf.saved ?? 0) +
    (exa.saved ?? 0) + (uspto.saved ?? 0) + (semanticScholar.saved ?? 0) +
    (nih.saved ?? 0) + (nrel.saved ?? 0);

  return NextResponse.json({
    success: true,
    totalSaved,
    results: { arxiv, sbir, nsf, exa, uspto, semanticScholar, nih, nrel },
  });
}
