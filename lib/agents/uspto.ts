// ─── USPTO PatentsView Sourcing Agent ────────────────────────────────────────
// Fetches recent patents from the USPTO PatentsView API matching Valuence thesis.
// API docs: https://search.patentsview.org/docs/

import {
  passesKeywordFilter,
  scoreSignals,
  saveSignals,
  type RawSignal,
} from "@/lib/sourcing-agents";
import { loadAgentConfig, recordAgentRun } from "@/lib/agent-config";

const PATENTS_API = "https://search.patentsview.org/api/v1/patent/";
const API_KEY = process.env.USPTO_API_KEY ?? "tnixdbdxmoonqvlznlwwsfvhvqsscs";

interface PatentRecord {
  patent_id?: string;
  patent_title?: string;
  patent_abstract?: string;
  patent_date?: string;
  inventors?: { inventor_name_first?: string; inventor_name_last?: string }[];
  assignees?: { assignee_organization?: string }[];
  cpcs?: { cpc_subgroup_id?: string }[];
}

interface PatentsResponse {
  patents?: PatentRecord[];
  total_patent_count?: number;
}

export async function runUsptoAgent(): Promise<{ fetched: number; saved: number }> {
  const cfg = await loadAgentConfig("uspto");
  const allSignals = new Map<string, RawSignal>();

  // Calculate lookback date
  const lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - cfg.lookbackDays);
  const dateStr = lookbackDate.toISOString().slice(0, 10);

  // Query each CPC code group
  const cpcGroups = cfg.cpcCodes.slice(0, 6); // limit to 6 to avoid too many API calls
  for (const cpcCode of cpcGroups) {
    try {
      const body = {
        q: {
          _and: [
            { _gte: { patent_date: dateStr } },
            { _begins: { cpc_subgroup_id: cpcCode } },
          ],
        },
        f: ["patent_id", "patent_title", "patent_abstract", "patent_date", "inventors", "assignees", "cpcs"],
        o: { size: Math.min(cfg.maxResults, 25), sort: [{ patent_date: "desc" }] },
      };

      const res = await fetch(PATENTS_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": API_KEY,
          "User-Agent": "ValuenceOS/1.0 (vc-research-tool)",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        console.error(`[USPTO] HTTP ${res.status} for CPC: ${cpcCode}`);
        continue;
      }

      const json = (await res.json()) as PatentsResponse;
      const patents = json.patents ?? [];

      for (const patent of patents) {
        const id = patent.patent_id;
        if (!id) continue;

        const url = `https://patents.google.com/patent/US${id}`;
        if (allSignals.has(url)) continue;

        const title = patent.patent_title ?? "Untitled Patent";
        const abstract = patent.patent_abstract ?? "";
        const content = `${title}. ${abstract}`;

        if (!passesKeywordFilter(content)) continue;

        const assignee = patent.assignees?.[0]?.assignee_organization ?? null;
        const inventors = (patent.inventors ?? [])
          .map((inv) => `${inv.inventor_name_first ?? ""} ${inv.inventor_name_last ?? ""}`.trim())
          .filter(Boolean);

        allSignals.set(url, {
          source: "uspto",
          signal_type: "patent",
          title,
          url,
          content,
          authors: inventors,
          published_date: patent.patent_date ?? undefined,
          company_name: assignee ?? undefined,
        });
      }
    } catch (err) {
      console.error(`[USPTO] Error for CPC "${cpcCode}":`, err);
    }

    // Rate limit
    await new Promise((r) => setTimeout(r, 500));
  }

  const signals = Array.from(allSignals.values());
  const fetched = signals.length;
  if (fetched === 0) {
    await recordAgentRun("uspto", 0);
    return { fetched: 0, saved: 0 };
  }

  const scored = await scoreSignals(signals);
  const saved = await saveSignals(scored, cfg.minScore);
  await recordAgentRun("uspto", saved);

  return { fetched, saved };
}
