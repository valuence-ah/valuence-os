export default function Loading() {
  return (
    <div className="flex flex-col h-full animate-pulse">
      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-6 w-28 bg-slate-200 rounded-md" />
          <div className="h-4 w-32 bg-slate-100 rounded-md" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-36 bg-amber-100 rounded-lg" />
          <div className="h-8 w-28 bg-slate-200 rounded-lg" />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
        {/* Stat tiles */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 bg-slate-100 rounded-lg p-3 space-y-2">
              <div className="h-3 bg-slate-200 rounded w-3/4" />
              <div className="h-6 bg-slate-200 rounded w-1/2" />
            </div>
          ))}
        </div>

        {/* Search + filter row */}
        <div className="flex items-center gap-3">
          <div className="h-9 bg-slate-200 rounded-lg flex-1 max-w-sm" />
          <div className="h-9 w-24 bg-slate-200 rounded-lg" />
          <div className="h-9 w-24 bg-slate-200 rounded-lg" />
        </div>

        {/* Table */}
        <div className="rounded-lg border border-slate-100 overflow-hidden">
          {/* Table header */}
          <div className="flex items-center gap-4 px-4 py-3 bg-slate-50 border-b border-slate-100">
            <div className="w-8 h-8 flex-shrink-0" />
            <div className="flex-1 h-3 bg-slate-200 rounded w-20" />
            <div className="w-36 h-3 bg-slate-200 rounded hidden sm:block" />
            <div className="w-32 h-3 bg-slate-200 rounded hidden md:block" />
            <div className="w-28 h-3 bg-slate-200 rounded hidden lg:block" />
            <div className="w-24 h-3 bg-slate-200 rounded hidden lg:block" />
          </div>

          {/* Table rows */}
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-slate-50 last:border-0">
              <div className="w-8 h-8 rounded-full bg-slate-200 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-slate-200 rounded w-36" />
                <div className="h-3 bg-slate-100 rounded w-24" />
              </div>
              <div className="w-36 h-5 bg-slate-100 rounded-full hidden sm:block" />
              <div className="w-32 h-5 bg-slate-100 rounded-full hidden md:block" />
              <div className="w-28 h-5 bg-slate-100 rounded-full hidden lg:block" />
              <div className="w-24 h-3 bg-slate-100 rounded hidden lg:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
