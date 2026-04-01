// ─── Semantic Scholar Sourcing Agent ─────────────────────────────────────────
// Fetches high-citation papers from Semantic Scholar matching Valuence thesis.
// API: https://api.semanticscholar.org

import {
  passesKeywordFilter,
  scoreSignals,
  saveSignals,
  type RawSignal,
} from "@/lib/sourcing-agents";
import { loadAgentConfig, recordAgentRun } from "@/lib/agent-config";

const SS_BASE = "https://api.semanticscholar.org/graph/v1/paper/search";

interface SSPaper {
  paperId?: string;
  title?: string;
  abstract?: string;
  year?: number;
  publicationDate?: string;
  citationCount?: number;
  influentialCitationCount?: number;
  venue?: string;
  fieldsOfStudy?: string[];
  authors?: { name?: string }[];
  openAccessPdf?: { url?: string };
  externalIds?: { DOI?: string; ArXiv?: string };
  url?: string;
}

interface SSResponse {
  data?: SSPaper[];
  total?: number;
}

export async function runSemanticScholarAgent(): Promise<{ fetched: number; saved: number }> {
  const cfg = await loadAgentConfig("semantic_scholar");
  const allSignals = new Map<string, RawSignal>();

  // Lookback date filter
  const lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - cfg.lookbackDays);
  const minYear = lookbackDate.getFullYear();

  for (const query of cfg.queries) {
    try {
      const params = new URLSearchParams({
        query,
        limit: String(Math.min(cfg.maxResults, 50)),
        fields: "paperId,title,abstract,year,publicationDate,citationCount,influentialCitationCount,venue,fieldsOfStudy,authors,openAccessPdf,externalIds,url",
        sort: "citationCount",
      });

      if (cfg.fieldsOfStudy.length > 0) {
        params.set("fieldsOfStudy", cfg.fieldsOfStudy.join(","));
      }

      const headers: Record<string, string> = {
        "User-Agent": "ValuenceOS/1.0 (vc-research-tool)",
        Accept: "application/json",
      };
      if (process.env.SEMANTIC_SCHOLAR_API_KEY) {
        headers["x-api-key"] = process.env.SEMANTIC_SCHOLAR_API_KEY;
      }

      const res = await fetch(`${SS_BASE}?${params.toString()}`, { headers });

      if (!res.ok) {
        console.error(`[SemanticScholar] HTTP ${res.status} for query: ${query}`);
        continue;
      }

      const json = (await res.json()) as SSResponse;
      const papers = json.data ?? [];

      for (const paper of papers) {
        // Filter by year
        if (paper.year && paper.year < minYear) continue;

        // Build URL
        const url =
          paper.openAccessPdf?.url ??
          (paper.externalIds?.ArXiv
            ? `https://arxiv.org/abs/${paper.externalIds.ArXiv}`
            : paper.externalIds?.DOI
            ? `https://doi.org/${paper.externalIds.DOI}`
            : paper.paperId
            ? `https://www.semanticscholar.org/paper/${paper.paperId}`
            : null);

        if (!url || allSignals.has(url)) continue;

        const title = paper.title ?? "Untitled Paper";
        const abstract = paper.abstract ?? "";
        const content = `${title}. ${abstract}`;

        if (!passesKeywordFilter(content)) continue;

        // Flag high-signal: >20 citations or influential
        const isHighSignal =
          (paper.citationCount ?? 0) > 20 || (paper.influentialCitationCount ?? 0) > 5;

        const authors = (paper.authors ?? [])
          .map((a) => a.name)
          .filter((n): n is string => Boolean(n));

        allSignals.set(url, {
          source: "semantic_scholar",
          signal_type: "paper",
          title,
          url,
          content: isHighSignal ? `[HIGH SIGNAL] ${content}` : content,
          authors,
          published_date: paper.publicationDate ?? (paper.year ? `${paper.year}-01-01` : undefined),
        });
      }
    } catch (err) {
      console.error(`[SemanticScholar] Error for query "${query}":`, err);
    }

    // Rate limit: ~1 req/sec on free tier
    await new Promise((r) => setTimeout(r, 1200));
  }

  const signals = Array.from(allSignals.values());
  const fetched = signals.length;
  if (fetched === 0) {
    await recordAgentRun("semantic_scholar", 0);
    return { fetched: 0, saved: 0 };
  }

  const scored = await scoreSignals(signals);
  const saved = await saveSignals(scored, cfg.minScore);
  await recordAgentRun("semantic_scholar", saved);

  return { fetched, saved };
}
