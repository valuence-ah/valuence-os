// ─── Agent Config Loader ──────────────────────────────────────────────────────
// Loads agent configuration from the agent_configs Supabase table.
// Falls back to hardcoded defaults if the DB row is missing or the table
// hasn't been migrated yet (safe during local dev).

import { createAdminClient } from "@/lib/supabase/admin";

// ── Default configs (mirrors migration seed data) ─────────────────────────────

export interface ExaAgentConfig {
  queries: string[];
  numResults: number;
  maxCharacters: number;
  lookbackDays: number;
  searchType: "neural" | "keyword" | "auto";
  includeDomains: string[];
  excludeDomains: string[];
  minScore: number;
}

export interface ArxivAgentConfig {
  queries: string[];
  maxResults: number;
  sortBy: "submittedDate" | "lastUpdatedDate" | "relevance";
  sortOrder: "ascending" | "descending";
  minScore: number;
}

export interface SbirAgentConfig {
  keywords: string[];
  rowsPerKeyword: number;
  programs: string[];
  yearOffset: number;
  minScore: number;
}

export interface NsfAgentConfig {
  keywords: string[];
  resultsPerPage: number;
  lookbackMonths: number;
  minScore: number;
}

const DEFAULTS = {
  exa: {
    queries: [
      "cleantech startup seed funding 2025 energy storage carbon capture",
      "synthetic biology startup series A investment biotech 2025",
      "advanced materials startup funding graphene nanomaterials 2025",
      "deeptech startup pre-seed seed round cleantech techbio 2025",
      "green hydrogen fuel cell startup investment 2025",
      "biomanufacturing precision fermentation startup funding 2025",
      "climate tech startup seed series A investment 2025",
    ],
    numResults: 8,
    maxCharacters: 800,
    lookbackDays: 90,
    searchType: "neural" as const,
    includeDomains: [],
    excludeDomains: [],
    minScore: 0.45,
  } satisfies ExaAgentConfig,

  arxiv: {
    queries: [
      "cleantech energy storage carbon capture hydrogen fuel cell solar",
      "synthetic biology bioengineering biomanufacturing metabolic engineering",
      "advanced materials graphene perovskite nanomaterials solid-state battery",
    ],
    maxResults: 25,
    sortBy: "submittedDate" as const,
    sortOrder: "descending" as const,
    minScore: 0.45,
  } satisfies ArxivAgentConfig,

  sbir: {
    keywords: ["clean energy", "synthetic biology", "advanced materials", "carbon capture", "battery", "hydrogen"],
    rowsPerKeyword: 15,
    programs: ["SBIR", "STTR"],
    yearOffset: 0,
    minScore: 0.40,
  } satisfies SbirAgentConfig,

  nsf: {
    keywords: ["clean energy", "synthetic biology", "advanced materials", "graphene", "bioprocess engineering"],
    resultsPerPage: 20,
    lookbackMonths: 6,
    minScore: 0.40,
  } satisfies NsfAgentConfig,
};

type AgentName = keyof typeof DEFAULTS;
type AgentConfig<T extends AgentName> = (typeof DEFAULTS)[T];

/** Loads an agent's config from Supabase, falling back to hardcoded defaults. */
export async function loadAgentConfig<T extends AgentName>(
  agentName: T
): Promise<AgentConfig<T>> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("agent_configs")
      .select("config")
      .eq("agent_name", agentName)
      .maybeSingle();

    if (error || !data) return DEFAULTS[agentName];

    // Merge DB config over defaults so missing keys still have a value
    return { ...DEFAULTS[agentName], ...(data.config as Partial<AgentConfig<T>>) };
  } catch {
    return DEFAULTS[agentName];
  }
}
