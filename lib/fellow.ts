// ─── Fellow API Client ─────────────────────────────────────────────────────────
// Base URL: https://{FELLOW_WORKSPACE}.fellow.app/api/v1
// Auth: X-API-KEY: {FELLOW_API_KEY}
// Docs: https://developers.fellow.ai/reference/introduction

function fellowBase(): string {
  const ws = process.env.FELLOW_WORKSPACE;
  if (!ws) throw new Error("FELLOW_WORKSPACE not configured");
  return `https://${ws}.fellow.app/api/v1`;
}

function fellowHeaders(): HeadersInit {
  const key = process.env.FELLOW_API_KEY;
  if (!key) throw new Error("FELLOW_API_KEY not configured");
  return {
    "X-API-KEY": key,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

// ── Types ──────────────────────────────────────────────────────────────────────

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

// Internal recording shape returned by Fellow API
interface FellowRecording {
  id: string;
  title?: string;
  // Fellow uses started_at / ended_at
  started_at?: string;
  ended_at?: string;
  created_at?: string;
  updated_at?: string;
  note_id?: string;
  event_guid?: string;
  event_call_url?: string;
  user_has_calendar_event?: boolean;
  // Transcript returned when include.transcript = true
  transcript?: {
    language?: string;
    speech_segments?: Array<{
      speaker?: string;       // Fellow uses "speaker" not "speaker_name"
      speaker_name?: string;  // fallback
      text?: string;
      start?: number;         // seconds from recording start
      end?: number;
      start_timestamp?: number;
      end_timestamp?: number;
    }>;
  } | string | null;
  // Sometimes attendees come back on the recording
  event_attendees?: string[];
  duration_minutes?: number;
  ai_notes?: string;    // Fellow uses ai_notes
  ai_summary?: string;
  summary?: string;
  action_items?: FellowActionItem[];
}

// Normalised shape used across the app
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
  duration_minutes?: number | null;
  updated_at?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Format the structured transcript object into plain text. */
function formatTranscript(raw: FellowRecording["transcript"]): string | null {
  if (!raw) return null;
  if (typeof raw === "string") return raw;
  const segments = raw.speech_segments ?? [];
  if (!segments.length) return null;
  return segments
    .map(s => {
      const speaker = s.speaker ?? s.speaker_name;
      return speaker ? `${speaker}: ${s.text ?? ""}` : (s.text ?? "");
    })
    .filter(Boolean)
    .join("\n");
}

/** Map a Fellow recording to our normalised FellowMeeting shape. */
function mapRecording(r: FellowRecording): FellowMeeting {
  return {
    id: r.id,
    title: r.title,
    start_datetime: r.started_at,
    end_datetime: r.ended_at,
    attendees: (r.event_attendees ?? []).map(email => ({ email, name: email })),
    transcript: formatTranscript(r.transcript) ?? undefined,
    ai_summary: r.ai_notes ?? r.ai_summary,   // Fellow uses ai_notes
    summary: r.summary,
    action_items: r.action_items ?? [],
    duration_minutes: r.duration_minutes ?? null,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * List recordings updated in the last `lookbackDays` days.
 * Uses POST /recordings (Fellow's list endpoint) with transcript included.
 */
export async function fellowListMeetings(lookbackDays = 30): Promise<FellowMeeting[]> {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

  const res = await fetch(`${fellowBase()}/recordings`, {
    method: "POST",
    headers: fellowHeaders(),
    body: JSON.stringify({
      updated_at_start: since,
      include: { transcript: true },
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Fellow API ${res.status}: ${text}`);
  }

  const json = await res.json() as unknown;
  const obj = json as Record<string, unknown>;

  // Fellow response: { recordings: { page_info: {...}, data: [...] } }
  // Fallback to flat array or other common shapes just in case
  let recordings: FellowRecording[];
  if (Array.isArray(json)) {
    recordings = json as FellowRecording[];
  } else if (obj.recordings && typeof obj.recordings === "object") {
    const inner = obj.recordings as Record<string, unknown>;
    recordings = (inner.data ?? inner.recordings ?? []) as FellowRecording[];
  } else {
    recordings = (obj.data ?? obj.results ?? []) as FellowRecording[];
  }

  return recordings.map(mapRecording);
}

/**
 * Get a single recording by ID (transcript included).
 */
export async function fellowGetMeeting(id: string): Promise<FellowMeeting> {
  const res = await fetch(`${fellowBase()}/recordings/${id}?include[transcript]=true`, {
    headers: fellowHeaders(),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Fellow API ${res.status}`);
  const r = await res.json() as FellowRecording;
  return mapRecording(r);
}

/**
 * Get transcript for a recording.
 * The transcript is already embedded when listing with include.transcript=true;
 * this is a fallback for individual fetch.
 */
export async function fellowGetTranscript(id: string): Promise<string | null> {
  try {
    const meeting = await fellowGetMeeting(id);
    return meeting.transcript ?? null;
  } catch {
    return null;
  }
}

/**
 * List action items.
 * Fellow's action items are returned via POST /action_items.
 */
export async function fellowGetActionItems(id: string): Promise<FellowActionItem[]> {
  try {
    const res = await fetch(`${fellowBase()}/action_items`, {
      method: "POST",
      headers: fellowHeaders(),
      body: JSON.stringify({ recording_id: id }),
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

/**
 * Get note content for a recording via POST /notes filtered by recording_id.
 */
export async function fellowGetNotes(id: string): Promise<FellowNote[]> {
  try {
    const res = await fetch(`${fellowBase()}/notes`, {
      method: "POST",
      headers: fellowHeaders(),
      body: JSON.stringify({
        recording_id: id,
        include: { content_markdown: true },
      }),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json() as unknown;
    // Notes come back as objects with content_markdown — normalise to FellowNote[]
    const notes = Array.isArray(data)
      ? data
      : ((data as Record<string, unknown>).data ??
         (data as Record<string, unknown>).notes ??
         (data as Record<string, unknown>).results ??
         []) as Array<Record<string, unknown>>;
    return notes.map(n => ({
      id: n.id as string | undefined,
      content: (n.content_markdown ?? n.content ?? n.text) as string | undefined,
      text: (n.content_markdown ?? n.text) as string | undefined,
    }));
  } catch {
    return [];
  }
}

// ── Field accessors ────────────────────────────────────────────────────────────

export function getMeetingTitle(m: FellowMeeting): string {
  return m.title ?? m.subject ?? "Untitled Meeting";
}

export function getMeetingDuration(m: FellowMeeting): number | null {
  if (m.duration_minutes) return m.duration_minutes;
  const start = m.start_datetime ?? m.start_time;
  const end   = m.end_datetime   ?? m.end_time;
  if (start && end) {
    const diff = new Date(end).getTime() - new Date(start).getTime();
    if (diff > 0) return Math.round(diff / 60000);
  }
  return null;
}

export function getMeetingDate(m: FellowMeeting): string {
  return m.start_datetime ?? m.start_time ?? new Date().toISOString();
}
