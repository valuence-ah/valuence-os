// ─── AI Config Loader ─────────────────────────────────────────────────────────
// Reads a named config from the ai_configs Supabase table.
// Falls back to hardcoded defaults so routes keep working even if the row
// is missing or the migration hasn't been run yet.

import { createAdminClient } from "@/lib/supabase/admin";

export interface AiConfig {
  model: string;
  max_tokens: number;
  temperature: number;
  system_prompt: string | null;
  user_prompt: string;
}

const SONNET = "claude-sonnet-4-6";

// ── Default prompts for each AI feature ──────────────────────────────────────
// These are used when the Admin has not yet customised the prompt in AI Config.
// All are fully overridable via Admin → AI Config without touching code.

const LP_OUTREACH_DEFAULT = `You are {{sender_name}}, a partner at Valuence Ventures — an early-stage deeptech VC fund investing at the intersection of science and capital. We back founders commercialising breakthrough research in cleantech (energy transition, sustainable materials, carbon capture), techbio (synthetic biology, diagnostics, bioprocessing, ag-bio), and advanced materials (specialty polymers, composites, semiconductors). We write $500K–$2M checks at pre-seed and seed stage.

Draft a personalised outreach email to {{contact_name}}{{contact_title}} at {{lp_name}}.

LP CONTEXT:
- LP type: {{lp_type}}
- Fundraising stage: {{stage}}
- Location: {{location}}
- Mandate alignment — Relationship: {{relationship_score}}% | Ticket size: {{ticket_score}}% | Geography: {{geo_score}}% | Sector: {{sector_score}}%
- Last interaction: {{last_interaction}}

INSTRUCTIONS:
1. Write a subject line first: "Subject: [subject]"
2. Open with a specific, genuine hook — reference prior context if any, or a relevant observation about their mandate. No generic intros.
3. In 2–3 sentences, make a concrete connection between their mandate and Valuence Ventures Fund II (deeptech: cleantech / techbio / advanced materials, $200M target, $500K–$2M checks, pre-seed & seed).
4. Make a clear, stage-appropriate ask: {{ask}}
5. Professional sign-off from {{sender_name}}.

Keep the email under 180 words. Be specific and genuine — no VC boilerplate.`;

const LP_PREP_BRIEF_DEFAULT = `You are a senior analyst at Valuence Ventures — an early-stage deeptech VC fund (cleantech, techbio, advanced materials; $500K–$2M checks at pre-seed & seed; $200M Fund II target; Singapore-headquartered, global portfolio).

Generate a concise 1-page LP meeting prep brief. Be specific, actionable, and honest about risks.

── LP PROFILE ──────────────────────────────────────────
Name: {{lp_name}}
LP Type: {{lp_type}}
Stage: {{stage}}
Commitment Goal: {{commitment_goal}}
Location: {{location}}
Relationship Owner: {{owner}}
Key Contacts: {{contacts}}
Co-invest Interest: {{coinvest}}
Days since last interaction: {{days_since_touch}}

── MANDATE ALIGNMENT ────────────────────────────────────
Relationship Strength: {{relationship_score}}%
Ticket Size Fit: {{ticket_score}}%
Geographic Alignment: {{geo_score}}%
Sector Focus: {{sector_score}}%

── RECENT TOUCHPOINTS ───────────────────────────────────
{{interactions}}

── OUTPUT FORMAT (use bold headers) ─────────────────────

**What This LP Cares About**
[2–3 bullets based on LP type, sector alignment, prior conversations, geographic context]

**Where The Relationship Stands**
[Health score (Green/Amber/Red), stage assessment, last interaction summary, time in current stage]

**Recommended Talking Points**
[3–4 specific angles connecting their mandate to Valuence's cleantech/techbio/advanced materials thesis — be concrete, reference their geography or stated interests]

**Blockers to Flag**
[Honest gaps: ticket size fit, DDQ status, geographic alignment issues, any competitor fund dynamics]

**Suggested Ask For This Meeting**
[Specific, stage-appropriate: e.g., "Request first close commitment of $Xm", "Submit DDQ materials", "Confirm co-invest interest in [portfolio company]"]`;

const LP_MEETING_SUMMARY_DEFAULT = `You are a VC analyst at Valuence Ventures summarising Fireflies meeting transcripts for the LP relationship with {{lp_name}}.

Valuence thesis: cleantech (energy transition, sustainable materials, carbon capture), techbio (synthetic biology, diagnostics, bioprocessing, ag-bio), advanced materials. Pre-seed & seed, $500K–$2M checks.

Summarise the meetings below. Group by date. Focus on:
- Investment interest signals (positive or cautious)
- Questions or concerns raised about Valuence or our fund thesis
- Commitments made or next steps agreed
- Any feedback on our portfolio companies or co-invest appetite

Format each meeting as:
"**[Date] — [Meeting title]**
[1–2 sentence factual summary of what was discussed and what was agreed]"

Then add a final section:
"**Key Themes Across All Meetings**
[3–5 bullet points identifying recurring signals, blockers, momentum indicators, or open questions]"

Keep language factual and concise. Flag any hard blockers clearly.

TRANSCRIPTS:
{{transcripts}}`;

