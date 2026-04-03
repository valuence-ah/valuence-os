"use client";
// ─── Feeds Sidebar ────────────────────────────────────────────────────────────
// Left 220px panel: source groups, sector filters, relevance filters, watchlist.

import { useState } from "react";
import { RefreshCw, Plus, Trash2, Globe, Rss, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeedSource, FeedWatchlistItem, FeedBucket } from "@/lib/types";

interface SourceGroup {
  heading: string;
  bucket: FeedBucket;
}

const SOURCE_GROUPS: SourceGroup[] = [
  { heading: "Fund launches + raises",   bucket: "fund_raise"     },
  { heading: "Startup rounds",           bucket: "startup_round"  },
  { heading: "M&A + partnerships",       bucket: "ma_partnership" },
];

const SECTORS = [
  { key: "cleantech",          label: "Cleantech",       cls: "bg-emerald-50  text-emerald-800 border-emerald-300  hover:bg-emerald-100" },
  { key: "biotech",            label: "Biotech",         cls: "bg-purple-50   text-purple-800  border-purple-300   hover:bg-purple-100"  },
  { key: "advanced_materials", label: "Adv. materials",  cls: "bg-blue-50     text-blue-800    border-blue-300     hover:bg-blue-100"    },
  { key: "climate_energy",     label: "Climate + energy",cls: "bg-amber-50    text-amber-800   border-amber-300    hover:bg-amber-100"   },
];

const RELEVANCE_FILTERS = [
  { key: "pipeline_match",     label: "Pipeline match"    },
  { key: "portfolio_match",    label: "Portfolio match"   },
  { key: "thesis_match",       label: "Thesis match"      },
  { key: "coinvestor_activity",label: "Watchlist activity" },
  { key: "lp_activity",        label: "LP activity"       },
];

interface FeedsSidebarProps {
  sources: FeedSource[];
  watchlist: FeedWatchlistItem[];
  selectedSource: string | null;
  selectedSectors: string[];
  selectedRelevance: string | null;
  showUnread: boolean;
  showStarred: boolean;
  showSaved: boolean;
  articleCounts: { unread: number; starred: number; saved: number; total: number };
  refreshing: string | null;
  onSelectSource: (id: string | null) => void;
  onToggleSector: (sector: string) => void;
  onSelectRelevance: (tag: string | null) => void;
  onSetUnread: (v: boolean) => void;
  onSetStarred: (v: boolean) => void;
  onSetSaved: (v: boolean) => void;
  onRefreshSource: (id?: string) => void;
  onDeleteSource: (id: string) => void;
  onAddSourceClick: () => void;
}

