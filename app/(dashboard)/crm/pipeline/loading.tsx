export default function Loading() {
  return (
    <div className="flex flex-col h-full animate-pulse">
      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-6 w-28 bg-slate-200 rounded-md" />
          <div className="h-4 w-20 bg-slate-100 rounded-md" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-32 bg-slate-200 rounded-lg" />
          <div className="h-8 w-24 bg-slate-200 rounded-lg" />
        </div>
      </div>

      {/* Split pane */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel — scrollable company list */}
        <div className="w-80 flex-shrink-0 border-r border-slate-100 flex flex-col">
          {/* Search bar */}
          <div className="px-3 py-3 border-b border-slate-100">
            <div className="h-9 bg-slate-200 rounded-lg w-full" />
          </div>

          {/* List items */}
          <div className="flex-1 overflow-hidden">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-3 border-b border-slate-50">
                <div className="w-8 h-8 rounded-md bg-slate-200 flex-shrink-0" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="h-3.5 bg-slate-200 rounded w-3/4" />
                  <div className="flex gap-1.5">
                    <div className="h-3 bg-slate-100 rounded w-16" />
                    <div className="h-3 bg-slate-100 rounded w-12" />
                  </div>
                </div>
                <div className="w-4 h-4 bg-slate-100 rounded flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>

        {/* Right panel — company detail */}
        <div className="flex-1 flex flex-col overflow-hidden p-4 md:p-6 space-y-5">
          {/* Company header */}
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-slate-200 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-6 bg-slate-200 rounded w-48" />
              <div className="flex gap-2">
                <div className="h-5 bg-slate-100 rounded-full w-24" />
                <div className="h-5 bg-slate-100 rounded-full w-20" />
                <div className="h-5 bg-slate-100 rounded-full w-16" />
              </div>
            </div>
          </div>

          {/* KPI tiles */}
          <div className="grid grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 bg-slate-100 rounded-lg" />
            ))}
          </div>

          {/* Tab bar */}
          <div className="flex gap-4 border-b border-slate-100 pb-0">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-4 bg-slate-200 rounded w-16 mb-3" />
            ))}
          </div>

          {/* Content area */}
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-16 bg-slate-100 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
