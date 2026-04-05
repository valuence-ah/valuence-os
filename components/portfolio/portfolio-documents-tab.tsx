"use client";
import { useState } from "react";
import { FileText, ExternalLink, RefreshCw, Loader2, Pencil, Check, X, Eye } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
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
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  // Preview modal for pasted-text reports (no file)
  const [previewReport, setPreviewReport] = useState<PortfolioReport | null>(null);

  async function handleReExtract(report: PortfolioReport) {
    setReExtracting(report.id);
    try {
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

  function handleStartEditTitle(report: PortfolioReport) {
    setEditingTitleId(report.id);
    setEditTitle(report.file_name === "pasted-text" ? "" : report.file_name);
  }

  async function handleSaveTitle(reportId: string) {
    if (!editTitle.trim()) { setEditingTitleId(null); return; }
    setSavingTitle(true);
    const supabase = createClient();
    await supabase.from("portfolio_reports").update({ file_name: editTitle.trim() }).eq("id", reportId);
    setSavingTitle(false);
    setEditingTitleId(null);
    onReportReExtracted(); // refresh parent
  }

  async function handleOpenReport(report: PortfolioReport) {
    // Text-paste reports: show summary modal
    if (report.storage_path === "text-paste" || report.file_name === "pasted-text") {
      setPreviewReport(report);
      return;
    }
    // File reports: get signed URL from Supabase storage
    setOpeningId(report.id);
    try {
      const supabase = createClient();
      const { data } = await supabase.storage
        .from("documents")
        .createSignedUrl(report.storage_path, 3600);
      if (data?.signedUrl) {
        window.open(data.signedUrl, "_blank", "noopener noreferrer");
      }
    } catch {
      // silent
    } finally {
      setOpeningId(null);
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
          <>
          <div className="space-y-2">
            {reports.map(r => (
              <div key={r.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors group">
                {/* File icon — click to open */}
                <button
                  onClick={() => handleOpenReport(r)}
                  disabled={openingId === r.id}
                  title="View document"
                  className="text-slate-400 hover:text-blue-500 flex-shrink-0 transition-colors disabled:opacity-50"
                >
                  {openingId === r.id
                    ? <Loader2 size={18} className="animate-spin" />
                    : <FileText size={18} />
                  }
                </button>

                <div className="flex-1 min-w-0">
                  {/* Editable title row */}
                  {editingTitleId === r.id ? (
                    <div className="flex items-center gap-1.5 mb-1">
                      <input
                        autoFocus
                        value={editTitle}
                        onChange={e => setEditTitle(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") handleSaveTitle(r.id); if (e.key === "Escape") setEditingTitleId(null); }}
                        className="flex-1 text-xs border border-slate-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      <button onClick={() => handleSaveTitle(r.id)} disabled={savingTitle} className="text-teal-600 hover:text-teal-800 disabled:opacity-50">
                        <Check size={13} />
                      </button>
                      <button onClick={() => setEditingTitleId(null)} className="text-slate-400 hover:text-slate-600">
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => handleOpenReport(r)}
                        className="text-[13px] font-medium text-slate-800 hover:text-blue-600 truncate text-left transition-colors"
                        title="Click to view"
                      >
                        {r.file_name === "pasted-text" ? (r.period ? `Pasted text — ${r.period}` : "Pasted text") : r.file_name}
                      </button>
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
                  )}
                  {r.ai_summary && (
                    <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">{r.ai_summary}</p>
                  )}
                  <p className="text-[10px] text-slate-400 mt-0.5">{formatDate(r.uploaded_at)}</p>
                </div>

                {/* Action buttons — visible on hover */}
                <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => handleStartEditTitle(r)}
                    title="Edit title"
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => handleOpenReport(r)}
                    title="View document"
                    className="text-slate-400 hover:text-blue-500"
                  >
                    <Eye size={13} />
                  </button>
                  <button
                    onClick={() => handleReExtract(r)}
                    disabled={reExtracting === r.id}
                    title="Re-run AI extraction"
                    className="text-slate-400 hover:text-slate-600 disabled:opacity-50"
                  >
                    {reExtracting === r.id ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <RefreshCw size={13} />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Preview modal for pasted-text reports */}
          {previewReport && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setPreviewReport(null)}>
              <div className="bg-white rounded-xl p-6 w-[560px] max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">{previewReport.file_name === "pasted-text" ? "Pasted text report" : previewReport.file_name}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${REPORT_TYPE_BADGE[previewReport.report_type] ?? "bg-slate-100 text-slate-500"}`}>{previewReport.report_type}</span>
                      {previewReport.period && <span className="text-[11px] text-slate-500">{previewReport.period}</span>}
                    </div>
                  </div>
                  <button onClick={() => setPreviewReport(null)} className="text-slate-400 hover:text-slate-600 p-1"><X size={16} /></button>
                </div>
                {previewReport.ai_summary ? (
                  <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 mb-4">
                    <p className="text-[11px] font-semibold text-blue-700 mb-1">AI summary</p>
                    <p className="text-xs text-blue-800 leading-relaxed">{previewReport.ai_summary}</p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No AI summary available for this report.</p>
                )}
                <p className="text-[10px] text-slate-400">Uploaded {formatDate(previewReport.uploaded_at)}</p>
              </div>
            </div>
          )}
          </>
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
