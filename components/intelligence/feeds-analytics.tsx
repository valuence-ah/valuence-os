"use client";
// ─── Feeds Analytics ──────────────────────────────────────────────────────────
// Bottom panels: thesis keyword heatmap + most active co-investors.

import { useMemo } from "react";
import type React from "react";
import { TrendingUp, Tag } from "lucide-react";
import type { FeedArticle } from "@/lib/types";

interface FeedsAnalyticsProps {
  articles: FeedArticle[];
}

export function FeedsAnalytics({ articles }: FeedsAnalyticsProps) {
  // Build keyword frequency map from last 30 days
  const keywordFreq = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const freq: Record<string, number> = {};
    for (const a of articles) {
      if (a.published_at && new Date(a.published_at).getTime() < cutoff) continue;
      for (const kw of a.thesis_keywords ?? []) {
        freq[kw] = (freq[kw] ?? 0) + 1;
      }
    }
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30);
  }, [articles]);

  // Build investor frequency map
  const investorFreq = useMemo(() => {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const freq: Record<string, number> = {};
    for (const a of articles) {
      if (a.published_at && new Date(a.published_at).getTime() < cutoff) continue;
      for (const inv of a.mentioned_investors ?? []) {
        if (inv.trim()) freq[inv] = (freq[inv] ?? 0) + 1;
      }
    }
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [articles]);

  const maxInvestorCount = investorFreq[0]?.[1] ?? 1;

  // Inline teal opacity gradient — smooth continuous scale
  const maxKwCount = keywordFreq[0]?.[1] ?? 1;
  function kwStyle(count: number): React.CSSProperties {
    const pct = count / maxKwCount;
    const alpha = 0.08 + pct * 0.82; // 0.08 → 0.9
    return {
      backgroundColor: `rgba(13, 148, 136, ${alpha})`,
      color: pct > 0.45 ? "white" : "rgb(15, 110, 86)",
      borderColor: `rgba(13, 148, 136, ${alpha + 0.1})`,
    };
  }

  if (!keywordFreq.length && !investorFreq.length) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 px-6 pb-6 pt-2">
      {/* Keyword heatmap */}
      {keywordFreq.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <Tag size={14} className="text-teal-600" />
            <h3 className="text-sm font-semibold text-gray-800">Thesis keywords this month</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {keywordFreq.map(([kw, count]) => (
              <span
                key={kw}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-full border"
                style={kwStyle(count)}
                title={`${count} articles`}
              >
                {kw}
                <span className="opacity-70 text-[10px]">{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Co-investor activity */}
      {investorFreq.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp size={14} className="text-teal-600" />
            <h3 className="text-sm font-semibold text-gray-800">Most active co-investors this month</h3>
          </div>
          <div className="space-y-2.5">
            {investorFreq.map(([name, count]) => (
              <div key={name} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-700 font-medium truncate">{name}</span>
                  <span className="text-gray-400 flex-shrink-0 ml-2">{count} {count === 1 ? "deal" : "deals"}</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 rounded-full transition-all"
                    style={{ width: `${(count / maxInvestorCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
