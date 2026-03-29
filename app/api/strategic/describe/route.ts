// POST { company_id, name, sectors }
// Uses Claude to generate a max-60-word description, saves to companies table
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const { company_id, name, sectors } = await req.json();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [{ role: "user", content: `Write a factual description of ${name} (sectors: ${(sectors ?? []).join(", ")}) in exactly 60 words or fewer. Be specific about what they do, their focus areas, and their relevance to a cleantech/techbio VC fund. No fluff. Just facts.` }],
  });
  const description = msg.content[0].type === "text" ? msg.content[0].text.trim() : "";
  if (company_id && description) {
    const supabase = createAdminClient();
    await supabase.from("companies").update({ description }).eq("id", company_id);
  }
  return NextResponse.json({ description });
}
