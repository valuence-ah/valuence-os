// ─── LPs page skeleton ────────────────────────────────────────────────────────
import { Skeleton, SkeletonList } from "@/components/ui/skeleton";

export default function LpsLoading() {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between">
        <div className="space-y-1">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>

      {/* Filter / search bar */}
      <div className="px-6 py-3 border-b border-slate-100 bg-white flex items-center gap-3">
        <Skeleton className="h-9 w-64 rounded-lg" />
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <SkeletonList rows={8} cols={6} />
      </div>
    </div>
  );
}
