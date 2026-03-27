"use client";

import { useState, useEffect } from "react";
import { FolderOpen, RefreshCw, CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronUp, FileText, Link2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type BulkResult = {
  folder:      string;
  company?:    string;
  company_id?: string;
  matched:     boolean;
  synced:      number;
  skipped:     number;
  errors:      number;
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

type DirectSyncResult = {
  synced: number; skipped: number; total: number;
  not_ingestible?: number;
  files: { name: string; status: string; chars?: number; reason?: string }[];
  error?: string; share_with?: string; setup_required?: boolean;
};

export function DrivePanel() {
  // ── Bulk sync state ──────────────────────────────────────────────────────────
  const [folderUrl, setFolderUrl]   = useState("");
  const [loading, setLoading]       = useState(false);
  const [result, setResult]         = useState<BulkSyncResponse | null>(null);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [showDetails, setShowDetails]    = useState(false);

  // ── Re-extract state ─────────────────────────────────────────────────────────
  const [reextracting, setReextracting]  = useState(false);
  const [reextractResult, setReextractResult] = useState<ReextractResult | null>(null);

  // ── Direct sync state ────────────────────────────────────────────────────────
  const [companies, setCompanies]       = useState<{ id: string; name: string }[]>([]);
  const [directCompany, setDirectCompany] = useState("");
  const [directFolder, setDirectFolder]   = useState("");
  const [directSyncing, setDirectSyncing] = useState(false);
  const [directResult, setDirectResult]   = useState<DirectSyncResult | null>(null);
  const [showDirectFiles, setShowDirectFiles] = useState(false);

  // Load companies for the direct sync dropdown
  useEffect(() => {
    const supabase = createClient();
    supabase.from("companies").select("id, name").order("name").then(({ data }) => {
      setCompanies((data ?? []).filter(c => c.name));
    });
  }, []);

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

  async function handleDirectSync() {
    if (!directCompany || !directFolder.trim()) return;
    setDirectSyncing(true);
    setDirectResult(null);
    setShowDirectFiles(false);
    try {
      const res = await fetch("/api/drive/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: directCompany, folder_url: directFolder.trim() }),
      });
      const data = await res.json();
      setDirectResult(data);
    } catch (err) {
      setDirectResult({ error: String(err), synced: 0, skipped: 0, total: 0, files: [] });
    } finally {
      setDirectSyncing(false);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* ── Bulk Sync ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-green-500 flex items-center justify-center flex-shrink-0">
          <FolderOpen size={18} className="text-white" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Google Drive — Bulk Company Sync</h2>
          <p className="text-xs text-slate-500 mt-0.5">Paste a top-level folder whose <strong>subfolders are named after companies</strong>. Each subfolder is matched and its files ingested.</p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-800 space-y-1.5">
        <p className="font-semibold">Before syncing:</p>
        <ol className="list-decimal list-inside space-y-1 text-blue-700">
          <li>Share the <strong>top-level folder</strong> with <code className="bg-blue-100 px-1 rounded">{process.env.NEXT_PUBLIC_DRIVE_SA_EMAIL ?? "your service account email"}</code> as Viewer</li>
          <li>Each subfolder name should match (or partially match) a company name in your CRM</li>
          <li>Files inside each subfolder are downloaded and ingested automatically</li>
        </ol>
      </div>

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

      {/* Bulk results */}
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
              {/* 0 folders hint */}
              {result.total_folders === 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 space-y-1">
                  <p className="font-semibold flex items-center gap-1.5"><AlertCircle size={13} /> No company subfolders found</p>
                  <p>This folder contains files directly (not company-named subfolders), so Bulk Sync can&apos;t match them automatically.</p>
                  <p className="font-medium">Use <strong>Sync Folder to Company</strong> below to sync this folder to a specific company.</p>
                </div>
              )}

              {/* Summary cards */}
              {result.total_folders > 0 && (
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "Folders found",     value: result.total_folders,   color: "slate" },
                    { label: "Companies matched",  value: result.matched,         color: "green" },
                    { label: "Files synced",       value: result.synced_total,    color: "blue"  },
                    { label: "Unmatched folders",  value: result.unmatched_count, color: result.unmatched_count > 0 ? "amber" : "slate" },
                  ].map(card => (
                    <div key={card.label} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                      <p className={`text-2xl font-bold text-${card.color}-600`}>{card.value}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{card.label}</p>
                    </div>
                  ))}
                </div>
              )}

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
              {result.total_folders > 0 && (
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
                              {r.errors > 0 && <span className="text-red-400 ml-2">{r.errors} failed</span>}
                            </>
                          )}
                          {!r.matched && <span className="text-slate-400 flex-1 italic">no match</span>}
                          {r.error && <span className="text-red-500 ml-2 truncate" title={r.error}>error</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {result.total_folders > 0 && (
                <p className="text-xs text-slate-400 text-center">
                  Sync complete · {result.skipped_total} files already up to date
                </p>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Direct Company Sync ───────────────────────────────────────────── */}
      <div className="border-t border-slate-200 pt-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
            <Link2 size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Sync Folder to Company</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Sync a Drive folder directly to one company — use this when the folder contains files without company-named subfolders.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <select
            value={directCompany}
            onChange={e => setDirectCompany(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
          >
            <option value="">Select a company…</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <div className="flex gap-2">
            <input
              type="text"
              value={directFolder}
              onChange={e => setDirectFolder(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              onKeyDown={e => e.key === "Enter" && handleDirectSync()}
            />
            <button
              onClick={handleDirectSync}
              disabled={directSyncing || !directCompany || !directFolder.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {directSyncing ? <RefreshCw size={14} className="animate-spin" /> : <FolderOpen size={14} />}
              {directSyncing ? "Syncing…" : "Sync Files"}
            </button>
          </div>
        </div>

        {directSyncing && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 flex items-center gap-2">
            <RefreshCw size={13} className="animate-spin text-blue-500" />
            Downloading files and extracting text… this may take a minute.
          </div>
        )}

        {directResult && !directSyncing && (
          <div className={`rounded-xl p-4 text-xs space-y-2 ${directResult.error ? "bg-red-50 border border-red-200 text-red-700" : "bg-blue-50 border border-blue-200 text-blue-800"}`}>
            {directResult.error ? (
              <>
                <p className="font-semibold">Error</p>
                <p>{directResult.error}</p>
                {directResult.share_with && (
                  <p className="mt-1">Share the folder with: <code className="bg-red-100 px-1 rounded">{directResult.share_with}</code></p>
                )}
              </>
            ) : (
              <>
                <p className="font-semibold">
                  ✓ {directResult.synced} file{directResult.synced !== 1 ? "s" : ""} synced to AI
                  {directResult.skipped > 0 && ` · ${directResult.skipped} already up to date`}
                  {(directResult.not_ingestible ?? 0) > 0 && ` · ${directResult.not_ingestible} unsupported format skipped`}
                </p>
                {directResult.files.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowDirectFiles(v => !v)}
                      className="flex items-center gap-1 text-blue-700 hover:text-blue-900"
                    >
                      {showDirectFiles ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                      {showDirectFiles ? "Hide" : "Show"} file details
                    </button>
                    {showDirectFiles && (
                      <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                        {directResult.files.map((f, i) => (
                          <div key={i} className="flex items-center gap-2">
                            {f.status === "synced"
                              ? <CheckCircle2 size={11} className="text-green-500 flex-shrink-0" />
                              : f.status === "skipped"
                              ? <span className="text-slate-400 text-[10px] flex-shrink-0">skip</span>
                              : <XCircle size={11} className="text-red-400 flex-shrink-0" />
                            }
                            <span className="truncate text-slate-700">{f.name}</span>
                            {f.chars && <span className="text-slate-400 ml-auto flex-shrink-0">{f.chars.toLocaleString()} chars</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Re-extract PDFs ──────────────────────────────────────────────── */}
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
