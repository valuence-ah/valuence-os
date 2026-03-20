// ─── Microsoft Graph API Client ───────────────────────────────────────────────
// Used to read emails from Outlook / Exchange Online without Make.com.
// Authenticates via client_credentials (app-only, no user login needed).
//
// Required env vars:
//   MICROSOFT_TENANT_ID      — Azure AD tenant ID (Directory ID)
//   MICROSOFT_CLIENT_ID      — App registration client ID
//   MICROSOFT_CLIENT_SECRET  — App registration client secret
//
// Required Graph permissions (Application, not Delegated):
//   Mail.Read   (to read emails from specific mailboxes)

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

let _token: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (_token && Date.now() < _token.expiresAt - 60_000) return _token.value;

  const { MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET } = process.env;

  if (!MICROSOFT_TENANT_ID || !MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
    throw new Error(
      "Microsoft Graph not configured. Add MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID, and MICROSOFT_CLIENT_SECRET to .env.local"
    );
  }

  const res = await fetch(
    `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: MICROSOFT_CLIENT_ID,
        client_secret: MICROSOFT_CLIENT_SECRET,
        scope: "https://graph.microsoft.com/.default",
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Microsoft token error ${res.status}: ${text}`);
  }

  const json = await res.json();
  _token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return _token.value;
}

export interface GraphEmail {
  id: string;
  subject: string;
  from: { emailAddress: { name: string; address: string } };
  toRecipients: { emailAddress: { name: string; address: string } }[];
  receivedDateTime: string;
  bodyPreview: string;
  body: { content: string; contentType: string };
  hasAttachments: boolean;
  webLink: string;
}

/** Fetch recent emails from a mailbox. `since` is an ISO timestamp (e.g. "2025-01-01T00:00:00Z"). */
export async function getRecentEmails(
  mailbox: string,
  since?: string,
  limit = 50
): Promise<GraphEmail[]> {
  const token = await getAccessToken();

  const filter = since
    ? `&$filter=receivedDateTime ge ${since}&$filter=isDraft eq false`
    : "$filter=isDraft eq false";

  const url =
    `${GRAPH_BASE}/users/${mailbox}/mailFolders/inbox/messages` +
    `?$top=${limit}&${filter}&$orderby=receivedDateTime desc` +
    `&$select=id,subject,from,toRecipients,receivedDateTime,bodyPreview,body,hasAttachments,webLink`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Graph messages error ${res.status}: ${text}`);
  }
  const json = await res.json();
  return json.value ?? [];
}

export interface GraphAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  contentBytes?: string; // base64
}

export async function getEmailAttachments(
  mailbox: string,
  messageId: string
): Promise<GraphAttachment[]> {
  const token = await getAccessToken();
  const url = `${GRAPH_BASE}/users/${mailbox}/messages/${messageId}/attachments`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  const json = await res.json();
  return json.value ?? [];
}
