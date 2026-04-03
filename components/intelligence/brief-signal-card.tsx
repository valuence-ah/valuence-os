"use client";
// ─── Brief Signal Card ─────────────────────────────────────────────────────────

import type { FeedArticle } from "@/lib/types";

// ── Helpers ────────────────────────────────────────────────────────────────────

export function formatStage(stage: string | null): string {
  const map: Record<string, string> = {
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
  return stage ? (map[stage] ?? stage) : "";
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 60)  return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  return `${days}d ago`;
}

function getWhyBlockColors(bucket: string) {
  switch (bucket) {
    case "startup_round":  return { bg: "bg-emerald-50", text: "text-emerald-800" };
    case "fund_raise":     return { bg: "bg-purple-50",  text: "text-purple-800"  };
    case "ma_partnership": return { bg: "bg-orange-50",  text: "text-orange-800"  };
    default:               return { bg: "bg-gray-50",    text: "text-gray-700"    };
  }
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface BriefSignalCardProps {
  article: FeedArticle;
  sourceName?: string;
  onDismiss: (article: FeedArticle) => void;
  onAddToPipeline: (article: FeedArticle) => void;
  onAddToFunds: (article: FeedArticle) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function BriefSignalCard({
  article,
  sourceName,
  onDismiss,
  onAddToPipeline,
  onAddToFunds,
}: BriefSignalCardProps) {
  const { bg: whyBg, text: whyText } = getWhyBlockColors(article.bucket);

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors bg-white">

      {/* Badge row */}
      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
        {article.sectors?.includes("cleantech") && (
          <span className="inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300">
            Cleantech
          </span>
        )}
        {article.sectors?.includes("biotech") && (
          <span className="inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full bg-purple-50 text-purple-800 border border-purple-300">
            Biotech
          </span>
        )}
        {article.sectors?.includes("advanced_materials") && (
          <span className="inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full bg-blue-50 text-blue-800 border border-blue-300">
            Adv. materials
          </span>
        )}
        {article.sectors?.includes("climate_energy") && (
          <span className="inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full bg-amber-50 text-amber-800 border border-amber-300">
            Climate + energy
          </span>
        )}
        {(article.deal_stage || article.deal_amount) && (
          <span className="inline-flex px-2 py-0.5 text-[10px] font-medium rounded-full bg-amber-50 text-amber-800 border border-amber-200">
            {formatStage(article.deal_stage)}
            {article.deal_amount ? ` / ${article.deal_amount}` : ""}
          </span>
        )}
        {article.thesis_keywords?.slice(0, 2).map((kw: string) => (
          <span key={kw} className="inline-flex px-2 py-0.5 text-[10px] rounded-full bg-gray-100 text-gray-500">
            {kw}
          </span>
        ))}
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-gray-900 mb-1">
        <a href={article.url} target="_blank" rel="noopener noreferrer" className="hover:text-teal-700 transition-colors">
          {article.title}
        </a>
      </h3>

      {/* Description */}
      {article.summary && (
        <p className="text-xs text-gray-500 mb-3 leading-relaxed line-clamp-2">
          {article.summary}
        </p>
      )}

      {/* Why this matters */}
      {article.ai_why_relevant && (
        <div className={`rounded-lg p-3 mb-3 ${whyBg}`}>
          <p className={`text-xs leading-relaxed ${whyText}`}>
            <span className="font-medium">Why this matters: </span>
            {article.ai_why_relevant}
          </p>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {sourceName && (
            <span className="text-[11px] text-gray-400">{sourceName}</span>
          )}
          <span className="text-[11px] text-gray-400">{timeAgo(article.published_at)}</span>
          {(article.matched_company_ids?.length ?? 0) > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded border border-emerald-400 text-emerald-700 font-medium">
              In pipeline
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          {article.bucket === "startup_round" && (
            <button
              onClick={() => onAddToPipeline(article)}
              className="text-[11px] px-2.5 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              Add to Pipeline
            </button>
          )}
          {article.bucket === "fund_raise" && (
            <button
              onClick={() => onAddToFunds(article)}
              className="text-[11px] px-2.5 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
            >
              Add to Funds CRM
            </button>
          )}
          {article.bucket === "ma_partnership" && (
            <button className="text-[11px] px-2.5 py-1 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors">
              Save to IC notes
            </button>
          )}
          <button
            onClick={() => onDismiss(article)}
            className="text-[11px] px-2.5 py-1 rounded-md border border-gray-200 text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
