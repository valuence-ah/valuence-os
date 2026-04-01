"use client";
// ─── Run Agents Button ────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from "react";
import { Loader2, ChevronDown, Sparkles, Clock } from "lucide-react";

type AgentOption = { label: string; value: string; endpoint: string };

const OPTIONS: AgentOption[] = [
  { label: "Run All",          value: "all",              endpoint: "/api/agents/run-all" },
  { label: "arXiv",            value: "arxiv",            endpoint: "/api/agents/arxiv" },
  { label: "SBIR",             value: "sbir",             endpoint: "/api/agents/sbir" },
  { label: "NSF",              value: "nsf",              endpoint: "/api/agents/nsf" },
  { label: "USPTO",            value: "uspto",            endpoint: "/api/agents/uspto" },
  { label: "Semantic Scholar", value: "semantic_scholar", endpoint: "/api/agents/semantic-scholar" },
  { label: "NIH Reporter",     value: "nih",              endpoint: "/api/agents/nih" },
  { label: "NREL",             value: "nrel",             endpoint: "/api/agents/nrel" },
  { label: "Exa",              value: "exa",              endpoint: "/api/agents/exa" },
];

const LAST_RUN_KEY = "sourcing_last_run";

function timeAgoShort(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function RunAgentsButton() {
  const [status, setStatus] = useState<"idle" | "running">("idle");
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LAST_RUN_KEY);
      if (stored) setLastRun(stored);
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function runAgent(option: AgentOption) {
    setOpen(false);
    setStatus("running");
    setResultMessage(null);

    try {
      const res = await fetch(option.endpoint, { method: "POST" });
      const data = await res.json() as {
        success?: boolean;
        totalSaved?: number;
        saved?: number;
        results?: Record<string, { saved?: number; fetched?: number }>;
      };

      let totalSaved = 0;
      if (option.value === "all") {
        totalSaved = data.totalSaved ?? Object.values(data.results ?? {}).reduce((s, r) => s + (r.saved ?? 0), 0);
      } else {
        totalSaved = data.saved ?? 0;
      }

      const now = new Date().toISOString();
      setLastRun(now);
      try { localStorage.setItem(LAST_RUN_KEY, now); } catch { /* noop */ }
      setResultMessage(`+${totalSaved} signal${totalSaved !== 1 ? "s" : ""}`);

      // Notify SourcingClient to refresh its signal list
      window.dispatchEvent(new CustomEvent("agents-ran", { detail: { saved: totalSaved } }));
    } catch {
      setResultMessage("Run failed");
    }

    setStatus("idle");
  }

  const isRunning = status === "running";

  return (
    <div className="flex items-center gap-2">
      {lastRun && !isRunning && (
        <span className="flex items-center gap-1 text-xs text-slate-400">
          <Clock size={11} /> Last run: {timeAgoShort(lastRun)}
        </span>
      )}
      {resultMessage && !isRunning && (
        <span className="text-xs font-medium text-green-600">{resultMessage}</span>
      )}

      <div className="relative" ref={dropdownRef}>
        <div className="flex items-stretch rounded-lg overflow-hidden border border-blue-300">
          <button
            onClick={() => runAgent(OPTIONS[0])}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRunning ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {isRunning ? "Running…" : "Run Agents"}
          </button>
          <button
            onClick={() => setOpen(o => !o)}
            disabled={isRunning}
            className="flex items-center px-2 py-1.5 bg-blue-600 text-white hover:bg-blue-700 border-l border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronDown size={12} />
          </button>
        </div>

        {open && (
          <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-slate-200 bg-white shadow-lg z-50 py-1">
            {OPTIONS.map((opt) => (
              <button key={opt.value} onClick={() => runAgent(opt)}
                className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors">
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
