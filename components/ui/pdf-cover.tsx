"use client";
// ─── PdfCover ──────────────────────────────────────────────────────────────────
// Renders the cover page (page 1) of a PDF URL as a canvas thumbnail.
// Uses pdfjs-dist dynamically so it never runs on the server.

import { useEffect, useRef, useState } from "react";
import { FileText } from "lucide-react";

interface PdfCoverProps {
  url: string;
  className?: string;
}

export function PdfCover({ url, className = "" }: PdfCoverProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const pdfjsLib = await import("pdfjs-dist");

        // Use CDN worker — avoids Next.js bundler complications
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

        const loadingTask = pdfjsLib.getDocument({ url, withCredentials: false });
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        const page = await pdf.getPage(1);
        if (cancelled || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Scale page to fill the container width
        const baseViewport = page.getViewport({ scale: 1 });
        const containerW = canvas.parentElement?.offsetWidth ?? 220;
        const scale = containerW / baseViewport.width;
        const viewport = page.getViewport({ scale });

        canvas.width  = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        if (!cancelled) setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    }

    setState("loading");
    render();
    return () => { cancelled = true; };
  }, [url]);

  if (state === "error") {
    return (
      <div className={`flex flex-col items-center justify-center bg-slate-50 rounded-lg text-slate-400 ${className}`}>
        <FileText size={20} />
        <span className="text-[10px] mt-1">Preview unavailable</span>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-lg bg-slate-100 ${className}`}>
      {state === "loading" && (
        <div className="absolute inset-0 bg-slate-100 animate-pulse rounded-lg" />
      )}
      <canvas
        ref={canvasRef}
        className={`w-full h-full object-cover transition-opacity duration-200 ${state === "ready" ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}
