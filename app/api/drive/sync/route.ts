// ─── Google Drive Sync API  /api/drive/sync ────────────────────────────────────
// POST { company_id, folder_url }
//
// FAST — lists all files in the Drive folder recursively and saves their
// metadata to the documents table WITHOUT downloading or extracting text.
// Text extraction happens separately via /api/drive/reextract.
// This avoids Vercel serverless timeouts caused by downloading large files.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  parseFolderId,
  listFolderFiles,
  isIngestible,
  mimeToDocType,
} from "@/lib/google-drive";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const authClient = await createClient();
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
      return NextResponse.json({ error: "Google Drive not configured.", setup_required: true }, { status: 503 });
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

    // Get existing Drive URLs for this company so we skip already-saved files
    const { data: existingDocs } = await supabase
      .from("documents")
      .select("google_drive_url")
      .eq("company_id", company_id)
      .not("google_drive_url", "is", null);
    const existingUrls = new Set((existingDocs ?? []).map(d => d.google_drive_url as string));

    // List all files recursively — fast, no downloads
    let allFiles;
    try {
      allFiles = await listFolderFiles(folderId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({
        error: `Cannot access Drive folder. Share it with: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL} (${msg})`,
        share_with: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      }, { status: 403 });
    }

    const ingestible = allFiles.filter(f => isIngestible(f.mimeType));
    const notIngestible = allFiles.filter(f => !isIngestible(f.mimeType));

    const results: { name: string; status: "saved" | "skipped" | "error" | "unsupported"; type: string; reason?: string }[] = [];
    let saved = 0;
    let skipped = 0;

    // Mark unsupported files
    for (const f of notIngestible) {
      results.push({ name: f.name, status: "unsupported", type: f.mimeType });
    }

    // Save metadata for new ingestible files — no downloads, no extraction
    for (const file of ingestible) {
      const fileUrl = file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`;

      if (existingUrls.has(fileUrl)) {
        results.push({ name: file.name, status: "skipped", type: mimeToDocType(file.mimeType, file.name) });
        skipped++;
        continue;
      }

      try {
        const { error: insertErr } = await supabase.from("documents").insert({
          company_id,
          name:             file.name,
          type:             mimeToDocType(file.mimeType, file.name),
          google_drive_url: fileUrl,
          mime_type:        file.mimeType,
          file_size:        file.size ?? null,
          extracted_text:   null, // populated later by /api/drive/reextract
          uploaded_by:      user.id,
          updated_at:       new Date().toISOString(),
        });

        if (insertErr) {
          if (insertErr.message.includes("duplicate") || insertErr.message.includes("unique")) {
            results.push({ name: file.name, status: "skipped", type: mimeToDocType(file.mimeType, file.name) });
            skipped++;
          } else {
            results.push({ name: file.name, status: "error", type: file.mimeType, reason: insertErr.message });
          }
        } else {
          results.push({ name: file.name, status: "saved", type: mimeToDocType(file.mimeType, file.name) });
          saved++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({ name: file.name, status: "error", type: file.mimeType, reason: msg });
      }
    }

    // Save the folder URL on the company record
    await supabase.from("companies").update({
      drive_folder_url: folder_url,
      updated_at: new Date().toISOString(),
    }).eq("id", company_id);

    return NextResponse.json({
      saved,
      skipped,
      total: ingestible.length,
      files_found: allFiles.length,
      not_ingestible: notIngestible.length,
      files: results,
      needs_extraction: saved > 0,
      share_with: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? null,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Drive sync error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
