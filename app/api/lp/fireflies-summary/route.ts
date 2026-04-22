// ─── POST /api/lp/fireflies-summary ──────────────────────────────────────────
// Fetches Fireflies transcripts relevant to an LP and summarises them.
// Full prompt is loaded from Admin → AI Config → LP Meeting Summary.
// Template variables: {{lp_name}}, {{transcripts}}

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getAiConfig } from "@/lib/ai-config";

/** Replace {{variable}} placeholders in a template string. */
function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replaceAll(`{{${k}}}`, v),
    template
  );
}

interface FirefliesTranscript {
  id: string;
  title: string;
  date: number;
  duration: number;
  participants: string[];
  summary?: {
    overview?: string;
    action_items?: string[];
    keywords?: string[];
  };
}

export async function POST(req: NextRequest) {
  try {
    const { contactEmails, companyName } = await req.json();

    const ffKey = process.env.FIREFLIES_API_KEY;
    if (!ffKey) {
      return NextResponse.json({ error: "FIREFLIES_API_KEY not configured", summary: null });
    }

    // Query Fireflies GraphQL for recent transcripts
    const query = `
      query GetTranscripts {
        transcripts(limit: 20) {
          id
          title
          date
          duration
          participants
          summary {
            overview
            action_items
            keywords
          }
        }
      }
    `;

    const ffRes = await fetch("https://api.fireflies.ai/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${ffKey}`,
      },
      body: JSON.stringify({ query }),
    });

    if (!ffRes.ok) {
      return NextResponse.json({ error: "Fireflies API error", summary: null });
    }

    const ffData = await ffRes.json();
    const allTranscripts: FirefliesTranscript[] = ffData.data?.transcripts ?? [];

    // Filter to transcripts relevant to this LP
    const normalizedEmails = (contactEmails ?? []).map((e: string) => e.toLowerCase());
    const companyNameLower  = (companyName ?? "").toLowerCase();

    const relevant = allTranscripts.filter(t => {
      const titleMatch       = t.title?.toLowerCase().includes(companyNameLower);
      const participantMatch = normalizedEmails.length > 0 && t.participants?.some(
        (p: string) => normalizedEmails.some((e: string) => p.toLowerCase().includes(e))
      );
      return titleMatch || participantMatch;
    });

    if (relevant.length === 0) {
      return NextResponse.json({ summary: null, transcriptCount: 0 });
    }

    // Build formatted transcript context
    const transcriptContext = relevant
      .sort((a, b) => b.date - a.date)
      .slice(0, 5)
      .map(t => {
        const d = new Date(t.date * 1000).toLocaleDateString("en-US", {
          month: "short", day: "numeric", year: "numeric",
        });
        return [
          `Date: ${d}`,
          `Title: ${t.title}`,
          t.summary?.overview      ? `Overview: ${t.summary.overview}` : "",
          t.summary?.action_items?.length
            ? `Action items: ${t.summary.action_items.join("; ")}`
            : "",
          t.summary?.keywords?.length
            ? `Keywords: ${t.summary.keywords.join(", ")}`
            : "",
        ].filter(Boolean).join("\n");
      })
      .join("\n\n---\n\n");

    const cfg = await getAiConfig("lp_meeting_summary");
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const templateVars: Record<string, string> = {
      lp_name:    companyName ?? "this LP",
      transcripts: transcriptContext,
    };

    const prompt       = interpolate(cfg.user_prompt, templateVars);
    const systemPrompt = cfg.system_prompt ?? "You are a VC analyst summarising LP meeting transcripts. Be factual and concise.";

    const message = await anthropic.messages.create({
      model:       cfg.model,
      max_tokens:  cfg.max_tokens,
      temperature: cfg.temperature,
      system:      systemPrompt,
      messages:    [{ role: "user", content: prompt }],
    });

    const summary = message.content[0].type === "text" ? message.content[0].text : null;
    return NextResponse.json({ summary, transcriptCount: relevant.length });
  } catch (err: unknown) {
    console.error("fireflies-summary error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg, summary: null });
  }
}
