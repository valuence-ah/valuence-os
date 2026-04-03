"use client";
import { useState } from "react";
import { FileText, ExternalLink, RefreshCw, Loader2 } from "lucide-react";
import type { PortfolioReport } from "@/lib/types";

interface Props {
  companyId: string;
  reports: PortfolioReport[];
  onReportReExtracted: () => void;
}

const REPORT_TYPE_BADGE: Record<string, string> = {
  monthly:   "bg-blue-50 text-blue-700",
  quarterly: "bg-violet-50 text-violet-700",
  annual:    "bg-emerald-50 text-emerald-700",
  board:     "bg-amber-50 text-amber-700",
  other:     "bg-slate-100 text-slate-500",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function PortfolioDocumentsTab({ companyId, reports, onReportReExtracted }: Props) {
  const [reExtracting, setReExtracting] = useState<string | null>(null);

  async function handleReExtract(report: PortfolioReport) {
    setReExtracting(report.id);
    try {
      // Download the file from storage and re-upload for extraction
      const res = await fetch(`/api/portfolio/re-extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: report.id, company_id: companyId }),
      });
      if (res.ok) onReportReExtracted();
    } catch {
      // silent
    } finally {
      setReExtracting(null);
    }
  }

  return (
    <div className="p-5 space-y-5 overflow-y-auto h-full">
      {/* Uploaded reports */}
      <div>
        <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Uploaded reports</h3>
        {reports.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 rounded-xl">
            <FileText size={24} className="text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-400">No reports uploaded yet</p>
            <p className="text-[11px] text-slate-400 mt-1">Use the &quot;Upload report&quot; button at the top to add quarterly or board reports</p>
          </div>
        ) : (
          <div className="space-y-2">
            {reports.map(r => (
              <div key={r.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors group">
                <FileText size={18} className="text-slate-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-[13px] font-medium text-slate-800 truncate">{r.file_name}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0 ${REPORT_TYPE_BADGE[r.report_type] ?? "bg-slate-100 text-slate-500"}`}>
                      {r.report_type}
                    </span>
                    {r.period && (
                      <span className="text-[10px] text-slate-500 flex-shrink-0">{r.period}</span>
                    )}
                    {r.ai_extracted && (
                      <span className="text-[10px] text-teal-600 font-medium flex-shrink-0">AI extracted</span>
                    )}
                  </div>
                  {r.ai_summary && (
                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{r.ai_summary}</p>
                  )}
                  <p className="text-[10px] text-slate-400 mt-0.5">{formatDate(r.uploaded_at)}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleReExtract(r)}
                    disabled={reExtracting === r.id}
                    title="Re-run AI extraction"
                    className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
                  >
                    {reExtracting === r.id ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <RefreshCw size={14} />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Placeholder for additional document types */}
      <div>
        <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Other documents</h3>
        <div className="text-center py-6 bg-slate-50 rounded-xl">
          <ExternalLink size={18} className="text-slate-300 mx-auto mb-2" />
          <p className="text-xs text-slate-400">
            Pitch decks, board materials, and cap tables are stored in your{" "}
            <span className="text-blue-500">Google Drive folder</span>
          </p>
        </div>
      </div>
    </div>
  );
}
