// ─── Google Drive Bulk Folder Link  /api/drive/sync-bulk ──────────────────────
// POST { folder_url: string }  ← top-level "Company" folder (Shared Drive OK)
//
// FAST operation (no file downloads):
// 1. Lists all subfolders in the parent folder
// 2. Fuzzy-matches each subfolder name to a company in the database
// 3. Saves the correct drive_folder_url on each matched company
// 4. Returns { results, linked, unmatched[] }
//
// File downloading happens separately via /api/drive/sync (per company).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseFolderId, listSubfolders } from "@/lib/google-drive";

export const maxDuration = 60;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchCompany(
  folderName: string,
  companies: { id: string; name: string }[]
): { id: string; name: string } | null {
  const fn = normalize(folderName);
  let hit = companies.find(c => normalize(c.name) === fn);
  if (hit) return hit;
  hit = companies.find(c => {
    const cn = normalize(c.name);
    return cn.includes(fn) || fn.includes(cn);
  });
  if (hit) return hit;
  if (fn.length >= 4) {
    hit = companies.find(c => normalize(c.name).startsWith(fn.slice(0, 4)));
    if (hit) return hit;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    return NextResponse.json({ error: "Google Drive not configured.", setup_required: true }, { status: 503 });
  }

  const { folder_url } = await req.json() as { folder_url: string };
  if (!folder_url) return NextResponse.json({ error: "folder_url is required" }, { status: 400 });

  const topFolderId = parseFolderId(folder_url);
  if (!topFolderId) return NextResponse.json({ error: "Invalid Google Drive folder URL" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: allCompanies } = await supabase.from("companies").select("id, name").order("name");
  const companies = (allCompanies ?? []).filter(c => c.name);

  let subfolders;
  try {
    subfolders = await listSubfolders(topFolderId);
  } catch {
    return NextResponse.json({
      error: `Cannot access folder. Share it with: ${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}`,
      share_with: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    }, { status: 403 });
  }

  type LinkResult = {
    folder: string; company?: string; company_id?: string; matched: boolean; error?: string;
  };
  const results: LinkResult[] = [];
  const unmatched: string[] = [];
  let linked = 0;

  // Match folders to companies and save drive_folder_url — no file downloads
  await Promise.all(subfolders.map(async (subfolder) => {
    const company = matchCompany(subfolder.name, companies);
    if (!company) {
      unmatched.push(subfolder.name);
      results.push({ folder: subfolder.name, matched: false });
      return;
    }
    const folderLink = `https://drive.google.com/drive/folders/${subfolder.id}`;
    try {
      await supabase.from("companies").update({
        drive_folder_url: folderLink,
        updated_at: new Date().toISOString(),
      }).eq("id", company.id);
      results.push({ folder: subfolder.name, company: company.name, company_id: company.id, matched: true });
      linked++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ folder: subfolder.name, company: company.name, company_id: company.id, matched: true, error: msg });
    }
  }));

  return NextResponse.json({
    linked,
    total_folders: subfolders.length,
    unmatched_count: unmatched.length,
    unmatched,
    results: results.sort((a, b) => (b.matched ? 1 : 0) - (a.matched ? 1 : 0)),
    share_with: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? null,
    note: "Folders linked. Now use 'Sync to AI' in the CRM for each company to ingest files.",
  });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Drive sync-bulk unhandled error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