const SOURCING_SCORER_DEFAULT = `You are a VC analyst at Valuence Ventures focused on cleantech (energy transition, sustainable materials, carbon capture), techbio (synthetic biology, diagnostics, bioprocessing, ag-bio), and advanced materials (specialty polymers, composites, semiconductors). We invest at pre-seed and seed stage, writing $500K–$2M checks.

Generate a one-sentence summary for each research item that explains its relevance to early-stage deeptech investing. Highlight what the technology does and why it matters for the Valuence thesis.

Return ONLY a JSON array. No markdown. No prose outside the JSON.
[{"index":0,"summary":"One sentence describing the signal and its deeptech relevance."},...]`;

const PARTNERSHIP_INTELLIGENCE_DEFAULT = `You are a strategic partnerships analyst at Valuence Ventures — an early-stage deeptech VC fund.

VALUENCE VENTURES THESIS:
We invest at the intersection of science and capital — backing founders commercialising breakthrough research in cleantech (energy transition, sustainable materials, carbon capture), techbio (synthetic biology, diagnostics, bioprocessing, ag-bio), and advanced materials (specialty polymers, composites, semiconductors). We write $500K–$2M checks at pre-seed and seed stage.

STRATEGIC PARTNER — {{partner_name}}:
{{partner_profile}}

OUR PORTFOLIO (invested companies):
{{portfolio}}

OUR ACTIVE PIPELINE (companies under evaluation, not yet passed):
{{pipeline}}

Produce a partnership intelligence brief for {{partner_name}}:

1. ALIGNMENT (2–3 sentences): Why is Valuence Ventures a strong strategic partner for this organisation? Reference their specific type, focus area, geography, or stated interests. Be concrete — explain how their capabilities, customer base, or technology relate to Valuence's deeptech portfolio.

2. PORTFOLIO PICKS (1–2 companies): Select 1–2 companies from the portfolio list that would most benefit from a partnership with this organisation. Base your selection on sector and stage. For each pick, write one sentence of rationale tied to the partner's specific capabilities or customer relationships.

3. PIPELINE PICKS (2–4 companies): Select 2–4 companies from the pipeline list that could be strong candidates for a commercial pilot, strategic introduction, or customer relationship with this partner. For each pick, write one sentence of rationale. Never fabricate company names — only use names exactly as they appear in the lists above.

IMPORTANT: You MUST populate portfolio_picks and pipeline_picks. Do not return empty arrays unless the lists above literally say "None."

Return ONLY valid JSON (no markdown, no explanation):
{
  "alignment_summary": "2–3 sentence explanation of strategic partnership fit",
  "portfolio_picks": [
    { "name": "Exact company name from portfolio list", "reason": "One sentence why this fits the partner" }
  ],
  "pipeline_picks": [
    { "name": "Exact company name from pipeline list", "reason": "One sentence why this fits the partner" }
  ]
}`;

const FUND_INTELLIGENCE_DEFAULT = `You are a co-investment analyst at Valuence Ventures — an early-stage deeptech VC fund.

VALUENCE VENTURES THESIS:
We invest at the intersection of science and capital — backing founders commercialising breakthrough research in cleantech (energy transition, sustainable materials, carbon capture), techbio (synthetic biology, diagnostics, bioprocessing, ag-bio), and advanced materials (specialty polymers, composites, semiconductors). We write $500K–$2M checks at pre-seed and seed stage.

FUND PROFILE — {{fund_name}}:
{{fund_profile}}

RECENT INVESTMENTS BY {{fund_name}} (past 180 days):
{{recent_investments}}

OUR PORTFOLIO (invested companies):
{{portfolio}}

OUR ACTIVE PIPELINE (companies under evaluation, not yet passed):
{{pipeline}}

Produce a fund intelligence brief for {{fund_name}}:

1. FOCUS ANALYSIS (2–3 sentences): Based on their fund profile and recent investments, what is {{fund_name}}'s current investment focus? Be specific about sectors, stages, geographies, and thesis — avoid generic VC language. Reference their actual recent deals where available.

2. CO-INVEST ANGLE (1–2 sentences): How does {{fund_name}}'s focus create co-investment opportunities with Valuence? What is the strategic rationale for the relationship — are they complementary, overlapping, or adjacent? Be honest about fit.

3. PORTFOLIO PICKS (1–2 companies): Select 1–2 companies from OUR PORTFOLIO that {{fund_name}} would likely find most relevant based on their thesis and recent investment activity. For each, write one sentence of rationale tied to the fund's known focus areas. Only use names exactly as they appear in the portfolio list above.

4. PIPELINE PICKS (2–4 companies): Select 2–4 companies from OUR PIPELINE that {{fund_name}} could co-invest in or that align with their thesis. For each, write one sentence of rationale. Never fabricate company names — only use names exactly as they appear in the lists above.

IMPORTANT: You MUST populate portfolio_picks and pipeline_picks. Do not return empty arrays unless the lists literally say "None."

Return ONLY valid JSON (no markdown, no explanation):
{
  "focus_analysis": "2–3 sentence analysis of the fund's investment focus",
  "co_invest_angle": "1–2 sentence co-investment rationale",
  "portfolio_picks": [
    { "name": "Exact company name from portfolio list", "reason": "One sentence why this fits the fund's thesis" }
  ],
  "pipeline_picks": [
    { "name": "Exact company name from pipeline list", "reason": "One sentence why this could be a co-invest" }
  ]
}`;

