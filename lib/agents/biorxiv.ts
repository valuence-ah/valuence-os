// ─── bioRxiv Sourcing Agent ───────────────────────────────────────────────────
// Fetches recent preprints from bioRxiv/medRxiv matching the Valuence thesis.
// Free API, no key required. Relevant for the techbio thesis pillar.

import {
  passesKeywordFilter,
  scoreSignals,
  saveSignals,
  type RawSignal,
} from "@/lib/sourcing-agents";
import { loadAgentConfig } from "@/lib/agent-config";

const BIORXIV_API = "https://api.biorxiv.org/details";

// Thesis-relevant bioRxiv subject categories
const RELEVANT_SUBJECTS = [
  "synthetic biology",
  "bioengineering",
  "biochemistry",
  "microbiology",
  "genomics",
  "bioinformatics",
  "cell biology",
  "molecular biology",
];

interface BiorxivPaper {
  doi: string;
  title: string;
  authors: string;
  author_corresponding: string;
  date: string;
  abstract: string;
  category: string;
  server: string;
}

interface BiorxivResponse {
  collection: BiorxivPaper[];
  messages: { status: string; total: number }[];
}

function getDateRange(lookbackDays = 14): { start: string; end: string } {
  const end = new Date();
  const start = new Date(end.getTime() - lookbackDays * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { start: fmt(start), end: fmt(end) };
}

export async function runBiorxivAgent(): Promise<{ fetched: number; saved: number }> {
  const cfg = await loadAgentConfig("biorxiv");
  const { start, end } = getDateRange(cfg.lookbackDays);
  const allSignals = new Map<string, RawSignal>(); // dedup by DOI URL

  // Build a combined keyword check from both passesKeywordFilter + admin-configured keywords
  const cfgKeywords = cfg.keywords.map(k => k.toLowerCase());

  function matchesThesis(content: string, category: string): boolean {
    const lower = content.toLowerCase();
    if (passesKeywordFilter(content)) return true;
    if (cfgKeywords.some(k => lower.includes(k))) return true;
    if (RELEVANT_SUBJECTS.some(s => category.toLowerCase().includes(s))) return true;
    return false;
  }

  // Fetch from both bioRxiv and medRxiv
  for (const server of ["biorxiv", "medrxiv"]) {
    try {
      const url = `${BIORXIV_API}/${server}/${start}/${end}/0/json`;
      const res = await fetch(url, {
        headers: { "User-Agent": "ValuenceOS/1.0 (vc-research-tool)" },
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        console.error(`[bioRxiv] HTTP ${res.status} for ${server}`);
        continue;
      }

      const data: BiorxivResponse = await res.json();
      const papers = data.collection ?? [];
      console.log(`[bioRxiv] ${server}: ${papers.length} papers from ${start} to ${end}`);

      for (const paper of papers) {
        if (!paper.doi || !paper.title) continue;

        const paperUrl = `https://www.biorxiv.org/content/${paper.doi}`;
        const content = `${paper.title}. ${paper.abstract ?? ""}`;

        if (!matchesThesis(content, paper.category ?? "")) continue;

        if (!allSignals.has(paperUrl)) {
          allSignals.set(paperUrl, {
            source: "other" as const, // biorxiv not in SignalSource enum, map to 'other'
            signal_type: "paper",
            title: paper.title,
            url: paperUrl,
            content: content.slice(0, 2000),
            authors: paper.authors ? paper.authors.split(",").map(a => a.trim()).slice(0, 10) : [],
            published_date: paper.date,
          });
        }
      }
    } catch (err) {
      console.error(`[bioRxiv] Error for ${server}:`, err);
    }
  }

  const signals = Array.from(allSignals.values());
  const fetched = signals.length;
  if (fetched === 0) return { fetched: 0, saved: 0 };

  const scored = await scoreSignals(signals);
  const saved = await saveSignals(scored, cfg.minScore * 10); // convert 0-1 to 0-10 scale

  return { fetched, saved };
}
