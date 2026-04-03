"use client";
import type { FeedArticle } from "@/lib/types";

interface Props {
  article: FeedArticle;
  sourceName?: string;
  onAddToPipeline: (article: FeedArticle) => void;
  onAddToFunds: (article: FeedArticle) => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

function getBucketDisplay(bucket: string | null) {
  switch (bucket) {
    case "fund_raise":     return { dot: "bg-purple-500", badge: "bg-purple-50 text-purple-800 border border-purple-200", label: "Fundraise" };
    case "startup_round":  return { dot: "bg-teal-500",   badge: "bg-teal-50 text-teal-800 border border-teal-200",       label: "Startup" };
    case "ma_partnership": return { dot: "bg-orange-500", badge: "bg-orange-50 text-orange-800 border border-orange-200", label: "M&A" };
    default:               return { dot: "bg-gray-300",   badge: "bg-gray-100 text-gray-600",                             label: "Other" };
  }
}

export function FeedsNewsItem({ article, sourceName, onAddToPipeline, onAddToFunds }: Props) {
  const { dot, badge, label } = getBucketDisplay(article.bucket ?? null);
  const isInPipeline = (article.matched_company_ids ?? []).length > 0;

  return (
    <div className="px-3 py-2.5 border-b border-gray-100 hover:bg-gray-50 transition-colors">
      {/* Badge row */}
      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
        {article.bucket && article.bucket !== "uncategorized" && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge}`}>
            {label}
          </span>
        )}
        {(article.sectors ?? []).includes("cleantech") && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium">
            Cleantech
          </span>
        )}
        {(article.sectors ?? []).includes("biotech") && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-800 border border-purple-200 font-medium">
            Biotech
          </span>
        )}
        {(article.sectors ?? []).includes("advanced_materials") && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 font-medium">
            Adv. Materials
          </span>
        )}
        {article.deal_amount && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
            {article.deal_amount}
          </span>
        )}
      </div>

      {/* Title */}
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[13px] font-medium text-gray-900 mb-0.5 line-clamp-1 hover:text-teal-700 transition-colors leading-snug block"
      >
        {article.title}
      </a>

      {/* Summary */}
      {article.summary && (
        <p className="text-[11px] text-gray-500 mb-1.5 line-clamp-1 leading-relaxed">
          {article.summary}
        </p>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 flex-wrap">
        {sourceName && <span className="text-[10px] text-gray-400">{sourceName}</span>}
        {article.published_at && (
          <span className="text-[10px] text-gray-400">{timeAgo(article.published_at)}</span>
        )}

        {isInPipeline ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium">
            In pipeline
          </span>
        ) : (article.thesis_keywords ?? []).length > 0 ? (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200">
            {article.thesis_keywords![0]}
          </span>
        ) : null}

        {/* Action buttons */}
        <div className="ml-auto flex items-center gap-1">
          {article.bucket === "startup_round" && !isInPipeline && (
            <button
              onClick={(e) => { e.stopPropagation(); onAddToPipeline(article); }}
              className="text-[10px] px-2 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              Add to Pipeline
            </button>
          )}
          {article.bucket === "fund_raise" && (
            <button
              onClick={(e) => { e.stopPropagation(); onAddToFunds(article); }}
              className="text-[10px] px-2 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              Add to Funds CRM
            </button>
          )}
          {article.bucket === "ma_partnership" && (
            <button
              onClick={(e) => { e.stopPropagation(); }}
              className="text-[10px] px-2 py-0.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
