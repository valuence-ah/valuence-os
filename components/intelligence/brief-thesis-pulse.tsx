"use client";
// ─── Brief Thesis Pulse ────────────────────────────────────────────────────────

interface KeywordStat {
  keyword: string;
  match_count: number;
}

interface BriefThesisPulseProps {
  keywordStats: KeywordStat[];
}

export function BriefThesisPulse({ keywordStats }: BriefThesisPulseProps) {
  if (keywordStats.length === 0) return null;

  const maxCount = Math.max(...keywordStats.map(k => k.match_count), 1);

  return (
    <div className="border-t border-gray-200 pt-5 mt-6">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-3">
        Thesis pulse (last 30 days)
      </p>
      <div className="flex flex-wrap gap-1.5">
        {keywordStats.map(({ keyword, match_count }) => {
          const intensity = match_count / maxCount;
          const bgClass =
            intensity > 0.7 ? "bg-teal-700 text-white" :
            intensity > 0.4 ? "bg-teal-500 text-white" :
            intensity > 0.2 ? "bg-teal-200 text-teal-900" :
                              "bg-teal-50 text-teal-800";
          return (
            <span
              key={keyword}
              className={`text-xs px-3 py-1 rounded-full font-medium ${bgClass}`}
            >
              {keyword} ({match_count})
            </span>
          );
        })}
      </div>
    </div>
  );
}
