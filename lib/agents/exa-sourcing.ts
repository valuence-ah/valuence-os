// ─── Exa Proactive Sourcing Agent ────────────────────────────────────────────
// Searches Exa.ai for deeptech startup news, funding rounds, and company signals.
// Unlike the per-company exa-research endpoint, this scans broadly for new
// companies and signals matching the Valuence thesis.

import {
  passesKeywordFilter,
  scoreSignals,
  saveSignals,
  type RawSignal,
} from "@/lib/sourcing-agents";
import { loadAgentConfig } from "@/lib/agent-config";

const EXA_API = "https://api.exa.ai/search";

interface ExaResult {
  id?: string;
  url?: string;
  title?: string;
  text?: string;
  score?: number;
  publishedDate?: string;
  author?: string;
}

interface ExaResponse {
  results?: ExaResult[];
}

/** Runs Exa thematic searches and saves relevant signals to Supabase. */
export async function runExaSourcingAgent(): Promise<{ fetched: number; saved: number }> {
  const EXA_API_KEY = process.env.EXA_API_KEY;
  if (!EXA_API_KEY) {
    console.warn("[exa-sourcing] EXA_API_KEY not set — skipping");
    return { fetched: 0, saved: 0 };
  }

  const cfg = await loadAgentConfig("exa");
  const seen = new Map<string, RawSignal>(); // deduplicate by URL

  const startDate = new Date(Date.now() - cfg.lookbackDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  for (const query of cfg.queries) {
    try {
      const body: Record<string, unknown> = {
        query,
        numResults: cfg.numResults,
        contents: { text: { maxCharacters: cfg.maxCharacters } },
        startPublishedDate: startDate,
        type: cfg.searchType,
      };
      if (cfg.includeDomains.length) body.includeDomains = cfg.includeDomains;
      if (cfg.excludeDomains.length) body.excludeDomains = cfg.excludeDomains;

      const res = await fetch(EXA_API, {
        method: "POST",
        headers: {
          "x-api-key": EXA_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        console.error(`[exa-sourcing] HTTP ${res.status} for query: "${query}"`);
        continue;
      }

      const data = (await res.json()) as ExaResponse;
      const results = data.results ?? [];

      for (const r of results) {
        if (!r.url || seen.has(r.url)) continue;

        const content = [r.title ?? "", r.text ?? ""].join(". ");
        if (!passesKeywordFilter(content)) continue;

        seen.set(r.url, {
          source: "exa",
          signal_type: "news",
          title: r.title ?? r.url,
          url: r.url,
          content: content.slice(0, 5000),
          authors: r.author ? [r.author] : [],
          published_date: r.publishedDate ? r.publishedDate.slice(0, 10) : undefined,
        });
      }
    } catch (err) {
      console.error(`[exa-sourcing] Error for query "${query}":`, err);
    }

    // Small delay between requests
    await new Promise((r) => setTimeout(r, 500));
  }

  const signals = Array.from(seen.values());
  const fetched = signals.length;
  if (fetched === 0) return { fetched: 0, saved: 0 };

  const scored = await scoreSignals(signals);
  const saved = await saveSignals(scored, cfg.minScore);

  return { fetched, saved };
}
