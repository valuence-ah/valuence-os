// GET /api/search/companies?q=searchTerm — search companies by name
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";

  if (!q.trim()) return NextResponse.json([]);

  const { data } = await supabase
    .from("companies")
    .select("id, name, type")
    .ilike("name", `%${q}%`)
    .order("name")
    .limit(10);

  return NextResponse.json(data ?? []);
}
