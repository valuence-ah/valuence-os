import { NextResponse } from "next/server";
import { runNrelAgent } from "@/lib/agents/nrel";
export const maxDuration = 60;
export async function POST() {
  try {
    const result = await runNrelAgent();
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    return NextResponse.json({ success: false, error: String(e) }, { status: 500 });
  }
}
