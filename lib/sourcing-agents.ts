// ─── Sourcing Agents — Shared Utilities ──────────────────────────────────────
// Keyword filtering, Claude Haiku relevance scoring, and Supabase deduplication.

import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
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
  // Pattern: title starts with proper noun followed by space
  return null;
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
  relevance_score: number;
  summary: string;
  sector_tags: string[];
}

// ── Claude Haiku scoring ──────────────────────────────────────────────────────

interface ScoreItem {
  index: number;
  relevance: number;
  summary: string;
  sectors: string[];
}

const SCORING_SYSTEM_PROMPT = `You are a VC analyst at Valuence Ventures focused on cleantech, techbio, and advanced materials.
You evaluate research papers, grants, and news for investment relevance.
For each item, score relevance 0.0–1.0 where:
  1.0 = directly relevant to Valuence thesis (cleantech, techbio, advanced materials, deeptech)
  0.7 = moderately relevant
  0.4 = tangentially relevant
  0.0 = not relevant

Return ONLY a JSON array. No markdown. No prose. Example:
[{"index":0,"relevance":0.85,"summary":"One sentence description.","sectors":["cleantech","energy storage"]},...]`;

/** Scores an array of RawSignals using Claude Haiku in batches of 20. */
export async function scoreSignals(signals: RawSignal[]): Promise<ScoredSignal[]> {
  if (signals.length === 0) return [];

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const results: ScoredSignal[] = [];
  const BATCH_SIZE = 20;

  for (let i = 0; i < signals.length; i += BATCH_SIZE) {
    const batch = signals.slice(i, i + BATCH_SIZE);

    const items = batch.map((s, idx) => ({
      index: idx,
      title: s.title,
      snippet: s.content.slice(0, 400),
    }));

    try {
      const message = await client.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 2048,
        system: SCORING_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: `Score these ${batch.length} items:\n${JSON.stringify(items, null, 2)}`,
          },
        ],
      });

      const rawText =
        message.content[0].type === "text" ? message.content[0].text : "[]";

      // Strip markdown code fences if present
      const jsonText = rawText
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```\s*$/, "")
        .trim();

      let scored: ScoreItem[] = [];
      try {
        scored = JSON.parse(jsonText) as ScoreItem[];
      } catch {
        scored = batch.map((_, idx) => ({
          index: idx,
          relevance: 0.5,
          summary: batch[idx].title,
          sectors: [],
        }));
      }

      for (const item of scored) {
        const original = batch[item.index];
        if (!original) continue;
        const text = `${original.title} ${original.content}`;
        results.push({
          ...original,
          relevance_score: Math.max(0, Math.min(1, item.relevance ?? 0.5)),
          summary: item.summary ?? original.title,
          sector_tags: Array.isArray(item.sectors) ? item.sectors : [],
          geography: original.geography ?? inferGeography(text) ?? undefined,
          technology_category: original.technology_category ?? inferTechCategory(text) ?? undefined,
          company_name: original.company_name ?? extractCompanyName(original.title, original.content) ?? undefined,
        });
      }
    } catch (err) {
      console.error("[scoreSignals] Claude error:", err);
      for (const s of batch) {
        const text = `${s.title} ${s.content}`;
        results.push({
          ...s,
          relevance_score: 0.5,
          summary: s.title,
          sector_tags: [],
          geography: s.geography ?? inferGeography(text) ?? undefined,
          technology_category: s.technology_category ?? inferTechCategory(text) ?? undefined,
          company_name: s.company_name ?? extractCompanyName(s.title, s.content) ?? undefined,
        });
      }
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

// ── Supabase save with enhanced deduplication ─────────────────────────────────

/** Saves scored signals to Supabase, deduplicating by URL, title, or company+week. Returns count inserted. */
export async function saveSignals(
  signals: ScoredSignal[],
  minScore = 0.0
): Promise<number> {
  if (signals.length === 0) return 0;

  const supabase = createAdminClient();
  const thisWeek = getISOWeek(new Date());

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
    if (s.relevance_score < minScore) continue;

    const urlKey = s.url;
    const titleKey = s.title.toLowerCase().trim();

    const byUrl = urlKey ? existingUrlMap.get(urlKey) : undefined;
    const byTitle = existingTitleMap.get(titleKey);
    const existing = byUrl ?? byTitle;

    if (existing) {
      // Merge: increment source_count, add URL to extra_urls if new
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
    relevance_score: s.relevance_score,
    sector_tags: s.sector_tags,
    authors: s.authors ?? [],
    published_date: s.published_date ?? null,
    company_id: s.company_id ?? null,
    company_name: s.company_name ?? null,
    geography: s.geography ?? null,
    technology_category: s.technology_category ?? null,
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
