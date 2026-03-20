// ─── NSF Sourcing Agent ───────────────────────────────────────────────────────
// Fetches NSF grants matching the Valuence thesis.

import {
  passesKeywordFilter,
  scoreSignals,
  saveSignals,
  type RawSignal,
} from "@/lib/sourcing-agents";

const NSF_BASE = "https://api.nsf.gov/services/v1/awards.json";

const KEYWORDS = [
  "clean energy",
  "synthetic biology",
  "advanced materials",
  "graphene",
  "bioprocess engineering",
];

interface NsfAward {
  title?: string;
  abstractText?: string;
  id?: string;
  pdPIName?: string;
  startDate?: string;
  expDate?: string;
}

interface NsfResponse {
  response?: {
    award?: NsfAward[];
  };
}

function formatDateStart(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/** Fetches NSF awards matching Valuence keywords and saves relevant ones. */
export async function runNsfAgent(): Promise<{ fetched: number; saved: number }> {
  const allSignals = new Map<string, RawSignal>(); // deduplicate by URL
  const dateStart = formatDateStart();

  for (const keyword of KEYWORDS) {
    try {
      const params = new URLSearchParams({
        keyword,
        rpp: "20",
        offset: "1",
        dateStart,
        printFields: "id,title,abstractText,pdPIName,startDate",
      });

      const res = await fetch(`${NSF_BASE}?${params.toString()}`, {
        headers: {
          "User-Agent": "ValuenceOS/1.0 (vc-research-tool)",
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        console.error(`[NSF] HTTP ${res.status} for keyword: ${keyword}`);
        continue;
      }

      const json = (await res.json()) as NsfResponse;
      const awards: NsfAward[] = json?.response?.award ?? [];

      for (const award of awards) {
        const id = award.id;
        if (!id) continue;

        const url = `https://www.nsf.gov/awardsearch/showAward?AWD_ID=${id}`;
        if (allSignals.has(url)) continue;

        const title = award.title ?? "Untitled NSF Award";
        const abstract = award.abstractText ?? "";
        const content = `${title}. ${abstract}`;

        if (!passesKeywordFilter(content)) continue;

        const authors: string[] = award.pdPIName ? [award.pdPIName] : [];

        allSignals.set(url, {
          source: "nsf",
          signal_type: "grant",
          title,
          url,
          content,
          authors,
          published_date: award.startDate ?? undefined,
        });
      }
    } catch (err) {
      console.error(`[NSF] Error for keyword "${keyword}":`, err);
    }
  }

  const signals = Array.from(allSignals.values());
  const fetched = signals.length;
  if (fetched === 0) return { fetched: 0, saved: 0 };

  const scored = await scoreSignals(signals);
  const saved = await saveSignals(scored, 0.4);

  return { fetched, saved };
}
