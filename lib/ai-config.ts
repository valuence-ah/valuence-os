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

const DEFAULTS: Record<string, AiConfig> = {
  pipeline_assistant:  { model: SONNET, max_tokens: 2048, temperature: 0.30, system_prompt: null, user_prompt: "" },
  company_description: { model: SONNET, max_tokens: 500,  temperature: 0.50, system_prompt: null, user_prompt: "" },
  ic_memo:             { model: SONNET, max_tokens: 12000, temperature: 0.30, system_prompt: null, user_prompt: "" },
  lp_outreach_draft:   { model: SONNET, max_tokens: 800,  temperature: 0.50, system_prompt: null, user_prompt: "" },
  lp_prep_brief:       { model: SONNET, max_tokens: 1500, temperature: 0.30, system_prompt: null, user_prompt: "" },
  lp_meeting_summary:  { model: SONNET, max_tokens: 800,  temperature: 0.30, system_prompt: null, user_prompt: "" },
  sourcing_scorer:     { model: SONNET, max_tokens: 2048, temperature: 0.10, system_prompt: null, user_prompt: "" },
  exa_research:          { model: SONNET, max_tokens: 1024, temperature: 0.20, system_prompt: null, user_prompt: "" },
  company_intelligence:  { model: SONNET, max_tokens: 2048, temperature: 0.20, system_prompt: null, user_prompt: "" },
  ma_intelligence:        { model: SONNET, max_tokens: 2500, temperature: 0.20, system_prompt: null, user_prompt: "" },
  pilot_intelligence:     { model: SONNET, max_tokens: 2500, temperature: 0.20, system_prompt: null, user_prompt: "" },
  competitor_intelligence:{ model: SONNET, max_tokens: 2500, temperature: 0.20, system_prompt: null, user_prompt: "" },
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
    return { ...fallback, ...(data as Partial<AiConfig>) };
  } catch {
    return fallback;
  }
}
