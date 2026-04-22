"use client";
// ─── AI Config Panel ───────────────────────────────────────────────────────────
// Tabbed editor for all Claude-powered features.
// Left: vertical tab list  |  Right: config editor for selected tab
// Settings saved to ai_configs Supabase table and read by API routes at runtime.

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Save, Check, Bot, FileText, Sparkles, Mail, ClipboardList, Mic, Radar, Search, Building2, Handshake, Newspaper, Swords, Users } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Model options ─────────────────────────────────────────────────────────────
const MODELS = [
  { group: "Claude Sonnet 4.6 ✦ recommended", options: [
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  ]},
  { group: "Claude Sonnet 4.5", options: [
    { value: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
  ]},
  { group: "Claude Haiku 4.5 (fast / cheap)", options: [
    { value: "claude-haiku-4-5",  label: "Claude Haiku 4.5" },
  ]},
  { group: "Claude Opus 4.5 (most capable)", options: [
    { value: "claude-opus-4-5",   label: "Claude Opus 4.5" },
  ]},
];

// ── Tab metadata (order + display) ───────────────────────────────────────────
const TABS = [
  {
    name: "pipeline_assistant",
    label: "Valuence Assistant",
    icon: Bot,
    color: "text-blue-600",
    bg: "bg-blue-50",
    description: "The AI chat (/chat) with live fund data. Controls model, tone, and any custom instructions appended to the base prompt.",
    variables: [],
    hint: "Use 'System Instruction' to override the entire base prompt, or leave blank to keep the built-in fund context prompt. Use 'Additional Instructions' to append rules without replacing it — e.g. preferred response language, investment focus, currency.",
    promptLabel: "Additional Instructions",
  },
  {
    name: "company_description",
    label: "Company Description",
    icon: FileText,
    color: "text-sky-600",
    bg: "bg-sky-50",
    description: "Generates the ~100-word company overview shown on each company card.",
    variables: ["{{company_name}}", "{{website}}", "{{keywords}}", "{{hq_city}}", "{{founded_year}}", "{{transcript_text}}"],
    promptLabel: "Prompt / Writing Rules",
  },
  {
    name: "ic_memo",
    label: "IC Memo",
    icon: Sparkles,
    color: "text-violet-600",
    bg: "bg-violet-50",
    description: "Generates the full Investment Committee memo from company data, decks, and transcripts.",
    variables: ["{{company_name}}", "{{contacts}}", "{{interactions}}", "{{deals}}", "{{documents}}"],
    promptLabel: "Prompt / Writing Rules",
  },
  {
    name: "lp_outreach_draft",
    label: "LP Outreach Email",
    icon: Mail,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    description: "Drafts personalised LP outreach emails from the LP tracker page. Appended to the base draft instructions.",
    variables: ["{{company_name}}", "{{contact_name}}", "{{stage}}", "{{lp_type}}", "{{last_interaction}}", "{{sender_name}}"],
    promptLabel: "Additional Instructions",
  },
  {
    name: "lp_prep_brief",
    label: "LP Meeting Brief",
    icon: ClipboardList,
    color: "text-amber-600",
    bg: "bg-amber-50",
    description: "Generates a 1-page LP meeting prep brief with talking points, blockers, and a suggested ask.",
    variables: ["{{company_name}}", "{{contacts}}", "{{interactions}}", "{{mandate_scores}}", "{{stage}}"],
    promptLabel: "Additional Instructions",
  },
  {
    name: "lp_meeting_summary",
    label: "LP Meeting Summary",
    icon: Mic,
    color: "text-orange-600",
    bg: "bg-orange-50",
    description: "Summarises Fireflies transcripts for an LP — pulled from the LP tracker's meeting history panel.",
    variables: ["{{company_name}}", "{{transcripts}}"],
    promptLabel: "Additional Instructions",
  },
  {
    name: "sourcing_scorer",
    label: "Sourcing Scorer",
    icon: Radar,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    description: "Controls the Claude model that generates one-sentence summaries for every sourcing signal (arXiv, SBIR, NSF, Exa, etc.). The System Instruction sets the analyst persona and output format — it is the full prompt for summary generation. Lower temperature = more consistent, factual summaries.",
    variables: ["{{items}}"],
    promptLabel: "Additional Instructions",
    hint: "The System Instruction IS the full summary prompt — edit it to change how Claude describes each signal. Leave 'Additional Instructions' blank unless you want to append extra rules. Haiku is recommended for speed and cost; Sonnet for higher-quality summaries.",
  },
  {
    name: "exa_research",
    label: "Exa Company Research",
    icon: Search,
    color: "text-teal-600",
    bg: "bg-teal-50",
    description: "Extracts structured insights (description, funding, tech highlights) from Exa search results for a specific company.",
    variables: ["{{company_name}}", "{{sectors}}", "{{research}}"],
    promptLabel: "Extraction Instructions",
  },
  {
    name: "company_intelligence",
    label: "Company Intelligence",
    icon: Newspaper,
    color: "text-rose-600",
    bg: "bg-rose-50",
    description: "Generates the intelligence news feed shown on the Pipeline company detail panel AND the LP Company News tab. Leave prompt blank to use the built-in default. The 180-day cutoff date ({{cutoff_date}}) is always calculated dynamically from today.",
    variables: ["{{company_name}}", "{{company_header}}", "{{website}}", "{{context}}", "{{cutoff_date}}"],
    promptLabel: "Prompt Template",
    hint: "Leave blank to use the built-in default prompt. If set, this becomes the full prompt — include the JSON output format block. Variables: {{company_header}} = name + website, {{context}} = description/stage/signals/meetings, {{cutoff_date}} = dynamically calculated 180 days before today (YYYY-MM-DD). Must return a JSON array with headline, source, date, summary, url fields. This prompt is used for both startup companies (Pipeline) and LP companies (Company News tab).",
  },
  {
    name: "ma_intelligence",
    label: "M&A Intelligence",
    icon: Building2,
    color: "text-blue-600",
    bg: "bg-blue-50",
    description: "Generates M&A acquirer candidates for portfolio companies. Prompts read from DB at runtime.",
    variables: ["{{company_name}}", "{{description}}", "{{sectors}}", "{{stage}}", "{{kpi_context}}", "{{milestones}}", "{{lp_names}}", "{{documents}}"],
    promptLabel: "M&A User Prompt Template",
    hint: "{{documents}} injects extracted text from the company's pitch deck and data room documents (up to 5 most recent, ~1500 chars each). Use it to instruct Claude to reference the company's own materials before identifying acquirers.",
  },
  {
    name: "pilot_intelligence",
    label: "Pilot Intelligence",
    icon: Handshake,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    description: "Generates pilot/commercial partner candidates for portfolio companies. Prompts read from DB at runtime.",
    variables: ["{{company_name}}", "{{description}}", "{{sectors}}", "{{stage}}", "{{kpi_context}}", "{{milestones}}", "{{lp_names}}", "{{documents}}"],
    promptLabel: "Pilot User Prompt Template",
    hint: "{{documents}} injects extracted text from the company's pitch deck and data room documents (up to 5 most recent, ~1500 chars each). Use it to instruct Claude to reference the company's own materials before identifying partners.",
  },
  {
    name: "competitor_intelligence",
    label: "Competitor Landscape",
    icon: Swords,
    color: "text-red-600",
    bg: "bg-red-50",
    description: "Generates competitor landscape cards shown on the Portfolio overview tab. Leave prompt blank to use the built-in default.",
    variables: ["{{company_name}}", "{{description}}", "{{sectors}}", "{{stage}}", "{{kpi_context}}", "{{milestones}}", "{{documents}}"],
    promptLabel: "Prompt Template",
    hint: "Leave blank to use the built-in default. If set, this replaces the full prompt — include the JSON output format. Must return an array with entity_name, description, fit_level (high/medium/low), warmth fields. {{documents}} injects extracted text from the company's pitch deck and data room (up to 5 most recent docs, ~1500 chars each) — use this to ground competitors in the company's actual technology.",
  },
  {
    name: "lp_intelligence",
    label: "LP Intelligence",
    icon: Users,
    color: "text-purple-600",
    bg: "bg-purple-50",
    description: "Powers the Intelligence tab in CRM/LPs. Generates an LP-specific brief: (1) why our fund aligns with this LP, (2) 1–2 portfolio companies to highlight, (3) 2–5 pipeline companies that fit their mandate. Run per LP — each output is tailored to the selected LP.",
    variables: ["{{lp_name}}", "{{lp_profile}}", "{{portfolio}}", "{{pipeline}}"],
    promptLabel: "Prompt Template",
    hint: "Leave blank to use the built-in default. Variables: {{lp_name}} = LP company name, {{lp_profile}} = LP type/description/sectors/location block, {{portfolio}} = bullet list of our portfolio companies, {{pipeline}} = bullet list of active pipeline (status ≠ passed/exited). Must return JSON with fields: alignment_summary (string), portfolio_picks (array of {name, reason}), pipeline_picks (array of {name, reason}). Names must match exactly — they are looked up to attach sector/stage/description data.",
  },
] as const;

type TabName = typeof TABS[number]["name"];

// ── Types ─────────────────────────────────────────────────────────────────────
interface AiConfig {
  id: string;
  name: string;
  label: string;
  model: string;
  max_tokens: number;
  temperature: number;
  system_prompt: string | null;
  user_prompt: string;
}

// ── Per-tab defaults (used when the DB row doesn't exist yet) ─────────────────
// These mirror the server-side DEFAULTS in lib/ai-config.ts exactly.
const SONNET = "claude-sonnet-4-6";
const HAIKU  = "claude-haiku-3-5";

const LP_OUTREACH_PROMPT = `You are {{sender_name}}, a partner at Valuence Ventures — an early-stage deeptech VC fund investing at the intersection of science and capital. We back founders commercialising breakthrough research in cleantech (energy transition, sustainable materials, carbon capture), techbio (synthetic biology, diagnostics, bioprocessing, ag-bio), and advanced materials (specialty polymers, composites, semiconductors). We write $500K–$2M checks at pre-seed and seed stage.

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

const LP_PREP_BRIEF_PROMPT = `You are a senior analyst at Valuence Ventures — an early-stage deeptech VC fund (cleantech, techbio, advanced materials; $500K–$2M checks at pre-seed & seed; $200M Fund II target; Singapore-headquartered, global portfolio).

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

const LP_MEETING_SUMMARY_PROMPT = `You are a VC analyst at Valuence Ventures summarising Fireflies meeting transcripts for the LP relationship with {{lp_name}}.

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

const SOURCING_SCORER_SYSTEM = `You are a VC analyst at Valuence Ventures focused on cleantech (energy transition, sustainable materials, carbon capture), techbio (synthetic biology, diagnostics, bioprocessing, ag-bio), and advanced materials (specialty polymers, composites, semiconductors). We invest at pre-seed and seed stage, writing $500K–$2M checks.

Generate a one-sentence summary for each research item that explains its relevance to early-stage deeptech investing. Highlight what the technology does and why it matters for the Valuence thesis.

Return ONLY a JSON array. No markdown. No prose outside the JSON.
[{"index":0,"summary":"One sentence describing the signal and its deeptech relevance."},...]`;

const TAB_DEFAULTS: Record<string, Omit<AiConfig, "id" | "name" | "label">> = {
  pipeline_assistant:  { model: SONNET, max_tokens: 2048,  temperature: 0.30, system_prompt: null, user_prompt: "" },
  company_description: { model: SONNET, max_tokens: 500,   temperature: 0.50, system_prompt: null, user_prompt: "" },
  ic_memo:             { model: SONNET, max_tokens: 12000, temperature: 0.30, system_prompt: null, user_prompt: "" },
  lp_outreach_draft:   { model: SONNET, max_tokens: 800,   temperature: 0.50, system_prompt: "You are an LP relations specialist at Valuence Ventures. Write professional, concise, personalised emails.", user_prompt: LP_OUTREACH_PROMPT },
  lp_prep_brief:       { model: SONNET, max_tokens: 1500,  temperature: 0.30, system_prompt: "You are a senior VC analyst. Generate precise, actionable LP meeting briefs.", user_prompt: LP_PREP_BRIEF_PROMPT },
  lp_meeting_summary:  { model: SONNET, max_tokens: 1000,  temperature: 0.30, system_prompt: "You are a VC analyst summarising LP meeting transcripts. Be factual and concise.", user_prompt: LP_MEETING_SUMMARY_PROMPT },
  sourcing_scorer:     { model: HAIKU,  max_tokens: 2048,  temperature: 0.10, system_prompt: SOURCING_SCORER_SYSTEM, user_prompt: "" },
  exa_research:        { model: SONNET, max_tokens: 1024,  temperature: 0.20, system_prompt: null, user_prompt: "" },
  company_intelligence:{ model: SONNET, max_tokens: 1024,  temperature: 0.20, system_prompt: "You are a VC intelligence analyst. Return only valid JSON arrays as instructed.", user_prompt: "" },
  ma_intelligence:        { model: SONNET, max_tokens: 2500,  temperature: 0.20, system_prompt: null, user_prompt: "" },
  pilot_intelligence:     { model: SONNET, max_tokens: 2500,  temperature: 0.20, system_prompt: null, user_prompt: "" },
  competitor_intelligence:{ model: SONNET, max_tokens: 2500,  temperature: 0.20, system_prompt: null, user_prompt: "" },
  lp_intelligence:        { model: SONNET, max_tokens: 1500,  temperature: 0.30, system_prompt: "You are an LP relations specialist. Return only valid JSON as instructed.", user_prompt: "" },
};

function makeDefault(name: string, label: string): AiConfig {
  const d = TAB_DEFAULTS[name] ?? TAB_DEFAULTS.pipeline_assistant;
  return { id: "", name, label, ...d };
}

// ── Component ─────────────────────────────────────────────────────────────────
export function AiConfigPanel() {
  const supabase = createClient();
  const [configs, setConfigs]     = useState<Record<string, AiConfig>>({});
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState<TabName>("pipeline_assistant");
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);

  useEffect(() => {
    supabase
      .from("ai_configs")
      .select("*")
      .then(({ data }) => {
        const map: Record<string, AiConfig> = {};
        for (const row of (data ?? []) as AiConfig[]) map[row.name] = row;
        // Fill in any tabs not yet in the DB with hardcoded defaults
        for (const t of TABS) {
          if (!map[t.name]) map[t.name] = makeDefault(t.name, t.label);
        }
        setConfigs(map);
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update<K extends keyof AiConfig>(field: K, value: AiConfig[K]) {
    setConfigs(prev => ({
      ...prev,
      [activeTab]: { ...prev[activeTab], [field]: value },
    }));
    setSaved(false);
  }

  async function save() {
    const cfg = configs[activeTab];
    if (!cfg) return;
    setSaving(true);
    // upsert so it creates the row if it doesn't exist yet
    await supabase
      .from("ai_configs")
      .upsert({
        name:          activeTab,
        label:         TABS.find(t => t.name === activeTab)?.label ?? activeTab,
        model:         cfg.model,
        max_tokens:    cfg.max_tokens,
        temperature:   cfg.temperature,
        system_prompt: cfg.system_prompt,
        user_prompt:   cfg.user_prompt,
        updated_at:    new Date().toISOString(),
      }, { onConflict: "name" });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const tab   = TABS.find(t => t.name === activeTab)!;
  const cfg   = configs[activeTab];
  const Icon  = tab.icon;

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left: tab list ── */}
      <div className="w-52 flex-shrink-0 border-r border-slate-200 bg-slate-50 overflow-y-auto py-3">
        {TABS.map(t => {
          const TIcon = t.icon;
          const isActive = t.name === activeTab;
          return (
            <button
              key={t.name}
              onClick={() => { setActiveTab(t.name); setSaved(false); }}
              className={cn(
                "w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors",
                isActive
                  ? "bg-white border-r-2 border-blue-600 text-slate-900 font-medium"
                  : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
              )}
            >
              <span className={cn("w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0", t.bg)}>
                <TIcon size={11} className={t.color} />
              </span>
              <span className="text-xs leading-tight">{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Right: editor ── */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-slate-400 gap-2 text-sm">
            <Loader2 size={16} className="animate-spin" /> Loading…
          </div>
        ) : cfg ? (
          <div className="max-w-4xl space-y-6">

            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0", tab.bg)}>
                  <Icon size={16} className={tab.color} />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">{tab.label}</h2>
                  <p className="text-xs text-slate-400 mt-0.5 max-w-md">{tab.description}</p>
                </div>
              </div>
              <button
                onClick={save}
                disabled={saving}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border transition-all",
                  saved
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "bg-blue-600 border-blue-600 text-white hover:bg-blue-500"
                )}
              >
                {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? <Check size={12} /> : <Save size={12} />}
                {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
              </button>
            </div>

            {/* Model */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Model</label>
              <select
                value={cfg.model}
                onChange={e => update("model", e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                {MODELS.map(g => (
                  <optgroup key={g.group} label={g.group}>
                    {g.options.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {/* Max Tokens + Temperature */}
            <div className="grid grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Max Tokens</label>
                <input
                  type="number"
                  min={100} max={32000} step={100}
                  value={cfg.max_tokens}
                  onChange={e => update("max_tokens", parseInt(e.target.value) || 1000)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <p className="text-[10px] text-slate-400">100 – 32,000</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide flex justify-between">
                  <span>Temperature</span>
                  <span className="font-normal text-slate-400">{Number(cfg.temperature).toFixed(2)}</span>
                </label>
                <input
                  type="range" min={0} max={1} step={0.05}
                  value={cfg.temperature}
                  onChange={e => update("temperature", parseFloat(e.target.value))}
                  className="w-full mt-2 accent-blue-600"
                />
                <div className="flex justify-between text-[10px] text-slate-300">
                  <span>Precise (0)</span>
                  <span>Creative (1)</span>
                </div>
              </div>
            </div>

            {/* System Prompt */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">System Instruction</label>
              <textarea
                rows={5}
                value={cfg.system_prompt ?? ""}
                onChange={e => update("system_prompt", e.target.value || null)}
                placeholder="Optional — overrides the default system prompt entirely. Leave blank to use the built-in prompt."
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y font-mono leading-relaxed"
              />
            </div>

            {/* User Prompt */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{tab.promptLabel}</label>
              <textarea
                rows={8}
                value={cfg.user_prompt}
                onChange={e => update("user_prompt", e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y font-mono leading-relaxed"
              />
              {"hint" in tab && tab.hint && (
                <p className="text-[10px] text-slate-400 leading-relaxed">{tab.hint}</p>
              )}
              {tab.variables.length > 0 && (
                <p className="text-[10px] text-slate-400">
                  Available variables:{" "}
                  {tab.variables.map(v => (
                    <code key={v} className="bg-slate-100 px-1 rounded text-slate-500 mr-1">{v}</code>
                  ))}
                </p>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
