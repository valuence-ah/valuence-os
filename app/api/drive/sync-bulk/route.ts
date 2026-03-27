// ─── Google Drive Bulk Sync  /api/drive/sync-bulk ─────────────────────────────
// POST { folder_url: string }   ← top-level "Company" folder (Shared Drive OK)
//
// 1. Lists all subfolders in the parent folder (one subfolder = one company)
// 2. Fuzzy-matches each subfolder name to a company in the database
// 3. Syncs all ingestible files recursively from each matched subfolder
// 4. Saves the correct drive_folder_url on each matched company
// 5. Returns { results, synced_total, skipped_total, unmatched[] }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseFolderId,
  listSubfolders,
  listFolderFiles,
  downloadFile,
  isIngestible,
  mimeToDocType,
} from "@/lib/google-drive";
import { extractPdfText } from "@/lib/extract-pdf-text";

export const maxDuration = 300; // bulk sync can take several minutes

// ── Text extraction (no Claude dependency — pure local parsing) ───────────────

async function extractText(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  if (mimeType === "application/pdf" || ext === "pdf") {
    return extractPdfText(buffer);
  }

  if (mimeType.startsWith("text/") || ext === "md" || ext === "txt") {
    return buffer.toString("utf-8").slice(0, 50000);
  }

  // XLSX
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
      return parts.join("\n\n").slice(0, 50000);
    } catch { return ""; }
  }

  // PPTX — unzip XML
  if (mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" || ext === "pptx") {
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
        const text = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        if (text) parts.push(text);
      }
      return parts.join("\n\n").slice(0, 50000);
    } catch { return ""; }
  }

  // DOCX — unzip XML
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword" || ext === "docx" || ext === "doc"
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
    } catch { return ""; }
  }

  return "";
}

// ── Fuzzy company name matching ────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchCompany(
  folderName: string,
  companies: { id: string; name: string }[]
): { id: string; name: string } | null {
  const fn = normalize(folderName);
  let hit = companies.find(c => normalize(c.name) === fn);
  if (hit) return hit;
  hit = companies.find(c => {
    const cn = normalize(c.name);
    return cn.includes(fn) || fn.includes(cn);
  });
  if (hit) return hit;
  if (fn.length >= 4) {
    hit = companies.find(c => normalize(c.name).startsWith(fn.slice(0, 4)));
    if (hit) return hit;
  }
  return null;
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    return NextResponse.json({ error: "Google Drive not configured.", setup_required: true }, { status: 503 });
  }

  const { folder_url } = await req.json() as { folder_url: string };
  if (!folder_url) return NextResponse.json({ error: "folder_url is required" }, { status: 400 });

  const topFolderId = parseFolderId(folder_url);
  if (!topFolderId) return NextResponse.json({ error: "Invalid Google Drive folder URL" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = (allCompanies ?? []).filter(c => c.name);

  let subfolders;
  try {
    subfolders = await listSubfolders(topFolderId);
  } catch {
    return NextResponse.json({
      error: `Cannot access folder. Share it with: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}`,
      share_with: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    }, { status: 403 });
  }

  type BulkResult = {
    folder: string; company?: string; company_id?: string;
    matched: boolean; synced: number; skipped: number; errors: number; error?: string;
  };

  const results: BulkResult[] = [];
  const unmatched: string[] = [];
  let synced_total = 0;
  let skipped_total = 0;

  for (const subfolder of subfolders) {
    const company = matchCompany(subfolder.name, companies);

    if (!company) {
      unmatched.push(subfolder.name);
      results.push({ folder: subfolder.name, matched: false, synced: 0, skipped: 0, errors: 0 });
      continue;
    }

    // Save the correct subfolder URL on the company immediately (so CRM sync works too)
    const folderLink = `https://drive.google.com/drive/folders/${subfolder.id}`;
    await supabase.from("companies").update({
      drive_folder_url: folderLink,
      updated_at: new Date().toISOString(),
    }).eq("id", company.id);

    // Existing docs (to skip re-syncing)
    const { data: existingDocs } = await supabase
      .from("documents")
      .select("google_drive_url")
      .eq("company_id", company.id)
      .not("google_drive_url", "is", null);
    const existingUrls = new Set((existingDocs ?? []).map(d => d.google_drive_url as string));

    let files;
    try {
      files = await listFolderFiles(subfolder.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ folder: subfolder.name, company: company.name, company_id: company.id, matched: true, synced: 0, skipped: 0, errors: 0, error: msg });
      continue;
    }

    const ingestible = files.filter(f => isIngestible(f.mimeType));
    let synced = 0, skipped = 0, fileErrors = 0;

    for (const file of ingestible) {
      const fileUrl = file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`;
      if (existingUrls.has(fileUrl)) { skipped++; continue; }

      try {
        const { buffer, effectiveMime } = await downloadFile(file.id, file.mimeType);
        const text = await extractText(buffer, effectiveMime, file.name);
        const docType = mimeToDocType(file.mimeType, file.name);

        const { error: insertErr } = await supabase.from("documents").insert({
          company_id:       company.id,
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
            skipped++;
          } else {
            throw new Error(insertErr.message);
          }
        } else {
          synced++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Bulk sync error for ${file.name} (${company.name}):`, msg);
        fileErrors++;
      }
    }

    synced_total += synced;
    skipped_total += skipped;
    results.push({ folder: subfolder.name, company: company.name, company_id: company.id, matched: true, synced, skipped, errors: fileErrors });
  }

  return NextResponse.json({
    synced_total,
    skipped_total,
    total_folders: subfolders.length,
    matched: results.filter(r => r.matched).length,
    unmatched_count: unmatched.length,
    unmatched,
    results,
    share_with: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? null,
  });
}
