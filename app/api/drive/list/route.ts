// ─── Drive folder diagnostic — lists ALL files without downloading ─────────────
// POST { folder_url } → returns every file found, with mime type + ingestible flag

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseFolderId, isIngestible } from "@/lib/google-drive";
import { google } from "googleapis";

export const maxDuration = 60;

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key   = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("Google credentials not configured");
  return new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: key },
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
}

interface FileEntry {
  id: string; name: string; mimeType: string;
  size: number | null; path: string; ingestible: boolean;
}

async function listAll(
  folderId: string,
  folderPath: string,
  depth: number,
  maxDepth: number,
): Promise<FileEntry[]> {
  if (depth > maxDepth) return [];
  const drive = google.drive({ version: "v3", auth: getAuth() });
  const results: FileEntry[] = [];
  const subFolders: { id: string; name: string }[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, size)",
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    for (const f of res.data.files ?? []) {
      if (!f.id || !f.name || !f.mimeType) continue;
      if (f.mimeType === "application/vnd.google-apps.folder") {
        subFolders.push({ id: f.id, name: f.name });
      } else {
        results.push({
          id: f.id,
          name: f.name,
          mimeType: f.mimeType,
          size: f.size ? parseInt(f.size, 10) : null,
          path: `${folderPath}/${f.name}`,
          ingestible: isIngestible(f.mimeType),
        });
      }
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  for (const sub of subFolders) {
    const children = await listAll(sub.id, `${folderPath}/${sub.name}`, depth + 1, maxDepth);
    results.push(...children);
  }
  return results;
}

export async function POST(req: NextRequest) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { folder_url } = await req.json() as { folder_url: string };
  const folderId = parseFolderId(folder_url);
  if (!folderId) return NextResponse.json({ error: "Invalid folder URL" }, { status: 400 });

  try {
    const files = await listAll(folderId, "", 0, 6);
    const ingestible = files.filter(f => f.ingestible);
    const notIngestible = files.filter(f => !f.ingestible);
    return NextResponse.json({
      total: files.length,
      ingestible_count: ingestible.length,
      not_ingestible_count: notIngestible.length,
      files,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
