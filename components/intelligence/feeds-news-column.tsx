"use client";
import { Newspaper } from "lucide-react";
import type { FeedArticle } from "@/lib/types";
import { FeedsNewsItem } from "./feeds-news-item";

interface Props {
  articles: FeedArticle[];
  bucketFilter: string;
  onBucketFilter: (b: string) => void;
  searchQuery: string;
  onSearch: (q: string) => void;
  sourceMap: Record<string, string>;
  loading: boolean;
  onAddToPipeline: (article: FeedArticle) => void;
  onAddToFunds: (article: FeedArticle) => void;
}

const BUCKET_TABS = [
  { key: "all",          label: "All" },
  { key: "fund_raise",   label: "Fundraises" },
  { key: "startup_round", label: "Startups" },
  { key: "ma_partnership", label: "M&A" },
];

export function FeedsNewsColumn({
  articles, bucketFilter, onBucketFilter, searchQuery, onSearch,
  sourceMap, loading, onAddToPipeline, onAddToFunds,
}: Props) {
  return (
    <div className="flex-1 min-w-0 border-r border-gray-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-gray-200 flex items-center gap-2 flex-shrink-0">
        <p className="text-sm font-medium text-gray-900 mr-1">All news</p>
        <div className="flex gap-1">
          {BUCKET_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => onBucketFilter(tab.key)}
              className={`px-2.5 py-1 text-[11px] rounded-full transition-colors ${
                bucketFilter === tab.key
                  ? "bg-gray-200 text-gray-900 font-medium"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <input
          type="text"
          placeholder="Search…"
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
          className="text-xs px-2.5 py-1.5 w-32 border border-gray-200 rounded-md bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 transition-colors"
        />
      </div>

      {/* Article list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="space-y-0">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="px-3 py-3 border-b border-gray-100 animate-pulse">
                <div className="flex gap-1.5 mb-1.5">
                  <div className="w-2 h-2 rounded-full bg-gray-200 mt-0.5" />
                  <div className="h-4 w-16 bg-gray-200 rounded-full" />
                  <div className="h-4 w-10 bg-gray-100 rounded-full" />
                </div>
                <div className="h-3.5 w-3/4 bg-gray-200 rounded mb-1" />
                <div className="h-3 w-1/2 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Newspaper size={24} className="text-gray-300 mb-2" />
            <p className="text-sm text-gray-400">No articles match your filters</p>
            <p className="text-xs text-gray-400 mt-1">Try changing the filter or syncing feeds</p>
          </div>
        ) : (
          articles.map(article => (
            <FeedsNewsItem
              key={article.id}
              article={article}
              sourceName={article.source_id ? sourceMap[article.source_id] : undefined}
              onAddToPipeline={onAddToPipeline}
              onAddToFunds={onAddToFunds}
            />
          ))
        )}
      </div>

      {/* Footer count */}
      {!loading && articles.length > 0 && (
        <div className="border-t border-gray-100 px-3 py-1.5 flex-shrink-0">
          <p className="text-[10px] text-gray-400">{articles.length} articles</p>
        </div>
      )}
    </div>
  );
}
