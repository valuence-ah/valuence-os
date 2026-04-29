export default function Loading() {
  return (
    <div className="flex flex-col h-full animate-pulse">
      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-6 w-36 bg-slate-200 rounded-md" />
          <div className="h-4 w-20 bg-slate-100 rounded-md" />
        </div>
        <div className="h-8 w-28 bg-slate-200 rounded-lg" />
      </div>

      <div className="flex-1 overflow-auto p-4 md:p-6 space-y-4">
        {/* Search + filter row */}
        <div className="flex items-center gap-3">
          <div className="h-9 bg-slate-200 rounded-lg flex-1 max-w-xs" />
          <div className="h-9 w-24 bg-slate-200 rounded-lg" />
          <div className="h-9 w-24 bg-slate-200 rounded-lg" />
          <div className="h-9 w-24 bg-slate-200 rounded-lg" />
        </div>

        {/* Table */}
        <div className="rounded-lg border border-slate-100 overflow-hidden">
          {/* Table header */}
          <div className="flex items-center gap-4 px-4 py-3 bg-slate-50 border-b border-slate-100">
            <div className="w-7 h-7 flex-shrink-0" />
            <div className="flex-1 h-3 bg-slate-200 rounded w-20" />
            <div className="w-28 h-3 bg-slate-200 rounded hidden md:block" />
            <div className="w-24 h-3 bg-slate-200 rounded hidden md:block" />
            <div className="w-24 h-3 bg-slate-200 rounded hidden lg:block" />
            <div className="w-24 h-3 bg-slate-200 rounded hidden lg:block" />
          </div>

          {/* Table rows */}
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3 border-b border-slate-50 last:border-0">
              <div className="w-7 h-7 rounded-md bg-slate-200 flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 bg-slate-200 rounded w-40" />
                <div className="flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-slate-100" />
                  <div className="h-2.5 w-2.5 rounded-full bg-slate-100" />
                  <div className="h-2.5 w-2.5 rounded-full bg-slate-100" />
                </div>
              </div>
              <div className="w-28 h-5 bg-slate-100 rounded-full hidden md:block" />
              <div className="w-24 h-5 bg-slate-100 rounded-full hidden md:block" />
              <div className="w-24 h-5 bg-slate-100 rounded-full hidden lg:block" />
              <div className="w-24 h-3 bg-slate-100 rounded hidden lg:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
