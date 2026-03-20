// ─── Fireflies Direct Webhook ─────────────────────────────────────────────────
// Fireflies.ai calls this endpoint directly (no Make.com).
// Fireflies sends: { meetingId, eventType, clientReferenceId? }
// We fetch the full transcript from Fireflies GraphQL API, then save to Supabase.
//
// Configure in Fireflies: Settings → Webhooks → add your app URL:
//   https://your-app.vercel.app/api/webhooks/fireflies-direct

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

interface FirefliesAttendee {
  displayName?: string;
  email?: string;
}

interface FirefliesSentence {
  speaker_name: string;
  text: string;
}

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

async function fetchTranscript(meetingId: string): Promise<FirefliesTranscript | null> {
  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) throw new Error("FIREFLIES_API_KEY not configured");

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

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { meetingId, eventType } = body;

  // Only process completed transcriptions
  if (!eventType?.toLowerCase().includes("transcription")) {
    return NextResponse.json({ skipped: true, reason: `Ignored event: ${eventType}` });
  }

  if (!meetingId) {
    return NextResponse.json({ error: "meetingId is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Idempotency check
  const { data: existing } = await supabase
    .from("interactions")
    .select("id")
    .eq("fireflies_id", meetingId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ success: true, interaction_id: existing.id, duplicate: true });
  }

  // Fetch full transcript from Fireflies
  let t: FirefliesTranscript | null = null;
  try {
    t = await fetchTranscript(meetingId);
  } catch (err) {
    console.error("[fireflies-direct] fetch error:", err);
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }

  if (!t) {
    return NextResponse.json({ error: "Transcript not found in Fireflies" }, { status: 404 });
  }

  // Build full transcript text from sentences
  const transcriptText =
    t.sentences?.map((s) => `${s.speaker_name}: ${s.text}`).join("\n") ?? "";

  // Participant emails — exclude Valuence team
  const participantEmails = (t.attendees ?? [])
    .map((a) => a.email?.toLowerCase())
    .filter((e): e is string => !!e && !e.endsWith("@valuence.vc"));

  // Resolve company via contact email → company_id
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

    // Fallback: match by email domain against company websites
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

  // Resolve contact IDs
  const { data: contacts } = participantEmails.length
    ? await supabase.from("contacts").select("id").in("email", participantEmails)
    : { data: [] };

  // Normalise action items (Fireflies returns a string or array)
  const actionItems: string[] =
    typeof t.summary?.action_items === "string"
      ? t.summary.action_items.split("\n").filter(Boolean)
      : (t.summary?.action_items ?? []);

  const { data: interaction, error } = await supabase
    .from("interactions")
    .insert({
      type: "meeting",
      subject: t.title || "Fireflies Meeting",
      body: t.summary?.overview ?? null,
      transcript_text: transcriptText || null,
      summary: t.summary?.overview ?? null,
      action_items: actionItems,
      date: t.date ? new Date(t.date).toISOString() : new Date().toISOString(),
      company_id: companyId,
      contact_ids: contacts?.map((c: { id: string }) => c.id) ?? [],
      fireflies_id: meetingId,
      sentiment: "neutral",
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (companyId) {
    await supabase
      .from("companies")
      .update({ last_contact_date: new Date().toISOString().split("T")[0] })
      .eq("id", companyId);
  }

  return NextResponse.json({ success: true, interaction_id: interaction.id });
}
