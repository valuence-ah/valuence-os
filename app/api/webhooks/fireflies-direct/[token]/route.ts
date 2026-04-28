// ─── Fireflies Per-User Webhook ──────────────────────────────────────────────
// URL: /api/webhooks/fireflies-direct/[token]
// Each Valuence user has a unique fireflies_webhook_token they paste into
// their personal Fireflies Settings → Developer Settings → Webhook URL.
// We use the token to identify the user, then use THEIR API key to fetch the
// transcript (necessary on Team plans where API keys only see own meetings).

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const FIREFLIES_API = "https://api.fireflies.ai/graphql";

const TRANSCRIPT_QUERY = `
  query GetTranscript($id: String!) {
    transcript(id: $id) {
      id
      title
      date
      duration
      sentences { speaker_name text }
      summary { keywords action_items overview shorthand_bullet }
      attendees { displayName email }
      host_email
    }
  }
`;

interface FirefliesAttendee { displayName?: string; email?: string }
interface FirefliesSentence { speaker_name: string; text: string }
interface FirefliesTranscript {
  id: string;
  title: string;
  date: string;
  duration?: number;
  sentences?: FirefliesSentence[];
  summary?: {
    keywords?: string;
    action_items?: string | string[];
    overview?: string;
    shorthand_bullet?: string;
  };
  attendees?: FirefliesAttendee[];
  host_email?: string;
}

async function fetchTranscript(meetingId: string, apiKey: string): Promise<FirefliesTranscript | null> {
  const res = await fetch(FIREFLIES_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query: TRANSCRIPT_QUERY, variables: { id: meetingId } }),
  });
  if (!res.ok) throw new Error(`Fireflies API error: ${res.status}`);
  const json = await res.json();
  if (json.errors) throw new Error(json.errors[0]?.message ?? "GraphQL error");
  return json.data?.transcript ?? null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const { meetingId, eventType } = body;

  if (!eventType?.toLowerCase().includes("transcription")) {
    return NextResponse.json({ skipped: true, reason: `Ignored event: ${eventType}` });
  }
  if (!meetingId) {
    return NextResponse.json({ error: "meetingId is required" }, { status: 400 });
  }
  if (!token) {
    return NextResponse.json({ error: "Webhook token missing from URL" }, { status: 401 });
  }

  const supabase = createAdminClient();

  // Look up the user by their webhook token
  const { data: ownerProfile } = await supabase
    .from("profiles")
    .select("id, full_name, fireflies_api_key, fireflies_email")
    .eq("fireflies_webhook_token", token)
    .maybeSingle();

  if (!ownerProfile) {
    console.error(`[fireflies] no profile for token ${token}`);
    return NextResponse.json({ error: "Invalid webhook token" }, { status: 401 });
  }
  if (!ownerProfile.fireflies_api_key) {
    console.error(`[fireflies] profile ${ownerProfile.id} missing API key`);
    return NextResponse.json({ error: "API key not configured for this user" }, { status: 412 });
  }

  // Idempotency check — skip if we already ingested this meeting
  const { data: existing } = await supabase
    .from("interactions")
    .select("id")
    .eq("fireflies_id", meetingId)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ success: true, interaction_id: existing.id, duplicate: true });
  }

  // Fetch transcript using THIS user's API key
  let t: FirefliesTranscript | null = null;
  try {
    t = await fetchTranscript(meetingId, ownerProfile.fireflies_api_key);
  } catch (err) {
    console.error("[fireflies] fetch error:", err);
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }
  if (!t) {
    return NextResponse.json({ error: "Transcript not found in Fireflies" }, { status: 404 });
  }

  // Build full transcript text
  const transcriptText =
    t.sentences?.map((s) => `${s.speaker_name}: ${s.text}`).join("\n") ?? "";

  // Participant emails — exclude internal @valuence.vc addresses
  const participantEmails = (t.attendees ?? [])
    .map((a) => a.email?.toLowerCase())
    .filter((e): e is string => !!e && !e.endsWith("@valuence.vc"));

  // Resolve company via contact email → company_id, then domain fallback
  let companyId: string | null = null;
  if (participantEmails.length > 0) {
    const { data: matchedContact } = await supabase
      .from("contacts")
      .select("company_id")
      .in("email", participantEmails)
      .not("company_id", "is", null)
      .limit(1)
      .maybeSingle();
    companyId = matchedContact?.company_id ?? null;

    if (!companyId) {
      const domain = participantEmails[0].split("@")[1];
      const { data: companyByDomain } = await supabase
        .from("companies")
        .select("id")
        .ilike("website", `%${domain}%`)
        .limit(1)
        .maybeSingle();
      companyId = companyByDomain?.id ?? null;
    }
  }

  // Resolve contact IDs for matched participants
  const { data: contacts } = participantEmails.length
    ? await supabase.from("contacts").select("id").in("email", participantEmails)
    : { data: [] };

  // Normalise action items (Fireflies returns either a string or array)
  const actionItems: string[] =
    typeof t.summary?.action_items === "string"
      ? t.summary.action_items.split("\n").filter(Boolean)
      : (t.summary?.action_items ?? []);

  // Insert interaction — tagged to the profile that owns this webhook token
  const { data: interaction, error } = await supabase
    .from("interactions")
    .insert({
      type:            "meeting",
      subject:         t.title || "Fireflies Meeting",
      body:            t.summary?.overview ?? null,
      transcript_text: transcriptText || null,
      summary:         t.summary?.overview ?? null,
      action_items:    actionItems,
      date:            t.date ? new Date(t.date).toISOString() : new Date().toISOString(),
      company_id:      companyId,
      contact_ids:     contacts?.map((c: { id: string }) => c.id) ?? [],
      fireflies_id:    meetingId,
      sentiment:       "neutral",
      host_user_id:    ownerProfile.id,
      host_email:      t.host_email ?? ownerProfile.fireflies_email ?? null,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update company last_contact / last_meeting dates
  if (companyId) {
    const meetingDateStr = t.date
      ? new Date(t.date).toISOString().split("T")[0]
      : new Date().toISOString().split("T")[0];
    await supabase
      .from("companies")
      .update({ last_contact_date: meetingDateStr, last_meeting_date: meetingDateStr })
      .eq("id", companyId);
  }

  return NextResponse.json({
    success:          true,
    interaction_id:   interaction.id,
    host:             ownerProfile.full_name,
    company_id:       companyId,
    contacts_matched: contacts?.length ?? 0,
  });
}
