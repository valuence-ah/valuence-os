export default function Loading() {
  return (
    <div className="flex-1 flex flex-col h-full animate-pulse overflow-auto">
      {/* Header */}
      <div className="px-4 md:px-8 py-5 border-b border-slate-100 flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-6 w-24 bg-slate-200 rounded-md" />
          <div className="h-4 w-40 bg-slate-100 rounded-md" />
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 space-y-6">
        {/* Tab bar */}
        <div className="flex gap-1 border-b border-slate-100 pb-0">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 w-24 bg-slate-200 rounded-t-lg mx-1" />
          ))}
        </div>

        {/* Table header */}
        <div className="flex gap-3 px-3 py-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-4 bg-slate-200 rounded flex-1" />
          ))}
        </div>

        {/* Table rows */}
        <div className="space-y-1">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex gap-3 px-3 py-2.5 bg-white border border-slate-50 rounded-lg">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="h-4 bg-slate-100 rounded flex-1" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
