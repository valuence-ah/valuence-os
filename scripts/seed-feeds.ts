// ─── Seed new RSS feed sources ────────────────────────────────────────────────
// Run with: npx tsx --env-file=.env.local scripts/seed-feeds.ts
// Idempotent — skips any source whose name already exists in feed_sources.
// Already connected in DB (not re-seeded): VCWire, FinSMEs.
// Total in this file: 25 sources across 3 buckets (13 cleantech/general + 12 biotech).

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const NEW_SOURCES = [
  // ── Bucket 1: Fund launches + raises ────────────────────────────────────────
  { name: "Crunchbase News",          website_url: "https://news.crunchbase.com",          feed_url: "https://news.crunchbase.com/feed/",                             bucket_affinity: "fund_raise",     keywords: ["fund", "venture", "raise", "close"] },
  { name: "PitchBook Blog",           website_url: "https://pitchbook.com",                feed_url: "https://pitchbook.com/blog/feed",                                bucket_affinity: "fund_raise",     keywords: ["fund", "capital raise", "close"] },
  { name: "NVCA",                     website_url: "https://nvca.org",                     feed_url: "https://nvca.org/feed/",                                        bucket_affinity: "fund_raise",     keywords: ["venture", "fund", "policy"] },
  { name: "PE Insights",              website_url: "https://pe-insights.com",              feed_url: "https://pe-insights.com/feed/",                                  bucket_affinity: "fund_raise",     keywords: ["private equity", "fund raise"] },
  // Biotech VC funding
  { name: "Fierce Biotech (VC)",      website_url: "https://fiercebiotech.com",            feed_url: "https://fiercebiotech.com/rss/venture-capital/xml",              bucket_affinity: "fund_raise",     keywords: ["biotech", "venture", "fund raise", "series", "investment"] },
  { name: "Life Sci VC",              website_url: "https://lifescivc.com",                feed_url: "https://lifescivc.com/feed",                                    bucket_affinity: "fund_raise",     keywords: ["biotech", "fund", "venture capital", "market", "strategy"] },

  // ── Bucket 2: Startup pre-seed + seed rounds ─────────────────────────────────
  { name: "TechCrunch",               website_url: "https://techcrunch.com",               feed_url: "https://techcrunch.com/feed/",                                   bucket_affinity: "startup_round",  keywords: ["seed", "series a", "raise", "funding"] },
  { name: "Sifted",                   website_url: "https://sifted.eu",                    feed_url: "https://sifted.eu/feed",                                        bucket_affinity: "startup_round",  keywords: ["startup", "seed", "funding", "europe"] },
  { name: "CTVC",                     website_url: "https://www.ctvc.co",                  feed_url: "https://www.ctvc.co/rss/",                                      bucket_affinity: "startup_round",  keywords: ["cleantech", "climate", "venture"] },
  { name: "SynBioBeta",               website_url: "https://synbiobeta.com",               feed_url: "https://synbiobeta.com/feed/",                                   bucket_affinity: "startup_round",  keywords: ["synthetic biology", "biotech", "startup"] },
  { name: "GreenBiz",                 website_url: "https://www.greenbiz.com",             feed_url: "https://www.greenbiz.com/feed",                                  bucket_affinity: "startup_round",  keywords: ["cleantech", "sustainability", "climate"] },
  { name: "Cleantech Group",          website_url: "https://www.cleantech.com",            feed_url: "https://www.cleantech.com/feed/",                                bucket_affinity: "startup_round",  keywords: ["cleantech", "climate", "investment"] },
  // Biotech startup rounds
  { name: "Fierce Biotech",           website_url: "https://fiercebiotech.com",            feed_url: "https://fiercebiotech.com/rss/biotech/xml",                      bucket_affinity: "startup_round",  keywords: ["biotech", "startup", "clinical", "funding", "round", "series"] },
  { name: "Endpoints News",           website_url: "https://endpts.com",                   feed_url: "https://endpts.com/feed",                                       bucket_affinity: "startup_round",  keywords: ["biotech", "biopharma", "funding", "series", "IPO", "R&D"] },
  { name: "Labiotech.eu",             website_url: "https://labiotech.eu",                 feed_url: "https://labiotech.eu/feed",                                     bucket_affinity: "startup_round",  keywords: ["biotech", "synbio", "gene therapy", "europe", "startup", "funding"] },
  { name: "GEN (Genetic Eng. News)",  website_url: "https://www.genengnews.com",           feed_url: "https://www.genengnews.com/feed",                                bucket_affinity: "startup_round",  keywords: ["synthetic biology", "CRISPR", "genomics", "biotech", "tools"] },
  { name: "BioSpace",                 website_url: "https://www.biospace.com",             feed_url: "https://www.biospace.com/rss",                                   bucket_affinity: "startup_round",  keywords: ["biotech", "clinical trial", "funding", "layoff", "biopharma"] },
  { name: "STAT News",                website_url: "https://www.statnews.com",             feed_url: "https://www.statnews.com/feed",                                  bucket_affinity: "startup_round",  keywords: ["biotech", "FDA", "regulatory", "clinical", "funding", "pharma"] },
  { name: "Nature Biotechnology",     website_url: "https://www.nature.com/nbt",           feed_url: "https://www.nature.com/nbt/rss",                                 bucket_affinity: "startup_round",  keywords: ["synthetic biology", "CRISPR", "cell therapy", "gene therapy", "research"] },

  // ── Bucket 3: M&A + partnerships ────────────────────────────────────────────
  { name: "Crunchbase M&A",           website_url: "https://news.crunchbase.com/tag/m-a",  feed_url: "https://news.crunchbase.com/tag/m-a/feed/",                      bucket_affinity: "ma_partnership", keywords: ["acquisition", "merger", "partnership"] },
  { name: "PR Newswire Tech",         website_url: "https://www.prnewswire.com",           feed_url: "https://www.prnewswire.com/rss/technology-latest-news.rss",      bucket_affinity: "ma_partnership", keywords: ["partnership", "strategic", "agreement", "licensing"] },
  { name: "GCV Analytics",            website_url: "https://globalcorporateventuring.com", feed_url: "https://globalcorporateventuring.com/feed/",                     bucket_affinity: "ma_partnership", keywords: ["corporate venture", "partnership", "investment"] },
  // Biotech M&A + deals
  { name: "Fierce Biotech (Deals)",   website_url: "https://fiercebiotech.com",            feed_url: "https://fiercebiotech.com/rss/deals/xml",                        bucket_affinity: "ma_partnership", keywords: ["biotech", "licensing", "partnership", "deal", "acquisition", "merger"] },
  { name: "Fierce Pharma",            website_url: "https://www.fiercepharma.com",         feed_url: "https://www.fiercepharma.com/rss/xml",                           bucket_affinity: "ma_partnership", keywords: ["pharma", "acquisition", "licensing", "partnership", "deal"] },
  { name: "BioPharma Dive",           website_url: "https://www.biopharmadive.com",        feed_url: "https://www.biopharmadive.com/feeds/news",                       bucket_affinity: "ma_partnership", keywords: ["biopharma", "deal", "merger", "partnership", "acquisition"] },
];

