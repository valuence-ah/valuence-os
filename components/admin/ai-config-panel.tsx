"use client";
// ─── AI Config Panel ───────────────────────────────────────────────────────────
// Admin UI for editing Claude parameters and prompts for each AI feature.
// Settings are saved to the ai_configs table and read by API routes at runtime.

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Save, Check, Sparkles, FileText, Bot } from "lucide-react";

const MODELS = [
  { group: "Claude 4.6", options: [
    { value: "claude-sonnet-4-6",         label: "Claude Sonnet 4.6" },
    { value: "claude-opus-4-6",           label: "Claude Opus 4.6" },
  ]},
  { group: "Claude 4.5", options: [
    { value: "claude-opus-4-5",           label: "Claude Opus 4.5" },
    { value: "claude-sonnet-4-5-20251001",label: "Claude Sonnet 4.5" },
    { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  ]},
  { group: "Claude 4.1", options: [
    { value: "claude-opus-4-1",           label: "Claude Opus 4.1" },
  ]},
  { group: "Claude 4", options: [
    { value: "claude-opus-4-0",           label: "Claude Opus 4" },
    { value: "claude-sonnet-4-0",         label: "Claude Sonnet 4" },
  ]},
];

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

interface CardState {
  config: AiConfig;
  saving: boolean;
  saved: boolean;
}

const CONFIG_META: Record<string, { icon: React.ReactNode; description: string; variables: string[]; hint?: string }> = {
  pipeline_assistant: {
    icon: <Bot size={14} className="text-blue-600" />,
    description: "The Valuence AI Assistant chat widget in CRM/Pipeline. Controls model, tone, and custom instructions.",
    variables: [],
    hint: "System Instruction overrides the entire base prompt. Leave blank to use the default. Use 'Additional Instructions' (Prompt field) to append rules without replacing the full prompt — e.g. investment focus, response style, or fund-specific context.",
  },
  company_description: {
    icon: <FileText size={14} className="text-blue-500" />,
    description: "Generates the ~100-word company overview shown on each company card.",
    variables: ["{{company_name}}", "{{website}}", "{{keywords}}", "{{hq_city}}", "{{founded_year}}", "{{transcript_text}}"],
  },
  ic_memo: {
    icon: <Sparkles size={14} className="text-violet-500" />,
    description: "Generates the full IC Memo from company data, decks, and transcripts.",
    variables: ["{{company_name}}", "{{contacts}}", "{{interactions}}", "{{deals}}", "{{documents}}"],
  },
};

export function AiConfigPanel() {
  const supabase = createClient();
  const [cards, setCards] = useState<CardState[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("ai_configs")
      .select("*")
      .order("name")
      .then(({ data }) => {
        setCards((data ?? []).map(c => ({ config: c as AiConfig, saving: false, saved: false })));
        setLoading(false);
      });
  }, [supabase]);

  function update(name: string, field: keyof AiConfig, value: string | number) {
    setCards(prev => prev.map(c =>
      c.config.name === name
        ? { ...c, saved: false, config: { ...c.config, [field]: value } }
        : c
    ));
  }

  async function save(name: string) {
    const card = cards.find(c => c.config.name === name);
    if (!card) return;
    setCards(prev => prev.map(c => c.config.name === name ? { ...c, saving: true } : c));

    await supabase
      .from("ai_configs")
      .update({
        model:         card.config.model,
        max_tokens:    card.config.max_tokens,
        temperature:   card.config.temperature,
        system_prompt: card.config.system_prompt,
        user_prompt:   card.config.user_prompt,
        updated_at:    new Date().toISOString(),
      })
      .eq("name", name);

    setCards(prev => prev.map(c =>
      c.config.name === name ? { ...c, saving: false, saved: true } : c
    ));
    setTimeout(() => {
      setCards(prev => prev.map(c => c.config.name === name ? { ...c, saved: false } : c));
    }, 2500);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400 gap-2 text-sm">
        <Loader2 size={16} className="animate-spin" /> Loading AI configs…
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-120px)]">
      <div>
        <h2 className="text-sm font-semibold text-slate-800">AI Configuration</h2>
        <p className="text-xs text-slate-500 mt-0.5">Edit the Claude model, parameters, and prompts for each AI feature. Changes take effect immediately on next use.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {cards.map(({ config, saving, saved }) => {
          const meta = CONFIG_META[config.name];
          return (
            <div key={config.name} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-5">
              {/* Card header */}
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center">
                    {meta?.icon}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{config.label}</p>
                    <p className="text-[11px] text-slate-400">{meta?.description}</p>
                  </div>
                </div>
                <button
                  onClick={() => save(config.name)}
                  disabled={saving}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                    saved
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : "bg-blue-600 border-blue-600 text-white hover:bg-blue-500"
                  } disabled:opacity-50`}
                >
                  {saving ? <Loader2 size={11} className="animate-spin" /> : saved ? <Check size={11} /> : <Save size={11} />}
                  {saving ? "Saving…" : saved ? "Saved" : "Save"}
                </button>
              </div>

              {/* Model */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Model</label>
                <select
                  value={config.model}
                  onChange={e => update(config.name, "model", e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  {MODELS.map(group => (
                    <optgroup key={group.group} label={group.group}>
                      {group.options.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Max Tokens + Temperature side by side */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Max Tokens</label>
                  <input
                    type="number"
                    min={100}
                    max={32000}
                    step={100}
                    value={config.max_tokens}
                    onChange={e => update(config.name, "max_tokens", parseInt(e.target.value) || 1000)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide flex justify-between">
                    <span>Temperature</span>
                    <span className="font-normal text-slate-400">{Number(config.temperature).toFixed(2)}</span>
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={config.temperature}
                    onChange={e => update(config.name, "temperature", parseFloat(e.target.value))}
                    className="w-full mt-2 accent-blue-600"
                  />
                  <div className="flex justify-between text-[10px] text-slate-300">
                    <span>Precise (0)</span>
                    <span>Creative (1)</span>
                  </div>
                </div>
              </div>

              {/* System Prompt */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">System Instruction</label>
                <textarea
                  rows={6}
                  value={config.system_prompt ?? ""}
                  onChange={e => update(config.name, "system_prompt", e.target.value)}
                  placeholder="Optional — overrides the default system prompt entirely. Leave blank to use the built-in prompt."
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y font-mono leading-relaxed"
                />
              </div>

              {/* User Prompt */}
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                  {config.name === "pipeline_assistant" ? "Additional Instructions" : "Prompt / Writing Rules"}
                </label>
                <textarea
                  rows={config.name === "pipeline_assistant" ? 6 : 10}
                  value={config.user_prompt}
                  onChange={e => update(config.name, "user_prompt", e.target.value)}
                  placeholder={config.name === "pipeline_assistant"
                    ? "Append extra rules or focus areas to the assistant. E.g. 'Always prioritise cleantech deals', 'Default currency is USD', 'Response language: English'…"
                    : ""}
                  className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y font-mono leading-relaxed"
                />
                {meta?.hint && (
                  <p className="text-[10px] text-slate-400 leading-relaxed">{meta.hint}</p>
                )}
                {meta?.variables && meta.variables.length > 0 && (
                  <p className="text-[10px] text-slate-400">
                    Available variables: {meta.variables.map(v => (
                      <code key={v} className="bg-slate-100 px-1 rounded text-slate-500 mr-1">{v}</code>
                    ))}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
