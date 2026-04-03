"use client";
import type { FeedSource } from "@/lib/types";

interface Props {
  sources: FeedSource[];
  selectedSource: string | null;
  onSelectSource: (id: string | null) => void;
}

const BUCKET_GROUPS = [
  { key: "fund_raise",     label: "Fundraises" },
  { key: "startup_round",  label: "Startups" },
  { key: "ma_partnership", label: "M&A / Partnerships" },
];

export function FeedsSourcePanel({ sources, selectedSource, onSelectSource }: Props) {
  const totalCount = sources.reduce((sum, s) => sum + (s.article_count ?? 0), 0);

  return (
    <div className="w-[190px] flex-shrink-0 border-r border-gray-200 overflow-y-auto flex flex-col">
      <div className="flex-1 py-2">
        {BUCKET_GROUPS.map(group => {
          const groupSources = sources
            .filter(s => (s.bucket_affinity ?? "uncategorized") === group.key)
            .sort((a, b) => (b.article_count ?? 0) - (a.article_count ?? 0));

          if (groupSources.length === 0) return null;

          return (
            <div key={group.key} className="mb-1">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mt-3 mb-1 px-3">
                {group.label}
              </p>
              {groupSources.map(source => (
                <button
                  key={source.id}
                  onClick={() => onSelectSource(source.id === selectedSource ? null : source.id)}
                  className={`w-full flex justify-between items-center px-3 py-1.5 text-xs transition-colors ${
                    selectedSource === source.id
                      ? "bg-gray-100 text-gray-900 font-medium"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                  }`}
                >
                  <span className="truncate text-left">{source.name}</span>
                  {(source.article_count ?? 0) > 0 && (
                    <span className="text-[11px] text-gray-400 ml-1 flex-shrink-0">
                      {source.article_count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          );
        })}

        {/* Uncategorized sources */}
        {(() => {
          const uncategorized = sources.filter(
            s => !s.bucket_affinity || s.bucket_affinity === "uncategorized"
          );
          if (uncategorized.length === 0) return null;
          return (
            <div className="mb-1">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mt-3 mb-1 px-3">
                Other
              </p>
              {uncategorized.map(source => (
                <button
                  key={source.id}
                  onClick={() => onSelectSource(source.id === selectedSource ? null : source.id)}
                  className={`w-full flex justify-between items-center px-3 py-1.5 text-xs transition-colors ${
                    selectedSource === source.id
                      ? "bg-gray-100 text-gray-900 font-medium"
                      : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                  }`}
                >
                  <span className="truncate text-left">{source.name}</span>
                  {(source.article_count ?? 0) > 0 && (
                    <span className="text-[11px] text-gray-400 ml-1 flex-shrink-0">
                      {source.article_count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Footer: All sources */}
      <div className="border-t border-gray-200 py-2 px-3 flex-shrink-0">
        <button
          onClick={() => onSelectSource(null)}
          className={`w-full flex justify-between items-center py-1.5 px-2 rounded-md text-xs transition-colors ${
            !selectedSource
              ? "bg-gray-100 text-gray-900 font-medium"
              : "text-gray-500 hover:bg-gray-50"
          }`}
        >
          <span>All sources</span>
          <span className="text-gray-400">{totalCount}</span>
        </button>
      </div>
    </div>
  );
}
