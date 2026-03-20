// ─── arXiv Sourcing Agent ─────────────────────────────────────────────────────
// Fetches recent papers from arXiv matching the Valuence thesis.
// Parses Atom XML with regex (no external parser dependency).

import {
  passesKeywordFilter,
  scoreSignals,
  saveSignals,
  type RawSignal,
} from "@/lib/sourcing-agents";

const ARXIV_BASE = "https://export.arxiv.org/api/query";

const QUERIES = [
  "cleantech energy storage carbon capture hydrogen fuel cell solar",
  "synthetic biology bioengineering biomanufacturing metabolic engineering",
  "advanced materials graphene perovskite nanomaterials solid-state battery",
];

function extractTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = re.exec(block);
  return m ? m[1].trim() : "";
}

function extractAttr(block: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, "i");
  const m = re.exec(block);
  return m ? m[1].trim() : "";
}

function parseEntries(xml: string): RawSignal[] {
  const entryRe = /<entry>([\s\S]*?)<\/entry>/gi;
  const signals: RawSignal[] = [];
  let match: RegExpExecArray | null;

  while ((match = entryRe.exec(xml)) !== null) {
    const block = match[1];

    const idRaw = extractTag(block, "id");
    const url = idRaw.replace("http://", "https://");
    if (!url) continue;

    const title = extractTag(block, "title").replace(/\s+/g, " ");
    const summary = extractTag(block, "summary").replace(/\s+/g, " ");
    const published = extractTag(block, "published");

    // Extract all author names
    const authorRe = /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi;
    const authors: string[] = [];
    let authorMatch: RegExpExecArray | null;
    while ((authorMatch = authorRe.exec(block)) !== null) {
      authors.push(authorMatch[1].trim());
    }

    // Extract primary category
    const category = extractAttr(block, "arxiv:primary_category", "term") ||
      extractAttr(block, "category", "term");

    const content = `${title}. ${summary}`;

    signals.push({
      source: "arxiv",
      signal_type: "paper",
      title,
      url,
      content,
      authors,
      published_date: published ? published.slice(0, 10) : undefined,
    });

    // suppress unused variable warning
    void category;
  }

  return signals;
}

/** Fetches arXiv papers matching the Valuence thesis and saves relevant ones. */
export async function runArxivAgent(): Promise<{ fetched: number; saved: number }> {
  const allSignals = new Map<string, RawSignal>(); // deduplicate by URL

  for (const query of QUERIES) {
    try {
      const params = new URLSearchParams({
        search_query: `all:${query}`,
        max_results: "25",
        sortBy: "submittedDate",
        sortOrder: "descending",
      });

      const res = await fetch(`${ARXIV_BASE}?${params.toString()}`, {
        headers: { "User-Agent": "ValuenceOS/1.0 (vc-research-tool)" },
      });

      if (!res.ok) {
        console.error(`[arXiv] HTTP ${res.status} for query: ${query}`);
        continue;
      }

      const xml = await res.text();
      const entries = parseEntries(xml);

      for (const entry of entries) {
        if (!allSignals.has(entry.url) && passesKeywordFilter(entry.content)) {
          allSignals.set(entry.url, entry);
        }
      }
    } catch (err) {
      console.error(`[arXiv] Error for query "${query}":`, err);
    }

    // 1 second delay between queries to respect rate limits
    await new Promise((r) => setTimeout(r, 1000));
  }

  const signals = Array.from(allSignals.values());
  const fetched = signals.length;
  if (fetched === 0) return { fetched: 0, saved: 0 };

  const scored = await scoreSignals(signals);
  const saved = await saveSignals(scored, 0.45);

  return { fetched, saved };
}
