"use client";
// ─── API Config Panel ─────────────────────────────────────────────────────────
// Left: vertical tab list  |  Right: config editor for selected tab
// Mirrors the layout of ai-config-panel.tsx.
// Agent configs stored in agent_configs table, read at runtime by each agent.

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { FeedsManager } from "@/components/admin/feeds-manager";
import {
  Loader2, Save, Check, Rss, Search, BookOpen, Award, FlaskConical,
  Plus, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Tab metadata ──────────────────────────────────────────────────────────────
const TABS = [
  {
    id:          "feeds",
    label:       "Feeds",
    icon:        Rss,
    color:       "text-slate-600",
    bg:          "bg-slate-100",
    description: "RSS and scraper feeds — sources that push articles and signals into your sourcing pipeline automatically.",
  },
  {
    id:          "exa",
    label:       "Exa.ai",
    icon:        Search,
    color:       "text-blue-600",
    bg:          "bg-blue-50",
    description: "Exa.ai neural search agent — runs themed queries on the web and scores results for thesis relevance. Requires EXA_API_KEY.",
  },
  {
    id:          "arxiv",
    label:       "arXiv",
    icon:        BookOpen,
    color:       "text-violet-600",
    bg:          "bg-violet-50",
    description: "arXiv paper agent — searches preprint papers by keyword and scores them for cleantech / techbio / advanced materials relevance. Free, no key required.",
  },
  {
    id:          "sbir",
    label:       "SBIR / STTR",
    icon:        Award,
    color:       "text-amber-600",
    bg:          "bg-amber-50",
    description: "SBIR.gov grant agent — fetches US Small Business Innovation Research and STTR awards by keyword. Free government API, no key required.",
  },
  {
    id:          "nsf",
    label:       "NSF",
    icon:        FlaskConical,
    color:       "text-emerald-600",
    bg:          "bg-emerald-50",
    description: "NSF Awards agent — fetches National Science Foundation grants by keyword and recency. Free government API, no key required.",
  },
] as const;

type TabId = typeof TABS[number]["id"];

// ── Shared primitives ─────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{children}</label>;
}

function SliderField({
  label, value, min, max, step = 1, onChange, suffix = "",
}: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; suffix?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide flex justify-between">
        <span>{label}</span>
        <span className="font-normal text-slate-400">{value}{suffix}</span>
      </label>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full accent-blue-600"
      />
      <div className="flex justify-between text-[10px] text-slate-300">
        <span>{min}{suffix}</span>
        <span>{max}{suffix}</span>
      </div>
    </div>
  );
}

function NumberField({
  label, value, min, max, step = 1, onChange, hint,
}: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <SectionLabel>{label}</SectionLabel>
      <input
        type="number" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseInt(e.target.value) || min)}
        className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
    </div>
  );
}