async function main() {
  // Detect which columns exist in feed_sources
  const { data: probe, error: probeErr } = await supabase
    .from("feed_sources")
    .select("id, keywords, bucket_affinity")
    .limit(1);

  const hasBucketAffinity = !probeErr && probe !== null;
  if (!hasBucketAffinity) {
    console.warn("⚠  bucket_affinity column not found — run migration 022 first, then re-run this script.");
    console.warn("   Probe error:", probeErr?.message);
    process.exit(1);
  }

  console.log(`Seeding ${NEW_SOURCES.length} new feed sources…`);
  let added = 0;
  let skipped = 0;

  for (const source of NEW_SOURCES) {
    // Skip if a source with the same name already exists
    const { data: existing } = await supabase
      .from("feed_sources")
      .select("id")
      .ilike("name", source.name)
      .limit(1)
      .single();

    if (existing) {
      console.log(`  skip  ${source.name} (already exists)`);
      skipped++;
      continue;
    }

    // Only send columns we know exist
    const payload: Record<string, unknown> = {
      name:            source.name,
      website_url:     source.website_url,
      feed_url:        source.feed_url,
      keywords:        source.keywords,
      bucket_affinity: source.bucket_affinity,
    };

    const { error } = await supabase.from("feed_sources").insert(payload);
    if (error) {
      console.error(`  error ${source.name}:`, error.message);
    } else {
      console.log(`  added ${source.name}`);
      added++;
    }
  }

  console.log(`\nDone — ${added} added, ${skipped} skipped.`);
}

main().catch(console.error);