export function FeedsSidebar({
  sources,
  watchlist,
  selectedSource,
  selectedSectors,
  selectedRelevance,
  showUnread,
  showStarred,
  showSaved,
  articleCounts,
  refreshing,
  onSelectSource,
  onToggleSector,
  onSelectRelevance,
  onSetUnread,
  onSetStarred,
  onSetSaved,
  onRefreshSource,
  onDeleteSource,
  onAddSourceClick,
}: FeedsSidebarProps) {
  const [openSection, setOpenSection] = useState<string | null>(null);

  function toggle(section: string) {
    setOpenSection(prev => prev === section ? null : section);
  }

  return (
    <div className="w-[220px] flex-shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="px-3 py-3 border-b border-gray-200 flex items-center justify-between">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">Sources</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onRefreshSource()}
            disabled={refreshing === "all"}
            title="Refresh all"
            className="p-1.5 text-gray-400 hover:text-teal-600 transition-colors disabled:opacity-40"
          >
            <RefreshCw size={12} className={cn(refreshing === "all" && "animate-spin")} />
          </button>
          <button
            onClick={onAddSourceClick}
            title="Add source"
            className="p-1.5 text-gray-400 hover:text-teal-600 transition-colors"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      {/* Quick filters */}
      <div className="px-2 py-2 border-b border-gray-100 space-y-0.5">
        <SidebarItem
          label="All Articles"
          count={articleCounts.total}
          icon={<Rss size={12} />}
          active={!selectedSource && !showUnread && !showStarred && !showSaved && selectedSectors.length === 0 && !selectedRelevance}
          onClick={() => { onSelectSource(null); onSetUnread(false); onSetStarred(false); onSetSaved(false); }}
        />
        {articleCounts.unread > 0 && (
          <SidebarItem
            label="Unread"
            count={articleCounts.unread}
            active={showUnread}
            onClick={() => { onSelectSource(null); onSetUnread(!showUnread); onSetStarred(false); onSetSaved(false); }}
          />
        )}
        {articleCounts.starred > 0 && (
          <SidebarItem
            label="Starred"
            count={articleCounts.starred}
            icon={<Star size={12} />}
            active={showStarred}
            onClick={() => { onSelectSource(null); onSetStarred(!showStarred); onSetUnread(false); onSetSaved(false); }}
          />
        )}
        {articleCounts.saved > 0 && (
          <SidebarItem
            label="Saved"
            count={articleCounts.saved}
            active={showSaved}
            onClick={() => { onSelectSource(null); onSetSaved(!showSaved); onSetUnread(false); onSetStarred(false); }}
          />
        )}
      </div>

      {/* Source groups */}
      {SOURCE_GROUPS.map(({ heading, bucket }) => {
        const groupSources = sources.filter(s => s.bucket_affinity === bucket);
        const uncategorised = bucket === "fund_raise" && sources.filter(s => !s.bucket_affinity || s.bucket_affinity === "uncategorized");
        const allSources = bucket === "fund_raise"
          ? [...groupSources, ...(uncategorised ? uncategorised : [])]
          : groupSources;
        if (!allSources.length) return null;

        return (
          <div key={bucket} className="border-b border-gray-100">
            <button
              onClick={() => toggle(bucket)}
              className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-gray-50"
            >
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em]">
                {heading}
              </span>
              <span className="text-[10px] text-gray-300">{openSection === bucket ? "▲" : "▼"}</span>
            </button>
            {openSection === bucket && (
              <div className="px-2 pb-2 space-y-0.5">
                {allSources.map(source => (
                  <div
                    key={source.id}
                    className={cn(
                      "group flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors",
                      selectedSource === source.id
                        ? "bg-teal-50 text-teal-700 font-medium"
                        : "text-gray-600 hover:bg-gray-50"
                    )}
                    onClick={() => onSelectSource(source.id === selectedSource ? null : source.id)}
                  >
                    <span className="truncate flex-1">{source.name}</span>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={e => { e.stopPropagation(); onRefreshSource(source.id); }}
                        disabled={refreshing === source.id}
                        className="p-0.5 text-gray-400 hover:text-teal-600"
                      >
                        <RefreshCw size={10} className={cn(refreshing === source.id && "animate-spin")} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); onDeleteSource(source.id); }}
                        className="p-0.5 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                    {source.article_count > 0 && (
                      <span className="text-[10px] text-gray-400 group-hover:hidden">{source.article_count}</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Sector filter */}
      <div className="px-3 py-2 border-b border-gray-100">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-2">Sectors</p>
        <div className="flex flex-wrap gap-1.5">
          {SECTORS.map(({ key, label, cls }) => (
            <button
              key={key}
              onClick={() => onToggleSector(key)}
              className={cn(
                "inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full border transition-colors",
                selectedSectors.includes(key) ? cls : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* CRM relevance filter */}
      <div className="px-3 py-2 border-b border-gray-100">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-2">CRM Relevance</p>
        <div className="space-y-0.5">
          {RELEVANCE_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onSelectRelevance(selectedRelevance === key ? null : key)}
              className={cn(
                "w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors",
                selectedRelevance === key
                  ? "bg-teal-50 text-teal-700 font-medium"
                  : "text-gray-600 hover:bg-gray-50"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Watchlist */}
      {watchlist.length > 0 && (
        <div className="px-3 py-2">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.1em] mb-2">Watchlist</p>
          <div className="space-y-1">
            {watchlist.slice(0, 8).map(item => (
              <div key={item.id} className="flex items-center justify-between">
                <span className="text-xs text-gray-700 font-medium truncate">{item.name}</span>
                <span className="text-[10px] text-gray-400 capitalize">{item.type}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty sources state */}
      {sources.length === 0 && (
        <div className="px-4 py-6 text-center flex-1 flex flex-col items-center justify-center">
          <Globe size={24} className="text-gray-300 mb-2" />
          <p className="text-xs text-gray-400">No feeds yet</p>
          <button onClick={onAddSourceClick} className="mt-2 text-xs text-teal-600 hover:text-teal-700">
            Add one →
          </button>
        </div>
      )}
    </div>
  );
}

function SidebarItem({
  label,
  count,
  icon,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  icon?: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors flex items-center justify-between",
        active ? "bg-teal-50 text-teal-700 font-medium" : "text-gray-600 hover:bg-gray-50"
      )}
    >
      <span className="flex items-center gap-1.5">
        {icon}
        {label}
      </span>
      {count !== undefined && (
        <span className="text-[10px] text-gray-400">{count}</span>
      )}
    </button>
  );
}
