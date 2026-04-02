// GET /api/search/companies?q=searchTerm&type=startup — search companies by name
// Optional `type` param filters by companies.type (case-insensitive).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q    = searchParams.get("q")    ?? "";
  const type = searchParams.get("type") ?? "";

  if (!q.trim()) return NextResponse.json([]);

  let query = supabase
    .from("companies")
    .select("id, name, type")
    .ilike("name", `%${q}%`)
    .order("name")
    .limit(10);

  // Restrict to a specific company type when requested (e.g. type=startup for pipeline)
  if (type.trim()) {
    query = query.ilike("type", type.trim());
  }

  const { data } = await query;

  return NextResponse.json(data ?? []);
}