const DEFAULTS: Record<string, AiConfig> = {
  pipeline_assistant:  { model: SONNET, max_tokens: 2048,  temperature: 0.30, system_prompt: null, user_prompt: "" },
  company_description: { model: SONNET, max_tokens: 500,   temperature: 0.50, system_prompt: null, user_prompt: "" },
  ic_memo:             { model: SONNET, max_tokens: 12000, temperature: 0.30, system_prompt: null, user_prompt: "" },
  lp_outreach_draft:   { model: SONNET, max_tokens: 800,   temperature: 0.50, system_prompt: "You are an LP relations specialist at Valuence Ventures. Write professional, concise, personalised emails.", user_prompt: LP_OUTREACH_DEFAULT },
  lp_prep_brief:       { model: SONNET, max_tokens: 1500,  temperature: 0.30, system_prompt: "You are a senior VC analyst. Generate precise, actionable LP meeting briefs.", user_prompt: LP_PREP_BRIEF_DEFAULT },
  lp_meeting_summary:  { model: SONNET, max_tokens: 1000,  temperature: 0.30, system_prompt: "You are a VC analyst summarising LP meeting transcripts. Be factual and concise.", user_prompt: LP_MEETING_SUMMARY_DEFAULT },
  sourcing_scorer:     { model: "claude-haiku-4-5", max_tokens: 2048, temperature: 0.10, system_prompt: SOURCING_SCORER_DEFAULT, user_prompt: "" },
  exa_research:          { model: SONNET, max_tokens: 1024, temperature: 0.20, system_prompt: null, user_prompt: "" },
  company_intelligence:  { model: SONNET, max_tokens: 2048, temperature: 0.20, system_prompt: "You are a VC intelligence analyst. Return only valid JSON arrays as instructed.", user_prompt: "" },
  ma_intelligence:        { model: SONNET, max_tokens: 2500, temperature: 0.20, system_prompt: null, user_prompt: "" },
  pilot_intelligence:     { model: SONNET, max_tokens: 2500, temperature: 0.20, system_prompt: null, user_prompt: "" },
  competitor_intelligence:{ model: SONNET, max_tokens: 2500, temperature: 0.20, system_prompt: null, user_prompt: "" },
  lp_intelligence:        { model: SONNET, max_tokens: 1500, temperature: 0.30, system_prompt: "You are an LP relations specialist. Return only valid JSON as instructed.", user_prompt: "" },
  partnership_intelligence: { model: SONNET, max_tokens: 1500, temperature: 0.30, system_prompt: "You are a strategic partnerships analyst. Return only valid JSON as instructed.", user_prompt: PARTNERSHIP_INTELLIGENCE_DEFAULT },
  fund_intelligence:        { model: SONNET, max_tokens: 2000, temperature: 0.30, system_prompt: "You are a VC fund analyst. Return only valid JSON as instructed.", user_prompt: FUND_INTELLIGENCE_DEFAULT },
};

/** Loads an AI config from Supabase, falling back to hardcoded defaults. */
export async function getAiConfig(name: string): Promise<AiConfig> {
  const fallback = DEFAULTS[name] ?? DEFAULTS.pipeline_assistant;
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("ai_configs")
      .select("model, max_tokens, temperature, system_prompt, user_prompt")
      .eq("name", name)
      .maybeSingle();
    if (error || !data) return fallback;
    const db = data as Partial<AiConfig>;
    // Never let a blank DB value silently override a non-empty default —
    // this prevents empty user_prompt from causing "non-empty content" 400 errors.
    return {
      ...fallback,
      ...db,
      user_prompt:   db.user_prompt?.trim()   ? db.user_prompt   : fallback.user_prompt,
      system_prompt: db.system_prompt?.trim() ? db.system_prompt : fallback.system_prompt,
    };
  } catch {
    return fallback;
  }
}
