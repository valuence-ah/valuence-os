"use client";
// ─── Brief Dismissed Section ───────────────────────────────────────────────────

import type { FeedArticle } from "@/lib/types";

interface BriefDismissedProps {
  articles: Pick<FeedArticle, "id" | "title" | "ai_why_relevant">[];
}

export function BriefDismissed({ articles }: BriefDismissedProps) {
  if (articles.length === 0) return null;

  return (
    <div className="border-t border-gray-200 pt-5 mt-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">
          Dismissed today
        </p>
        <span className="text-xs text-gray-400">{articles.length} article{articles.length !== 1 ? "s" : ""}</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {articles.map(article => (
          <div
            key={article.id}
            className="flex-shrink-0 w-56 bg-gray-50 rounded-lg p-3 opacity-60"
          >
            <p className="text-xs text-gray-500 line-clamp-2">{article.title}</p>
            <p className="text-[10px] text-gray-400 mt-1 line-clamp-1">
              {article.ai_why_relevant ?? "No thesis overlap."}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
