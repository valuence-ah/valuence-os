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

export interface UsptoAgentConfig {
  cpcCodes: string[];
  maxResults: number;
  lookbackDays: number;
  minScore: number;
}

export interface SemanticScholarAgentConfig {
  queries: string[];
  fieldsOfStudy: string[];
  maxResults: number;
  minCitations: number;
  lookbackDays: number;
  minScore: number;
}

export interface NihReporterAgentConfig {
  searchTerms: string[];
  agencies: string[];
  fiscalYears: number[];
  minFundingAmt: number;
  maxResults: number;
  minScore: number;
}

export interface NrelAgentConfig {
  topics: string[];
  maxResults: number;
  lookbackDays: number;
  apiKey: string;
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
    keywords: ["clean energy", "synthetic biology", "advanced materials", "carbon capture", "battery", "hydrogen", "biomanufacturing", "precision fermentation"],
    rowsPerKeyword: 15,
    programs: ["SBIR", "STTR"],
    yearOffset: 0,
    minScore: 0.40,
  } satisfies SbirAgentConfig,

  nsf: {
    keywords: ["clean energy", "synthetic biology", "advanced materials", "graphene", "bioprocess engineering", "carbon capture", "biomanufacturing"],
    resultsPerPage: 20,
    lookbackMonths: 6,
    minScore: 0.40,
  } satisfies NsfAgentConfig,

  uspto: {
    cpcCodes: ["C12", "A61K", "A61P", "C12Q", "C12N", "C12P", "C02F", "Y02", "H01M", "H02J", "B82", "C08J"],
    maxResults: 50,
    lookbackDays: 30,
    minScore: 0.35,
  } satisfies UsptoAgentConfig,

  semantic_scholar: {
    queries: [
      "synthetic biology biomanufacturing",
      "cleantech energy storage carbon capture",
      "advanced materials nanotechnology",
      "precision fermentation techbio",
      "green chemistry biomaterials",
    ],
    fieldsOfStudy: ["Biology", "Chemistry", "Materials Science", "Environmental Science", "Engineering"],
    maxResults: 20,
    minCitations: 0,
    lookbackDays: 90,
    minScore: 0.35,
  } satisfies SemanticScholarAgentConfig,

  nih_reporter: {
    searchTerms: ["synthetic biology", "biomanufacturing", "precision fermentation", "carbon capture", "advanced materials", "green chemistry"],
    agencies: ["NIEHS", "NIGMS", "NCI", "NIAID", "NIDDK"],
    fiscalYears: [2024, 2025],
    minFundingAmt: 100000,
    maxResults: 50,
    minScore: 0.35,
  } satisfies NihReporterAgentConfig,

  nrel: {
    topics: ["solar", "wind", "energy storage", "hydrogen", "bioenergy", "carbon capture"],
    maxResults: 30,
    lookbackDays: 60,
    apiKey: process.env.NREL_API_KEY ?? "",
    minScore: 0.35,
  } satisfies NrelAgentConfig,
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

/** Records the last run time and saved count for an agent. */
export async function recordAgentRun(agentName: string, saved: number): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase
      .from("agent_configs")
      .update({ last_run_at: new Date().toISOString(), last_run_saved: saved })
      .eq("agent_name", agentName);
  } catch {
    // non-critical
  }
}
