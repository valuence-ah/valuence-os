"use client";
import { RefreshCw, Plus } from "lucide-react";

interface KeywordStat {
  keyword: string;
  match_count: number;
}

interface Props {
  keywords: KeywordStat[];
  syncing: boolean;
  onSync: () => void;
  onManageSources: () => void;
}

export function FeedsThesisPulse({ keywords, syncing, onSync, onManageSources }: Props) {
  const maxCount = Math.max(...keywords.map(k => k.match_count), 1);

  function cls(count: number): string {
    const i = count / maxCount;
    if (i > 0.7) return "bg-teal-700 text-white";
    if (i > 0.4) return "bg-teal-500 text-white";
    if (i > 0.2) return "bg-teal-200 text-teal-900";
    return "bg-teal-50 text-teal-800 border border-teal-200";
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 flex-shrink-0">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">
          Thesis pulse (30 days)
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={onManageSources}
            className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Plus size={11} />
            Manage sources
          </button>
          <button
            onClick={onSync}
            disabled={syncing}
            className="flex items-center gap-1.5 text-[11px] px-3 py-1.5 rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={11} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Sync now"}
          </button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {keywords.length > 0 ? (
          keywords.map(({ keyword, match_count }) => (
            <span key={keyword} className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${cls(match_count)}`}>
              {keyword} ({match_count})
            </span>
          ))
        ) : (
          <span className="text-xs text-gray-400">
            No thesis keywords matched yet. Sync feeds to start scoring.
          </span>
        )}
      </div>
    </div>
  );
}
