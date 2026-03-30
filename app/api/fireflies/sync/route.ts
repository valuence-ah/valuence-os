// ─── Fireflies Manual Sync /api/fireflies/sync ───────────────────────────────
// Fetches recent transcripts from Fireflies GraphQL API and saves any
// that aren't already in the interactions table.
// Called manually from the Meetings page "Sync" button.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const FIREFLIES_API = "https://api.fireflies.ai/graphql";

const LIST_QUERY = `
  query ListTranscripts($limit: Int) {
    transcripts(limit: $limit) {
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

interface FirefliesTranscriptItem {
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

export async function POST() {
  // Auth check
  const supabaseUser = await createClient();
  const { data: { user } } = await supabaseUser.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const apiKey = process.env.FIREFLIES_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "FIREFLIES_API_KEY not configured" }, { status: 503 });
  }

  // Fetch recent transcripts from Fireflies
  let transcripts: FirefliesTranscriptItem[] = [];
  try {
    const res = await fetch(FIREFLIES_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query: LIST_QUERY, variables: { limit: 50 } }),
    });

    if (!res.ok) throw new Error(`Fireflies API error: ${res.status}`);
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0]?.message ?? "GraphQL error");
    transcripts = json.data?.transcripts ?? [];
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 });
  }

  const supabase = createAdminClient();
  let imported = 0;
  let skipped = 0;

  for (const t of transcripts) {
    // Idempotency
    const { data: existing } = await supabase
      .from("interactions")
      .select("id")
      .eq("fireflies_id", t.id)
      .maybeSingle();

    if (existing) { skipped++; continue; }

    // Build transcript text
    const transcriptText =
      t.sentences?.map((s) => `${s.speaker_name}: ${s.text}`).join("\n") ?? "";

    // Participant emails (exclude Valuence team)
    const participantEmails = (t.attendees ?? [])
      .map((a) => a.email?.toLowerCase())
      .filter((e): e is string => !!e && !e.endsWith("@valuence.vc"));

    // Resolve company
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
        const { data: byDomain } = await supabase
          .from("companies")
          .select("id")
          .ilike("website", `%${domain}%`)
          .limit(1)
          .maybeSingle();
        companyId = byDomain?.id ?? null;
      }
    }

    // Resolve contact IDs
    const { data: contacts } = participantEmails.length
      ? await supabase.from("contacts").select("id").in("email", participantEmails)
      : { data: [] };

    // Normalise action items
    const actionItems: string[] =
      typeof t.summary?.action_items === "string"
        ? t.summary.action_items.split("\n").filter(Boolean)
        : (t.summary?.action_items ?? []);

    const { error } = await supabase.from("interactions").insert({
      type: "meeting",
      subject: t.title || "Fireflies Meeting",
      body: t.summary?.overview ?? null,
      transcript_text: transcriptText || null,
      summary: t.summary?.overview ?? null,
      action_items: actionItems,
      date: t.date ? new Date(t.date).toISOString() : new Date().toISOString(),
      company_id: companyId,
      contact_ids: contacts?.map((c: { id: string }) => c.id) ?? [],
      fireflies_id: t.id,
      sentiment: "neutral",
    });

    if (!error) {
      imported++;
      if (companyId) {
        const dateStr = t.date
          ? new Date(t.date).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0];
        await supabase
          .from("companies")
          .update({ last_contact_date: dateStr, last_meeting_date: dateStr })
          .eq("id", companyId);
      }
    }
  }

  return NextResponse.json({ success: true, imported, skipped, total: transcripts.length });
}
