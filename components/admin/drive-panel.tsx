"use client";

import { useState, useEffect } from "react";
import { FolderOpen, RefreshCw, CheckCircle2, XCircle, AlertCircle, ChevronDown, ChevronUp, FileText, Link2, SkipForward } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ReextractResult = {
  processed: number; success: number; failed: number;
  results: { name: string; status: "ok" | "error"; chars?: number; reason?: string }[];
  message?: string;
  error?: string;
};

type DirectSyncResult = {
  synced: number; skipped: number; total: number;
  files_found?: number;
  not_ingestible?: number;
  files: { name: string; status: string; type: string; chars?: number; reason?: string }[];
  error?: string; share_with?: string; setup_required?: boolean;
};

export function DrivePanel() {
  // ── Direct sync state ────────────────────────────────────────────────────────
  const [companies, setCompanies]       = useState<{ id: string; name: string }[]>([]);
  const [directCompany, setDirectCompany] = useState("");
  const [directFolder, setDirectFolder]   = useState("");
  const [directSyncing, setDirectSyncing] = useState(false);
  const [directResult, setDirectResult]   = useState<DirectSyncResult | null>(null);
  const [showFiles, setShowFiles]         = useState(false);

  // ── Re-extract state ─────────────────────────────────────────────────────────
  const [reextracting, setReextracting]  = useState(false);
  const [reextractResult, setReextractResult] = useState<ReextractResult | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.from("companies").select("id, name").order("name").then(({ data }) => {
      setCompanies((data ?? []).filter(c => c.name));
    });
  }, []);

  async function handleDirectSync() {
    if (!directCompany || !directFolder.trim()) return;
    setDirectSyncing(true);
    setDirectResult(null);
    setShowFiles(false);
    try {
      const res = await fetch("/api/drive/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: directCompany, folder_url: directFolder.trim() }),
      });
      const data = await res.json();
      setDirectResult(data);
      setShowFiles(true);
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
      const data = await res.json();
      setReextractResult(data);
    } catch (err) {
      setReextractResult({ error: String(err), processed: 0, success: 0, failed: 0, results: [] });
    } finally {
      setReextracting(false);
    }
  }

  const saEmail = process.env.NEXT_PUBLIC_DRIVE_SA_EMAIL;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">

      {/* ── Sync Folder to Company ───────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
            <Link2 size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Sync Google Drive Folder to Company</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Select a company, paste the Google Drive folder URL, and click Sync. Supports PDF, DOCX, PPTX, XLSX, Google Docs/Sheets/Slides.
            </p>
          </div>
        </div>

        {saEmail && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-800">
            <span className="font-semibold">Before syncing:</span> Share the Drive folder with{" "}
            <code className="bg-blue-100 px-1 py-0.5 rounded font-mono">{saEmail}</code>{" "}
            as Viewer.
          </div>
        )}

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
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {directSyncing ? <RefreshCw size={14} className="animate-spin" /> : <FolderOpen size={14} />}
              {directSyncing ? "Syncing…" : "Sync Files"}
            </button>
          </div>
        </div>

        {directSyncing && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 flex items-center gap-2">
            <RefreshCw size={13} className="animate-spin text-blue-500" />
            Listing files, downloading, and extracting text… this may take a minute.
          </div>
        )}

        {directResult && !directSyncing && (
          <div className={`rounded-xl p-4 text-xs space-y-3 ${directResult.error ? "bg-red-50 border border-red-200 text-red-700" : "bg-blue-50 border border-blue-200 text-blue-800"}`}>
            {directResult.error ? (
              <>
                <p className="font-semibold flex items-center gap-1.5"><AlertCircle size={13} /> Error</p>
                <p>{directResult.error}</p>
                {directResult.share_with && (
                  <p>Share the folder with: <code className="bg-red-100 px-1 py-0.5 rounded">{directResult.share_with}</code></p>
                )}
                {directResult.setup_required && (
                  <p>Add <code className="bg-red-100 px-1 rounded">GOOGLE_SERVICE_ACCOUNT_EMAIL</code> and <code className="bg-red-100 px-1 rounded">GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY</code> to your environment.</p>
                )}
              </>
            ) : (
              <>
                {/* Summary */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Files found", value: directResult.files_found ?? (directResult.total + (directResult.not_ingestible ?? 0)), color: "slate" },
                    { label: "Synced to AI",  value: directResult.synced,  color: "green" },
                    { label: "Already saved", value: directResult.skipped, color: "blue"  },
                  ].map(c => (
                    <div key={c.label} className="bg-white rounded-lg border border-blue-100 p-2 text-center">
                      <p className={`text-xl font-bold text-${c.color}-600`}>{c.value}</p>
                      <p className="text-[10px] text-slate-500">{c.label}</p>
                    </div>
                  ))}
                </div>

                {/* Folder empty warning */}
                {(directResult.files_found ?? directResult.total) === 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5"><AlertCircle size={12} /> No files found in this folder</p>
                    <p>Make sure the folder is shared with the service account email, and that it contains files.</p>
                    {directResult.share_with && (
                      <p>Share with: <code className="bg-amber-100 px-1 rounded font-mono">{directResult.share_with}</code></p>
                    )}
                  </div>
                )}

                {/* Unsupported files warning */}
                {(directResult.not_ingestible ?? 0) > 0 && (
                  <p className="text-amber-700 flex items-center gap-1">
                    <AlertCircle size={11} />
                    {directResult.not_ingestible} file{directResult.not_ingestible !== 1 ? "s" : ""} skipped (unsupported format — images, videos, etc.)
                  </p>
                )}

                {/* Per-file breakdown */}
                {directResult.files.length > 0 && (
                  <div>
                    <button onClick={() => setShowFiles(v => !v)} className="flex items-center gap-1 text-blue-700 hover:text-blue-900 font-medium">
                      {showFiles ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                      {showFiles ? "Hide" : "Show"} file details ({directResult.files.length})
                    </button>
                    {showFiles && (
                      <div className="mt-2 max-h-60 overflow-y-auto space-y-1 border border-blue-100 rounded-lg p-2 bg-white">
                        {directResult.files.map((f, i) => (
                          <div key={i} className="flex items-center gap-2 text-[11px]">
                            {f.status === "synced"
                              ? <CheckCircle2 size={11} className="text-green-500 flex-shrink-0" />
                              : f.status === "skipped"
                              ? <SkipForward size={11} className="text-slate-400 flex-shrink-0" />
                              : f.status === "unsupported"
                              ? <span className="text-slate-300 text-[9px] flex-shrink-0 w-3">—</span>
                              : <XCircle size={11} className="text-red-400 flex-shrink-0" />
                            }
                            <span className={`truncate flex-1 ${f.status === "unsupported" ? "text-slate-400" : "text-slate-700"}`}>{f.name}</span>
                            {f.status === "synced" && <span className="text-slate-400 ml-auto flex-shrink-0">{f.chars?.toLocaleString()} chars</span>}
                            {f.status === "unsupported" && <span className="text-slate-300 ml-auto flex-shrink-0 text-[9px]">unsupported</span>}
                            {f.status === "error" && <span className="text-red-500 ml-auto flex-shrink-0 truncate max-w-[120px]" title={f.reason}>{f.reason}</span>}
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
              For documents already in the database that have no extracted text. Downloads each from storage and re-runs extraction so the AI can read them.
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
