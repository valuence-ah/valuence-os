// ─── Pipeline page skeleton — shown while companies load ──────────────────────
import { Skeleton, SkeletonKanbanColumn } from "@/components/ui/skeleton";

const COLUMNS = [
  { label: "Identified",    cards: 4 },
  { label: "1st Meeting",   cards: 3 },
  { label: "Discussion",    cards: 2 },
  { label: "Tracking/Hold", cards: 2 },
  { label: "Due Diligence", cards: 1 },
  { label: "Portfolio",     cards: 2 },
];

export default function PipelineLoading() {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center justify-between">
        <div className="space-y-1">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-3 w-40" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-48 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
      </div>

      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-4 min-w-max">
          {COLUMNS.map(({ label, cards }) => (
            <SkeletonKanbanColumn key={label} cards={cards} />
          ))}
        </div>
      </div>
    </div>
  );
}
