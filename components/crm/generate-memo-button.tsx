"use client";
// ─── Generate IC Memo Button ──────────────────────────────────────────────────
// Placed on the company detail page header.
// Calls Claude via /api/memos/generate and navigates to the new memo.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles } from "lucide-react";

interface Props {
  companyId: string;
}

export function GenerateMemoButton({ companyId }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "generating">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setStatus("generating");
    setError(null);
    try {
      const res = await fetch("/api/memos/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      if (json.data?.id) router.push(`/memos/${json.data.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
      setStatus("idle");
    }
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-500 max-w-[180px] truncate">{error}</span>}
      <button
        onClick={handleGenerate}
        disabled={status === "generating"}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Sparkles size={13} />
        {status === "generating" ? "Generating…" : "Generate IC Memo"}
      </button>
    </div>
  );
}
