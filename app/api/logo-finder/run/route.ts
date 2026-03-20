// ─── Logo Finder ─────────────────────────────────────────────────────────────
// POST /api/logo-finder/run
// Finds logos for startups using Logo.dev API.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

function extractDomain(website: string): string | null {
  try {
    const url = new URL(website.startsWith("http") ? website : `https://${website}`);
    let host = url.hostname.replace(/^www\./, "");
    // Strip common non-root subdomains (mail., app., etc.) to get root domain
    const parts = host.split(".");
    if (parts.length > 2) {
      const sub = parts[0];
      const nonRoot = ["mail", "app", "docs", "help", "support", "blog", "careers", "jobs"];
      if (nonRoot.includes(sub)) host = parts.slice(1).join(".");
    }
    return host;
  } catch {
    return null;
  }
}

async function tryLogoDev(domain: string): Promise<string | null> {
  const token = process.env.LOGO_DEV_TOKEN;
  if (!token) return null;
  try {
    const url = `https://img.logo.dev/${domain}?token=${token}&format=png`;
    const res = await fetch(url, { method: "GET", redirect: "follow" });
    if (res.ok && res.headers.get("content-type")?.startsWith("image")) {
      return url;
    }
  } catch {}
  return null;
}

export async function POST(req: NextRequest) {
  const { limit = 25, companyId } = await req.json().catch(() => ({}));
  const supabase = createAdminClient();

  // Single company mode
  if (companyId) {
    const { data: company } = await supabase
      .from("companies")
      .select("id, name, website")
      .eq("id", companyId)
      .single();
    if (!company?.website) {
      return NextResponse.json({ success: false, message: "No website set for this company." });
    }
    const domain = extractDomain(company.website);
    if (!domain) return NextResponse.json({ success: false, message: "Could not parse domain." });
    const logoUrl = await tryLogoDev(domain);
    if (logoUrl) {
      await supabase.from("companies").update({ logo_url: logoUrl }).eq("id", company.id);
      return NextResponse.json({ success: true, logo_url: logoUrl });
    }
    return NextResponse.json({ success: false, message: "Logo not found." });
  }

  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, website")
    .eq("type", "startup")
    .is("logo_url", null)
    .not("website", "is", null)
    .limit(Math.min(Number(limit), 50));

  if (!companies?.length) {
    return NextResponse.json({
      success: true,
      processed: 0,
      updated: 0,
      results: [],
      message: "No startups missing logos.",
    });
  }

  const results: { name: string; logo_url?: string; skipped?: boolean }[] = [];

  for (const company of companies) {
    const domain = extractDomain(company.website!);
    if (!domain) {
      results.push({ name: company.name, skipped: true });
      continue;
    }

    const logoUrl = await tryLogoDev(domain);

    if (logoUrl) {
      await supabase.from("companies").update({ logo_url: logoUrl }).eq("id", company.id);
      results.push({ name: company.name, logo_url: logoUrl });
    } else {
      results.push({ name: company.name, skipped: true });
    }

    await new Promise((r) => setTimeout(r, 100));
  }

  const updated = results.filter((r) => !r.skipped).length;
  return NextResponse.json({ success: true, processed: companies.length, updated, results });
}
