export default function PipelineLoading() {
  return (
    <div className="flex flex-col h-full items-center justify-center gap-3 text-slate-400">
      <div className="w-6 h-6 border-2 border-slate-200 border-t-slate-400 rounded-full animate-spin" />
      <span className="text-xs">Loading pipeline…</span>
    </div>
  );
}
