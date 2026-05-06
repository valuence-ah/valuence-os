export default function Loading() {
  return (
    <div className="flex-1 flex flex-col h-full animate-pulse overflow-auto">
      {/* Header */}
      <div className="px-4 md:px-8 py-5 border-b border-slate-100 flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-6 w-40 bg-slate-200 rounded-md" />
          <div className="h-4 w-28 bg-slate-100 rounded-md" />
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 space-y-6">
        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-slate-100 rounded-xl" />
          ))}
        </div>

        {/* Chart area */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 h-56 bg-slate-100 rounded-xl" />
          <div className="h-56 bg-slate-100 rounded-xl" />
        </div>

        {/* Recent activity table */}
        <div className="space-y-2">
          <div className="h-5 w-32 bg-slate-200 rounded-md" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 bg-slate-100 rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}