function StringListField({
  label, values, onChange, placeholder, hint,
}: {
  label: string; values: string[]; onChange: (v: string[]) => void;
  placeholder?: string; hint?: string;
}) {
  function update(idx: number, val: string) {
    const next = [...values]; next[idx] = val; onChange(next);
  }
  function remove(idx: number) { onChange(values.filter((_, i) => i !== idx)); }
  function add()               { onChange([...values, ""]); }

  return (
    <div className="space-y-2">
      <SectionLabel>{label}</SectionLabel>
      <div className="space-y-1.5">
        {values.map((v, i) => (
          <div key={i} className="flex gap-2">
            <input
              value={v}
              onChange={e => update(i, e.target.value)}
              placeholder={placeholder}
              className="flex-1 text-xs border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 font-mono"
            />
            <button onClick={() => remove(i)} className="p-2 text-slate-400 hover:text-red-500 transition-colors" title="Remove">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
      <button onClick={add} className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium">
        <Plus size={12} /> Add entry
      </button>
      {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
    </div>
  );
}

// ── Agent config editor ────────────────────────────────────────────────────────

interface AgentEditorProps {
  agentName: "exa" | "arxiv" | "sbir" | "nsf";
  tab: typeof TABS[number];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AgentEditor({ agentName, tab }: AgentEditorProps) {
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [config, setConfig] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved,  setSaved]    = useState(false);

  useEffect(() => {
    setLoading(true);
    supabase
      .from("agent_configs")
      .select("config")
      .eq("agent_name", agentName)
      .maybeSingle()
      .then(({ data }) => {
        setConfig(data?.config ?? null);
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentName]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const set = useCallback((key: string, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setSaved(false);
  }, []);

  async function handleSave() {
    if (!config) return;
    setSaving(true);
    await supabase
      .from("agent_configs")
      .update({ config, updated_at: new Date().toISOString() })
      .eq("agent_name", agentName);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const Icon = tab.icon;

  return (
    <div className="max-w-2xl space-y-6">

      {/* Header — matches AI Config style */}
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
          onClick={handleSave}
          disabled={saving || loading || !config}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg border transition-all",
            saved
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-blue-600 border-blue-600 text-white hover:bg-blue-500 disabled:opacity-50"
          )}
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : saved ? <Check size={12} /> : <Save size={12} />}
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-slate-400 gap-2 text-sm">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      ) : !config ? (
        <div className="flex items-center justify-center h-48 text-slate-400 text-sm text-center px-8">
          Config not found. Run <code className="bg-slate-100 px-1 rounded mx-1">009_agent_configs.sql</code> in Supabase SQL editor first.
        </div>
      ) : (
        <>
          {/* ── EXA ── */}
          {agentName === "exa" && (
            <div className="space-y-6">
              <StringListField
                label="Search Queries"
                values={config.queries ?? []}
                onChange={v => set("queries", v)}
                placeholder="e.g. cleantech startup seed funding 2025"
                hint="Each query runs as an independent Exa search."
              />

              <div className="grid grid-cols-2 gap-5">
                <NumberField
                  label="Results per Query"
                  value={config.numResults ?? 8}
                  min={1} max={10}
                  onChange={v => set("numResults", v)}
                  hint="Max 10 on Exa standard tier"
                />
                <NumberField
                  label="Max Characters per Result"
                  value={config.maxCharacters ?? 800}
                  min={100} max={2000} step={100}
                  onChange={v => set("maxCharacters", v)}
                  hint="Body text extracted per article"
                />
              </div>

              <div className="grid grid-cols-2 gap-5">
                <NumberField
                  label="Lookback Period (days)"
                  value={config.lookbackDays ?? 90}
                  min={7} max={365}
                  onChange={v => set("lookbackDays", v)}
                  hint="Only results published within this window"
                />
                <div className="space-y-1.5">
                  <SectionLabel>Search Type</SectionLabel>
                  <select
                    value={config.searchType ?? "neural"}
                    onChange={e => set("searchType", e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <option value="neural">Neural (semantic AI search)</option>
                    <option value="keyword">Keyword (exact match)</option>
                    <option value="auto">Auto (Exa decides)</option>
                  </select>
                  <p className="text-[10px] text-slate-400">Neural recommended for thematic discovery</p>
                </div>
              </div>

              <SliderField
                label="Min Relevance Score to Save"
                value={config.minScore ?? 0.45}
                min={0} max={1} step={0.05}
                onChange={v => set("minScore", v)}
              />
              <p className="text-[10px] text-slate-400 -mt-4">
                Signals scored below this are discarded. 0.45 = moderate relevance, 0.7 = high only.
              </p>

              <div className="grid grid-cols-2 gap-5">
                <StringListField
                  label="Include Domains (optional)"
                  values={config.includeDomains ?? []}
                  onChange={v => set("includeDomains", v)}
                  placeholder="e.g. techcrunch.com"
                />
                <StringListField
                  label="Exclude Domains (optional)"
                  values={config.excludeDomains ?? []}
                  onChange={v => set("excludeDomains", v)}
                  placeholder="e.g. wikipedia.org"
                />
              </div>
            </div>
          )}

          {/* ── ARXIV ── */}
          {agentName === "arxiv" && (
            <div className="space-y-6">
              <StringListField
                label="Search Queries"
                values={config.queries ?? []}
                onChange={v => set("queries", v)}
                placeholder="e.g. cleantech energy storage carbon capture hydrogen"
                hint="Each query searches all arXiv fields (title, abstract, authors)."
              />

              <div className="grid grid-cols-2 gap-5">
                <NumberField
                  label="Max Results per Query"
                  value={config.maxResults ?? 25}
                  min={5} max={100}
                  onChange={v => set("maxResults", v)}
                  hint="arXiv allows up to 2000 per call"
                />
                <div className="space-y-1.5">
                  <SectionLabel>Sort By</SectionLabel>
                  <select
                    value={config.sortBy ?? "submittedDate"}
                    onChange={e => set("sortBy", e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <option value="submittedDate">Submission Date (newest first)</option>
                    <option value="lastUpdatedDate">Last Updated Date</option>
                    <option value="relevance">Relevance</option>
                  </select>
                </div>
              </div>

              <SliderField
                label="Min Relevance Score to Save"
                value={config.minScore ?? 0.45}
                min={0} max={1} step={0.05}
                onChange={v => set("minScore", v)}
              />
            </div>
          )}

          {/* ── SBIR ── */}
          {agentName === "sbir" && (
            <div className="space-y-6">
              <StringListField
                label="Search Keywords"
                values={config.keywords ?? []}
                onChange={v => set("keywords", v)}
                placeholder="e.g. clean energy"
                hint="Each keyword triggers one API call to SBIR.gov."
              />

              <div className="grid grid-cols-2 gap-5">
                <NumberField
                  label="Results per Keyword"
                  value={config.rowsPerKeyword ?? 15}
                  min={5} max={50}
                  onChange={v => set("rowsPerKeyword", v)}
                  hint="Number of awards fetched per keyword"
                />
                <div className="space-y-1.5">
                  <SectionLabel>Award Year</SectionLabel>
                  <select
                    value={String(config.yearOffset ?? 0)}
                    onChange={e => set("yearOffset", parseInt(e.target.value))}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <option value="0">Current year only</option>
                    <option value="1">Previous year only</option>
                  </select>
                  <p className="text-[10px] text-slate-400">Which award year to search</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <SectionLabel>Programs</SectionLabel>
                <div className="flex gap-4">
                  {["SBIR", "STTR"].map(p => (
                    <label key={p} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(config.programs ?? ["SBIR", "STTR"]).includes(p)}
                        onChange={e => {
                          const current: string[] = config.programs ?? ["SBIR", "STTR"];
                          set("programs", e.target.checked ? [...current, p] : current.filter(x => x !== p));
                        }}
                        className="accent-blue-600"
                      />
                      {p}
                    </label>
                  ))}
                </div>
              </div>

              <SliderField
                label="Min Relevance Score to Save"
                value={config.minScore ?? 0.40}
                min={0} max={1} step={0.05}
                onChange={v => set("minScore", v)}
              />
            </div>
          )}

          {/* ── NSF ── */}
          {agentName === "nsf" && (
            <div className="space-y-6">
              <StringListField
                label="Search Keywords"
                values={config.keywords ?? []}
                onChange={v => set("keywords", v)}
                placeholder="e.g. synthetic biology"
                hint="Each keyword triggers one API call to the NSF Awards API."
              />

              <div className="grid grid-cols-2 gap-5">
                <NumberField
                  label="Results per Keyword"
                  value={config.resultsPerPage ?? 20}
                  min={5} max={100}
                  onChange={v => set("resultsPerPage", v)}
                  hint="NSF allows up to 25 per page"
                />
                <NumberField
                  label="Lookback Period (months)"
                  value={config.lookbackMonths ?? 6}
                  min={1} max={24}
                  onChange={v => set("lookbackMonths", v)}
                  hint="Only awards started within this window"
                />
              </div>

              <SliderField
                label="Min Relevance Score to Save"
                value={config.minScore ?? 0.40}
                min={0} max={1} step={0.05}
                onChange={v => set("minScore", v)}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export function ApiConfigPanel() {
  const [activeTab, setActiveTab] = useState<TabId>("feeds");
  const tab = TABS.find(t => t.id === activeTab)!;

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left: tab list ── */}
      <div className="w-52 flex-shrink-0 border-r border-slate-200 bg-slate-50 overflow-y-auto py-3">
        {TABS.map(t => {
          const TIcon = t.icon;
          const isActive = t.id === activeTab;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
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

      {/* ── Right: content ── */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "feeds" ? (
          <FeedsManager />
        ) : (
          <AgentEditor
            agentName={activeTab as "exa" | "arxiv" | "sbir" | "nsf"}
            tab={tab}
          />
        )}
      </div>

    </div>
  );
}
