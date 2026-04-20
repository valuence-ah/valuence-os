// ─── POST /api/meetings/[id]/export-pdf ──────────────────────────────────────
// Receives a base64-encoded PDF generated client-side, uploads it to the
// "meeting-transcripts" Supabase Storage bucket, and creates a company_documents
// record so it appears in the Meeting Transcripts panel.
//
// Body: { company_id: string, pdf_base64: string }

import { NextResponse }       from "next/server";
import { createClient }       from "@/lib/supabase/server";
import { createAdminClient }  from "@/lib/supabase/admin";

export const maxDuration = 30;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // ── Auth ─────────────────────────────────────────────────────────────────
  const supabaseUser = await createClient();
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { company_id?: string; pdf_base64?: string };
  try {
    body = await req.json() as { company_id?: string; pdf_base64?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { company_id, pdf_base64 } = body;
  if (!company_id || !pdf_base64) {
    return NextResponse.json(
      { error: "company_id and pdf_base64 are required" },
      { status: 400 }
    );
  }

  // ── Fetch meeting metadata ────────────────────────────────────────────────
  const { data: meeting } = await supabase
    .from("interactions")
    .select("id, subject, date")
    .eq("id", id)
    .single();

  if (!meeting) {
    return NextResponse.json({ error: "Meeting not found" }, { status: 404 });
  }

  // ── Build a clean file name ───────────────────────────────────────────────
  const rawTitle  = ((meeting.subject as string | null) ?? "Meeting").trim();
  const safeTitle = rawTitle
    .replace(/[^a-zA-Z0-9\s\-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60) || "Meeting";
  const dateStr   = meeting.date
    ? new Date(meeting.date as string).toISOString().slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const fileName  = `${safeTitle}-${dateStr}.pdf`;

  // Unique path per export (timestamp prefix avoids collisions on re-export)
  const storagePath = `${company_id}/${id}/${Date.now()}-${fileName}`;

  // ── Decode base64 → Buffer ────────────────────────────────────────────────
  const pdfBuffer = Buffer.from(pdf_base64, "base64");

  // ── Upload to Supabase Storage ────────────────────────────────────────────
  const { error: uploadErr } = await supabase.storage
    .from("meeting-transcripts")
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert:      false,
    });

  if (uploadErr) {
    console.error("[export-pdf] storage upload failed:", uploadErr.message);
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  // ── Insert into company_documents ─────────────────────────────────────────
  const { error: docErr } = await (supabase
    .from("company_documents" as "documents")
    .insert({
      meeting_id:    id,
      company_id,
      file_name:     fileName,
      storage_path:  storagePath,
      document_type: "meeting_transcript",
      uploaded_at:   new Date().toISOString(),
    }) as unknown as Promise<{ error: { message: string } | null }>);

  if (docErr) {
    // Non-fatal: storage upload succeeded — log the DB insert error
    console.warn("[export-pdf] company_documents insert warning:", docErr.message);
  }

  return NextResponse.json({ ok: true, file_name: fileName, storage_path: storagePath });
}
