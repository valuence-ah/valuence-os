// ─── NIH Reporter Sourcing Agent ─────────────────────────────────────────────
// Fetches NIH grant awards matching Valuence thesis.
// API: https://api.reporter.nih.gov/

import {
  passesKeywordFilter,
  scoreSignals,
  saveSignals,
  type RawSignal,
} from "@/lib/sourcing-agents";
import { loadAgentConfig, recordAgentRun } from "@/lib/agent-config";

const NIH_BASE = "https://api.reporter.nih.gov/v2/projects/search";

interface NihProject {
  project_num?: string;
  project_title?: string;
  abstract_text?: string;
  phr_text?: string;
  org_name?: string;
  contact_pi_name?: string;
  fiscal_year?: number;
  award_amount?: number;
  project_start_date?: string;
  agency_ic_fundings?: { fy?: number; total_cost?: number; ic_name?: string }[];
}

interface NihResponse {
  results?: NihProject[];
  meta?: { total?: number };
}

export async function runNihReporterAgent(): Promise<{ fetched: number; saved: number }> {
  const cfg = await loadAgentConfig("nih_reporter");
  const allSignals = new Map<string, RawSignal>();

  for (const term of cfg.searchTerms) {
    try {
      const body = {
        criteria: {
          advanced_text_search: {
            operator: "and",
            search_field: "all",
            search_text: term,
          },
          fiscal_years: cfg.fiscalYears,
          award_amount_low: cfg.minFundingAmt,
          org_countries: ["UNITED STATES"],
        },
        include_fields: [
          "ProjectNum", "ProjectTitle", "AbstractText", "PhrText", "OrgName",
          "ContactPiName", "FiscalYear", "AwardAmount", "ProjectStartDate",
        ],
        offset: 0,
        limit: Math.min(cfg.maxResults, 50),
        sort_field: "award_amount",
        sort_order: "desc",
      };

      const res = await fetch(NIH_BASE, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "ValuenceOS/1.0 (vc-research-tool)",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        console.error(`[NIH] HTTP ${res.status} for term: ${term}`);
        continue;
      }

      const json = (await res.json()) as NihResponse;
      const projects = json.results ?? [];

      for (const project of projects) {
        const id = project.project_num;
        if (!id) continue;

        const url = `https://reporter.nih.gov/project-details/${encodeURIComponent(id)}`;
        if (allSignals.has(url)) continue;

        const title = project.project_title ?? "Untitled NIH Grant";
        const abstract = project.abstract_text ?? project.phr_text ?? "";
        const content = `${title}. ${abstract}`;

        if (!passesKeywordFilter(content)) continue;

        const org = project.org_name ?? null;
        const pi = project.contact_pi_name ?? null;

        allSignals.set(url, {
          source: "nih",
          signal_type: "grant",
          title: org ? `${org}: ${title}` : title,
          url,
          content,
          authors: pi ? [pi] : [],
          published_date: project.project_start_date ?? undefined,
          company_name: org ?? undefined,
        });
      }
    } catch (err) {
      console.error(`[NIH] Error for term "${term}":`, err);
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  const signals = Array.from(allSignals.values());
  const fetched = signals.length;
  if (fetched === 0) {
    await recordAgentRun("nih_reporter", 0);
    return { fetched: 0, saved: 0 };
  }

  const scored = await scoreSignals(signals);
  const saved = await saveSignals(scored, cfg.minScore);
  await recordAgentRun("nih_reporter", saved);

  return { fetched, saved };
}
