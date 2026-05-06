export default function Loading() {
  return (
    <div className="flex-1 flex flex-col h-full animate-pulse overflow-auto">
      {/* Header */}
      <div className="px-4 md:px-8 py-5 border-b border-slate-100 flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-6 w-28 bg-slate-200 rounded-md" />
          <div className="h-4 w-20 bg-slate-100 rounded-md" />
        </div>
        <div className="h-8 w-36 bg-slate-200 rounded-lg" />
      </div>

      <div className="px-4 md:px-8 py-6 space-y-3">
        {/* Memo cards */}
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start gap-4 p-4 bg-white border border-slate-100 rounded-xl">
            <div className="w-10 h-10 rounded-lg bg-slate-200 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-slate-200 rounded w-3/4" />
              <div className="h-3 bg-slate-100 rounded w-1/2" />
              <div className="flex gap-2">
                <div className="h-5 bg-slate-100 rounded-full w-16" />
                <div className="h-5 bg-slate-100 rounded-full w-20" />
              </div>
            </div>
            <div className="h-3 bg-slate-100 rounded w-16 flex-shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
