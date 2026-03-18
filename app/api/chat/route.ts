// ─── Chat API Route /api/chat ─────────────────────────────────────────────────
// Receives a user message, queries the database for relevant context,
// injects it into Claude's system prompt, and streams the response back.
// This is what makes Claude "know" about your fund's actual data.

import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText } from "ai";
import { createClient } from "@/lib/supabase/server";

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

export async function POST(req: Request) {
  const { messages } = await req.json();
  const supabase = await createClient();

  // ── 1. Verify the user is authenticated ──────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  // ── 2. Gather live context from the database ──────────────────────────────
  // We run several quick queries to give Claude real-time fund data.
  // This is a "retrieval-augmented" approach without needing vector search for simple queries.

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

  // ── 3. Format context as readable text for Claude ─────────────────────────
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

  // ── 4. Build the system prompt ─────────────────────────────────────────────
  const systemPrompt = `You are the AI assistant for Valuence Ventures, an early-stage deeptech venture capital fund focused on cleantech, techbio, and advanced materials. You invest at pre-seed and seed stage.

You have direct access to the fund's live operating data (CRM, pipeline, portfolio, LP tracker). Use this data to give accurate, specific, and actionable answers.

FUND CONTEXT:
${fundContext}

INSTRUCTIONS:
- Always refer to specific company names, amounts, and data when answering
- Be concise but thorough. Use bullet points and structure for complex answers.
- If you don't have data to answer something, say so clearly and suggest where to find it
- Format currency as $XM or $XK for readability
- Never make up company names or financials — only use what's in the context above
- You can help draft emails, memos, meeting prep notes, and analysis
- Speak like a sharp, knowledgeable VC analyst/partner`;

  // ── 5. Stream the response ─────────────────────────────────────────────────
  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: systemPrompt,
    messages,
    temperature: 0.3,
    maxTokens: 2048,
  });

  return result.toDataStreamResponse();
}
