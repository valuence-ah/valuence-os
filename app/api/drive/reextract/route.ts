// ─── Re-extract text from existing documents /api/drive/reextract ─────────────
// Finds all documents with storage_path but no extracted_text, downloads each
// from Supabase Storage, extracts PDF text, and saves it back.
// Called from the Admin page. Safe to run multiple times (idempotent).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractPdfText } from "@/lib/extract-pdf-text";

export const maxDuration = 300; // Allow up to 5 minutes for batch extraction

export async function POST() {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();

  // Find all documents without extracted text
  const { data: docs, error } = await supabase
    .from("documents")
    .select("id, name, storage_path, mime_type, google_drive_url")
    .is("extracted_text", null)
    .not("storage_path", "is", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!docs?.length) return NextResponse.json({ message: "All documents already have extracted text.", processed: 0 });

  const results: { name: string; status: "ok" | "error"; chars?: number; reason?: string }[] = [];
  let success = 0;
  let failed = 0;

  for (const doc of docs) {
    try {
      // Download file from Supabase Storage
      const { data: fileData, error: dlErr } = await supabase.storage
        .from("decks")
        .download(doc.storage_path!);

      if (dlErr || !fileData) {
        results.push({ name: doc.name, status: "error", reason: dlErr?.message ?? "Download failed" });
        failed++;
        continue;
      }

      const buffer = Buffer.from(await fileData.arrayBuffer());

      // Extract text
      const text = await extractPdfText(buffer);

      if (!text) {
        results.push({ name: doc.name, status: "error", reason: "No text extracted" });
        failed++;
        continue;
      }

      // Save extracted text
      await supabase
        .from("documents")
        .update({ extracted_text: text })
        .eq("id", doc.id);

      results.push({ name: doc.name, status: "ok", chars: text.length });
      success++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Re-extract error for ${doc.name}:`, msg);
      results.push({ name: doc.name, status: "error", reason: msg });
      failed++;
    }
  }

  return NextResponse.json({
    processed: docs.length,
    success,
    failed,
    results,
  });
}
