// ─── NREL Sourcing Agent ──────────────────────────────────────────────────────
// Fetches energy research publications from NREL (National Renewable Energy Lab).
// Uses NREL's Publications API and OpenEI data where available.
// API Key: https://developer.nrel.gov/

import {
  passesKeywordFilter,
  scoreSignals,
  saveSignals,
  type RawSignal,
} from "@/lib/sourcing-agents";
import { loadAgentConfig, recordAgentRun } from "@/lib/agent-config";

const NREL_PUBS_BASE = "https://www.nrel.gov/research/publications-search-api.html";
const NREL_SEARCH_BASE = "https://developer.nrel.gov/api/alt-fuel-stations/v1.json"; // placeholder, actual NREL pub search

interface NrelPublication {
  id?: string | number;
  title?: string;
  abstract?: string;
  authors?: string[];
  publication_date?: string;
  journal?: string;
  doi?: string;
  url?: string;
  topics?: string[];
}

export async function runNrelAgent(): Promise<{ fetched: number; saved: number }> {
  const cfg = await loadAgentConfig("nrel");
  const allSignals = new Map<string, RawSignal>();

  const apiKey = cfg.apiKey || process.env.NREL_API_KEY || "1erotAHGd96ZGbY8Miu4oCjVyhtmATzkejMgGri2";

  // Calculate lookback date
  const lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - cfg.lookbackDays);
  const minDateStr = lookbackDate.toISOString().slice(0, 10);

  for (const topic of cfg.topics) {
    try {
      // NREL Publications API endpoint
      const params = new URLSearchParams({
        api_key: apiKey,
        keyword: topic,
        limit: String(Math.min(cfg.maxResults, 25)),
        sort: "date",
        order: "desc",
        start_date: minDateStr,
      });

      const res = await fetch(`https://developer.nrel.gov/api/publications/v1.json?${params.toString()}`, {
        headers: {
          Accept: "application/json",
          "User-Agent": "ValuenceOS/1.0 (vc-research-tool)",
        },
      });

      if (!res.ok) {
        // NREL publications API may not be publicly accessible; skip gracefully
        console.warn(`[NREL] HTTP ${res.status} for topic: ${topic} — skipping`);
        continue;
      }

      const json = await res.json() as { outputs?: NrelPublication[]; results?: NrelPublication[] };
      const pubs: NrelPublication[] = json.outputs ?? json.results ?? [];

      for (const pub of pubs) {
        const id = String(pub.id ?? "");
        if (!id) continue;

        const url =
          pub.url ??
          (pub.doi ? `https://doi.org/${pub.doi}` : null) ??
          `https://www.nrel.gov/research/publications.html?q=${encodeURIComponent(pub.title ?? "")}`;

        if (allSignals.has(url)) continue;

        const title = pub.title ?? "Untitled NREL Publication";
        const abstract = pub.abstract ?? "";
        const content = `${title}. ${abstract}`;

        if (!passesKeywordFilter(content)) continue;

        allSignals.set(url, {
          source: "nrel",
          signal_type: "paper",
          title,
          url,
          content,
          authors: pub.authors ?? [],
          published_date: pub.publication_date ?? undefined,
          geography: "North America",
          technology_category: "Cleantech",
        });
      }
    } catch (err) {
      console.warn(`[NREL] Error for topic "${topic}":`, err);
    }

    await new Promise((r) => setTimeout(r, 300));
  }

  const signals = Array.from(allSignals.values());
  const fetched = signals.length;
  if (fetched === 0) {
    await recordAgentRun("nrel", 0);
    return { fetched: 0, saved: 0 };
  }

  const scored = await scoreSignals(signals);
  const saved = await saveSignals(scored, cfg.minScore);
  await recordAgentRun("nrel", saved);

  return { fetched, saved };
}
