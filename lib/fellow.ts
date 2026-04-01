// ─── Fellow API Client ─────────────────────────────────────────────────────────
// Base URL: https://api.fellow.app/v2
// Auth: Authorization: Bearer {FELLOW_API_KEY}

const FELLOW_BASE = "https://api.fellow.app/v2";

export interface FellowAttendee {
  name: string;
  email: string;
  response_status?: string;
}

export interface FellowActionItem {
  id?: string;
  description: string;
  owner?: { name?: string; email?: string };
  due_date?: string | null;
  completed?: boolean;
  assignee?: { name?: string; email?: string };
}

export interface FellowNote {
  id?: string;
  content?: string;
  text?: string;
  type?: string;
}

export interface FellowMeeting {
  id: string;
  title?: string;
  subject?: string;
  start_datetime?: string;
  start_time?: string;
  end_datetime?: string;
  end_time?: string;
  attendees?: FellowAttendee[];
  organizer?: FellowAttendee | { name?: string; email?: string };
  notes?: FellowNote[];
  transcript?: string;
  ai_summary?: string;
  summary?: string;
  action_items?: FellowActionItem[];
  duration_minutes?: number;
  updated_at?: string;
}

function fellowHeaders(): HeadersInit {
  const key = process.env.FELLOW_API_KEY;
  if (!key) throw new Error("FELLOW_API_KEY not configured");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/** List meetings updated in the last `lookbackDays` days. */
export async function fellowListMeetings(lookbackDays = 30): Promise<FellowMeeting[]> {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({ updated_since: since, limit: "100" });

  const res = await fetch(`${FELLOW_BASE}/meetings?${params}`, {
    headers: fellowHeaders(),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Fellow API ${res.status}: ${text}`);
  }

  const json = await res.json() as unknown;
  if (Array.isArray(json)) return json as FellowMeeting[];
  const obj = json as Record<string, unknown>;
  return (obj.data ?? obj.meetings ?? obj.results ?? []) as FellowMeeting[];
}

export async function fellowGetMeeting(id: string): Promise<FellowMeeting> {
  const res = await fetch(`${FELLOW_BASE}/meetings/${id}`, {
    headers: fellowHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Fellow API ${res.status}`);
  return res.json() as Promise<FellowMeeting>;
}

export async function fellowGetTranscript(id: string): Promise<string | null> {
  try {
    const res = await fetch(`${FELLOW_BASE}/meetings/${id}/transcript`, {
      headers: fellowHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json() as Record<string, unknown>;
    return (data.transcript ?? data.content ?? data.text ?? null) as string | null;
  } catch {
    return null;
  }
}

export async function fellowGetActionItems(id: string): Promise<FellowActionItem[]> {
  try {
    const res = await fetch(`${FELLOW_BASE}/meetings/${id}/action_items`, {
      headers: fellowHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json() as unknown;
    if (Array.isArray(data)) return data as FellowActionItem[];
    const obj = data as Record<string, unknown>;
    return (obj.data ?? obj.action_items ?? obj.results ?? []) as FellowActionItem[];
  } catch {
    return [];
  }
}

export async function fellowGetNotes(id: string): Promise<FellowNote[]> {
  try {
    const res = await fetch(`${FELLOW_BASE}/meetings/${id}/notes`, {
      headers: fellowHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json() as unknown;
    if (Array.isArray(data)) return data as FellowNote[];
    const obj = data as Record<string, unknown>;
    return (obj.data ?? obj.notes ?? obj.results ?? []) as FellowNote[];
  } catch {
    return [];
  }
}

/** Get the meeting title, normalizing across field name variants. */
export function getMeetingTitle(m: FellowMeeting): string {
  return m.title ?? m.subject ?? "Untitled Meeting";
}

/** Get duration in minutes from a Fellow meeting. */
export function getMeetingDuration(m: FellowMeeting): number | null {
  if (m.duration_minutes) return m.duration_minutes;
  const start = m.start_datetime ?? m.start_time;
  const end = m.end_datetime ?? m.end_time;
  if (start && end) {
    const diff = new Date(end).getTime() - new Date(start).getTime();
    if (diff > 0) return Math.round(diff / 60000);
  }
  return null;
}

/** Get the ISO string for meeting start. */
export function getMeetingDate(m: FellowMeeting): string {
  return m.start_datetime ?? m.start_time ?? new Date().toISOString();
}
