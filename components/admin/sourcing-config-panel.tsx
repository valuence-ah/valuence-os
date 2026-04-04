"use client";
// ─── Sourcing Agent Config Panel ─────────────────────────────────────────────
// Admin panel to configure all sourcing agent parameters stored in agent_configs.

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Save, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";

interface AgentConfig {
  agent_name: string;
  label: string;
  config: Record<string, unknown>;
  last_run_at?: string | null;
  last_run_saved?: number | null;
}

const AGENT_LABELS: Record<string, string> = {
  arxiv:            "arXiv",
  biorxiv:          "bioRxiv / medRxiv",
  sbir:             "SBIR",
  nsf:              "NSF",
  exa:              "Exa AI",
  uspto:            "USPTO Patents",
  semantic_scholar: "Semantic Scholar",
  nih_reporter:     "NIH Reporter",
  nrel:             "NREL",
};

function timeAgoShort(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function ConfigField({
  label, configKey, value, onChange, hint, type = "text",
}: {
  label: string; configKey: string; value: unknown; onChange: (key: string, val: unknown) => void;
  hint?: string; type?: "text" | "number" | "array" | "boolean";
}) {
  if (type === "boolean") {
    return (
      <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
        <div>
          <div className="text-xs font-medium text-slate-700">{label}</div>
          {hint && <div className="text-[10px] text-slate-400">{hint}</div>}
        </div>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={e => onChange(configKey, e.target.checked)}
          className="rounded border-slate-300"
        />
      </div>
    );
  }

  if (type === "array") {
    const arr = Array.isArray(value) ? value : [];
    return (
      <div className="py-2 border-b border-slate-100 last:border-0">
        <div className="text-xs font-medium text-slate-700 mb-1">{label}</div>
        {hint && <div className="text-[10px] text-slate-400 mb-1">{hint}</div>}
        <textarea
          rows={3}
          className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono"
          value={arr.join("\n")}
          onChange={e => onChange(configKey, e.target.value.split("\n").map(s => s.trim()).filter(Boolean))}
          placeholder="One item per line"
        />
      </div>
    );
  }

  if (type === "number") {
    return (
      <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
        <div>
          <div className="text-xs font-medium text-slate-700">{label}</div>
          {hint && <div className="text-[10px] text-slate-400">{hint}</div>}
        </div>
        <input
          type="number"
          step="any"
          className="w-24 text-xs border border-slate-200 rounded px-2 py-1 text-right focus:outline-none focus:ring-1 focus:ring-blue-400"
          value={Number(value)}
          onChange={e => onChange(configKey, isNaN(parseFloat(e.target.value)) ? 0 : parseFloat(e.target.value))}
        />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
      <div>
        <div className="text-xs font-medium text-slate-700">{label}</div>
        {hint && <div className="text-[10px] text-slate-400">{hint}</div>}
      </div>
      <input
        type="text"
        className="w-40 text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
        value={String(value ?? "")}
        onChange={e => onChange(configKey, e.target.value)}
      />
    </div>
  );
}

// Field definitions per agent
const AGENT_FIELDS: Record<string, { key: string; label: string; type: "text" | "number" | "array" | "boolean"; hint?: string }[]> = {
  arxiv: [
    { key: "queries", label: "Search Queries", type: "array", hint: "One query per line" },
    { key: "maxResults", label: "Max Results per Query", type: "number" },
    { key: "minScore", label: "Min Relevance Score (0–1)", type: "number", hint: "Signals below this threshold are skipped" },
  ],
  biorxiv: [
    { key: "keywords", label: "Keywords", type: "array", hint: "One keyword per line — used to filter preprints" },
    { key: "lookbackDays", label: "Lookback (days)", type: "number" },
    { key: "minScore", label: "Min Relevance Score (0–1)", type: "number" },
  ],
  sbir: [
    { key: "keywords", label: "Keywords", type: "array", hint: "One keyword per line" },
    { key: "rowsPerKeyword", label: "Results per Keyword", type: "number" },
    { key: "minScore", label: "Min Relevance Score (0–1)", type: "number" },
  ],
  nsf: [
    { key: "keywords", label: "Keywords", type: "array", hint: "One keyword per line" },
    { key: "resultsPerPage", label: "Results per Page", type: "number" },
    { key: "lookbackMonths", label: "Lookback (months)", type: "number" },
    { key: "minScore", label: "Min Relevance Score (0–1)", type: "number" },
  ],
  exa: [
    { key: "queries", label: "Search Queries", type: "array", hint: "One query per line" },
    { key: "numResults", label: "Results per Query", type: "number" },
    { key: "lookbackDays", label: "Lookback (days)", type: "number" },
    { key: "minScore", label: "Min Relevance Score (0–1)", type: "number" },
  ],
  uspto: [
    { key: "cpcCodes", label: "CPC Codes", type: "array", hint: "One CPC code per line (e.g. C12, A61K)" },
    { key: "maxResults", label: "Max Results per CPC", type: "number" },
    { key: "lookbackDays", label: "Lookback (days)", type: "number" },
    { key: "minScore", label: "Min Relevance Score (0–1)", type: "number" },
  ],
  semantic_scholar: [
    { key: "queries", label: "Search Queries", type: "array", hint: "One query per line" },
    { key: "fieldsOfStudy", label: "Fields of Study", type: "array", hint: "One field per line" },
    { key: "maxResults", label: "Max Results per Query", type: "number" },
    { key: "lookbackDays", label: "Lookback (days)", type: "number" },
    { key: "minCitations", label: "Min Citations", type: "number" },
    { key: "minScore", label: "Min Relevance Score (0–1)", type: "number" },
  ],
  nih_reporter: [
    { key: "searchTerms", label: "Search Terms", type: "array", hint: "One term per line" },
    { key: "agencies", label: "NIH Agencies", type: "array", hint: "e.g. NIGMS, NIEHS, NCI" },
    { key: "fiscalYears", label: "Fiscal Years", type: "array", hint: "e.g. 2024\n2025" },
    { key: "minFundingAmt", label: "Min Award Amount ($)", type: "number" },
    { key: "maxResults", label: "Max Results per Term", type: "number" },
    { key: "minScore", label: "Min Relevance Score (0–1)", type: "number" },
  ],
  nrel: [
    { key: "topics", label: "Topics", type: "array", hint: "One topic per line" },
    { key: "maxResults", label: "Max Results per Topic", type: "number" },
    { key: "lookbackDays", label: "Lookback (days)", type: "number" },
    { key: "apiKey", label: "NREL API Key", type: "text" },
    { key: "minScore", label: "Min Relevance Score (0–1)", type: "number" },
  ],
};

function AgentCard({ agent, onSaved }: { agent: AgentConfig; onSaved: (name: string, config: Record<string, unknown>) => void }) {
  const supabase = createClient();
  const [config, setConfig] = useState({ ...agent.config });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<string | null>(null);

  const fields = AGENT_FIELDS[agent.agent_name] ?? [];

  function handleChange(key: string, val: unknown) {
    setConfig(prev => ({ ...prev, [key]: val }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    await supabase.from("agent_configs").update({ config }).eq("agent_name", agent.agent_name);
    setSaving(false);
    setSaved(true);
    onSaved(agent.agent_name, config);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleReset() {
    setConfig({ ...agent.config });
    setSaved(false);
  }

  async function handleRunNow() {
    const endpointMap: Record<string, string> = {
      arxiv: "/api/agents/arxiv", sbir: "/api/agents/sbir",
      nsf: "/api/agents/nsf", exa: "/api/agents/exa",
      uspto: "/api/agents/uspto", semantic_scholar: "/api/agents/semantic-scholar",
      nih_reporter: "/api/agents/nih", nrel: "/api/agents/nrel",
    };
    const endpoint = endpointMap[agent.agent_name];
    if (!endpoint) return;
    setRunning(true);
    setRunResult(null);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json() as { saved?: number; fetched?: number };
      setRunResult(`Saved ${data.saved ?? 0} new signals`);
    } catch {
      setRunResult("Run failed");
    }
    setRunning(false);
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-slate-800">{AGENT_LABELS[agent.agent_name] ?? agent.label}</span>
          {agent.last_run_at && (
            <span className="text-[10px] text-slate-400">Last run: {timeAgoShort(agent.last_run_at)} · {agent.last_run_saved ?? 0} saved</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={e => { e.stopPropagation(); handleRunNow(); }}
            disabled={running}
            className="flex items-center gap-1 px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg disabled:opacity-50 transition-colors"
          >
            {running ? <Loader2 size={10} className="animate-spin" /> : null}
            {running ? "Running…" : "Run Now"}
          </button>
          {runResult && <span className="text-xs text-green-600">{runResult}</span>}
          {expanded ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pt-2 bg-slate-50 border-t border-slate-100">
          <div className="space-y-0">
            {fields.map(f => (
              <ConfigField
                key={f.key}
                label={f.label}
                configKey={f.key}
                value={config[f.key]}
                onChange={handleChange}
                hint={f.hint}
                type={f.type}
              />
            ))}
          </div>
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
              {saving ? "Saving…" : saved ? "Saved!" : "Save Changes"}
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 text-xs rounded-lg hover:bg-slate-50 transition-colors"
            >
              <RotateCcw size={11} /> Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SourcingConfigPanel() {
  const supabase = createClient();
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("agent_configs")
      .select("agent_name, label, config, last_run_at, last_run_saved")
      .order("agent_name")
      .then(({ data }) => {
        setAgents((data as AgentConfig[]) ?? []);
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSaved(name: string, config: Record<string, unknown>) {
    setAgents(prev => prev.map(a => a.agent_name === name ? { ...a, config } : a));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 max-w-3xl">
      <div>
        <h2 className="text-base font-semibold text-slate-800">Sourcing Agent Configuration</h2>
        <p className="text-xs text-slate-500 mt-0.5">Configure parameters for each sourcing agent. Changes take effect on the next run.</p>
      </div>

      <div className="space-y-3">
        {agents.map(agent => (
          <AgentCard key={agent.agent_name} agent={agent} onSaved={handleSaved} />
        ))}
      </div>

      {agents.length === 0 && (
        <div className="text-center py-8 text-sm text-slate-400">
          No agent configurations found. Run the DB migration to initialize defaults.
        </div>
      )}

      {/* Scoring rubric */}
      <div className="mt-2 border border-slate-200 rounded-xl p-5 bg-white">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-3">
          Scoring criteria (0–10 scale · deterministic)
        </p>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left pb-2 text-slate-500 font-medium">Criterion</th>
              <th className="text-right pb-2 text-slate-500 font-medium pr-6">Max pts</th>
              <th className="text-left pb-2 pl-4 text-slate-500 font-medium">How scored</th>
            </tr>
          </thead>
          <tbody className="text-slate-700">
            {[
              { label: "Thesis keyword match", max: 3, how: "1 pt per matching thesis keyword (max 3)" },
              { label: "Stage fit",            max: 2, how: "Pre-seed / Seed = 2 · Unknown = 1 · Series A+ = 0" },
              { label: "Sector fit",           max: 2, how: "Cleantech / Biotech / Adv. Materials = 2 · Adjacent = 1 · Other = 0" },
              { label: "Geography fit",        max: 1, how: "US / Singapore / Korea / Japan = 1 · Other = 0" },
              { label: "Recency",              max: 1, how: "Published within 30 days = 1" },
              { label: "Source quality",       max: 1, how: "Peer-reviewed / govt (arXiv, NSF, SBIR, NIH…) = 1 · News = 0" },
            ].map(row => (
              <tr key={row.label} className="border-b border-slate-100 last:border-0">
                <td className="py-2 font-medium">{row.label}</td>
                <td className="py-2 text-right pr-6 font-bold text-slate-800">{row.max}</td>
                <td className="py-2 pl-4 text-slate-400">{row.how}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200">
              <td className="pt-2 font-semibold text-slate-800">Total</td>
              <td className="pt-2 text-right pr-6 font-bold text-slate-800">10</td>
              <td className="pt-2 pl-4 text-slate-400">≥ 7 = High · 4–6 = Medium · &lt; 4 = Low</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
