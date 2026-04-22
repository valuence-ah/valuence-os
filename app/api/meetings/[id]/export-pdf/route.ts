// ─── POST /api/meetings/[id]/export-pdf ──────────────────────────────────────
// Receives a base64-encoded PDF generated client-side, uploads it to the
// "transcripts" Supabase Storage bucket, and inserts a record into the
// `documents` table so it appears in the Meeting Transcripts panel.
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

  // ── Build a clean file name — "MMM DD YYYY - Meeting Subject.pdf" ─────────
  const meetingDate = meeting.date ? new Date(meeting.date as string) : new Date();
  const datePretty = meetingDate.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  }); // e.g. "Apr 16, 2026"
  const rawTitle  = ((meeting.subject as string | null) ?? "Meeting").trim();
  const safeTitle = rawTitle
    .replace(/[^a-zA-Z0-9\s\-]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 60) || "Meeting";
  const safeDatePretty = datePretty.replace(/,/g, "").replace(/\s+/g, " ");
  const fileName  = `${safeDatePretty} - ${safeTitle}.pdf`;

  // Unique path per export (timestamp prefix avoids collisions on re-export)
  const storagePath = `${company_id}/${id}/${Date.now()}-${fileName}`;

  // ── Decode base64 → Buffer ────────────────────────────────────────────────
  const pdfBuffer = Buffer.from(pdf_base64, "base64");

  // ── Upload to Supabase Storage ("transcripts" bucket) ────────────────────
  const { error: uploadErr } = await supabase.storage
    .from("transcripts")
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert:      false,
    });

  if (uploadErr) {
    console.error("[export-pdf] storage upload failed:", uploadErr.message);
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  // ── Insert into documents table ───────────────────────────────────────────
  const { data: docRow, error: docErr } = await supabase
    .from("documents")
    .insert({
      name:       fileName,
      type:       "transcript",
      company_id,
      storage_path: storagePath,
      mime_type:  "application/pdf",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id, name, type, storage_path, google_drive_url, created_at")
    .single();

  if (docErr) {
    console.error("[export-pdf] documents insert failed:", docErr.message);
    return NextResponse.json({ error: docErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, file_name: fileName, storage_path: storagePath, document: docRow });
}
