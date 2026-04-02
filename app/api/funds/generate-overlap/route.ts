// ─── POST /api/funds/generate-overlap ─────────────────────────────────────────
// Returns pipeline/portfolio overlap for a single fund:
// deals in Valuence's DB where this fund appears as co_investor or lead_partner.
// Body: { company_id: string; force?: boolean }
// Returns: { overlap: { initials, name, role, confidence, match_method }[], fund_name: string }

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

function matchStrength(fundName: string, candidate: string): { matches: boolean; method: "exact" | "contains" | "fuzzy" } | null {
  if (!candidate.trim()) return null;
  const fn = normalize(fundName);
  const cn = normalize(candidate);
  if (fn === cn) return { matches: true, method: "exact" };
  if (fn.includes(cn) || cn.includes(fn)) return { matches: true, method: "contains" };
  return null;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2);
}

function roleToConfidence(method: "exact" | "contains" | "fuzzy", role: string): "high" | "medium" | "low" {
  if (method === "exact")    return role === "Lead investor" ? "high" : "high";
  if (method === "contains") return "medium";
  return "low";
}

export async function POST(req: NextRequest) {
  // Auth check
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { company_id?: string; force?: boolean };
  if (!body.company_id) {
    return NextResponse.json({ error: "company_id required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // ── Load from cache if not forcing ───────────────────────────────────────────
  if (!body.force) {
    const { data: cached } = await supabase
      .from("fund_portfolio_overlap")
      .select("portfolio_company, role, confidence, match_method, initials")
      .eq("fund_id", body.company_id)
      .order("portfolio_company");

    if (cached && cached.length > 0) {
      return NextResponse.json({
        overlap: cached.map((r: { portfolio_company: string; role: string; confidence: string; match_method: string; initials: string }) => ({
          initials: r.initials,
          name: r.portfolio_company,
          role: r.role,
          confidence: r.confidence,
          match_method: r.match_method,
        })),
        fund_name: "",
        from_cache: true,
      });
    }
  }

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

  const overlap: { initials: string; name: string; role: string; confidence: string; match_method: string }[] = [];
  const seen = new Set<string>();

  for (const deal of deals) {
    const company = (deal as unknown as { companies: { name: string } | null }).companies;
    const companyName = company?.name?.trim() ?? "";
    if (!companyName || seen.has(companyName.toLowerCase())) continue;

    const lead = (deal.lead_partner as string | null) ?? "";
    const coInvs = (deal.co_investors as string[] | null) ?? [];

    let role: string | null = null;
    let method: "exact" | "contains" | "fuzzy" = "contains";

    const leadMatch = lead ? matchStrength(fundName, lead) : null;
    if (leadMatch?.matches) {
      role = "Lead investor";
      method = leadMatch.method;
    } else {
      for (const c of coInvs) {
        const coMatch = matchStrength(fundName, c);
        if (coMatch?.matches) {
          role = "Co-investor";
          method = coMatch.method;
          break;
        }
      }
    }

    if (role) {
      seen.add(companyName.toLowerCase());
      overlap.push({
        initials: getInitials(companyName),
        name: companyName,
        role,
        confidence: roleToConfidence(method, role),
        match_method: method,
      });
    }
  }

  // Sort: leads first, then co-investors, then alphabetically
  overlap.sort((a, b) => {
    if (a.role === "Lead investor" && b.role !== "Lead investor") return -1;
    if (a.role !== "Lead investor" && b.role === "Lead investor") return 1;
    return a.name.localeCompare(b.name);
  });

  // Persist to fund_portfolio_overlap table
  if (overlap.length > 0) {
    await supabase.from("fund_portfolio_overlap").delete().eq("fund_id", body.company_id);
    await supabase.from("fund_portfolio_overlap").insert(
      overlap.map(o => ({
        fund_id:           body.company_id,
        portfolio_company: o.name,
        role:              o.role,
        confidence:        o.confidence,
        match_method:      o.match_method,
        initials:          o.initials,
      }))
    );
  }

  return NextResponse.json({ overlap, fund_name: fundName, from_cache: false });
}
