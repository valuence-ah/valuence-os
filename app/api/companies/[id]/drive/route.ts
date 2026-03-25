// ─── Company Drive Folder Link ────────────────────────────────────────────────
// POST: Save a Google Drive folder URL for a company.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { folderUrl } = await req.json();

  // Extract folder ID from various Drive URL formats
  const folderIdMatch = (folderUrl as string | undefined)?.match(
    /\/folders\/([a-zA-Z0-9_-]+)/
  );
  const folderId = folderIdMatch?.[1] ?? null;

  const { error } = await supabase
    .from("companies")
    .update({ drive_folder_url: folderUrl || null })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ folderId });
}
