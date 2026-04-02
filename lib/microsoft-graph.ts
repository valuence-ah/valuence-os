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

/** Fetch recent emails from a mailbox folder. */
export async function getRecentEmails(
  mailbox: string,
  since?: string,
  limit = 50,
  folder: "inbox" | "sentItems" = "inbox"
): Promise<GraphEmail[]> {
  const token = await getAccessToken();

  const filter = since
    ? `&$filter=receivedDateTime ge ${since} and isDraft eq false`
    : "$filter=isDraft eq false";

  const url =
    `${GRAPH_BASE}/users/${mailbox}/mailFolders/${folder}/messages` +
    `?$top=${limit}&${filter}&$orderby=receivedDateTime desc` +
    `&$select=id,subject,from,toRecipients,receivedDateTime,bodyPreview,body,hasAttachments,webLink`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Graph API ${res.status} for ${mailbox}/${folder}: ${body.slice(0, 300)}`);
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

// ── Calendar enrichment (uses GRAPH_* env vars set separately) ────────────────
// Requires: GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET, GRAPH_TENANT_ID, GRAPH_USER_EMAIL
// Permissions: Calendars.Read (Application)

let _calToken: { value: string; expiresAt: number } | null = null;

async function getCalendarToken(): Promise<string> {
  if (_calToken && Date.now() < _calToken.expiresAt - 60_000) return _calToken.value;
  const tenantId = process.env.GRAPH_TENANT_ID;
  if (!tenantId) throw new Error("GRAPH_TENANT_ID not set");
  const res = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     process.env.GRAPH_CLIENT_ID!,
        client_secret: process.env.GRAPH_CLIENT_SECRET!,
        scope:         "https://graph.microsoft.com/.default",
        grant_type:    "client_credentials",
      }),
    }
  );
  const data = await res.json() as { access_token?: string; expires_in?: number; error?: string };
  if (!data.access_token) throw new Error(`Graph calendar token error: ${data.error ?? "unknown"}`);
  _calToken = { value: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return _calToken.value;
}

export interface OutlookEventMatch {
  attendees: { name: string; email: string }[];
  bodyText:  string;
  organizer: { name: string; email: string } | null;
}

/**
 * Find the Outlook calendar event that best matches the given meeting date + title.
 * Returns null on any error — Graph enrichment is always best-effort.
 */
export async function findOutlookEvent(
  meetingDate: string,
  meetingTitle: string
): Promise<OutlookEventMatch | null> {
  if (!process.env.GRAPH_CLIENT_ID || !process.env.GRAPH_TENANT_ID) return null;
  try {
    const token     = await getCalendarToken();
    const userEmail = process.env.GRAPH_USER_EMAIL;
    if (!userEmail) return null;

    const startDate = new Date(meetingDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(meetingDate);
    endDate.setHours(23, 59, 59, 999);

    const url =
      `${GRAPH_BASE}/users/${encodeURIComponent(userEmail)}/calendarView` +
      `?startDateTime=${startDate.toISOString()}` +
      `&endDateTime=${endDate.toISOString()}` +
      `&$select=subject,attendees,organizer,body` +
      `&$top=50`;

    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { console.warn(`[Graph] calendarView ${res.status}`); return null; }

    const data = await res.json() as { value?: Array<{
      subject?: string;
      attendees?: Array<{ emailAddress: { name: string; address: string } }>;
      organizer?: { emailAddress: { name: string; address: string } };
      body?: { content?: string };
    }>};
    const events = data.value ?? [];

    // Import here to avoid circular deps — meeting-resolution doesn't import microsoft-graph
    const { jaroWinkler } = await import("@/lib/meeting-resolution");
    const titleLower = meetingTitle.toLowerCase();
    let best = null, bestScore = 0;
    for (const ev of events) {
      if (!ev.subject) continue;
      const s = jaroWinkler(ev.subject.toLowerCase(), titleLower);
      if (s > bestScore) { bestScore = s; best = ev; }
    }
    if (!best || bestScore < 0.75) return null;

    const bodyText = (best.body?.content ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    return {
      attendees: (best.attendees ?? []).map(a => ({ name: a.emailAddress.name, email: a.emailAddress.address })),
      bodyText,
      organizer: best.organizer
        ? { name: best.organizer.emailAddress.name, email: best.organizer.emailAddress.address }
        : null,
    };
  } catch (err) {
    console.warn("[Graph] findOutlookEvent (best-effort):", err);
    return null;
  }
}
