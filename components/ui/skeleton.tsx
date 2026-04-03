// ─── Skeleton loading primitives ──────────────────────────────────────────────
// Use these inside loading.tsx files so users see a layout placeholder
// instead of a blank screen while server data is fetching.

import { cn } from "@/lib/utils";

// Single animated block — pass className to control size/shape
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-slate-100",
        className
      )}
    />
  );
}

// One row of the table/list skeletons used on most pages
export function SkeletonRow({ cols = 4 }: { cols?: number }) {
  const widths = ["w-1/4", "w-1/3", "w-1/5", "w-1/6", "w-1/4", "w-1/5"];
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-slate-100">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-4 flex-1", widths[i % widths.length])}
        />
      ))}
    </div>
  );
}

// Stack of N skeleton rows with a header row
export function SkeletonList({
  rows = 8,
  cols = 4,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div className={cn("card overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-slate-100 bg-slate-50">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1 max-w-[120px]" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} cols={cols} />
      ))}
    </div>
  );
}

// Stat card skeleton matching the dashboard / summary bar style
export function SkeletonStatCard() {
  return (
    <div className="card p-4 space-y-3">
      <Skeleton className="h-8 w-8 rounded-lg" />
      <Skeleton className="h-7 w-16" />
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

// Kanban column skeleton for the pipeline loading screen
export function SkeletonKanbanColumn({ cards = 3 }: { cards?: number }) {
  return (
    <div className="w-[220px] flex-shrink-0 space-y-2">
      <div className="flex items-center justify-between px-1 mb-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-5 w-6 rounded-full" />
      </div>
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="card p-3 space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <div className="flex gap-1 pt-1">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-10 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
