"use client";
// ─── Find Logo Button (single company) ────────────────────────────────────────
// Finds and saves a logo for one specific company.

import { useState } from "react";
import { ImageIcon, CheckCircle, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";

export function FindLogoButton({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "running" | "found" | "not_found">("idle");

  async function handleClick() {
    setStatus("running");
    try {
      const res = await fetch("/api/logo-finder/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      const data = await res.json();
      if (data.success && data.logo_url) {
        setStatus("found");
        router.refresh(); // reload page to show new logo
      } else {
        setStatus("not_found");
      }
    } catch {
      setStatus("not_found");
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={status === "running"}
      title="Find logo for this company"
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {status === "running" ? (
        <><ImageIcon size={13} className="animate-pulse" /> Finding…</>
      ) : status === "found" ? (
        <><CheckCircle size={13} className="text-green-500" /> Logo found</>
      ) : status === "not_found" ? (
        <><XCircle size={13} className="text-red-400" /> Not found</>
      ) : (
        <><ImageIcon size={13} /> Find Logo</>
      )}
    </button>
  );
}
