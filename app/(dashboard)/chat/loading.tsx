export default function Loading() {
  return (
    <div className="flex-1 flex flex-col h-full animate-pulse">
      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="space-y-1.5">
          <div className="h-5 w-24 bg-slate-200 rounded-md" />
          <div className="h-3.5 w-40 bg-slate-100 rounded-md" />
        </div>
        <div className="h-8 w-20 bg-slate-200 rounded-lg" />
      </div>

      {/* Messages area */}
      <div className="flex-1 px-4 md:px-8 py-6 space-y-4 overflow-hidden">
        {/* Assistant message */}
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex-shrink-0" />
          <div className="flex-1 space-y-2 max-w-xl">
            <div className="h-3.5 bg-slate-200 rounded w-full" />
            <div className="h-3.5 bg-slate-200 rounded w-4/5" />
            <div className="h-3.5 bg-slate-200 rounded w-3/5" />
          </div>
        </div>
        {/* User message */}
        <div className="flex gap-3 justify-end">
          <div className="flex-1 space-y-2 max-w-md">
            <div className="h-3.5 bg-slate-100 rounded w-full ml-auto" />
            <div className="h-3.5 bg-slate-100 rounded w-3/4 ml-auto" />
          </div>
          <div className="w-8 h-8 rounded-full bg-slate-200 flex-shrink-0" />
        </div>
        {/* Another assistant message */}
        <div className="flex gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-100 flex-shrink-0" />
          <div className="flex-1 space-y-2 max-w-lg">
            <div className="h-3.5 bg-slate-200 rounded w-full" />
            <div className="h-3.5 bg-slate-200 rounded w-2/3" />
          </div>
        </div>
      </div>

      {/* Input bar */}
      <div className="px-4 md:px-8 py-4 border-t border-slate-100">
        <div className="h-12 bg-slate-100 rounded-xl w-full" />
      </div>
    </div>
  );
}
