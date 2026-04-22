"use client";
// ─── AI Config Panel ───────────────────────────────────────────────────────────
// Tabbed editor for all Claude-powered features.
// Left: vertical tab list  |  Right: config editor for selected tab
// Settings saved to ai_configs Supabase table and read by API routes at runtime.

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Save, Check, Bot, FileText, Sparkles, Mail, ClipboardList, Mic, Radar, Search, Building2, Handshake, Newspaper, Swords } from "lucide-react";
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
    description: "Claude Haiku that scores arXiv/SBIR/NSF/Exa signals for relevance (0–1) to the Valuence thesis. Lower temperature = more consistent scores.",
    variables: ["{{items}}"],
    promptLabel: "Scoring Instructions",
    hint: "Default: scores 0.0–1.0 where 1.0 = cleantech/techbio/advanced materials. Use Additional Instructions to emphasise or de-emphasise specific sectors.",
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
    description: "Generates the intelligence news feed shown on the Pipeline company detail panel. Leave prompt blank to use the built-in default (180-day cutoff, Exa signal prioritisation).",
    variables: ["{{company_name}}", "{{company_header}}", "{{website}}", "{{context}}", "{{cutoff_date}}"],
    promptLabel: "Prompt Template",
    hint: "Leave blank to use the built-in default prompt. If set, this becomes the full prompt sent to Claude — include the JSON output format block. Available variables: {{company_header}} = company name + website, {{context}} = description/stage/signals/meetings block, {{cutoff_date}} = 180-day cutoff (YYYY-MM-DD). Must return a JSON array with headline, source, date, summary, url fields.",
  },
  {
    name: "ma_intelligence",
    label: "M&A Intelligence",
    icon: Building2,
    color: "text-blue-600",
    bg: "bg-blue-50",
    description: "Generates M&A acquirer candidates for portfolio companies. Prompts read from DB at runtime.",
    variables: ["{{company_name}}", "{{description}}", "{{sectors}}", "{{stage}}", "{{kpi_context}}", "{{milestones}}", "{{lp_names}}"],
    promptLabel: "M&A User Prompt Template",
  },
  {
    name: "pilot_intelligence",
    label: "Pilot Intelligence",
    icon: Handshake,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    description: "Generates pilot/commercial partner candidates for portfolio companies. Prompts read from DB at runtime.",
    variables: ["{{company_name}}", "{{description}}", "{{sectors}}", "{{stage}}", "{{kpi_context}}", "{{milestones}}", "{{lp_names}}"],
    promptLabel: "Pilot User Prompt Template",
  },
  {
    name: "competitor_intelligence",
    label: "Competitor Landscape",
    icon: Swords,
    color: "text-red-600",
    bg: "bg-red-50",
    description: "Generates competitor landscape cards shown on the Portfolio overview tab. Leave prompt blank to use the built-in default.",
    variables: ["{{company_name}}", "{{description}}", "{{sectors}}", "{{stage}}", "{{kpi_context}}", "{{milestones}}"],
    promptLabel: "Prompt Template",
    hint: "Leave blank to use the built-in default. If set, this replaces the full prompt — include the JSON output format. Must return an array with entity_name, description, fit_level (high/medium/low), warmth fields.",
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
const SONNET = "claude-sonnet-4-6";
const TAB_DEFAULTS: Record<string, Omit<AiConfig, "id" | "name" | "label">> = {
  pipeline_assistant:  { model: SONNET, max_tokens: 2048,  temperature: 0.30, system_prompt: null, user_prompt: "" },
  company_description: { model: SONNET, max_tokens: 500,   temperature: 0.50, system_prompt: null, user_prompt: "" },
  ic_memo:             { model: SONNET, max_tokens: 12000, temperature: 0.30, system_prompt: null, user_prompt: "" },
  lp_outreach_draft:   { model: SONNET, max_tokens: 800,   temperature: 0.50, system_prompt: null, user_prompt: "" },
  lp_prep_brief:       { model: SONNET, max_tokens: 1500,  temperature: 0.30, system_prompt: null, user_prompt: "" },
  lp_meeting_summary:  { model: SONNET, max_tokens: 800,   temperature: 0.30, system_prompt: null, user_prompt: "" },
  sourcing_scorer:     { model: SONNET, max_tokens: 2048,  temperature: 0.10, system_prompt: null, user_prompt: "" },
  exa_research:        { model: SONNET, max_tokens: 1024,  temperature: 0.20, system_prompt: null, user_prompt: "" },
  company_intelligence:{ model: SONNET, max_tokens: 1024,  temperature: 0.20, system_prompt: "You are a VC intelligence analyst. Return only valid JSON arrays as instructed.", user_prompt: "" },
  ma_intelligence:        { model: SONNET, max_tokens: 2500,  temperature: 0.20, system_prompt: null, user_prompt: "" },
  pilot_intelligence:     { model: SONNET, max_tokens: 2500,  temperature: 0.20, system_prompt: null, user_prompt: "" },
  competitor_intelligence:{ model: SONNET, max_tokens: 2500,  temperature: 0.20, system_prompt: null, user_prompt: "" },
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
