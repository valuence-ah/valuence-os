// ─── POST /api/feeds/categorize ───────────────────────────────────────────────
// Processes up to 20 uncategorized feed_articles with Claude Haiku.
// Fetches thesis keywords from DB, computes relevance_score, sets ai_why_relevant.
// Called automatically after feed sync and by Vercel cron.

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic    = "force-dynamic";
export const maxDuration = 60;

interface ClaudeCategorizationResult {
  bucket: "fund_raise" | "startup_round" | "ma_partnership" | "uncategorized";
  sectors: string[];
  deal_stage: string | null;
  deal_amount: string | null;
  deal_amount_usd: number | null;
  mentioned_companies: string[];
  mentioned_investors: string[];
  thesis_keywords: string[];
  ai_why_relevant: string | null;
}

export async function POST(request: NextRequest) {
  // Auth: allow Vercel cron or authenticated user
  const authHeader = request.headers.get("authorization");
  const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  const supabase = createAdminClient();

  if (!isCron) {
    const userClient = await createClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // 1. Fetch active thesis keywords from DB
  const { data: kwRows } = await supabase
    .from("thesis_keywords")
    .select("keyword, category")
    .eq("active", true);

  const thesisKeywords = (kwRows ?? []).map(r => r.keyword);
  const keywordCategories = Object.fromEntries(
    (kwRows ?? []).map(r => [r.keyword.toLowerCase(), r.category as string])
  );

  // 2. Fetch uncategorized articles
  const { data: articles, error } = await supabase
    .from("feed_articles")
    .select("id, title, summary, content, source_id")
    .eq("ai_categorized", false)
    .order("published_at", { ascending: false })
    .limit(20);

  if (error || !articles?.length) {
    return NextResponse.json({ processed: 0 });
  }

  // 3. Fetch watchlist for co-investor matching
  const { data: watchlistItems } = await supabase
    .from("feed_watchlist")
    .select("name, keywords, type");

  const watchlist = watchlistItems ?? [];

  const BATCH_SIZE = 5;
  let processed = 0;

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (article) => {
        try {
          const textForAnalysis = `${article.title}\n\n${
            article.summary ?? article.content ?? ""
          }`.substring(0, 2000);

          const textLower = textForAnalysis.toLowerCase();

          // 3a. Simple keyword pre-matching (before calling Claude)
          const preMatchedKws = thesisKeywords.filter(kw =>
            textLower.includes(kw.toLowerCase())
          );

          const response = await anthropic.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 600,
            system: `You are a VC analyst at Valuence Ventures, a deeptech fund focused on cleantech, biotech, and advanced materials (pre-seed & seed). Categorize news articles and explain thesis relevance. Respond ONLY in valid JSON with no markdown fences.`,
            messages: [
              {
                role: "user",
                content: `Categorize this article and return JSON only:

Title: ${article.title}
Content: ${textForAnalysis}

Active thesis keywords: ${thesisKeywords.slice(0, 60).join(", ")}

Return this exact JSON structure:
{
  "bucket": "fund_raise" | "startup_round" | "ma_partnership" | "uncategorized",
  "sectors": ["cleantech", "biotech", "advanced_materials", "climate_energy"],
  "deal_stage": "pre_seed" | "seed" | "series_a" | "series_b" | "growth" | "fund_close" | "first_close" | "acquisition" | "partnership" | null,
  "deal_amount": "$4.5M" or null,
  "deal_amount_usd": 4500000 or null,
  "mentioned_companies": [],
  "mentioned_investors": [],
  "thesis_keywords": [],
  "ai_why_relevant": "1-2 sentences explaining why this matters to Valuence (thesis alignment, pipeline overlap, co-invest potential). Return null if not relevant."
}

Bucket rules:
- fund_raise: VC/PE fund launches, fund closes, LP commitments
- startup_round: Any startup fundraising (pre-seed through growth)
- ma_partnership: Acquisitions, mergers, strategic partnerships

thesis_keywords: only use terms from the active thesis keywords list above.
For deal_amount_usd: convert EUR × 1.1, GBP × 1.27.`,
              },
            ],
          });

          const rawText =
            response.content[0].type === "text" ? response.content[0].text : "{}";
          const parsed: ClaudeCategorizationResult = JSON.parse(
            rawText.replace(/```json|```/g, "").trim()
          );

          // 3b. Merge Claude's thesis_keywords with pre-matched ones (dedup)
          const finalThesisKeywords = [
            ...new Set([
              ...(parsed.thesis_keywords ?? []),
              ...preMatchedKws,
            ]),
          ];

          // 3c. Match mentioned companies against CRM
          const matchedCompanyIds: string[] = [];
          for (const name of parsed.mentioned_companies ?? []) {
            const { data: match } = await supabase
              .from("companies")
              .select("id")
              .ilike("name", `%${name}%`)
              .limit(1)
              .maybeSingle();
            if (match) matchedCompanyIds.push(match.id);
          }

          // 3d. Watchlist matching
          const watchlistMatched = watchlist.filter((w) =>
            (w.keywords as string[]).some((kw: string) =>
              textLower.includes(kw.toLowerCase())
            )
          );

          // 3e. Calculate relevance_score (0–5)
          let relevanceScore = 0;
          // +1 per thesis keyword match (max 2)
          relevanceScore += Math.min(finalThesisKeywords.length, 2);
          // +1 if sector is cleantech or biotech
          const sectors: string[] = parsed.sectors ?? [];
          if (sectors.includes("cleantech") || sectors.includes("biotech")) {
            relevanceScore += 1;
          }
          // +1 if deal stage is early
          const earlyStages = ["pre_seed", "seed", "series_a"];
          if (parsed.deal_stage && earlyStages.includes(parsed.deal_stage)) {
            relevanceScore += 1;
          }
          // +1 if matched to existing pipeline company or known co-investor
          if (matchedCompanyIds.length > 0 || watchlistMatched.length > 0) {
            relevanceScore += 1;
          }

          // 3f. Build relevance tags
          const relevanceTags: string[] = [];
          if (matchedCompanyIds.length)     relevanceTags.push("pipeline_match");
          if (finalThesisKeywords.length)   relevanceTags.push("thesis_match");
          if (watchlistMatched.length)      relevanceTags.push("coinvestor_activity");

          // 3g. Update article
          await supabase
            .from("feed_articles")
            .update({
              bucket:              parsed.bucket ?? "uncategorized",
              sectors,
              deal_stage:          parsed.deal_stage ?? null,
              deal_amount:         parsed.deal_amount ?? null,
              deal_amount_usd:     parsed.deal_amount_usd ?? null,
              mentioned_companies: parsed.mentioned_companies ?? [],
              mentioned_investors: parsed.mentioned_investors ?? [],
              matched_company_ids: matchedCompanyIds,
              thesis_keywords:     finalThesisKeywords,
              relevance_tags:      [...new Set(relevanceTags)],
              relevance_score:     relevanceScore,
              ai_why_relevant:     parsed.ai_why_relevant ?? null,
              ai_categorized:      true,
            })
            .eq("id", article.id);

          // 3h. Increment keyword match counts in DB
          for (const kw of finalThesisKeywords) {
            const cat = keywordCategories[kw.toLowerCase()];
            if (cat !== undefined) {
              try {
                await supabase.rpc("increment_keyword_match", { kw });
              } catch { /* non-critical */ }
            }
          }

          processed++;
        } catch (err) {
          console.error(`[categorize] article ${article.id}:`, err);
          // Mark categorized to avoid re-processing failures
          await supabase
            .from("feed_articles")
            .update({ ai_categorized: true, bucket: "uncategorized", relevance_score: 0 })
            .eq("id", article.id);
        }
      })
    );
  }

  return NextResponse.json({ processed });
}
