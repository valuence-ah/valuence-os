// POST { company_id, name, description }
// Uses Claude to determine the sector, saves to companies table
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const { company_id, name, description } = await req.json();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await anthropic.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 50,
    messages: [{ role: "user", content: `For the company "${name}" described as: "${description ?? ""}"\n\nReturn ONLY a single sector label (2-4 words max) that best describes this company's primary business. Examples: "Energy & Materials", "Deep Tech / AI", "Healthcare", "Real Estate & Infra", "Gov / Investment", "TechBio", "Advanced Manufacturing". Return only the label, nothing else.` }],
  });
  const sector = msg.content[0].type === "text" ? msg.content[0].text.trim().replace(/^"|"$/g, "") : "";
  if (company_id && sector) {
    const supabase = createAdminClient();
    await supabase.from("companies").update({ sectors: [sector] }).eq("id", company_id);
  }
  return NextResponse.json({ sector });
}
