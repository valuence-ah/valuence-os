"use client";
// ─── Find Logos Button ────────────────────────────────────────────────────────
// Triggers the logo-finder API to populate logo_url for startups.
// Shows a live count of how many were updated.

import { useState } from "react";
import { Sparkles } from "lucide-react";

export function FindLogosButton() {
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [summary, setSummary] = useState<{ updated: number; processed: number } | null>(null);

  async function handleClick() {
    setStatus("running");
    setSummary(null);
    try {
      const res = await fetch("/api/logo-finder/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 25 }),
      });
      const data = await res.json();
      setSummary({ updated: data.updated ?? 0, processed: data.processed ?? 0 });
    } catch {
      setSummary({ updated: 0, processed: 0 });
    }
    setStatus("done");
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={status === "running"}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-50 text-violet-700 border border-violet-200 hover:bg-violet-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Sparkles size={13} />
        {status === "running" ? "Finding logos…" : "Find Logos"}
      </button>
      {status === "done" && summary && (
        <span className="text-xs text-slate-500">
          {summary.updated}/{summary.processed} updated
        </span>
      )}
    </div>
  );
}
