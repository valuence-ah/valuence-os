// GET /api/documents/[id]/download
// Fetches a company_documents record, generates a signed Supabase Storage URL,
// and returns a 302 redirect to it (valid for 1 hour).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabaseUser = await createClient();
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createAdminClient();

  // Fetch the document record
  const { data: doc, error } = await (supabase
    .from("company_documents" as "documents") // cast — table not in generated types yet
    .select("storage_path, file_name")
    .eq("id", id)
    .single() as unknown as Promise<{ data: { storage_path: string; file_name: string } | null; error: { message: string } | null }>);

  if (error || !doc) {
    return NextResponse.json({ error: error?.message ?? "Document not found" }, { status: 404 });
  }

  // Generate a signed URL (1 hour expiry)
  const { data: signed, error: signErr } = await supabase.storage
    .from("meeting-transcripts")
    .createSignedUrl(doc.storage_path, 3600);

  if (signErr || !signed?.signedUrl) {
    return NextResponse.json({ error: signErr?.message ?? "Could not generate download URL" }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
