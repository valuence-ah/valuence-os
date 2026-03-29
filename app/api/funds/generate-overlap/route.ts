// ─── POST /api/funds/generate-overlap ─────────────────────────────────────────
// Returns pipeline/portfolio overlap for a single fund:
// deals in Valuence's DB where this fund appears as co_investor or lead_partner.
// Body: { company_id: string }
// Returns: { overlap: { initials, name, role }[], fund_name: string }

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 30;

/** Strip common VC suffixes for fuzzy name matching */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b(ventures?|capital|partners?|fund|vc|investments?|group|management|advisors?)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function nameMatches(fundName: string, candidate: string): boolean {
  if (!candidate.trim()) return false;
  const fn = normalize(fundName);
  const cn = normalize(candidate);
  // Direct substring match either way
  return fn.includes(cn) || cn.includes(fn);
}

export async function POST(req: NextRequest) {
  // Auth check
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { company_id?: string };
  if (!body.company_id) {
    return NextResponse.json({ error: "company_id required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch fund name
  const { data: fund } = await supabase
    .from("companies")
    .select("id, name")
    .eq("id", body.company_id)
    .single();

  if (!fund?.name) return NextResponse.json({ overlap: [], fund_name: "" });

  const fundName = (fund.name as string).trim();

  // Fetch all deals, joining the portfolio company name
  const { data: deals, error } = await supabase
    .from("deals")
    .select("id, lead_partner, co_investors, companies(name)")
    .limit(2000);

  if (error || !deals?.length) {
    return NextResponse.json({ overlap: [], fund_name: fundName });
  }

  const overlap: { initials: string; name: string; role: string }[] = [];
  const seen = new Set<string>();

  for (const deal of deals) {
    // The joined company is the startup (portfolio company)
    const company = (deal as unknown as { companies: { name: string } | null }).companies;
    const companyName = company?.name?.trim() ?? "";
    if (!companyName || seen.has(companyName.toLowerCase())) continue;

    const lead = (deal.lead_partner as string | null) ?? "";
    const coInvs = (deal.co_investors as string[] | null) ?? [];

    let role: string | null = null;

    if (lead && nameMatches(fundName, lead)) {
      role = "Lead investor";
    } else if (coInvs.some(c => nameMatches(fundName, c))) {
      role = "Co-investor";
    }

    if (role) {
      seen.add(companyName.toLowerCase());
      const initials = companyName
        .split(/\s+/)
        .map(w => w[0]?.toUpperCase() ?? "")
        .join("")
        .slice(0, 2);
      overlap.push({ initials, name: companyName, role });
    }
  }

  // Sort: leads first, then co-investors, then alphabetically
  overlap.sort((a, b) => {
    if (a.role === "Lead investor" && b.role !== "Lead investor") return -1;
    if (a.role !== "Lead investor" && b.role === "Lead investor") return 1;
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json({ overlap, fund_name: fundName });
}
