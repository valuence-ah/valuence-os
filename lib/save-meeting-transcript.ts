// ─── Save Meeting Transcript to Supabase Storage ─────────────────────────────
// Generates a PDF for a meeting and saves it to the "meeting-transcripts"
// Storage bucket + records it in the company_documents table.
// Never throws — safe to fire-and-forget from the sync route.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Interaction } from "@/lib/types";
import { generateMeetingPDFBuffer } from "@/lib/generate-meeting-pdf";

export interface SaveTranscriptResult {
  success:     boolean;
  document_id?: string;
  error?:      string;
}

export async function saveMeetingTranscript(
  supabase:    SupabaseClient,
  meeting:     Interaction,
  companyName: string,
): Promise<SaveTranscriptResult> {
  try {
    // 1. Generate PDF bytes
    const pdfBytes = await generateMeetingPDFBuffer(meeting, companyName);

    // 2. Build storage path
    const dateStr   = (meeting.date ?? "").slice(0, 10).replace(/-/g, "");
    const safeTitle = (meeting.subject ?? "meeting")
      .replace(/[^a-zA-Z0-9\s]/g, "")
      .replace(/\s+/g, "_")
      .slice(0, 40);
    const storagePath = `${meeting.company_id}/${dateStr}_${safeTitle}.pdf`;

    // 3. Upload to Supabase Storage (create bucket if missing)
    const doUpload = () =>
      supabase.storage
        .from("meeting-transcripts")
        .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: true });

    let uploadResult = await doUpload();

    if (uploadResult.error) {
      // Bucket might not exist yet — attempt to create it then retry once
      if (
        uploadResult.error.message.includes("Bucket not found") ||
        uploadResult.error.message.includes("bucket") ||
        uploadResult.error.message.includes("The resource was not found")
      ) {
        await supabase.storage.createBucket("meeting-transcripts", { public: false });
        uploadResult = await doUpload();
      }
      if (uploadResult.error) {
        return { success: false, error: `Storage upload failed: ${uploadResult.error.message}` };
      }
    }

    // 4. Upsert into company_documents (includes fireflies_url for "View in Fireflies" button)
    const { data, error: dbError } = await supabase
      .from("company_documents" as "documents")
      .upsert(
        {
          company_id:    meeting.company_id,
          meeting_id:    meeting.id,
          document_type: "meeting_transcript",
          file_name:     `${safeTitle}.pdf`,
          storage_path:  storagePath,
          fireflies_url: meeting.transcript_url ?? null,
          created_by:    "system",
        },
        { onConflict: "meeting_id" }
      )
      .select("id")
      .single();

    if (dbError) {
      console.warn("[saveMeetingTranscript] DB upsert failed:", dbError.message);
      return { success: false, error: dbError.message };
    }

    return { success: true, document_id: (data as { id: string }).id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[saveMeetingTranscript] Unexpected error:", msg);
    return { success: false, error: msg };
  }
}
