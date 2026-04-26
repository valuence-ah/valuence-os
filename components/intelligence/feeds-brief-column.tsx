"use client";
import type { FeedArticle } from "@/lib/types";
import { FeedsBriefCard } from "./feeds-brief-card";

interface Props {
  summary: string;
  articles: FeedArticle[];
  totalScanned: number;
  totalRelevant: number;
  totalHighPriority: number;
  sourceMap: Record<string, string>;
  onAddToPipeline: (article: FeedArticle) => void;
  onAddToFunds: (article: FeedArticle) => void;
}

export function FeedsBriefColumn({
  summary, articles, totalScanned, totalRelevant, totalHighPriority,
  sourceMap, onAddToPipeline, onAddToFunds,
}: Props) {
  return (
    <div className="hidden lg:flex w-[532px] flex-shrink-0 flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <p className="text-sm font-semibold text-gray-900">AI daily brief</p>
        <p className="text-[10px] text-gray-400 mt-0.5">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long", month: "long", day: "numeric", year: "numeric",
          })}
        </p>
      </div>

      {/* AI summary */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <p className="text-xs text-gray-900 leading-relaxed">
          {summary || "Sync feeds to generate your daily brief."}
        </p>
        <p className="text-[10px] text-gray-400 mt-2">
          {totalScanned} scanned · {totalRelevant} relevant
          {totalHighPriority > 0 ? ` · ${totalHighPriority} high priority` : ""}
        </p>
      </div>

      {/* High priority signal cards */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-3">
          High priority signals
        </p>
        {articles.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-xs text-gray-400">
              No high-priority signals yet.
            </p>
            <p className="text-[11px] text-gray-400 mt-1">
              Sync feeds to fetch and score articles.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {articles.map(article => (
              <FeedsBriefCard
                key={article.id}
                article={article}
                sourceName={article.source_id ? sourceMap[article.source_id] : undefined}
                onAddToPipeline={onAddToPipeline}
                onAddToFunds={onAddToFunds}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
