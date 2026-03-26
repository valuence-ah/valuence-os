// ─── Google Drive Bulk Sync  /api/drive/sync-bulk ─────────────────────────────
// POST { folder_url: string }   ← top-level "Company" folder
//
// 1. Lists all subfolders in the given folder (one subfolder = one company)
// 2. Fuzzy-matches each subfolder name to a company in the database
// 3. Syncs files from each matched subfolder (skips already-synced files)
// 4. Returns { results: BulkResult[], synced_total, skipped_total, unmatched[] }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
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

// ── Text extraction ────────────────────────────────────────────────────────────

async function extractText(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (mimeType === "application/pdf" || ext === "pdf") return extractPdfText(buffer);
  if (mimeType.startsWith("text/") || ext === "md" || ext === "txt") return buffer.toString("utf-8").slice(0, 50000);
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword" || ext === "docx" || ext === "doc"
  ) {
    try {
      const { text } = await generateText({
        model: anthropic("claude-4-opus-20250514"),
        maxTokens: 4000,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Extract ALL text content from this Word document. Preserve structure. Output raw text only." },
            { type: "file", data: buffer, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
          ],
        }],
      });
      return text.slice(0, 50000);
    } catch { return ""; }
  }
  return "";
}

// ── Fuzzy name matching ────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchCompany(
  folderName: string,
  companies: { id: string; name: string }[]
): { id: string; name: string } | null {
  const fn = normalize(folderName);
  // 1. Exact normalized match
  let hit = companies.find(c => normalize(c.name) === fn);
  if (hit) return hit;
  // 2. One contains the other
  hit = companies.find(c => {
    const cn = normalize(c.name);
    return cn.includes(fn) || fn.includes(cn);
  });
  if (hit) return hit;
  // 3. Starts-with (at least 4 chars)
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

  // Load all companies
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = (allCompanies ?? []).filter(c => c.name);

  // List subfolders of the top-level folder
  let subfolders;
  try {
    subfolders = await listSubfolders(topFolderId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({
      error: `Cannot access folder. Make sure it is shared with: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}`,
      share_with: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    }, { status: 403 });
  }

  type BulkResult = {
    folder:     string;
    company?:   string;
    company_id?: string;
    matched:    boolean;
    synced:     number;
    skipped:    number;
    error?:     string;
  };

  const results: BulkResult[] = [];
  const unmatched: string[] = [];
  let synced_total = 0;
  let skipped_total = 0;

  for (const subfolder of subfolders) {
    const company = matchCompany(subfolder.name, companies);

    if (!company) {
      unmatched.push(subfolder.name);
      results.push({ folder: subfolder.name, matched: false, synced: 0, skipped: 0 });
      continue;
    }

    // Load existing docs for this company
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
      results.push({ folder: subfolder.name, company: company.name, company_id: company.id, matched: true, synced: 0, skipped: 0, error: msg });
      continue;
    }

    const ingestible = files.filter(f => isIngestible(f.mimeType));
    let synced = 0, skipped = 0;

    for (const file of ingestible) {
      const fileUrl = file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`;
      if (existingUrls.has(fileUrl)) { skipped++; continue; }

      try {
        const { buffer, effectiveMime } = await downloadFile(file.id, file.mimeType);
        const text = await extractText(buffer, effectiveMime, file.name);
        const docType = mimeToDocType(file.mimeType, file.name);

        await supabase.from("documents").upsert({
          company_id:       company.id,
          name:             file.name,
          type:             docType,
          google_drive_url: fileUrl,
          mime_type:        file.mimeType,
          file_size:        file.size ?? null,
          extracted_text:   text || null,
          uploaded_by:      user.id,
          updated_at:       new Date().toISOString(),
        }, { onConflict: "google_drive_url" });

        synced++;
      } catch {
        // skip failed files silently
      }
    }

    // Save drive folder URL on company
    const folderLink = `https://drive.google.com/drive/folders/${subfolder.id}`;
    await supabase.from("companies").update({
      drive_folder_url: folderLink,
      updated_at: new Date().toISOString(),
    }).eq("id", company.id);

    synced_total += synced;
    skipped_total += skipped;
    results.push({ folder: subfolder.name, company: company.name, company_id: company.id, matched: true, synced, skipped });
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
