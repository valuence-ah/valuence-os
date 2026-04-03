"use client";
import { useState, useRef, useCallback } from "react";
import { X, Upload, Loader2, CheckCircle } from "lucide-react";
import type { Company } from "@/lib/types";

interface Props {
  company: Company;
  onClose: () => void;
  onSuccess: () => void;
}

type UploadState = "idle" | "uploading" | "success" | "error";

export function PortfolioReportUpload({ company, onClose, onSuccess }: Props) {
  const [reportType, setReportType] = useState("quarterly");
  const [period, setPeriod] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [result, setResult] = useState<{ kpi_count: number; milestone_count: number; initiative_count: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    const ok = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"].includes(f.type) || f.name.endsWith(".pdf") || f.name.endsWith(".docx") || f.name.endsWith(".xlsx");
    if (ok) setFile(f);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  async function handleUpload() {
    if (!file) return;
    setUploadState("uploading");
    setErrorMsg("");

    const fd = new FormData();
    fd.append("file", file);
    fd.append("company_id", company.id);
    fd.append("report_type", reportType);
    fd.append("period", period);

    try {
      const res = await fetch("/api/portfolio/upload-report", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setResult(data.extracted);
      setUploadState("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Upload failed");
      setUploadState("error");
    }
  }

  function handleDone() {
    onSuccess();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl p-6 w-[480px] shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Upload report</h2>
            <p className="text-xs text-slate-500 mt-0.5">{company.name}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1">
            <X size={18} />
          </button>
        </div>

        {uploadState === "success" && result ? (
          <div className="text-center py-4">
            <CheckCircle size={32} className="text-teal-500 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-800 mb-1">Extraction complete</p>
            <p className="text-xs text-slate-500 mb-4">
              Extracted {result.kpi_count} KPI{result.kpi_count !== 1 ? "s" : ""},{" "}
              {result.milestone_count} milestone{result.milestone_count !== 1 ? "s" : ""},{" "}
              {result.initiative_count} initiative{result.initiative_count !== 1 ? "s" : ""}
            </p>
            <button
              onClick={handleDone}
              className="w-full py-2.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Report type + period */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Report type</label>
                <select
                  value={reportType}
                  onChange={e => setReportType(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annual">Annual</option>
                  <option value="board">Board deck</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Period</label>
                <input
                  type="text"
                  placeholder="Q1 2026, Mar 2026…"
                  value={period}
                  onChange={e => setPeriod(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                />
              </div>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                dragging ? "border-teal-400 bg-teal-50/30" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
              }`}
            >
              <Upload size={24} className="mx-auto text-slate-300 mb-2" />
              {file ? (
                <p className="text-sm font-medium text-teal-700">{file.name}</p>
              ) : (
                <>
                  <p className="text-sm text-slate-500">Drop PDF, DOCX, or XLSX here</p>
                  <p className="text-xs text-slate-400 mt-1">or click to browse</p>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.docx,.xlsx"
                className="hidden"
                onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
              />
            </div>

            {errorMsg && (
              <p className="text-xs text-red-600 mt-2">{errorMsg}</p>
            )}

            {/* Actions */}
            <div className="flex gap-3 mt-5">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 border border-slate-200 text-slate-700 text-sm rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={!file || uploadState === "uploading"}
                className="flex-1 py-2.5 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
              >
                {uploadState === "uploading" ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Uploading and extracting…
                  </>
                ) : "Upload + Extract"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
