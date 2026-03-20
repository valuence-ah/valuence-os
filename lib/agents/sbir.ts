// ─── SBIR Sourcing Agent ──────────────────────────────────────────────────────
// Fetches SBIR/STTR grant awards matching the Valuence thesis.

import {
  passesKeywordFilter,
  scoreSignals,
  saveSignals,
  type RawSignal,
} from "@/lib/sourcing-agents";

const SBIR_BASE = "https://api.sbir.gov/public/api/awards";

const KEYWORDS = [
  "clean energy",
  "synthetic biology",
  "advanced materials",
  "carbon capture",
  "battery",
  "hydrogen",
];

interface SbirAward {
  companyName?: string;
  firm?: string;
  projectTitle?: string;
  title?: string;
  abstract?: string;
  awardId?: string | number;
  award_id?: string | number;
  id?: string | number;
  piFirstName?: string;
  piLastName?: string;
  startDate?: string;
  date?: string;
}

function buildAwardUrl(award: SbirAward): string {
  const id = award.awardId ?? award.award_id ?? award.id;
  if (id) return `https://www.sbir.gov/node/${id}`;
  return "";
}

function buildTitle(award: SbirAward): string {
  const company = award.companyName ?? award.firm ?? "";
  const project = award.projectTitle ?? award.title ?? "";
  if (company && project) return `${company}: ${project}`;
  return project || company || "Untitled SBIR Award";
}

function buildAuthors(award: SbirAward): string[] {
  const first = award.piFirstName ?? "";
  const last = award.piLastName ?? "";
  const name = `${first} ${last}`.trim();
  return name ? [name] : [];
}

/** Fetches SBIR awards matching Valuence keywords and saves relevant ones. */
export async function runSbirAgent(): Promise<{ fetched: number; saved: number }> {
  const currentYear = new Date().getFullYear();
  const allSignals = new Map<string, RawSignal>(); // deduplicate by URL

  for (const keyword of KEYWORDS) {
    try {
      const params = new URLSearchParams({
        keyword,
        rows: "15",
        year: String(currentYear),
      });

      const res = await fetch(`${SBIR_BASE}?${params.toString()}`, {
        headers: {
          "User-Agent": "ValuenceOS/1.0 (vc-research-tool)",
          Accept: "application/json",
        },
      });

      if (!res.ok) {
        console.error(`[SBIR] HTTP ${res.status} for keyword: ${keyword}`);
        continue;
      }

      const json: unknown = await res.json();

      // Handle different response shapes
      let awards: SbirAward[] = [];
      if (Array.isArray(json)) {
        awards = json as SbirAward[];
      } else if (json && typeof json === "object") {
        const obj = json as Record<string, unknown>;
        if (Array.isArray(obj.data)) {
          awards = obj.data as SbirAward[];
        } else if (Array.isArray(obj.awards)) {
          awards = obj.awards as SbirAward[];
        } else if (Array.isArray(obj.results)) {
          awards = obj.results as SbirAward[];
        }
      }

      for (const award of awards) {
        const url = buildAwardUrl(award);
        if (!url || allSignals.has(url)) continue;

        const title = buildTitle(award);
        const abstract = award.abstract ?? "";
        const content = `${title}. ${abstract}`;

        if (!passesKeywordFilter(content)) continue;

        allSignals.set(url, {
          source: "sbir",
          signal_type: "grant",
          title,
          url,
          content,
          authors: buildAuthors(award),
          published_date: award.startDate ?? award.date ?? undefined,
        });
      }
    } catch (err) {
      console.error(`[SBIR] Error for keyword "${keyword}":`, err);
    }
  }

  const signals = Array.from(allSignals.values());
  const fetched = signals.length;
  if (fetched === 0) return { fetched: 0, saved: 0 };

  const scored = await scoreSignals(signals);
  const saved = await saveSignals(scored, 0.4);

  return { fetched, saved };
}
