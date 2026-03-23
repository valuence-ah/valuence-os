// ─── Storage Upload API /api/storage/upload ───────────────────────────────────
// Accepts a file upload (multipart/form-data), stores it in Supabase Storage,
// extracts text from PDFs / transcripts, and inserts a documents row.
//
// Form fields:
//   file        — the file to upload
//   bucket      — "decks" | "transcripts"
//   company_id  — UUID of the company
//   doc_type    — "deck" | "transcript"

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

// ── Extract readable text from a buffer ──────────────────────────────────────
async function extractText(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  // Plain text / VTT transcripts — read directly
  if (
    mimeType === "text/plain" ||
    mimeType === "text/vtt" ||
    ext === "txt" ||
    ext === "vtt" ||
    ext === "srt"
  ) {
    return buffer.toString("utf-8").slice(0, 50000);
  }

  // PDF — extract with pdf-parse
  if (mimeType === "application/pdf" || ext === "pdf") {
    try {
      // Dynamic import keeps this out of the client bundle
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse");
      const data = await pdfParse(buffer, { max: 0 }); // max:0 = all pages
      return data.text.slice(0, 50000);
    } catch (err) {
      console.error("pdf-parse error:", err);
      return "";
    }
  }

  // DOCX — return empty (could add mammoth later)
  return "";
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file       = formData.get("file") as File | null;
  const bucket     = formData.get("bucket") as string;
  const company_id = formData.get("company_id") as string;
  const doc_type   = formData.get("doc_type") as string;

  if (!file || !bucket || !company_id) {
    return NextResponse.json({ error: "file, bucket, and company_id are required" }, { status: 400 });
  }

  // Build a clean file path: company_id/timestamp-filename
  const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath  = `${company_id}/${Date.now()}-${safeName}`;
  const mimeType  = file.type || "application/octet-stream";

  // Convert File → Buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer      = Buffer.from(arrayBuffer);

  // ── Upload to Supabase Storage ─────────────────────────────────────────────
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, buffer, { contentType: mimeType, upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath);

  // ── Extract text ───────────────────────────────────────────────────────────
  const extractedText = await extractText(buffer, mimeType, file.name);

  // ── Insert document record ─────────────────────────────────────────────────
  // doc_type maps to documents.type values
  const documentType = doc_type === "deck" ? "pitch_deck" : "transcript";

  await supabase.from("documents").insert({
    company_id,
    name:           file.name,
    type:           documentType,
    storage_path:   filePath,
    mime_type:      mimeType,
    file_size:      buffer.byteLength,
    extracted_text: extractedText || null,
    uploaded_by:    user.id,
  });

  // ── Side-effects per doc type ──────────────────────────────────────────────
  if (doc_type === "deck") {
    // Update the company's latest deck URL (used for quick access / thumbnail)
    await supabase.from("companies").update({ pitch_deck_url: publicUrl }).eq("id", company_id);
  }

  if (doc_type === "transcript") {
    // Store as an interaction with transcript_url + extracted text
    await supabase.from("interactions").insert({
      company_id,
      type:            "meeting",
      subject:         `Transcript: ${file.name}`,
      transcript_text: extractedText || null,
      transcript_url:  publicUrl,
      date:            new Date().toISOString(),
      sentiment:       "neutral",
      created_by:      user.id,
    });
  }

  return NextResponse.json({ url: publicUrl, path: filePath, bucket, extracted: !!extractedText });
}
