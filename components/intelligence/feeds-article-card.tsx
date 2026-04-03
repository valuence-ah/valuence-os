"use client";
// ─── Feeds Article Card ───────────────────────────────────────────────────────
// Individual article card with sector badges, deal info, CRM chips, actions.

import { Star, ExternalLink, Plus, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeedArticle, FeedBucket } from "@/lib/types";

// ── Colour config ──────────────────────────────────────────────────────────────
const BUCKET_DOT: Record<FeedBucket, string> = {
  fund_raise:     "bg-[#534AB7]",
  startup_round:  "bg-[#1D9E75]",
  ma_partnership: "bg-[#D85A30]",
  uncategorized:  "bg-gray-300",
};

const BUCKET_LABEL: Record<FeedBucket, string> = {
  fund_raise:     "Fund raise",
  startup_round:  "Startup round",
  ma_partnership: "M&A / Partnership",
  uncategorized:  "Uncategorized",
};

const BUCKET_BADGE: Record<FeedBucket, string> = {
  fund_raise:     "bg-purple-50 text-purple-700 border-purple-200",
  startup_round:  "bg-teal-50 text-teal-700 border-teal-200",
  ma_partnership: "bg-orange-50 text-orange-700 border-orange-200",
  uncategorized:  "bg-gray-100 text-gray-500 border-gray-200",
};

const SECTOR_BADGE: Record<string, string> = {
  cleantech:          "bg-emerald-50  text-emerald-800 border-emerald-300",
  biotech:            "bg-purple-50   text-purple-800  border-purple-300",
  advanced_materials: "bg-blue-50     text-blue-800    border-blue-300",
  climate_energy:     "bg-amber-50    text-amber-800   border-amber-300",
};

const SECTOR_LABEL: Record<string, string> = {
  cleantech:          "Cleantech",
  biotech:            "Biotech",
  advanced_materials: "Adv. materials",
  climate_energy:     "Climate + energy",
};

const STAGE_LABEL: Record<string, string> = {
  pre_seed:    "Pre-seed",
  seed:        "Seed",
  series_a:    "Series A",
  series_b:    "Series B",
  growth:      "Growth",
  fund_close:  "Fund close",
  first_close: "First close",
  acquisition: "Acquisition",
  partnership: "Partnership",
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "—";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface FeedsArticleCardProps {
  article: FeedArticle;
  sourceName: string | undefined;
  onMarkRead: (id: string) => void;
  onToggleStar: (id: string, current: boolean) => void;
  onToggleSave: (id: string, current: boolean) => void;
  onAddToPipeline: (article: FeedArticle) => void;
  onAddToFundsCRM: (article: FeedArticle) => void;
  relatedPipelineCompany?: { id: string; name: string } | null;
}

export function FeedsArticleCard({
  article,
  sourceName,
  onMarkRead,
  onToggleStar,
  onToggleSave,
  onAddToPipeline,
  onAddToFundsCRM,
  relatedPipelineCompany,
}: FeedsArticleCardProps) {
  const bucket = article.bucket ?? "uncategorized";

  return (
    <div
      className={cn(
        "px-5 py-4 hover:bg-gray-50/60 transition-colors border-b border-gray-100",
        article.is_read && "opacity-60"
      )}
    >
      <div className="flex items-start gap-3">
        {/* Bucket colour dot */}
        <div className="flex-shrink-0 pt-1.5">
          <span className={cn("w-2 h-2 rounded-full block", BUCKET_DOT[bucket])} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            {/* Bucket badge */}
            {bucket !== "uncategorized" && (
              <span className={cn(
                "inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full border",
                BUCKET_BADGE[bucket]
              )}>
                {BUCKET_LABEL[bucket]}
              </span>
            )}

            {/* Sector badges */}
            {(article.sectors ?? []).slice(0, 3).map(s => (
              <span
                key={s}
                className={cn(
                  "inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full border",
                  SECTOR_BADGE[s] ?? "bg-gray-100 text-gray-600 border-gray-200"
                )}
              >
                {SECTOR_LABEL[s] ?? s}
              </span>
            ))}

            {/* Deal stage + amount */}
            {article.deal_stage && (
              <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                {STAGE_LABEL[article.deal_stage] ?? article.deal_stage}
                {article.deal_amount ? ` · ${article.deal_amount}` : ""}
              </span>
            )}
          </div>

          {/* Title */}
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onMarkRead(article.id)}
            className="text-sm font-semibold text-gray-800 hover:text-teal-600 leading-snug line-clamp-2 block"
          >
            {article.title}
          </a>

          {/* Summary */}
          {article.summary && (
            <p className="text-xs text-gray-500 leading-relaxed line-clamp-2 mt-0.5">
              {article.summary}
            </p>
          )}

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400">
            {sourceName && <span>{sourceName}</span>}
            {article.published_at && (
              <><span>·</span><span>{timeAgo(article.published_at)}</span></>
            )}
          </div>

          {/* CRM relevance chips + thesis keywords */}
          {(
            article.relevance_tags?.length > 0 ||
            article.thesis_keywords?.length > 0 ||
            relatedPipelineCompany
          ) && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {article.relevance_tags?.includes("pipeline_match") && (
                <span className="text-[11px] px-2 py-0.5 rounded border border-emerald-400 text-emerald-700 font-medium bg-emerald-50">
                  In pipeline
                </span>
              )}
              {relatedPipelineCompany && (
                <span className="text-[11px] px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-medium">
                  Related: {relatedPipelineCompany.name}
                </span>
              )}
              {article.relevance_tags?.includes("coinvestor_activity") && (
                <span className="text-[11px] px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                  Watchlist match
                </span>
              )}
              {(article.thesis_keywords ?? []).slice(0, 2).map(kw => (
                <span key={kw} className="text-[11px] px-2 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200">
                  {kw}
                </span>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-2.5">
            {bucket === "startup_round" && (
              <button
                onClick={() => onAddToPipeline(article)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-teal-600 text-white rounded-md hover:bg-teal-700 transition-colors"
              >
                <Plus size={11} />
                Add to Pipeline
              </button>
            )}
            {bucket === "fund_raise" && (
              <button
                onClick={() => onAddToFundsCRM(article)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
              >
                <Plus size={11} />
                Add to Funds CRM
              </button>
            )}
            <button
              onClick={() => onToggleSave(article.id, article.saved)}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors",
                article.saved
                  ? "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              )}
            >
              {article.saved ? "Saved" : "Save"}
            </button>
          </div>
        </div>

        {/* Right action icons */}
        <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
          <button
            onClick={() => onToggleStar(article.id, article.is_starred)}
            className={cn(
              "p-1.5 rounded transition-colors",
              article.is_starred ? "text-amber-500" : "text-gray-300 hover:text-amber-400"
            )}
          >
            <Star size={14} fill={article.is_starred ? "currentColor" : "none"} />
          </button>
          {!article.is_read && (
            <button
              onClick={() => onMarkRead(article.id)}
              className="p-1.5 rounded text-gray-300 hover:text-gray-500 transition-colors"
              title="Mark as read"
            >
              <Eye size={14} />
            </button>
          )}
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => onMarkRead(article.id)}
            className="p-1.5 text-gray-300 hover:text-teal-600 transition-colors"
          >
            <ExternalLink size={14} />
          </a>
        </div>
      </div>
    </div>
  );
}
