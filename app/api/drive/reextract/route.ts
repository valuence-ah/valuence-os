// ─── Extract text from documents /api/drive/reextract ─────────────────────────
// Finds all documents without extracted_text, downloads each file (from
// Supabase Storage OR Google Drive), extracts text, and saves it back.
// Works for both manually uploaded docs AND Drive-synced files.
// Safe to run multiple times (idempotent).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { downloadFile } from "@/lib/google-drive";
import JSZip from "jszip";

export const maxDuration = 300;

// ── Pure-JS text extractors (no native binaries) ──────────────────────────────

async function extractFromBuffer(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  // PDF — use pdf-parse (direct lib path avoids serverless test-harness issue)
  if (mimeType === "application/pdf" || ext === "pdf") {
    try {
      // Use the internal lib file to avoid pdf-parse's test-file loader (@napi warning)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse/lib/pdf-parse.js");
      const result = await pdfParse(buffer, { max: 0 });
      const text = (result.text ?? "").trim();
      if (text.length >= 10) return text.slice(0, 100000);
      // Fallback: try with default options
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse2 = require("pdf-parse/lib/pdf-parse.js");
      const result2 = await pdfParse2(buffer);
      return (result2.text ?? "").slice(0, 100000);
    } catch {
      return "";
    }
  }

  // Plain text / Markdown
  if (mimeType.startsWith("text/") || ext === "md" || ext === "txt") {
    return buffer.toString("utf-8").slice(0, 100000);
  }

  // XLSX — SheetJS (pure JS)
  if (mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" || ext === "xlsx") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require("xlsx");
      const wb = XLSX.read(buffer, { type: "buffer" });
      const parts: string[] = [];
      for (const name of wb.SheetNames as string[]) {
        const csv: string = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
        if (csv.trim()) parts.push(`=== ${name} ===\n${csv}`);
      }
      return parts.join("\n\n").slice(0, 100000);
    } catch { return ""; }
  }

  // PPTX — unzip XML (pure JS)
  if (mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" || ext === "pptx") {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const keys = Object.keys(zip.files).filter(k => /^ppt\/slides\/slide\d+\.xml$/.test(k)).sort();
      const parts: string[] = [];
      for (const k of keys) {
        const xml: string = await zip.files[k].async("text");
        const text = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (text) parts.push(text);
      }
      return parts.join("\n\n").slice(0, 100000);
    } catch { return ""; }
  }

  // DOCX — unzip XML (pure JS)
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword" || ext === "docx" || ext === "doc"
  ) {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const docXml = zip.files["word/document.xml"];
      if (docXml) {
        const xml: string = await docXml.async("text");
        return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 100000);
      }
    } catch { return ""; }
  }

  return "";
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createAdminClient();

    let companyId: string | null = null;
    try { companyId = ((await req.json()) as { company_id?: string }).company_id ?? null; } catch { /* no body */ }

    // Find docs without extracted text — both Storage and Drive-synced
    let query = supabase
      .from("documents")
      .select("id, name, type, storage_path, mime_type, google_drive_url")
      .is("extracted_text", null);

    if (companyId) query = query.eq("company_id", companyId);

    // When targeting a specific company fetch all its docs; otherwise batch globally to 50
    const batchSize = companyId ? 200 : 50;
    const { data: docs, error } = await query.limit(batchSize);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!docs?.length) return NextResponse.json({ message: "All documents already have extracted text.", processed: 0, success: 0, failed: 0, has_more: false, results: [] });

    const results: { name: string; status: "ok" | "error"; chars?: number; reason?: string }[] = [];
    let success = 0;
    let failed = 0;

    for (const doc of docs) {
      try {
        let buffer: Buffer | null = null;
        let effectiveMime = doc.mime_type ?? "application/pdf";

        if (doc.storage_path) {
          // Manually uploaded — download from the correct bucket based on doc type
          const bucket = doc.type === "transcript" ? "transcripts" : "decks";
          const { data: fileData, error: dlErr } = await supabase.storage
            .from(bucket)
            .download(doc.storage_path);
          if (dlErr || !fileData) throw new Error(dlErr?.message ?? `Storage download failed from '${bucket}' bucket`);
          buffer = Buffer.from(await fileData.arrayBuffer());

        } else if (doc.google_drive_url) {
          // Drive-synced — extract file ID from URL and download
          const fileIdMatch = doc.google_drive_url.match(/\/d\/([a-zA-Z0-9_-]+)/);
          if (!fileIdMatch) throw new Error("Cannot parse Drive file ID from URL");
          const fileId = fileIdMatch[1];
          try {
            const dl = await downloadFile(fileId, doc.mime_type ?? "application/pdf");
            buffer = dl.buffer;
            effectiveMime = dl.effectiveMime;
          } catch (err) {
            throw new Error(`Drive download failed: ${err instanceof Error ? err.message : String(err)}`);
          }
        } else {
          throw new Error("No storage_path or google_drive_url");
        }

        const text = await extractFromBuffer(buffer, effectiveMime, doc.name);

        if (!text || text.trim().length < 10) {
          results.push({ name: doc.name, status: "error", reason: "No text extracted" });
          failed++;
          continue;
        }

        await supabase.from("documents").update({ extracted_text: text }).eq("id", doc.id);
        results.push({ name: doc.name, status: "ok", chars: text.length });
        success++;

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Re-extract error for ${doc.name}:`, msg);
        results.push({ name: doc.name, status: "error", reason: msg });
        failed++;
      }
    }

    // has_more = true when we hit the batch ceiling (caller should click again)
    const has_more = docs.length === batchSize;
    return NextResponse.json({ processed: docs.length, success, failed, has_more, results });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
