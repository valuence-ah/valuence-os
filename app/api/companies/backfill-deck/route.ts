// ─── Backfill Deck /api/companies/backfill-deck ────────────────────────────────
// For decks uploaded before text-extraction was added:
// fetches the PDF from its public URL, extracts text, creates the documents row.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { company_id } = await req.json();
  if (!company_id) return NextResponse.json({ error: "company_id required" }, { status: 400 });

  const { data: company } = await supabase
    .from("companies")
    .select("id, name, pitch_deck_url")
    .eq("id", company_id)
    .single();

  if (!company?.pitch_deck_url) {
    return NextResponse.json({ error: "No deck URL found for this company" }, { status: 404 });
  }

  // Derive storage_path from the public URL
  // URL format: https://xxx.supabase.co/storage/v1/object/public/decks/{storage_path}
  const url = company.pitch_deck_url;
  const storagePathMatch = url.match(/\/object\/public\/decks\/(.+)$/);
  const storagePath = storagePathMatch?.[1] ?? null;
  const fileName = storagePath?.split("/").pop() ?? "deck.pdf";

  // Fetch the PDF
  let buffer: Buffer;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const ab = await res.arrayBuffer();
    buffer = Buffer.from(ab);
  } catch (err) {
    return NextResponse.json({ error: `Could not fetch deck: ${err}` }, { status: 500 });
  }

  // Extract text
  let extractedText = "";
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require("pdf-parse");
    const data = await pdfParse(buffer, { max: 0 });
    extractedText = data.text.slice(0, 50000);
  } catch (err) {
    console.error("pdf-parse error:", err);
  }

  // Check if document record already exists
  const { data: existing } = await supabase
    .from("documents")
    .select("id")
    .eq("company_id", company_id)
    .eq("type", "pitch_deck")
    .limit(1)
    .single();

  if (existing) {
    // Update extracted_text on existing record
    await supabase
      .from("documents")
      .update({ extracted_text: extractedText || null })
      .eq("id", existing.id);
  } else {
    // Insert new document record
    await supabase.from("documents").insert({
      company_id,
      name:           fileName,
      type:           "pitch_deck",
      storage_path:   storagePath,
      mime_type:      "application/pdf",
      file_size:      buffer.byteLength,
      extracted_text: extractedText || null,
      uploaded_by:    user.id,
    });
  }

  return NextResponse.json({
    success: true,
    extracted_chars: extractedText.length,
    file: fileName,
  });
}
