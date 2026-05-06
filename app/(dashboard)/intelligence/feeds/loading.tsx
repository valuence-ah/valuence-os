export default function Loading() {
  return (
    <div className="flex-1 flex flex-col h-full animate-pulse overflow-auto">
      {/* Header */}
      <div className="px-4 md:px-8 py-5 border-b border-slate-100 flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-6 w-28 bg-slate-200 rounded-md" />
          <div className="h-4 w-36 bg-slate-100 rounded-md" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-24 bg-slate-200 rounded-lg" />
          <div className="h-8 w-28 bg-slate-200 rounded-lg" />
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: feed sources sidebar */}
        <div className="w-64 flex-shrink-0 border-r border-slate-100 p-3 space-y-2">
          <div className="h-8 bg-slate-200 rounded-lg mb-3" />
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 p-2">
              <div className="w-6 h-6 rounded bg-slate-200 flex-shrink-0" />
              <div className="flex-1 h-3.5 bg-slate-100 rounded" />
            </div>
          ))}
        </div>

        {/* Right: articles */}
        <div className="flex-1 p-4 md:p-6 space-y-3 overflow-hidden">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex gap-3 p-3 bg-white border border-slate-100 rounded-lg">
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-slate-200 rounded w-3/4" />
                <div className="h-3 bg-slate-100 rounded w-1/2" />
                <div className="flex gap-2">
                  <div className="h-4 bg-slate-100 rounded-full w-16" />
                  <div className="h-4 bg-slate-100 rounded-full w-20" />
                </div>
              </div>
              <div className="w-16 h-3 bg-slate-100 rounded flex-shrink-0 mt-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
