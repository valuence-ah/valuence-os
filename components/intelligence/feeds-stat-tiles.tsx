"use client";
// ─── Feeds Stat Tiles ─────────────────────────────────────────────────────────
// Three clickable bucket tiles shown above the main feed area.

import type { FeedBucket } from "@/lib/types";

interface BucketConfig {
  bucket: FeedBucket;
  label: string;
  color: string;
}

const BUCKETS: BucketConfig[] = [
  { bucket: "fund_raise",     label: "Fund launches + raises",   color: "#534AB7" },
  { bucket: "startup_round",  label: "Startup rounds",           color: "#1D9E75" },
  { bucket: "ma_partnership", label: "M&A + partnerships",       color: "#D85A30" },
];

interface FeedsStatTilesProps {
  counts: Record<FeedBucket, number>;
  activeTab: "all" | FeedBucket;
  onTabChange: (tab: "all" | FeedBucket) => void;
}

export function FeedsStatTiles({ counts, activeTab, onTabChange }: FeedsStatTilesProps) {
  return (
    <div className="grid grid-cols-3 gap-4 px-6 pb-4 pt-2">
      {BUCKETS.map(({ bucket, label, color }) => {
        const active = activeTab === bucket;
        return (
          <button
            key={bucket}
            onClick={() => onTabChange(active ? "all" : bucket)}
            className={`bg-white border rounded-xl p-4 text-left transition-all hover:shadow-md ${
              active
                ? "border-gray-400 shadow-md ring-1 ring-gray-300"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                {label}
              </span>
            </div>
            <div className="text-2xl font-semibold text-gray-900">
              {counts[bucket] ?? 0}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">articles this week</div>
          </button>
        );
      })}
    </div>
  );
}
