// ─── Google Drive utilities (Service Account) ─────────────────────────────────
// Uses a Google Service Account to read Drive folders shared with it.
//
// Setup (one-time):
//   1. Google Cloud Console → Create/select project
//   2. APIs & Services → Enable "Google Drive API"
//   3. IAM & Admin → Service Accounts → Create SA → download JSON key
//   4. Add to .env.local:
//        GOOGLE_SERVICE_ACCOUNT_EMAIL=xxx@yyy.iam.gserviceaccount.com
//        GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n"
//   5. Share each data room Drive folder with the service account email address

import { google } from "googleapis";

// ── Auth ──────────────────────────────────────────────────────────────────────

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key   = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) throw new Error("GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY not set.");
  return new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key: key },
    scopes: ["https://www.googleapis.com/auth/drive.readonly"],
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DriveFile {
  id:           string;
  name:         string;
  mimeType:     string;
  size:         number | null;
  modifiedTime: string | null;
  webViewLink:  string | null;
}

// ── Parse folder ID from URL ───────────────────────────────────────────────────

export function parseFolderId(url: string): string | null {
  const u = url.trim();

  // https://drive.google.com/drive/folders/FOLDER_ID
  // https://drive.google.com/drive/u/0/folders/FOLDER_ID
  // https://drive.google.com/drive/u/0/folders/FOLDER_ID?usp=sharing
  const folderMatch = u.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch) return folderMatch[1];

  // https://drive.google.com/file/d/FILE_ID/view
  // https://docs.google.com/document/d/DOC_ID/edit
  // https://docs.google.com/spreadsheets/d/SHEET_ID/edit
  // https://docs.google.com/presentation/d/PRES_ID/edit
  const fileMatch = u.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (fileMatch) return fileMatch[1];

  // https://drive.google.com/open?id=FOLDER_ID
  // https://drive.google.com/folderview?id=FOLDER_ID
  const idMatch = u.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch) return idMatch[1];

  return null;
}

// ── List subfolders in folder ─────────────────────────────────────────────────

export interface DriveFolder {
  id:   string;
  name: string;
}

export async function listSubfolders(folderId: string): Promise<DriveFolder[]> {
  const drive = google.drive({ version: "v3", auth: getAuth() });
  const folders: DriveFolder[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "nextPageToken, files(id, name)",
      pageSize: 100,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    for (const f of res.data.files ?? []) {
      if (f.id && f.name) folders.push({ id: f.id, name: f.name });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  return folders;
}

// ── List files in folder (recursive) ─────────────────────────────────────────
// Scans the folder and all subfolders up to `maxDepth` levels deep (default 4).
// This handles typical data room structures like Company/SubFolder/Files.

// Folder names (case-insensitive) to skip during recursive scan.
// These are typically archive/backup folders containing old versions.
const SKIP_FOLDER_NAMES = new Set(["archive", "archives", "old", "backup", "backups", "archived"]);

export async function listFolderFiles(
  folderId: string,
  maxDepth = 4,
  _depth = 0,
): Promise<DriveFile[]> {
  const drive = google.drive({ version: "v3", auth: getAuth() });
  const allFiles: DriveFile[] = [];
  const subFolders: { id: string; name: string }[] = [];
  let pageToken: string | undefined;

  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id, name, mimeType, size, modifiedTime, webViewLink)",
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    for (const f of res.data.files ?? []) {
      if (!f.id || !f.name || !f.mimeType) continue;
      if (f.mimeType === "application/vnd.google-apps.folder") {
        // Skip archive-type folders; recurse into the rest
        if (_depth < maxDepth && !SKIP_FOLDER_NAMES.has(f.name.toLowerCase())) {
          subFolders.push({ id: f.id, name: f.name });
        }
        continue;
      }
      allFiles.push({
        id:           f.id,
        name:         f.name,
        mimeType:     f.mimeType,
        size:         f.size ? parseInt(f.size, 10) : null,
        modifiedTime: f.modifiedTime ?? null,
        webViewLink:  f.webViewLink ?? null,
      });
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);

  // Recurse into subfolders in parallel (faster than sequential)
  const subResults = await Promise.all(
    subFolders.map(sub => listFolderFiles(sub.id, maxDepth, _depth + 1))
  );
  for (const files of subResults) allFiles.push(...files);

  return allFiles;
}

// ── Download a file as Buffer ─────────────────────────────────────────────────
// Google Workspace formats (Docs/Sheets/Slides) are exported as PDF.
// Binary files (PDF, DOCX, TXT, etc.) are downloaded directly.

const GOOGLE_EXPORT_MIME: Record<string, string> = {
  // Export as plain text — no PDF parsing needed, works reliably in serverless
  "application/vnd.google-apps.document":     "text/plain",
  "application/vnd.google-apps.spreadsheet":  "text/csv",
  // Slides/Drawings still exported as PDF (no plain-text export available)
  "application/vnd.google-apps.presentation": "application/pdf",
  "application/vnd.google-apps.drawing":      "application/pdf",
};

export async function downloadFile(
  fileId: string,
  mimeType: string
): Promise<{ buffer: Buffer; effectiveMime: string }> {
  const drive = google.drive({ version: "v3", auth: getAuth() });
  const exportMime = GOOGLE_EXPORT_MIME[mimeType];

  if (exportMime) {
    // Export Google Workspace format → PDF
    const res = await drive.files.export(
      { fileId, mimeType: exportMime },
      { responseType: "arraybuffer" }
    );
    return {
      buffer:        Buffer.from(res.data as ArrayBuffer),
      effectiveMime: exportMime,
    };
  }

  // Direct download
  const res = await drive.files.get(
    { fileId, alt: "media", supportsAllDrives: true },
    { responseType: "arraybuffer" }
  );
  return {
    buffer:        Buffer.from(res.data as ArrayBuffer),
    effectiveMime: mimeType,
  };
}

// ── Can we extract text from this file type? ─────────────────────────────────

export function isIngestible(mimeType: string): boolean {
  if (GOOGLE_EXPORT_MIME[mimeType]) return true;  // Google Workspace → export as PDF
  return [
    "application/pdf",
    "text/plain",
    "text/markdown",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // DOCX
    "application/msword",                                                       // DOC
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",       // XLSX
    "application/vnd.ms-excel",                                                 // XLS
    "application/vnd.openxmlformats-officedocument.presentationml.presentation", // PPTX
    "application/vnd.ms-powerpoint",                                            // PPT
  ].includes(mimeType);
}

// ── Map Drive mime type to document type label ─────────────────────────────────

export function mimeToDocType(mimeType: string, fileName: string): string {
  const name = fileName.toLowerCase();
  if (name.includes("transcript") || name.includes("meeting")) return "transcript";
  if (name.includes("cap table") || name.includes("captable") || name.includes("financials")) return "financials";
  if (name.includes("term sheet") || name.includes("termsheet")) return "contract";
  if (mimeType === "application/vnd.google-apps.spreadsheet") return "financials";
  return "deck"; // default to deck for pitch materials
}
