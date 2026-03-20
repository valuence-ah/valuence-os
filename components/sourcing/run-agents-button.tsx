"use client";
// ─── Run Agents Button ────────────────────────────────────────────────────────
// Dropdown button to trigger sourcing agents (arXiv, SBIR, NSF, or all).
// Shows spinner while running, then displays new signal counts.

import { useState, useRef, useEffect } from "react";
import { Loader2, ChevronDown, Sparkles } from "lucide-react";

type AgentOption = {
  label: string;
  value: "all" | "arxiv" | "sbir" | "nsf";
  endpoint: string;
};

const OPTIONS: AgentOption[] = [
  { label: "Run All", value: "all", endpoint: "/api/agents/run-all" },
  { label: "arXiv only", value: "arxiv", endpoint: "/api/agents/arxiv" },
  { label: "SBIR only", value: "sbir", endpoint: "/api/agents/sbir" },
  { label: "NSF only", value: "nsf", endpoint: "/api/agents/nsf" },
];

interface RunAllResult {
  success: boolean;
  results?: {
    arxiv?: { fetched: number; saved: number };
    sbir?: { fetched: number; saved: number };
    nsf?: { fetched: number; saved: number };
  };
  fetched?: number;
  saved?: number;
}

export function RunAgentsButton() {
  const [status, setStatus] = useState<"idle" | "running">("idle");
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
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
      const data = (await res.json()) as RunAllResult;

      if (option.value === "all" && data.results) {
        const totalSaved =
          (data.results.arxiv?.saved ?? 0) +
          (data.results.sbir?.saved ?? 0) +
          (data.results.nsf?.saved ?? 0);
        setResultMessage(`${totalSaved} new signal${totalSaved !== 1 ? "s" : ""}`);
      } else {
        const saved = data.saved ?? 0;
        setResultMessage(`${saved} new signal${saved !== 1 ? "s" : ""}`);
      }
    } catch {
      setResultMessage("Run failed");
    }

    setStatus("idle");
  }

  const isRunning = status === "running";

  return (
    <div className="flex items-center gap-2">
      {resultMessage && (
        <span className="text-xs text-slate-500">{resultMessage}</span>
      )}
      <div className="relative" ref={dropdownRef}>
        {/* Main button + dropdown arrow */}
        <div className="flex items-stretch rounded-lg overflow-hidden border border-blue-300">
          {/* Primary action: Run All */}
          <button
            onClick={() => runAgent(OPTIONS[0])}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isRunning ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Sparkles size={13} />
            )}
            {isRunning ? "Running…" : "Run Agents"}
          </button>

          {/* Dropdown arrow */}
          <button
            onClick={() => setOpen((o) => !o)}
            disabled={isRunning}
            className="flex items-center px-2 py-1.5 bg-blue-600 text-white hover:bg-blue-700 border-l border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Show agent options"
          >
            <ChevronDown size={12} />
          </button>
        </div>

        {/* Dropdown menu */}
        {open && (
          <div className="absolute right-0 top-full mt-1 w-40 rounded-lg border border-slate-200 bg-white shadow-lg z-50 py-1">
            {OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => runAgent(opt)}
                className="w-full text-left px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
