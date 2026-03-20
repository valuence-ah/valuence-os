"use client";
// ─── Exa Research Button ──────────────────────────────────────────────────────
// Triggers Exa.ai company research and shows results inline.

import { useState } from "react";
import { Search } from "lucide-react";

interface Props {
  companyId: string;
}

interface ExaResult {
  success: boolean;
  signals_saved?: number;
  research?: {
    description_update?: string | null;
    recent_funding?: string | null;
  };
  error?: string;
}

export function ExaResearchButton({ companyId }: Props) {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    setStatus("loading");
    setMessage(null);

    try {
      const res = await fetch("/api/agents/exa-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId }),
      });

      const data = (await res.json()) as ExaResult;

      if (res.status === 503) {
        setStatus("error");
        setMessage("Add EXA_API_KEY to .env.local to enable");
        return;
      }

      if (!data.success || data.error) {
        setStatus("error");
        setMessage(data.error ?? "Research failed");
        return;
      }

      const saved = data.signals_saved ?? 0;
      const descUpdated = !!data.research?.description_update;
      const parts: string[] = [`${saved} signal${saved !== 1 ? "s" : ""} found`];
      if (descUpdated) parts.push("description updated");
      setMessage(parts.join(" + "));
      setStatus("done");
    } catch {
      setStatus("error");
      setMessage("Research failed");
    }
  }

  return (
    <div className="flex items-center gap-2">
      {message && (
        <span
          className={`text-xs max-w-[200px] truncate ${
            status === "error" ? "text-red-500" : "text-slate-500"
          }`}
        >
          {message}
        </span>
      )}
      <button
        onClick={handleClick}
        disabled={status === "loading"}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Search size={13} />
        {status === "loading" ? "Researching…" : "Research with Exa"}
      </button>
    </div>
  );
}
