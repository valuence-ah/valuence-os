// ─── Google Drive Sync API  /api/drive/sync ────────────────────────────────────
// POST { company_id, folder_url }
//
// Lists all files in the Drive folder recursively, extracts text, and inserts
// them into the documents table.  Supports: PDF, DOCX, PPTX, XLSX, TXT, MD,
// Google Docs/Sheets/Slides (exported as PDF).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseFolderId,
  listFolderFiles,
  downloadFile,
  isIngestible,
  mimeToDocType,
} from "@/lib/google-drive";
import { extractPdfText } from "@/lib/extract-pdf-text";

export const maxDuration = 300;

// ── XLSX text extraction ───────────────────────────────────────────────────────
function extractXlsxText(buffer: Buffer): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require("xlsx");
    const wb = XLSX.read(buffer, { type: "buffer" });
    const parts: string[] = [];
    for (const name of wb.SheetNames as string[]) {
      const csv: string = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
      if (csv.trim()) parts.push(`=== ${name} ===\n${csv}`);
    }
    return parts.join("\n\n").slice(0, 50000);
  } catch (err) {
    console.error("XLSX extraction error:", err);
    return "";
  }
}

// ── PPTX text extraction (unzip XML slides) ────────────────────────────────────
async function extractPptxText(buffer: Buffer): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const JSZip = require("jszip");
    const zip = await JSZip.loadAsync(buffer);
    const slideKeys: string[] = Object.keys(zip.files)
      .filter((k: string) => /^ppt\/slides\/slide\d+\.xml$/.test(k))
      .sort();
    const parts: string[] = [];
    for (const key of slideKeys) {
      const xml: string = await zip.files[key].async("text");
      // Strip XML tags, collapse whitespace
      const text = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (text) parts.push(text);
    }
    return parts.join("\n\n").slice(0, 50000);
  } catch (err) {
    console.error("PPTX extraction error:", err);
    return "";
  }
}

// ── Text extraction router ─────────────────────────────────────────────────────
async function extractText(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  // PDF (and Google Workspace exports)
  if (mimeType === "application/pdf" || ext === "pdf") {
    return extractPdfText(buffer);
  }

  // Plain text / Markdown
  if (mimeType.startsWith("text/") || ext === "md" || ext === "txt") {
    return buffer.toString("utf-8").slice(0, 50000);
  }

  // XLSX
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    ext === "xlsx"
  ) {
    return extractXlsxText(buffer);
  }

  // PPTX
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    ext === "pptx"
  ) {
    return extractPptxText(buffer);
  }

  // DOCX — xml-based, similar zip approach to PPTX
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword" ||
    ext === "docx" || ext === "doc"
  ) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const JSZip = require("jszip");
      const zip = await JSZip.loadAsync(buffer);
      const wordDoc = zip.files["word/document.xml"];
      if (wordDoc) {
        const xml: string = await wordDoc.async("text");
        return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 50000);
      }
    } catch (err) {
      console.error("DOCX extraction error:", err);
    }
    return "";
  }

  return "";
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    return NextResponse.json({
      error: "Google Drive not configured. Add GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY to your environment variables.",
      setup_required: true,
    }, { status: 503 });
  }

  const { company_id, folder_url } = await req.json() as { company_id: string; folder_url: string };
  if (!company_id || !folder_url) {
    return NextResponse.json({ error: "company_id and folder_url are required" }, { status: 400 });
  }

  const folderId = parseFolderId(folder_url);
  if (!folderId) {
    return NextResponse.json({ error: "Invalid Google Drive folder URL. Expected .../folders/FOLDER_ID" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Existing docs for this company (to skip re-syncing)
  const { data: existingDocs } = await supabase
    .from("documents")
    .select("google_drive_url")
    .eq("company_id", company_id)
    .not("google_drive_url", "is", null);

  const existingUrls = new Set((existingDocs ?? []).map(d => d.google_drive_url as string));

  // List all files in the folder (recursive)
  let allFiles;
  try {
    allFiles = await listFolderFiles(folderId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("403") || msg.includes("insufficientPermissions") || msg.includes("notFound")) {
      return NextResponse.json({
        error: `Cannot access this Drive folder. Share it with the service account: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}`,
        share_with: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Separate ingestible from unsupported
  const ingestible = allFiles.filter(f => isIngestible(f.mimeType));
  const notIngestible = allFiles.filter(f => !isIngestible(f.mimeType));

  const results: { name: string; status: "synced" | "skipped" | "error" | "unsupported"; type: string; chars?: number; reason?: string }[] = [];

  // Record unsupported files for transparency
  for (const f of notIngestible) {
    results.push({ name: f.name, status: "unsupported", type: f.mimeType });
  }

  let synced = 0;
  let skipped = 0;

  // Process in parallel batches of 5 — fast enough for large folders without overwhelming Drive API
  const CONCURRENCY = 5;
  for (let i = 0; i < ingestible.length; i += CONCURRENCY) {
    const batch = ingestible.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(async (file) => {
      const fileUrl = file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`;

      if (existingUrls.has(fileUrl)) {
        results.push({ name: file.name, status: "skipped", type: file.mimeType });
        skipped++;
        return;
      }

      try {
        const { buffer, effectiveMime } = await downloadFile(file.id, file.mimeType);
        const text = await extractText(buffer, effectiveMime, file.name);
        const docType = mimeToDocType(file.mimeType, file.name);

        const { error: insertErr } = await supabase.from("documents").insert({
          company_id,
          name:             file.name,
          type:             docType,
          google_drive_url: fileUrl,
          mime_type:        file.mimeType,
          file_size:        file.size ?? null,
          extracted_text:   text || null,
          uploaded_by:      user.id,
          updated_at:       new Date().toISOString(),
        });

        if (insertErr) {
          if (insertErr.message.includes("duplicate") || insertErr.message.includes("unique")) {
            results.push({ name: file.name, status: "skipped", type: docType });
            skipped++;
          } else {
            throw new Error(insertErr.message);
          }
        } else {
          results.push({ name: file.name, status: "synced", type: docType, chars: text.length });
          synced++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Drive sync error for ${file.name}:`, msg);
        results.push({ name: file.name, status: "error", type: file.mimeType, reason: msg });
      }
    }));
  }

  // Save the drive_folder_url on the company
  await supabase.from("companies").update({
    drive_folder_url: folder_url,
    updated_at:       new Date().toISOString(),
  }).eq("id", company_id);

  return NextResponse.json({
    synced,
    skipped,
    total: ingestible.length,
    files_found: allFiles.length,
    not_ingestible: notIngestible.length,
    files: results,
    share_with: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? null,
  });
}
