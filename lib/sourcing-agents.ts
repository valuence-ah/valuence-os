// ─── Sourcing Agents — Shared Utilities ──────────────────────────────────────
// Keyword filtering, deterministic scoring, and Supabase deduplication.
// Scoring is DETERMINISTIC: same input always produces same score.
// Claude is used only for generating human-readable summaries.

import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAiConfig } from "@/lib/ai-config";
import type { SignalSource } from "@/lib/types";

// ── Thesis keywords for Valuence Ventures ────────────────────────────────────

export const THESIS_KEYWORDS: string[] = [
  // Cleantech
  "clean energy", "renewable energy", "solar", "wind energy", "energy storage",
  "battery technology", "grid storage", "carbon capture", "carbon sequestration",
  "net zero", "decarbonization", "electrification", "hydrogen", "fuel cell",
  "green hydrogen", "offshore wind", "geothermal", "nuclear fusion",
  "direct air capture", "carbon removal", "sustainable aviation fuel",
  "circular economy", "waste to energy", "water treatment", "desalination",
  // Techbio
  "synthetic biology", "bioengineering", "biomanufacturing", "metabolic engineering",
  "gene editing", "CRISPR", "protein engineering", "cell-free", "fermentation",
  "industrial biotech", "bioprocess engineering", "biofoundry", "biocatalysis",
  "microbiome", "precision fermentation", "bio-based materials", "enzyme engineering",
  "single-cell sequencing", "techbio", "green chemistry",
  // Advanced materials
  "advanced materials", "graphene", "carbon nanotubes", "nanomaterials",
  "perovskite", "solid-state electrolyte", "solid-state battery",
  "metamaterials", "2D materials", "semiconductor", "photovoltaic",
  "biomaterials", "composite materials", "functional coatings",
  "additive manufacturing", "3D printing", "high-entropy alloy",
  // Energy transition / AI
  "energy transition", "factory automation", "AI drug discovery", "gene sequencing", "quantum",
  "nanotechnology",
];

