// POST /api/meetings/[id]/export-pdf
// Generates a meeting summary PDF (client supplies base64), uploads to Supabase
// Storage, inserts a company_documents record, and returns the result.
//
// Request body:
//   { company_id: string, pdf_base64: string }
//
// The PDF is generated client-side (lib/generate-meeting-pdf.ts) and sent as
// base64 to avoid Node.js/jspdf compatibility concerns in serverless functions.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabaseUser = await createClient();
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { company_id: string; pdf_base64: string };
  const { company_id, pdf_base64 } = body;

  if (!company_id)  return NextResponse.json({ error: "company_id required" }, { status: 400 });
  if (!pdf_base64)  return NextResponse.json({ error: "pdf_base64 required" }, { status: 400 });

  const supabase = createAdminClient();

  // Fetch meeting record to build the filename
  const { data: meeting, error: meetingErr } = await supabase
    .from("interactions")
    .select("id, subject, date")
    .eq("id", id)
    .single();

  if (meetingErr || !meeting) {
    return NextResponse.json({ error: meetingErr?.message ?? "Meeting not found" }, { status: 404 });
  }

  // Decode base64 PDF into a Buffer
  const pdfBuffer = Buffer.from(pdf_base64, "base64");

  // Build storage path
  const dateSlug = meeting.date ? meeting.date.slice(0, 10) : new Date().toISOString().slice(0, 10);
  const safeName = (meeting.subject ?? "meeting").replace(/[^a-zA-Z0-9_\-\s]/g, "").trim().replace(/\s+/g, "_").slice(0, 60);
  const fileName    = `${safeName}_${dateSlug}_summary.pdf`;
  const storagePath = `${company_id}/${id}_${dateSlug}_summary.pdf`;

  // Ensure the bucket exists (idempotent)
  await supabase.storage.createBucket("meeting-transcripts", { public: false }).catch(() => {/* already exists */});

  // Upload PDF to Supabase Storage
  const { error: uploadErr } = await supabase.storage
    .from("meeting-transcripts")
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  // Insert company_documents record
  const { data: doc, error: docErr } = await supabase
    .from("company_documents" as "documents") // cast to avoid missing type
    .insert({
      company_id,
      meeting_id:    id,
      document_type: "meeting_transcript",
      file_name:     fileName,
      storage_path:  storagePath,
      created_by:    user.id,
    } as unknown as Record<string, unknown>)
    .select("id")
    .single();

  if (docErr) {
    return NextResponse.json({ error: docErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success:      true,
    storage_path: storagePath,
    document_id:  (doc as unknown as { id: string }).id,
    file_name:    fileName,
  });
}
