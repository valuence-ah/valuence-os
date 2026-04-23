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
  partnership_intelligence: { model: SONNET, max_tokens: 1500, temperature: 0.30, system_prompt: "You are a strategic partnerships analyst. Return only valid JSON as instructed.", user_prompt: "" },
  fund_intelligence:        { model: SONNET, max_tokens: 2000, temperature: 0.30, system_prompt: "You are a VC fund analyst. Return only valid JSON as instructed.", user_prompt: "" },
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
