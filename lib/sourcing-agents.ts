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
  "microbiome", "precision fermentation", "bio-based materials",
  // Advanced materials
  "advanced materials", "graphene", "carbon nanotubes", "nanomaterials",
  "perovskite", "solid-state electrolyte", "solid-state battery",
  "metamaterials", "2D materials", "semiconductor", "photovoltaic",
  "biomaterials", "composite materials", "functional coatings",
  "additive manufacturing", "3D printing", "high-entropy alloy",
];

/** Returns true if the text contains at least one thesis keyword (case-insensitive). */
export function passesKeywordFilter(text: string): boolean {
  const lower = text.toLowerCase();
  return THESIS_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
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
        // If parsing fails, assign neutral scores
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
        results.push({
          ...original,
          relevance_score: Math.max(0, Math.min(1, item.relevance ?? 0.5)),
          summary: item.summary ?? original.title,
          sector_tags: Array.isArray(item.sectors) ? item.sectors : [],
        });
      }
    } catch (err) {
      console.error("[scoreSignals] Claude error:", err);
      // Fall back: add all batch items with neutral score
      for (const s of batch) {
        results.push({
          ...s,
          relevance_score: 0.5,
          summary: s.title,
          sector_tags: [],
        });
      }
    }
  }

  return results;
}

// ── Supabase save with deduplication ─────────────────────────────────────────

/** Saves scored signals to Supabase, deduplicating by URL. Returns count inserted. */
export async function saveSignals(
  signals: ScoredSignal[],
  minScore = 0.0
): Promise<number> {
  if (signals.length === 0) return 0;

  const supabase = createAdminClient();

  // Collect all URLs to check for duplicates
  const urls = signals
    .filter((s) => s.url)
    .map((s) => s.url);

  const { data: existing } = await supabase
    .from("sourcing_signals")
    .select("url")
    .in("url", urls);

  const existingUrls = new Set((existing ?? []).map((r: { url: string | null }) => r.url).filter(Boolean));

  const toInsert = signals
    .filter((s) => s.relevance_score >= minScore)
    .filter((s) => !existingUrls.has(s.url));

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
