import { NextResponse } from "next/server";
import { runUsptoAgent } from "@/lib/agents/uspto";
export const maxDuration = 60;
export async function POST() {
  try {
    const result = await runUsptoAgent();
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
