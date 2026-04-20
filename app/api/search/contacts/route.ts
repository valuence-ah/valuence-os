// GET /api/search/contacts?q=searchTerm — search contacts by name/email
// GET /api/search/contacts?ids=id1,id2,... — fetch contacts by IDs
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q   = searchParams.get("q") ?? "";
  const ids = searchParams.get("ids") ?? "";

  // ID lookup mode
  if (ids.trim()) {
    const idList = ids.split(",").map(s => s.trim()).filter(Boolean);
    if (idList.length === 0) return NextResponse.json([]);
    const { data } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, email, company_id")
      .in("id", idList);
    return NextResponse.json(data ?? []);
  }

  // Text search mode
  if (!q.trim()) return NextResponse.json([]);

  const words = q.trim().split(/\s+/);
  let filter: string;

  if (words.length >= 2) {
    // Multi-word query (e.g. "Kevin Wong") — try first+last in both orderings,
    // plus a fallback email match for the full string.
    const w1 = words[0];
    const w2 = words.slice(1).join(" ");
    filter =
      `and(first_name.ilike.%${w1}%,last_name.ilike.%${w2}%),` +
      `and(first_name.ilike.%${w2}%,last_name.ilike.%${w1}%),` +
      `email.ilike.%${q}%`;
  } else {
    // Single word — match any field
    filter = `first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`;
  }

  const { data } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, email, company_id")
    .or(filter)
    .order("first_name")
    .limit(20);

  return NextResponse.json(data ?? []);
}
