// ─── Storage Upload API /api/storage/upload ───────────────────────────────────
// Accepts a file upload (multipart/form-data), stores it in Supabase Storage,
// and inserts a documents row. Returns immediately — no slow AI extraction here.
// For image-based PDFs use /api/companies/backfill-deck to extract text via
// Claude vision after the upload succeeds.
//
// Form fields:
//   file        — the file to upload
//   bucket      — "decks" | "transcripts"
//   company_id  — UUID of the company
//   doc_type    — "deck" | "transcript"

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

// Fast-only text extraction — plain text and text-layer PDFs only.
// No Claude vision here (would time out). Image PDFs get extracted via backfill.
async function extractTextFast(buffer: Buffer, mimeType: string, fileName: string): Promise<string> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";

  // Plain text / VTT / SRT — read directly (instant)
  if (["txt", "vtt", "srt"].includes(ext) || mimeType === "text/plain" || mimeType === "text/vtt") {
    return buffer.toString("utf-8").slice(0, 50000);
  }

  // PDF — try pdf-parse only (fast, no AI fallback)
  if (mimeType === "application/pdf" || ext === "pdf") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse");
      const data = await pdfParse(buffer, { max: 0 });
      return ((data.text ?? "").trim()).slice(0, 50000);
    } catch {
      return ""; // image-based PDF — backfill-deck will handle it
    }
  }

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

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${company_id}/${Date.now()}-${safeName}`;
  const mimeType = file.type || "application/octet-stream";

  const arrayBuffer = await file.arrayBuffer();
  const buffer      = Buffer.from(arrayBuffer);

  // ── Upload to Supabase Storage ─────────────────────────────────────────────
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, buffer, { contentType: mimeType, upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath);

  // ── Extract text (fast path only) ─────────────────────────────────────────
  const extractedText = await extractTextFast(buffer, mimeType, file.name);

  // ── Insert document record ─────────────────────────────────────────────────
  const documentType = doc_type === "deck" ? "deck" : "transcript";

  const { error: insertError } = await supabase.from("documents").insert({
    company_id,
    name:           file.name,
    type:           documentType,
    storage_path:   filePath,
    mime_type:      mimeType,
    file_size:      buffer.byteLength,
    extracted_text: extractedText || null,
    uploaded_by:    user.id,
  });

  if (insertError) {
    console.error("documents insert error:", insertError.message);
  }

  // ── Side-effects per doc type ──────────────────────────────────────────────
  if (doc_type === "deck") {
    await supabase.from("companies").update({ pitch_deck_url: publicUrl }).eq("id", company_id);
  }

  if (doc_type === "transcript") {
    await supabase.from("interactions").insert({
      company_id,
      type:           "meeting",
      subject:        `Transcript: ${file.name}`,
      body:           extractedText || null,
      transcript_url: publicUrl,
      date:           new Date().toISOString(),
      sentiment:      "neutral",
      created_by:     user.id,
    });
  }

  return NextResponse.json({ url: publicUrl, path: filePath, bucket, extracted: !!extractedText });
}
