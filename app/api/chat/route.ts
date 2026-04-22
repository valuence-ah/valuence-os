// ─── Chat API Route /api/chat ─────────────────────────────────────────────────
// Receives a user message, queries the database for relevant context,
// injects it into Claude's system prompt, and streams the response back.
//
// Context strategy (layered):
//   Layer 1 — Always injected: fund snapshot (companies, deals, portfolio, LPs, memos)
//   Layer 2 — Smart context:   if user mentions a company name, fetch that company's
//                              full interactions, documents, and signals
//   Layer 3 — Semantic search: if VOYAGE_API_KEY is set, embed the query and search
//                              documents + signals via pgvector

import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { createClient } from "@/lib/supabase/server";
import { embedText } from "@/lib/embeddings";

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract the last user message text from the messages array. */
function getLastUserMessage(messages: { role: string; content: string }[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content ?? "";
  }
  return "";
}

/** Find company names from the query against a known list. Returns matched IDs. */
function detectMentionedCompanies(
  query: string,
  companies: { id: string; name: string }[]
): string[] {
  const q = query.toLowerCase();
  return companies
    .filter((c) => c.name && q.includes(c.name.toLowerCase()))
    .map((c) => c.id);
}

// ── Main ──────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const { messages } = await req.json();
  const supabase = await createClient();

  // ── 1. Auth ───────────────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const lastUserMessage = getLastUserMessage(messages);

  // ── 2. Layer 1: Fund snapshot ─────────────────────────────────────────────
  type CompanyRow = { id: string; name: string; type: string; deal_status: string | null; sectors: string[] | null; stage: string | null; description: string | null; location_city: string | null; location_country: string | null; funding_raised: number | null; source: string | null; created_at: string };
  type DealRow = { stage: string; instrument: string | null; investment_amount: number | null; valuation_cap: number | null; company?: { name: string; sectors: string[] | null } | null };
  type PortfolioRow = { name: string; sectors: string[] | null; deal_status: string | null; funding_raised: number | null };
  type LpRow = { stage: string; target_allocation: number | null; committed_amount: number | null; fund_vehicle: string | null; company?: { name: string; lp_type: string | null } | null };
  type SignalRow = { source: string; signal_type: string; title: string | null; relevance_score: number | null; sector_tags: string[] | null; status: string; published_date: string | null };
  type MemoRow = { title: string; recommendation: string | null; status: string; company?: { name: string; sectors: string[] | null } | null; created_at: string };

  const [
    { data: companies },
    { data: deals },
    { data: portfolio },
    { data: lpRelationships },
    { data: recentSignals },
    { data: recentMemos },
  ] = await Promise.all([
    supabase.from("companies").select("id, name, type, deal_status, sectors, stage, description, location_city, location_country, funding_raised, source, created_at").order("updated_at", { ascending: false }).limit(50) as unknown as Promise<{ data: CompanyRow[] | null; error: unknown }>,
    supabase.from("deals").select("stage, instrument, investment_amount, valuation_cap, company:companies(name, sectors)").neq("stage", "passed").order("created_at", { ascending: false }).limit(30) as unknown as Promise<{ data: DealRow[] | null; error: unknown }>,
    supabase.from("companies").select("name, sectors, deal_status, funding_raised").eq("deal_status", "portfolio") as unknown as Promise<{ data: PortfolioRow[] | null; error: unknown }>,
    supabase.from("lp_relationships").select("stage, target_allocation, committed_amount, fund_vehicle, company:companies(name, lp_type)").neq("stage", "passed").limit(30) as unknown as Promise<{ data: LpRow[] | null; error: unknown }>,
    supabase.from("sourcing_signals").select("source, signal_type, title, relevance_score, sector_tags, status, published_date").eq("status", "new").order("relevance_score", { ascending: false }).limit(20) as unknown as Promise<{ data: SignalRow[] | null; error: unknown }>,
    supabase.from("ic_memos").select("title, recommendation, status, company:companies(name, sectors), created_at").order("created_at", { ascending: false }).limit(10) as unknown as Promise<{ data: MemoRow[] | null; error: unknown }>,
  ]);

  const fundContext = `
CURRENT FUND DATA (as of ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })})
=======================================================================

COMPANIES IN CRM (${companies?.length ?? 0} total):
${companies?.map(c => `- ${c.name} | Type: ${c.type} | Sectors: ${c.sectors?.join(", ") || "—"} | Status: ${c.deal_status || c.stage || "—"} | Location: ${[c.location_city, c.location_country].filter(Boolean).join(", ") || "—"}${c.funding_raised ? ` | Raised: $${(c.funding_raised / 1e6).toFixed(1)}M` : ""}`).join("\n") || "None"}

ACTIVE DEAL PIPELINE (${deals?.length ?? 0} deals):
${deals?.map(d => `- ${d.company?.name} | Stage: ${d.stage} | ${d.instrument?.toUpperCase() || "—"} | Amount: ${d.investment_amount ? `$${(d.investment_amount / 1e3).toFixed(0)}K` : "—"} | Cap: ${d.valuation_cap ? `$${(d.valuation_cap / 1e6).toFixed(1)}M` : "—"}`).join("\n") || "None"}

PORTFOLIO COMPANIES (${portfolio?.length ?? 0}):
${portfolio?.map(c => `- ${c.name} | Sectors: ${c.sectors?.join(", ") || "—"} | Total raised: ${c.funding_raised ? `$${(c.funding_raised / 1e6).toFixed(1)}M` : "—"}`).join("\n") || "None"}

LP FUNDRAISING PIPELINE (${lpRelationships?.length ?? 0} relationships):
${lpRelationships?.map(r => `- ${r.company?.name} (${r.company?.lp_type || "—"}) | Stage: ${r.stage} | Target: ${r.target_allocation ? `$${(r.target_allocation / 1e6).toFixed(1)}M` : "—"} | Committed: ${r.committed_amount ? `$${(r.committed_amount / 1e6).toFixed(1)}M` : "$0"} | Vehicle: ${r.fund_vehicle || "—"}`).join("\n") || "None"}

RECENT SOURCING SIGNALS (top ${recentSignals?.length ?? 0} unreviewed):
${recentSignals?.map(s => `- [${s.source.toUpperCase()}] ${s.title || "Untitled"} | Type: ${s.signal_type} | Relevance: ${s.relevance_score ? Math.round(s.relevance_score * 100) + "%" : "—"} | Date: ${s.published_date || "—"}`).join("\n") || "None"}

RECENT IC MEMOS (${recentMemos?.length ?? 0}):
${recentMemos?.map(m => `- ${m.title} (${m.company?.name}) | Recommendation: ${m.recommendation} | Status: ${m.status} | Date: ${new Date(m.created_at).toLocaleDateString()}`).join("\n") || "None"}
`;

  // ── 3. Layer 2: Smart company deep-dive ───────────────────────────────────
  let deepDiveContext = "";

  if (lastUserMessage && companies) {
    const mentionedIds = detectMentionedCompanies(lastUserMessage, companies);

    if (mentionedIds.length > 0) {
      type InteractionRow = { type: string; subject: string | null; summary: string | null; action_items: string[] | null; date: string; sentiment: string | null };
      type DocRow = { name: string; type: string; ai_summary: string | null; created_at: string };

      const [{ data: interactions }, { data: docs }] = await Promise.all([
        supabase
          .from("interactions")
          .select("type, subject, summary, action_items, date, sentiment")
          .in("company_id", mentionedIds)
          .order("date", { ascending: false })
          .limit(10) as unknown as Promise<{ data: InteractionRow[] | null; error: unknown }>,
        supabase
          .from("documents")
          .select("name, type, ai_summary, created_at")
          .in("company_id", mentionedIds)
          .limit(5) as unknown as Promise<{ data: DocRow[] | null; error: unknown }>,
      ]);

      if ((interactions?.length ?? 0) > 0 || (docs?.length ?? 0) > 0) {
        const companyNames = companies
          .filter((c) => mentionedIds.includes(c.id))
          .map((c) => c.name)
          .join(", ");

        deepDiveContext = `
\nDEEP-DIVE DATA FOR: ${companyNames}
──────────────────────────────────────
RECENT MEETINGS & INTERACTIONS (${interactions?.length ?? 0}):
${interactions?.map(i => `- [${i.type.toUpperCase()}] ${i.subject || "—"} | ${new Date(i.date).toLocaleDateString()} | Sentiment: ${i.sentiment || "—"}${i.summary ? `\n  Summary: ${i.summary}` : ""}${i.action_items?.length ? `\n  Actions: ${i.action_items.join("; ")}` : ""}`).join("\n") || "None"}

DOCUMENTS (${docs?.length ?? 0}):
${docs?.map(d => `- ${d.name} (${d.type}) | ${new Date(d.created_at).toLocaleDateString()}${d.ai_summary ? `\n  AI Summary: ${d.ai_summary}` : ""}`).join("\n") || "None"}
`;
      }
    }
  }

  // ── 4. Layer 3: Semantic search (pgvector) ────────────────────────────────
  let semanticContext = "";

  if (lastUserMessage && process.env.VOYAGE_API_KEY) {
    try {
      const queryEmbedding = await embedText(lastUserMessage);

      if (queryEmbedding) {
        type DocMatch = { id: string; name: string; type: string; company_name: string | null; text_snippet: string | null; similarity: number };
        type SignalMatch = { id: string; title: string; source: string; summary: string | null; relevance_score: number | null; url: string | null; similarity: number };

        const [{ data: docMatches }, { data: signalMatches }] = await Promise.all([
          supabase.rpc("match_documents", {
            query_embedding: queryEmbedding,
            match_threshold: 0.5,
            match_count: 4,
          }) as unknown as Promise<{ data: DocMatch[] | null; error: unknown }>,
          supabase.rpc("match_signals", {
            query_embedding: queryEmbedding,
            match_threshold: 0.5,
            match_count: 4,
          }) as unknown as Promise<{ data: SignalMatch[] | null; error: unknown }>,
        ]);

        const hasDocMatches    = (docMatches?.length ?? 0) > 0;
        const hasSignalMatches = (signalMatches?.length ?? 0) > 0;

        if (hasDocMatches || hasSignalMatches) {
          semanticContext = `
\nSEMANTICALLY RELEVANT RESULTS (matched to your query):
──────────────────────────────────────`;

          if (hasDocMatches) {
            semanticContext += `\nDOCUMENTS (${docMatches!.length} matches):\n`;
            semanticContext += docMatches!.map(d =>
              `- "${d.name}" (${d.type})${d.company_name ? ` — ${d.company_name}` : ""} [${Math.round(d.similarity * 100)}% match]${d.text_snippet ? `\n  Excerpt: ${d.text_snippet}` : ""}`
            ).join("\n");
          }

          if (hasSignalMatches) {
            semanticContext += `\nSOURCING SIGNALS (${signalMatches!.length} matches):\n`;
            semanticContext += signalMatches!.map(s =>
              `- [${s.source.toUpperCase()}] ${s.title} [${Math.round(s.similarity * 100)}% match]${s.summary ? `\n  ${s.summary}` : ""}`
            ).join("\n");
          }
        }
      }
    } catch (err) {
      // Semantic search failing silently is acceptable — Layer 1+2 still work
      console.warn("[chat] Semantic search error:", err);
    }
  }

  // ── 5. System prompt ──────────────────────────────────────────────────────
  const systemPrompt = `You are the AI assistant for Valuence Ventures, an early-stage deeptech venture capital fund focused on cleantech, techbio, and advanced materials. You invest at pre-seed and seed stage.

You have direct access to the fund's live operating data (CRM, pipeline, portfolio, LP tracker, meetings, documents). Use this data to give accurate, specific, and actionable answers.

FUND CONTEXT:
${fundContext}${deepDiveContext}${semanticContext}

INSTRUCTIONS:
- Always refer to specific company names, amounts, and data when answering
- Be concise but thorough. Use bullet points and structure for complex answers.
- If you don't have data to answer something, say so clearly and suggest where to find it
- Format currency as $XM or $XK for readability
- Never make up company names or financials — only use what's in the context above
- You can help draft emails, memos, meeting prep notes, and analysis
- Speak like a sharp, knowledgeable VC analyst/partner`;

  // ── 6. Stream ─────────────────────────────────────────────────────────────
  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: systemPrompt,
    messages,
    temperature: 0.3,
    maxTokens: 2048,
  });

  return result.toDataStreamResponse();
}