/** Returns true if the text contains at least one thesis keyword (case-insensitive). */
export function passesKeywordFilter(text: string): boolean {
  const lower = text.toLowerCase();
  return THESIS_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

// ── Geography inference ───────────────────────────────────────────────────────

const GEO_PATTERNS: { geo: string; patterns: string[] }[] = [
  { geo: "North America", patterns: ["united states", "u.s.", " usa ", "u.s.a", "american", "canada", "canadian", "north america"] },
  { geo: "Singapore", patterns: ["singapore", "nus ", "ntu ", "a*star", "a-star", "biopolis"] },
  { geo: "Korea", patterns: ["korea", "korean", "seoul", "kaist", "postech", "snu "] },
  { geo: "Japan", patterns: ["japan", "japanese", "tokyo", "osaka", "kyoto", "riken", "nims"] },
];

export function inferGeography(text: string): string | null {
  const lower = text.toLowerCase();
  for (const { geo, patterns } of GEO_PATTERNS) {
    if (patterns.some(p => lower.includes(p))) return geo;
  }
  return null;
}

// ── Technology category inference ─────────────────────────────────────────────

const TECH_PATTERNS: { category: string; patterns: string[] }[] = [
  { category: "Synthetic Bio", patterns: ["synthetic biology", "synbio", "biomanufacturing", "metabolic engineering", "enzyme", "fermentation", "crispr", "gene editing", "biofoundry", "biocatalysis", "cell-free", "techbio", "microbiome", "protein engineering"] },
  { category: "Cleantech", patterns: ["cleantech", "clean energy", "carbon capture", "carbon removal", "hydrogen", "fuel cell", "solar", "wind energy", "energy storage", "battery", "electrification", "decarbonization", "net zero", "green hydrogen", "energy transition"] },
  { category: "Advanced Materials", patterns: ["advanced materials", "graphene", "nanomaterial", "perovskite", "solid-state", "metamaterial", "2d material", "biomaterial", "composite material", "high-entropy alloy", "nanotechnology"] },
  { category: "Factory Automation", patterns: ["factory automation", "industrial automation", "robotics", "manufacturing automation", "smart factory", "industry 4.0"] },
  { category: "AI / Compute", patterns: ["ai drug discovery", "machine learning", "deep learning", "neural network", "artificial intelligence", "quantum computing", "drug discovery ai"] },
  { category: "Quantum", patterns: ["quantum", "qubit", "quantum computing", "quantum sensing"] },
  { category: "Green Chemistry", patterns: ["green chemistry", "bio-based", "bio-derived", "bioplastic", "circular economy", "biodegradable"] },
];

export function inferTechCategory(text: string): string | null {
  const lower = text.toLowerCase();
  for (const { category, patterns } of TECH_PATTERNS) {
    if (patterns.some(p => lower.includes(p))) return category;
  }
  return null;
}

// ── Company name extraction ───────────────────────────────────────────────────

export function extractCompanyName(title: string, content: string): string | null {
  // Pattern: "CompanyName: Project Title" (SBIR style)
  const colonSplit = title.match(/^([^:]{3,50}):\s+/);
  if (colonSplit) return colonSplit[1].trim();
  void content;
  return null;
}

// ── Funding stage detection (deterministic, no AI) ───────────────────────────

export function detectFundingStage(title: string, description: string): string | null {
  const text = `${title} ${description}`.toLowerCase();
  if (text.includes("series a") || text.includes("series-a")) return "series_a";
  if (text.includes("series b") || text.includes("series-b")) return "series_b";
  if (text.includes("series c") || text.includes("series-c")) return "series_c";
  if (text.includes("series d")) return "series_d";
  if (text.includes("growth round") || text.includes("growth equity")) return "growth";
  if (text.includes("ipo") || text.includes("went public")) return "ipo";
  if (text.includes("pre-seed") || text.includes("pre seed")) return "pre_seed";
  if (text.includes("seed round") || text.includes("seed funding") || text.includes("seed extension")) return "seed";
  // Infer from dollar amount — >$25M is almost certainly not seed
  const amountMatch = text.match(/\$(\d+(?:\.\d+)?)\s*(?:m|million)/i);
  if (amountMatch) {
    const amount = parseFloat(amountMatch[1]);
    if (amount > 25) return "late_stage";
  }
  return null;
}

// ── Deterministic scoring rubric (0–10 scale) ─────────────────────────────────
// Max points: thesis_keyword_match(3) + stage_fit(2) + sector_fit(2)
//             + geography_fit(1) + recency(1) + source_quality(1) = 10

export function deterministicScoreSignal(signal: RawSignal): {
  score: number;
  fundingStage: string | null;
} {
  const text = `${signal.title} ${signal.content}`.toLowerCase();

  // Thesis keyword match (0–3): 1 point per matching keyword, max 3
  const matchedKeywords = THESIS_KEYWORDS.filter(kw => text.includes(kw.toLowerCase()));
  const kwScore = Math.min(matchedKeywords.length, 3);

  // Funding stage (for stage fit)
  const fundingStage = detectFundingStage(signal.title, signal.content);

  // Stage fit (0–2): pre-seed/seed/unknown = 2 or 1, series A+ = 0
  let stageScore: number;
  if (!fundingStage) {
    stageScore = 1; // unknown stage — assume possible
  } else if (["pre_seed", "seed"].includes(fundingStage)) {
    stageScore = 2;
  } else {
    stageScore = 0; // Series A+ not investable for Valuence
  }

  // Sector fit (0–2): core thesis sectors score highest
  const techCat = signal.technology_category ?? inferTechCategory(text) ?? "";
  let sectorScore = 0;
  if (["Synthetic Bio", "Cleantech", "Advanced Materials"].some(s => techCat.includes(s))) {
    sectorScore = 2;
  } else if (["Factory Automation", "Green Chemistry", "Quantum"].some(s => techCat.includes(s))) {
    sectorScore = 1;
  }

  // Geography fit (0–1): US, SG, KR, JP = 1, other/unknown = 0
  const geo = signal.geography ?? inferGeography(text) ?? "";
  const geoLower = geo.toLowerCase();
  const geoScore = (
    !geo ||
    geoLower.includes("north america") ||
    geoLower.includes("singapore") ||
    geoLower.includes("korea") ||
    geoLower.includes("japan")
  ) ? 1 : 0;

  // Recency (0–1): published within last 30 days
  let recencyScore = 0;
  const dateStr = signal.published_date;
  if (dateStr) {
    const daysSince = (Date.now() - new Date(dateStr).getTime()) / 86400000;
    if (daysSince <= 30) recencyScore = 1;
  }

  // Source quality (0–1): peer-reviewed / govt sources score higher
  const highQualitySources = ["arxiv", "nsf", "sbir", "nih", "nrel", "uspto", "semantic_scholar", "biorxiv"];
  const srcScore = highQualitySources.includes((signal.source ?? "").toLowerCase()) ? 1 : 0;

  const score = kwScore + stageScore + sectorScore + geoScore + recencyScore + srcScore;
  return { score: Math.max(0, Math.min(10, score)), fundingStage };
}

// ── RawSignal & ScoredSignal types ───────────────────────────────────────────

export interface RawSignal {
  source: SignalSource;
  signal_type: "paper" | "grant" | "patent" | "funding" | "news" | "job_posting" | "other";
  title: string;
  url: string;
  content: string;
  authors?: string[];
  published_date?: string;
  company_id?: string;
  company_name?: string;
  geography?: string;
  technology_category?: string;
}

export interface ScoredSignal extends RawSignal {
  relevance_score: number;   // 0–10 deterministic score
  summary: string;
  sector_tags: string[];
  funding_stage: string | null;
}

// ── Claude summary generation ─────────────────────────────────────────────────
// Model, temperature, max_tokens, and system prompt are all read from
// Admin → AI Config → Sourcing Scorer. No values are hardcoded here.

interface SummaryItem {
  index: number;
  summary: string;
}

async function generateSummaries(signals: RawSignal[]): Promise<Map<number, string>> {
  const summaryMap = new Map<number, string>();
  if (signals.length === 0) return summaryMap;

  // Load config from Admin → AI Config → Sourcing Scorer
  const cfg = await getAiConfig("sourcing_scorer");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const items = signals.map((s, idx) => ({
    index: idx,
    title: s.title,
    snippet: s.content.slice(0, 300),
  }));

  try {
    const message = await client.messages.create({
      model:       cfg.model,
      max_tokens:  cfg.max_tokens,
      temperature: cfg.temperature,
      system:      cfg.system_prompt ?? undefined,
      messages: [
        { role: "user", content: `Summarize these ${signals.length} items:\n${JSON.stringify(items, null, 2)}` },
      ],
    });

    const rawText  = message.content[0].type === "text" ? message.content[0].text : "[]";
    const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

    const parsed: SummaryItem[] = JSON.parse(jsonText);
    for (const item of parsed) {
      if (typeof item.index === "number" && typeof item.summary === "string") {
        summaryMap.set(item.index, item.summary);
      }
    }
  } catch (err) {
    console.error("[generateSummaries] Claude error:", err);
    // Fallback: use title as summary
    signals.forEach((s, idx) => summaryMap.set(idx, s.title));
  }

  return summaryMap;
}

/** Scores an array of RawSignals using the DETERMINISTIC rubric (0–10).
 *  Claude Haiku is used ONLY to generate human-readable summary text. */
export async function scoreSignals(signals: RawSignal[]): Promise<ScoredSignal[]> {
  if (signals.length === 0) return [];

  const results: ScoredSignal[] = [];
  const BATCH_SIZE = 20;

  for (let i = 0; i < signals.length; i += BATCH_SIZE) {
    const batch = signals.slice(i, i + BATCH_SIZE);

    // 1. Compute deterministic scores (no AI needed)
    const scoreResults = batch.map(s => deterministicScoreSignal(s));

    // 2. Generate summaries with Claude (AI for text only)
    const summaryMap = await generateSummaries(batch);

    // 3. Combine
    for (let j = 0; j < batch.length; j++) {
      const s = batch[j];
      const { score, fundingStage } = scoreResults[j];
      const text = `${s.title} ${s.content}`;

      results.push({
        ...s,
        relevance_score: score,
        summary: summaryMap.get(j) ?? s.title,
        sector_tags: inferTechCategory(text) ? [inferTechCategory(text)!] : [],
        funding_stage: fundingStage,
        geography: s.geography ?? inferGeography(text) ?? undefined,
        technology_category: s.technology_category ?? inferTechCategory(text) ?? undefined,
        company_name: s.company_name ?? extractCompanyName(s.title, s.content) ?? undefined,
      });
    }
  }

  return results;
}

// ── Week string helper (YYYY-Www) ─────────────────────────────────────────────

function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// ── Supabase save with deduplication ─────────────────────────────────────────

/** Saves scored signals to Supabase, deduplicating by URL or title. Returns count inserted. */
export async function saveSignals(
  signals: ScoredSignal[],
  minScore = 0.0
): Promise<number> {
  if (signals.length === 0) return 0;

  const supabase = createAdminClient();
  void getISOWeek(new Date()); // keep import used

  // Collect all URLs and titles to check for duplicates
  const urls = signals.filter((s) => s.url).map((s) => s.url);
  const titles = signals.filter((s) => s.title).map((s) => s.title.toLowerCase().trim());

  const [{ data: existingByUrl }, { data: existingByTitle }] = await Promise.all([
    supabase.from("sourcing_signals").select("url, id, source_count, extra_urls").in("url", urls),
    supabase.from("sourcing_signals").select("title, id, source_count, extra_urls").in("title", titles),
  ]);

  const existingUrlMap = new Map(
    (existingByUrl ?? []).map((r: { url: string | null; id: string; source_count: number; extra_urls: string[] | null }) => [r.url, r])
  );
  const existingTitleMap = new Map(
    (existingByTitle ?? []).map((r: { title: string | null; id: string; source_count: number; extra_urls: string[] | null }) => [
      (r.title ?? "").toLowerCase().trim(),
      r,
    ])
  );

  const toInsert: ScoredSignal[] = [];
  const toMerge: { id: string; source_count: number; extra_urls: string[] }[] = [];

  for (const s of signals) {
    // minScore now 0-10 scale. Default 0.0 means accept all.
    if (s.relevance_score < minScore) continue;

    const urlKey = s.url;
    const titleKey = s.title.toLowerCase().trim();

    const byUrl = urlKey ? existingUrlMap.get(urlKey) : undefined;
    const byTitle = existingTitleMap.get(titleKey);
    const existing = byUrl ?? byTitle;

    if (existing) {
      const newExtraUrls = [...(existing.extra_urls ?? [])];
      const existingUrl = "url" in existing ? existing.url : undefined;
      if (s.url && !newExtraUrls.includes(s.url) && existingUrl !== s.url) {
        newExtraUrls.push(s.url);
      }
      toMerge.push({
        id: existing.id,
        source_count: (existing.source_count ?? 1) + 1,
        extra_urls: newExtraUrls,
      });
      continue;
    }

    toInsert.push(s);
  }

  // Apply merges
  for (const merge of toMerge) {
    await supabase
      .from("sourcing_signals")
      .update({ source_count: merge.source_count, extra_urls: merge.extra_urls })
      .eq("id", merge.id);
  }

  if (toInsert.length === 0) return 0;

  const rows = toInsert.map((s) => ({
    source: s.source,
    signal_type: s.signal_type,
    title: s.title,
    url: s.url,
    content: s.content.slice(0, 5000),
    summary: s.summary,
    relevance_score: s.relevance_score,   // 0–10 deterministic
    sector_tags: s.sector_tags,
    authors: s.authors ?? [],
    published_date: s.published_date ?? null,
    company_id: s.company_id ?? null,
    company_name: s.company_name ?? null,
    geography: s.geography ?? null,
    technology_category: s.technology_category ?? null,
    funding_stage: s.funding_stage ?? null,
    source_count: 1,
    is_watchlisted: false,
    extra_urls: [],
    status: "new" as const,
  }));

  const { error, data } = await supabase
    .from("sourcing_signals")
    .insert(rows)
    .select("id");

  if (error) {
    console.error("[saveSignals] Insert error:", error);
    return 0;
  }

  return data?.length ?? 0;
}
