// ─── Storage Upload API /api/storage/upload ───────────────────────────────────
// Accepts a file upload (multipart/form-data), stores it in Supabase Storage,
// and updates the relevant company record.
//
// Form fields:
//   file        — the file to upload
//   bucket      — "logos" | "decks" | "transcripts"
//   company_id  — UUID of the company
//   doc_type    — "logo" | "deck" | "transcript"

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  const ext       = file.name.split(".").pop() ?? "bin";
  const safeName  = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath  = `${company_id}/${Date.now()}-${safeName}`;

  // Convert File to ArrayBuffer → Buffer
  const arrayBuffer = await file.arrayBuffer();
  const buffer      = Buffer.from(arrayBuffer);

  // Upload to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Get public URL (works for public buckets)
  const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(filePath);

  // Update company record based on doc_type
  if (doc_type === "logo") {
    await supabase.from("companies").update({ logo_url: publicUrl }).eq("id", company_id);
  }

  if (doc_type === "deck") {
    await supabase.from("companies").update({ pitch_deck_url: publicUrl }).eq("id", company_id);
    await supabase.from("documents").insert({
      company_id,
      name:         file.name,
      type:         "pitch_deck",
      file_url:     publicUrl,
      storage_path: filePath,
    });
  }

  if (doc_type === "transcript") {
    // Save as an interaction with transcript_text
    let transcriptText = "";
    if (ext === "txt" || file.type === "text/plain") {
      transcriptText = buffer.toString("utf-8");
    }
    await supabase.from("interactions").insert({
      company_id,
      type:            "meeting",
      subject:         `Transcript: ${file.name}`,
      transcript_text: transcriptText || null,
      date:            new Date().toISOString(),
      sentiment:       "neutral",
      created_by:      user.id,
    });
    await supabase.from("documents").insert({
      company_id,
      name:         file.name,
      type:         "transcript",
      file_url:     publicUrl,
      storage_path: filePath,
    });
  }

  return NextResponse.json({ url: publicUrl, path: filePath, bucket });
}
