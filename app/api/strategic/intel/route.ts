// POST { company_id, name, sectors }
// Uses Exa to search for recent news, Claude to summarize, returns intel items
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

interface ExaResult { url?: string; title?: string; text?: string; publishedDate?: string; }

export async function POST(req: NextRequest) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { company_id, name, sectors } = await req.json();
  const EXA_KEY = process.env.EXA_API_KEY;
  const items: { id: string; headline: string; source: string; url: string; date: string; is_signal: boolean; summary: string }[] = [];

  if (EXA_KEY) {
    const queries = [`${name} news 2025 2026`, `${name} partnership investment announcement`];
    const results: ExaResult[] = [];
    for (const q of queries) {
      try {
        const r = await fetch("https://api.exa.ai/search", {
          method: "POST",
          headers: { "x-api-key": EXA_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, numResults: 4, contents: { text: { maxCharacters: 500 } } }),
        });
        if (r.ok) { const d = await r.json(); results.push(...(d.results ?? [])); }
      } catch {}
    }

    // Use Claude to identify signals and summarize
    if (results.length > 0) {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const combined = results.slice(0, 6).map((r, i) => `[${i}] ${r.title}\n${r.text?.slice(0, 300)}\nURL: ${r.url}\nDate: ${r.publishedDate}`).join("\n\n---\n\n");
      try {
        const msg = await anthropic.messages.create({
          model: "claude-haiku-3-5", max_tokens: 800,
          messages: [{ role: "user", content: `You are a VC analyst. For each article below about ${name} (a strategic partner for a cleantech/techbio fund), determine if it is a relevant signal (new investment mandate, partnership, leadership change, R&D announcement, market expansion). Return a JSON array: [{"index": 0, "headline": "concise headline under 15 words", "summary": "1 sentence relevance to a VC fund", "is_signal": true/false}]. Only include articles that are genuinely about ${name}.\n\nArticles:\n${combined}\n\nReturn only the JSON array.` }],
        });
        const raw = msg.content[0].type === "text" ? msg.content[0].text : "[]";
        const parsed = JSON.parse(raw.replace(/^```json?\s*/i, "").replace(/```\s*$/, "").trim()) as { index: number; headline: string; summary: string; is_signal: boolean }[];
        for (const p of parsed) {
          const r = results[p.index];
          if (!r) continue;
          items.push({
            id: Math.random().toString(36).slice(2),
            headline: p.headline,
            summary: p.summary,
            source: new URL(r.url ?? "https://unknown").hostname.replace("www.", ""),
            url: r.url ?? "#",
            date: r.publishedDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
            is_signal: p.is_signal,
          });
        }
      } catch {}
    }
  }

  return NextResponse.json({ items, company_id });
}
