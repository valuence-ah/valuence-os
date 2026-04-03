"use client";
import type { FeedArticle } from "@/lib/types";

interface Props {
  article: FeedArticle;
  sourceName?: string;
  onAddToPipeline: (article: FeedArticle) => void;
  onAddToFunds: (article: FeedArticle) => void;
}

function getWhyColors(bucket: string | null) {
  switch (bucket) {
    case "startup_round":  return { bg: "bg-teal-50",   text: "text-teal-800" };
    case "fund_raise":     return { bg: "bg-purple-50", text: "text-purple-800" };
    case "ma_partnership": return { bg: "bg-orange-50", text: "text-orange-800" };
    default:               return { bg: "bg-gray-50",   text: "text-gray-700" };
  }
}

function getBucketBadge(bucket: string | null) {
  switch (bucket) {
    case "fund_raise":     return "bg-purple-50 text-purple-800 border border-purple-200";
    case "startup_round":  return "bg-teal-50 text-teal-800 border border-teal-200";
    case "ma_partnership": return "bg-orange-50 text-orange-800 border border-orange-200";
    default:               return "bg-gray-100 text-gray-600";
  }
}

function getBucketLabel(bucket: string | null) {
  switch (bucket) {
    case "fund_raise":     return "Fundraise";
    case "startup_round":  return "Startup";
    case "ma_partnership": return "M&A";
    default:               return "Other";
  }
}

export function FeedsBriefCard({ article, sourceName, onAddToPipeline, onAddToFunds }: Props) {
  const { bg, text } = getWhyColors(article.bucket ?? null);
  const isInPipeline = (article.matched_company_ids ?? []).length > 0;

  return (
    <div className="border border-gray-200 rounded-lg p-3 hover:border-gray-300 transition-colors">
      {/* Badge row */}
      <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
        {article.bucket && article.bucket !== "uncategorized" && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getBucketBadge(article.bucket)}`}>
            {getBucketLabel(article.bucket)}
          </span>
        )}
        {(article.sectors ?? []).includes("cleantech") && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium">CT</span>
        )}
        {(article.sectors ?? []).includes("biotech") && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-800 border border-purple-200 font-medium">Bio</span>
        )}
        {(article.sectors ?? []).includes("advanced_materials") && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200 font-medium">AM</span>
        )}
        {article.deal_amount && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
            {article.deal_amount}
          </span>
        )}
        {article.deal_stage && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">
            {article.deal_stage.replace(/_/g, " ")}
          </span>
        )}
      </div>

      {/* Title */}
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-medium text-gray-900 mb-1.5 line-clamp-2 hover:text-teal-700 transition-colors leading-snug block"
      >
        {article.title}
      </a>

      {/* Why this matters */}
      {article.ai_why_relevant && (
        <div className={`rounded-md p-2 mb-2 ${bg}`}>
          <p className={`text-[11px] leading-relaxed ${text}`}>
            <span className="font-semibold">Why: </span>
            {article.ai_why_relevant}
          </p>
        </div>
      )}

      {/* Watchlist / pipeline chips */}
      {isInPipeline && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 font-medium mr-1.5">
          In pipeline
        </span>
      )}
      {(article.thesis_keywords ?? []).length > 0 && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200 mr-1.5">
          {article.thesis_keywords![0]}
        </span>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 mt-2">
        {sourceName && <span className="text-[10px] text-gray-400">{sourceName}</span>}
        <div className="ml-auto flex gap-1">
          {article.bucket === "startup_round" && !isInPipeline && (
            <button
              onClick={() => onAddToPipeline(article)}
              className="text-[10px] px-2 py-0.5 rounded border border-teal-200 text-teal-700 hover:bg-teal-50 transition-colors"
            >
              Add to Pipeline
            </button>
          )}
          {article.bucket === "fund_raise" && (
            <button
              onClick={() => onAddToFunds(article)}
              className="text-[10px] px-2 py-0.5 rounded border border-purple-200 text-purple-700 hover:bg-purple-50 transition-colors"
            >
              Add to Funds CRM
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
