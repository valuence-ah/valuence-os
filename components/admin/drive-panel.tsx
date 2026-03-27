"use client";

import { useState, useEffect } from "react";
import { FolderOpen, RefreshCw, CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronUp, FileText, Link2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type BulkResult = {
  folder: string; company?: string; company_id?: string;
  matched: boolean; synced: number; skipped: number; errors: number; error?: string;
};
type BulkSyncResponse = {
  synced_total: number; skipped_total: number; total_folders: number;
  matched: number; unmatched_count: number; unmatched: string[];
  results: BulkResult[]; share_with?: string; error?: string; setup_required?: boolean;
};
type ReextractResult = {
  processed: number; success: number; failed: number;
  results: { name: string; status: "ok" | "error"; chars?: number; reason?: string }[];
  message?: string; error?: string;
};
type DirectSyncResult = {
  synced: number; skipped: number; total: number; files_found?: number;
  not_ingestible?: number;
  files: { name: string; status: string; type: string; chars?: number; reason?: string }[];
  error?: string; share_with?: string; setup_required?: boolean;
};

export function DrivePanel() {
  // ── Bulk sync ──────────────────────────────────────────────────────────────
  const [bulkUrl, setBulkUrl]         = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkResult, setBulkResult]   = useState<BulkSyncResponse | null>(null);
  const [showUnmatched, setShowUnmatched] = useState(false);
  const [showDetails, setShowDetails]    = useState(false);

  // ── Direct sync ────────────────────────────────────────────────────────────
  const [companies, setCompanies]         = useState<{ id: string; name: string }[]>([]);
  const [directCompany, setDirectCompany] = useState("");
  const [directFolder, setDirectFolder]   = useState("");
  const [directSyncing, setDirectSyncing] = useState(false);
  const [directResult, setDirectResult]   = useState<DirectSyncResult | null>(null);
  const [showDirectFiles, setShowDirectFiles] = useState(false);

  // ── Re-extract ──────────────────────────────────────────────────────────────
  const [reextracting, setReextracting]       = useState(false);
  const [reextractResult, setReextractResult] = useState<ReextractResult | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.from("companies").select("id, name").order("name").then(({ data }) => {
      setCompanies((data ?? []).filter(c => c.name));
    });
  }, []);

  async function handleBulkSync() {
    if (!bulkUrl.trim()) return;
    setBulkLoading(true);
    setBulkResult(null);
    try {
      const res = await fetch("/api/drive/sync-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_url: bulkUrl.trim() }),
      });
      setBulkResult(await res.json());
    } catch (err) {
      setBulkResult({ error: String(err), synced_total: 0, skipped_total: 0, total_folders: 0, matched: 0, unmatched_count: 0, unmatched: [], results: [] });
    } finally {
      setBulkLoading(false);
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
      setDirectResult(await res.json());
      setShowDirectFiles(true);
    } catch (err) {
      setDirectResult({ error: String(err), synced: 0, skipped: 0, total: 0, files: [] });
    } finally {
      setDirectSyncing(false);
    }
  }

  async function handleReextract() {
    setReextracting(true);
    setReextractResult(null);
    try {
      const res = await fetch("/api/drive/reextract", { method: "POST" });
      setReextractResult(await res.json());
    } catch (err) {
      setReextractResult({ error: String(err), processed: 0, success: 0, failed: 0, results: [] });
    } finally {
      setReextracting(false);
    }
  }

  const saEmail = process.env.NEXT_PUBLIC_DRIVE_SA_EMAIL;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">

      {/* ── Bulk Sync (primary tool) ──────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-green-500 flex items-center justify-center flex-shrink-0">
            <FolderOpen size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Sync All Companies from Drive</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Paste the top-level shared folder. Each subfolder is matched to a company and all its files are ingested. Also saves the correct folder link per company.
            </p>
          </div>
        </div>

        {saEmail && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
            Share the top-level folder with{" "}
            <code className="bg-blue-100 px-1 py-0.5 rounded font-mono">{saEmail}</code>{" "}
            as Viewer, then paste its URL below.
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={bulkUrl}
            onChange={e => setBulkUrl(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400"
            onKeyDown={e => e.key === "Enter" && handleBulkSync()}
          />
          <button
            onClick={handleBulkSync}
            disabled={bulkLoading || !bulkUrl.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
          >
            {bulkLoading ? <RefreshCw size={14} className="animate-spin" /> : <FolderOpen size={14} />}
            {bulkLoading ? "Syncing…" : "Sync All Companies"}
          </button>
        </div>

        {bulkLoading && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 flex items-center gap-2">
            <RefreshCw size={13} className="animate-spin text-green-500" />
            Scanning company subfolders and ingesting files — this can take several minutes for large libraries.
          </div>
        )}

        {bulkResult && !bulkLoading && (
          <div className="space-y-3">
            {bulkResult.error ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-700">
                <p className="font-semibold">Error</p>
                <p className="mt-1">{bulkResult.error}</p>
                {bulkResult.share_with && <p className="mt-2">Share with: <code className="bg-red-100 px-1 rounded">{bulkResult.share_with}</code></p>}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: "Folders found",    value: bulkResult.total_folders,   color: "slate" },
                    { label: "Companies matched", value: bulkResult.matched,         color: "green" },
                    { label: "Files synced",      value: bulkResult.synced_total,    color: "blue"  },
                    { label: "Unmatched",         value: bulkResult.unmatched_count, color: bulkResult.unmatched_count > 0 ? "amber" : "slate" },
                  ].map(c => (
                    <div key={c.label} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                      <p className={`text-2xl font-bold text-${c.color}-600`}>{c.value}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{c.label}</p>
                    </div>
                  ))}
                </div>

                {bulkResult.unmatched_count > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
                    <button onClick={() => setShowUnmatched(v => !v)} className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-amber-800 hover:bg-amber-100">
                      <span className="flex items-center gap-2"><AlertCircle size={13} />{bulkResult.unmatched_count} folders not matched to a company</span>
                      {showUnmatched ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                    {showUnmatched && (
                      <div className="px-4 pb-3 space-y-1">
                        {bulkResult.unmatched.map(name => (
                          <div key={name} className="text-xs text-amber-700 flex items-center gap-1.5"><XCircle size={11} /> {name}</div>
                        ))}
                        <p className="text-xs text-amber-600 mt-2 italic">Tip: subfolder names must partially match company names in your CRM.</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <button onClick={() => setShowDetails(v => !v)} className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    <span>Per-company breakdown</span>
                    {showDetails ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                  {showDetails && (
                    <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                      {bulkResult.results.filter(r => r.matched).map(r => (
                        <div key={r.folder} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                          <CheckCircle2 size={13} className="text-green-500 flex-shrink-0" />
                          <span className="font-medium text-slate-700 w-32 truncate" title={r.folder}>{r.folder}</span>
                          <span className="text-slate-400">→</span>
                          <span className="text-slate-600 flex-1 truncate">{r.company}</span>
                          <span className="text-green-600 font-medium ml-auto">{r.synced} synced</span>
                          {r.skipped > 0 && <span className="text-slate-400 ml-2">{r.skipped} skipped</span>}
                          {r.errors > 0 && <span className="text-red-400 ml-2">{r.errors} failed</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-400 text-center">
                  Sync complete · {bulkResult.skipped_total} files already up to date
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Direct Company Sync ───────────────────────────────────────────── */}
      <div className="border-t border-slate-200 pt-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
            <Link2 size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Sync Single Company</h2>
            <p className="text-xs text-slate-500 mt-0.5">Sync one company's folder directly. Use after running bulk sync to re-sync a specific company.</p>
          </div>
        </div>

        <div className="space-y-2">
          <select value={directCompany} onChange={e => setDirectCompany(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
            <option value="">Select a company…</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="flex gap-2">
            <input type="text" value={directFolder} onChange={e => setDirectFolder(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              onKeyDown={e => e.key === "Enter" && handleDirectSync()}
            />
            <button onClick={handleDirectSync} disabled={directSyncing || !directCompany || !directFolder.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap">
              {directSyncing ? <RefreshCw size={14} className="animate-spin" /> : <FolderOpen size={14} />}
              {directSyncing ? "Syncing…" : "Sync Files"}
            </button>
          </div>
        </div>

        {directResult && !directSyncing && (
          <div className={`rounded-xl p-4 text-xs space-y-2 ${directResult.error ? "bg-red-50 border border-red-200 text-red-700" : "bg-blue-50 border border-blue-200 text-blue-800"}`}>
            {directResult.error ? (
              <>
                <p className="font-semibold flex items-center gap-1"><AlertCircle size={12} /> Error</p>
                <p>{directResult.error}</p>
                {directResult.share_with && <p>Share with: <code className="bg-red-100 px-1 rounded">{directResult.share_with}</code></p>}
              </>
            ) : (
              <>
                <p className="font-semibold">✓ {directResult.synced} synced · {directResult.skipped} already saved · {directResult.files_found ?? directResult.total} found</p>
                {(directResult.files_found ?? directResult.total) === 0 && (
                  <p className="text-amber-700">No files found — use Bulk Sync with the parent folder instead.</p>
                )}
                {directResult.files.length > 0 && (
                  <>
                    <button onClick={() => setShowDirectFiles(v => !v)} className="flex items-center gap-1 text-blue-700">
                      {showDirectFiles ? <ChevronUp size={11} /> : <ChevronDown size={11} />} {showDirectFiles ? "Hide" : "Show"} files
                    </button>
                    {showDirectFiles && (
                      <div className="max-h-48 overflow-y-auto space-y-1 border border-blue-100 rounded p-2 bg-white">
                        {directResult.files.map((f, i) => (
                          <div key={i} className="flex items-center gap-2 text-[11px]">
                            {f.status === "synced" ? <CheckCircle2 size={11} className="text-green-500 flex-shrink-0" /> : <span className="text-slate-300 w-3">—</span>}
                            <span className="truncate text-slate-700">{f.name}</span>
                            {f.chars && <span className="text-slate-400 ml-auto">{f.chars.toLocaleString()} chars</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
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
            <p className="text-xs text-slate-500 mt-0.5">For manually uploaded documents that have no extracted text yet.</p>
          </div>
        </div>
        <button onClick={handleReextract} disabled={reextracting}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 transition-colors">
          {reextracting ? <RefreshCw size={14} className="animate-spin" /> : <FileText size={14} />}
          {reextracting ? "Extracting…" : "Re-extract All PDFs"}
        </button>
        {reextractResult && !reextracting && (
          <div className={`rounded-xl p-4 text-xs space-y-2 ${reextractResult.error ? "bg-red-50 border border-red-200 text-red-700" : "bg-violet-50 border border-violet-200 text-violet-800"}`}>
            {reextractResult.error ? <p>{reextractResult.error}</p>
              : reextractResult.message ? <p className="font-medium">{reextractResult.message}</p>
              : (
                <>
                  <p className="font-semibold">✓ {reextractResult.success} of {reextractResult.processed} documents extracted{reextractResult.failed > 0 ? ` · ${reextractResult.failed} failed` : ""}</p>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {reextractResult.results.map(r => (
                      <div key={r.name} className="flex items-center gap-2">
                        {r.status === "ok" ? <CheckCircle2 size={11} className="text-green-500 flex-shrink-0" /> : <XCircle size={11} className="text-red-400 flex-shrink-0" />}
                        <span className="truncate text-slate-700">{r.name}</span>
                        {r.status === "ok" && <span className="text-slate-400 ml-auto">{r.chars?.toLocaleString()} chars</span>}
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
