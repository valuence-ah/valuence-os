// ─── Fireflies GraphQL Client ─────────────────────────────────────────────────
// API: https://api.fireflies.ai/graphql
// Auth: Authorization: Bearer {FIREFLIES_API_KEY}
// Docs: https://docs.fireflies.ai/graphql-api/reference

const FIREFLIES_API = "https://api.fireflies.ai/graphql";

function firefliesHeaders(): HeadersInit {
  const key = process.env.FIREFLIES_API_KEY;
  if (!key) throw new Error("FIREFLIES_API_KEY not configured");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function gql<T = unknown>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(FIREFLIES_API, {
    method: "POST",
    headers: firefliesHeaders(),
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Fireflies API ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json() as { data?: T; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    throw new Error(`Fireflies GraphQL: ${json.errors.map(e => e.message).join(", ")}`);
  }
  return json.data as T;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FirefliesAttendee {
  name: string;
  email: string;
}

export interface FirefliesActionItem {
  description: string;
}

// Raw shape from GraphQL
interface RawTranscript {
  id: string;
  title?: string | null;
  date?: number | null;           // Unix ms
  duration?: number | null;       // seconds
  organizer_email?: string | null;
  participants?: string[] | null;
  meeting_attendees?: Array<{ displayName?: string | null; email?: string | null }> | null;
  summary?: {
    overview?: string | null;
    bullet_gist?: string | null;
    action_items?: string | null;
    keywords?: string | null;
    short_overview?: string | null;
  } | null;
  sentences?: Array<{
    speaker_name?: string | null;
    text?: string | null;
    start_time?: number | null;
    end_time?: number | null;
  }> | null;
}

// Normalised shape used across the app — mirrors FellowMeeting
export interface FirefliesMeeting {
  id: string;
  title: string;
  start_datetime: string;          // ISO string
  duration_minutes: number | null;
  attendees: FirefliesAttendee[];
  transcript: string | null;
  ai_summary: string | null;
  action_items: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTranscript(sentences: RawTranscript["sentences"]): string | null {
  if (!sentences?.length) return null;
  return sentences
    .map(s => s.speaker_name ? `${s.speaker_name}: ${s.text ?? ""}` : (s.text ?? ""))
    .filter(Boolean)
    .join("\n");
}

function mapTranscript(r: RawTranscript): FirefliesMeeting {
  // Build attendees — prefer meeting_attendees (has names), fall back to participants (email only)
  let attendees: FirefliesAttendee[] = [];
  if (r.meeting_attendees?.length) {
    attendees = r.meeting_attendees
      .filter(a => a.email)
      .map(a => ({ name: a.displayName ?? a.email ?? "", email: a.email! }));
  } else if (r.participants?.length) {
    attendees = r.participants.map(p => ({ name: p, email: p }));
  }

  // Build structured AI summary from Fireflies' native sections so our
  // formatMeetingSummary parser can display each section cleanly.
  const sections: string[] = [];
  const overview = r.summary?.overview ?? r.summary?.short_overview ?? null;
  if (overview?.trim()) {
    sections.push(`## Overview\n${overview.trim()}`);
  }
  if (r.summary?.bullet_gist?.trim()) {
    sections.push(`## Key Discussion Topics\n${r.summary.bullet_gist.trim()}`);
  }
  if (r.summary?.action_items?.trim()) {
    sections.push(`## Next Steps\n${r.summary.action_items.trim()}`);
  }
  const aiSummary = sections.length > 0 ? sections.join("\n\n") : null;

  // Action items come as a newline-separated string
  const actionItems: string[] = r.summary?.action_items
    ? r.summary.action_items
        .split("\n")
        .map(s => s.replace(/^[-•*]\s*/, "").trim())
        .filter(Boolean)
    : [];

  return {
    id: r.id,
    title: r.title ?? "Untitled Meeting",
    start_datetime: r.date ? new Date(r.date).toISOString() : new Date().toISOString(),
    duration_minutes: r.duration ? Math.round(r.duration / 60) : null,
    attendees,
    transcript: formatTranscript(r.sentences),
    ai_summary: aiSummary,
    action_items: actionItems,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

const LIST_QUERY = `
  query GetTranscripts($fromDate: DateTime) {
    transcripts(fromDate: $fromDate) {
      id
      title
      date
      duration
      organizer_email
      participants
      meeting_attendees { displayName email }
      summary { overview bullet_gist action_items keywords short_overview }
      sentences { speaker_name text start_time end_time }
    }
  }
`;

const SINGLE_QUERY = `
  query GetTranscript($id: String!) {
    transcript(id: $id) {
      id
      title
      date
      duration
      organizer_email
      participants
      meeting_attendees { displayName email }
      summary { overview bullet_gist action_items keywords short_overview }
      sentences { speaker_name text start_time end_time }
    }
  }
`;

const USER_QUERY = `
  query { user { user_id name email num_transcripts } }
`;

/**
 * List transcripts updated in the last `lookbackDays` days.
 */
export async function firefliesListMeetings(lookbackDays = 30): Promise<FirefliesMeeting[]> {
  const fromDate = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();
  const data = await gql<{ transcripts: RawTranscript[] }>(LIST_QUERY, { fromDate });
  const transcripts = data?.transcripts;
  if (!Array.isArray(transcripts)) return [];
  return transcripts.map(mapTranscript);
}

/**
 * Get a single transcript by ID.
 */
export async function firefliesGetMeeting(id: string): Promise<FirefliesMeeting> {
  const data = await gql<{ transcript: RawTranscript }>(SINGLE_QUERY, { id });
  return mapTranscript(data.transcript);
}

/**
 * Get current user info — used for connection status check.
 */
export async function firefliesGetUser(): Promise<{
  user_id: string; name: string; email: string; num_transcripts: number;
}> {
  const data = await gql<{ user: { user_id: string; name: string; email: string; num_transcripts: number } }>(USER_QUERY);
  return data.user;
}

// ── Field accessors (mirror fellow.ts) ───────────────────────────────────────

export function getMeetingTitle(m: FirefliesMeeting): string { return m.title; }
export function getMeetingDuration(m: FirefliesMeeting): number | null { return m.duration_minutes; }
export function getMeetingDate(m: FirefliesMeeting): string { return m.start_datetime; }
