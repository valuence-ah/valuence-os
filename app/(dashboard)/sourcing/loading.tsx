export default function Loading() {
  return (
    <div className="flex-1 flex flex-col h-full animate-pulse overflow-auto">
      {/* Header */}
      <div className="px-4 md:px-8 py-5 border-b border-slate-100 flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-6 w-32 bg-slate-200 rounded-md" />
          <div className="h-4 w-24 bg-slate-100 rounded-md" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-28 bg-slate-200 rounded-lg" />
          <div className="h-8 w-24 bg-slate-200 rounded-lg" />
        </div>
      </div>

      <div className="px-4 md:px-8 py-6 space-y-6">
        {/* Status bar */}
        <div className="h-10 bg-slate-100 rounded-lg w-64" />

        {/* Signal cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-36 bg-slate-100 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
