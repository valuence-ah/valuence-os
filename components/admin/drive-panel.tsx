"use client";

import { useState } from "react";
import { FolderOpen, RefreshCw, CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronUp, FileText } from "lucide-react";

type BulkResult = {
  folder:      string;
  company?:    string;
  company_id?: string;
  matched:     boolean;
  synced:      number;
  skipped:     number;
  error?:      string;
};

type BulkSyncResponse = {
  synced_total:   number;
  skipped_total:  number;
  total_folders:  number;
  matched:        number;
  unmatched_count: number;
  unmatched:      string[];
  results:        BulkResult[];
  share_with?:    string;
  error?:         string;
  setup_required?: boolean;
};

type ReextractResult = {
  processed: number; success: number; failed: number;
  results: { name: string; status: "ok" | "error"; chars?: number; reason?: string }[];
  message?: string;
  error?: string;
};

export function DrivePanel() {
  const [folderUrl, setFolderUrl]   = useState("");
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState<BulkSyncResponse | null>(null);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [showDetails, setShowDetails]    = useState(false);
  const [reextracting, setReextracting]  = useState(false);
  const [reextractResult, setReextractResult] = useState<ReextractResult | null>(null);

  async function handleReextract() {
    setReextracting(true);
    setReextractResult(null);
    try {
      const res = await fetch("/api/drive/reextract", { method: "POST" });
      const data = await res.json();
      setReextractResult(data);
    } catch (err) {
      setReextractResult({ error: String(err), processed: 0, success: 0, failed: 0, results: [] });
    } finally {
      setReextracting(false);
    }
  }

  async function handleSync() {
    if (!folderUrl.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/drive/sync-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_url: folderUrl.trim() }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({ error: String(err), synced_total: 0, skipped_total: 0, total_folders: 0, matched: 0, unmatched_count: 0, unmatched: [], results: [] });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-green-500 flex items-center justify-center flex-shrink-0">
          <FolderOpen size={18} className="text-white" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Google Drive — Bulk Company Sync</h2>
          <p className="text-xs text-slate-500 mt-0.5">Paste your top-level "Company" folder URL. All subfolders will be matched to companies and their files ingested.</p>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800 space-y-1.5">
        <p className="font-semibold">Before syncing:</p>
        <ol className="list-decimal list-inside space-y-1 text-blue-700">
          <li>Share the <strong>top-level "Company" folder</strong> with <code className="bg-blue-100 px-1 rounded">{process.env.NEXT_PUBLIC_DRIVE_SA_EMAIL ?? "your service account email"}</code> as Viewer</li>
          <li>Make sure subfolder names match (or partially match) company names in your CRM</li>
          <li>Files inside each subfolder will be downloaded and ingested automatically</li>
        </ol>
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={folderUrl}
          onChange={e => setFolderUrl(e.target.value)}
          placeholder="https://drive.google.com/drive/folders/..."
          className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400"
          onKeyDown={e => e.key === "Enter" && handleSync()}
        />
        <button
          onClick={handleSync}
          disabled={loading || !folderUrl.trim()}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? <RefreshCw size={14} className="animate-spin" /> : <FolderOpen size={14} />}
          {loading ? "Syncing…" : "Sync All Companies"}
        </button>
      </div>

      {loading && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 flex items-center gap-2">
          <RefreshCw size={13} className="animate-spin text-green-500" />
          Scanning subfolders, matching companies, and downloading files… this may take a few minutes.
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="space-y-4">
          {result.error ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-700">
              <p className="font-semibold">Error</p>
              <p className="mt-1">{result.error}</p>
              {result.share_with && (
                <p className="mt-2">Share the folder with: <code className="bg-red-100 px-1 rounded">{result.share_with}</code></p>
              )}
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: "Folders found", value: result.total_folders, color: "slate" },
                  { label: "Companies matched", value: result.matched, color: "green" },
                  { label: "Files synced", value: result.synced_total, color: "blue" },
                  { label: "Unmatched folders", value: result.unmatched_count, color: result.unmatched_count > 0 ? "amber" : "slate" },
                ].map(card => (
                  <div key={card.label} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                    <p className={`text-2xl font-bold text-${card.color}-600`}>{card.value}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{card.label}</p>
                  </div>
                ))}
              </div>

              {/* Unmatched folders */}
              {result.unmatched_count > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setShowUnmatched(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <AlertCircle size={13} />
                      {result.unmatched_count} folder{result.unmatched_count !== 1 ? "s" : ""} could not be matched to a company
                    </span>
                    {showUnmatched ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                  {showUnmatched && (
                    <div className="px-4 pb-3 space-y-1">
                      {result.unmatched.map(name => (
                        <div key={name} className="text-xs text-amber-700 flex items-center gap-1.5">
                          <XCircle size={11} /> {name}
                        </div>
                      ))}
                      <p className="text-xs text-amber-600 mt-2 italic">Tip: Make sure the subfolder name matches the company name in your CRM (partial matches work too).</p>
                    </div>
                  )}
                </div>
              )}

              {/* Per-company details */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <button
                  onClick={() => setShowDetails(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <span>Per-company breakdown</span>
                  {showDetails ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </button>
                {showDetails && (
                  <div className="divide-y divide-slate-100">
                    {result.results.map(r => (
                      <div key={r.folder} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                        {r.matched
                          ? <CheckCircle2 size={13} className="text-green-500 flex-shrink-0" />
                          : <XCircle size={13} className="text-slate-300 flex-shrink-0" />
                        }
                        <span className="font-medium text-slate-700 w-40 truncate" title={r.folder}>{r.folder}</span>
                        {r.matched && (
                          <>
                            <span className="text-slate-400">→</span>
                            <span className="text-slate-600 flex-1 truncate" title={r.company}>{r.company}</span>
                            <span className="text-green-600 font-medium ml-auto">{r.synced} synced</span>
                            {r.skipped > 0 && <span className="text-slate-400 ml-2">{r.skipped} skipped</span>}
                          </>
                        )}
                        {!r.matched && <span className="text-slate-400 flex-1 italic">no match</span>}
                        {r.error && <span className="text-red-500 ml-2 truncate" title={r.error}>error</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-400 text-center">
                Sync complete · {result.skipped_total} files already up to date
              </p>
            </>
          )}
        </div>
      )}

      {/* ── Re-extract PDFs ──────────────────────────────────────────── */}
      <div className="border-t border-slate-200 pt-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-violet-500 flex items-center justify-center flex-shrink-0">
            <FileText size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Re-extract PDF Text</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              For documents already uploaded but showing no extracted text. Downloads each PDF from storage and extracts its content so the AI can read it.
            </p>
          </div>
        </div>

        <button
          onClick={handleReextract}
          disabled={reextracting}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {reextracting ? <RefreshCw size={14} className="animate-spin" /> : <FileText size={14} />}
          {reextracting ? "Extracting…" : "Re-extract All PDFs"}
        </button>

        {reextractResult && !reextracting && (
          <div className={`rounded-xl p-4 text-xs space-y-2 ${reextractResult.error ? "bg-red-50 border border-red-200 text-red-700" : "bg-violet-50 border border-violet-200 text-violet-800"}`}>
            {reextractResult.error ? (
              <p>{reextractResult.error}</p>
            ) : reextractResult.message ? (
              <p className="font-medium">{reextractResult.message}</p>
            ) : (
              <>
                <p className="font-semibold">
                  ✓ {reextractResult.success} of {reextractResult.processed} documents extracted
                  {reextractResult.failed > 0 && ` · ${reextractResult.failed} failed`}
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {reextractResult.results.map(r => (
                    <div key={r.name} className="flex items-center gap-2">
                      {r.status === "ok"
                        ? <CheckCircle2 size={11} className="text-green-500 flex-shrink-0" />
                        : <XCircle size={11} className="text-red-400 flex-shrink-0" />
                      }
                      <span className="truncate text-slate-700" title={r.name}>{r.name}</span>
                      {r.status === "ok" && <span className="text-slate-400 ml-auto flex-shrink-0">{r.chars?.toLocaleString()} chars</span>}
                      {r.status === "error" && <span className="text-red-500 ml-auto flex-shrink-0 truncate max-w-[120px]" title={r.reason}>{r.reason}</span>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
