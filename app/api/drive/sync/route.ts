// ─── Google Drive Sync API  /api/drive/sync ────────────────────────────────────
// POST { company_id, folder_url }
//
// 1. Lists all ingestible files in the Drive folder (shared with service account)
// 2. Skips files already synced (matched by google_drive_url)
// 3. Downloads each file and runs text extraction
// 4. Upserts into documents table with extracted_text + google_drive_url
// 5. Returns { synced: number, skipped: number, files: [...] }
//
// Prerequisites:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY in .env.local
//   The Drive folder must be shared with the service account email

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import {
  parseFolderId,
  listFolderFiles,
  downloadFile,
  isIngestible,
  mimeToDocType,
} from "@/lib/google-drive";
import { extractPdfText } from "@/lib/extract-pdf-text";

export const maxDuration = 120; // Drive downloads + text extraction can be slow

// ── Text extraction router ─────────────────────────────────────────────────────

async function extractText(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  // PDF (including exported Google Workspace docs)
  if (mimeType === "application/pdf" || ext === "pdf") {
    return extractPdfText(buffer);
  }

  // Plain text / Markdown
  if (mimeType.startsWith("text/") || ext === "md" || ext === "txt") {
    return buffer.toString("utf-8").slice(0, 50000);
  }

  // DOCX — use Claude to extract text
  if (
    mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mimeType === "application/msword" ||
    ext === "docx" || ext === "doc"
  ) {
    try {
      const { text } = await generateText({
        model: anthropic("claude-opus-4-5"),
        maxTokens: 4000,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Extract ALL text content from this Word document. Preserve structure (headings, bullets, tables). Output raw extracted text only — no commentary." },
            { type: "file", data: buffer, mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
          ],
        }],
      });
      return text.slice(0, 50000);
    } catch (err) {
      console.error("DOCX extraction error:", err);
      return "";
    }
  }

  return "";
}

// ── Route handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // Auth check
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify Google credentials are configured
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
    return NextResponse.json({ error: "Invalid Google Drive folder URL" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch existing documents for this company to avoid re-syncing
  const { data: existingDocs } = await supabase
    .from("documents")
    .select("google_drive_url")
    .eq("company_id", company_id)
    .not("google_drive_url", "is", null);

  const existingUrls = new Set((existingDocs ?? []).map(d => d.google_drive_url as string));

  // List all files in the folder
  let files;
  try {
    files = await listFolderFiles(folderId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("403") || msg.includes("insufficientPermissions") || msg.includes("notFound")) {
      return NextResponse.json({
        error: `Cannot access this Drive folder. Make sure it is shared with the service account: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}`,
        share_with: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const ingestible = files.filter(f => isIngestible(f.mimeType));
  const results: { name: string; status: "synced" | "skipped" | "error"; type: string; chars?: number }[] = [];
  let synced = 0;
  let skipped = 0;

  for (const file of ingestible) {
    const fileUrl = file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`;

    // Skip already synced
    if (existingUrls.has(fileUrl)) {
      results.push({ name: file.name, status: "skipped", type: file.mimeType });
      skipped++;
      continue;
    }

    try {
      // Download and extract
      const { buffer, effectiveMime } = await downloadFile(file.id, file.mimeType);
      const text = await extractText(buffer, effectiveMime, file.name);
      const docType = mimeToDocType(file.mimeType, file.name);

      // Upsert into documents table
      await supabase.from("documents").upsert({
        company_id,
        name:             file.name,
        type:             docType,
        google_drive_url: fileUrl,
        mime_type:        file.mimeType,
        file_size:        file.size ?? null,
        extracted_text:   text || null,
        uploaded_by:      user.id,
        updated_at:       new Date().toISOString(),
      }, { onConflict: "google_drive_url" });

      results.push({ name: file.name, status: "synced", type: docType, chars: text.length });
      synced++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Drive sync error for ${file.name}:`, msg);
      results.push({ name: file.name, status: "error", type: file.mimeType });
    }
  }

  // Update company drive_folder_url (ensure it's saved)
  await supabase.from("companies").update({
    drive_folder_url: folder_url,
    updated_at:       new Date().toISOString(),
  }).eq("id", company_id);

  return NextResponse.json({
    synced,
    skipped,
    total: ingestible.length,
    not_ingestible: files.length - ingestible.length,
    files: results,
    share_with: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? null,
  });
}
