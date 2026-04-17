// ─── Company Detail Page /crm/companies/[id] ─────────────────────────────────
// Accepts either a UUID (legacy links) or a slug like "impact-cooling".
// When navigating from the table, slugs are used for cleaner URLs.

import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { notFound } from "next/navigation";
import { CompanyDetailClient } from "@/components/crm/company-detail-client";
import { GenerateMemoButton } from "@/components/crm/generate-memo-button";
import { ExaResearchButton } from "@/components/crm/exa-research-button";
import { FindLogoButton } from "@/components/crm/find-logo-button";
import type { Company, Contact, Deal, IcMemo } from "@/lib/types";

// Convert a company name to the same slug format the table uses
function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: maybeSlug } = await params;
  const supabase = await createClient();

  // ── Step 1: look up by UUID (backward compat with old bookmarks/links) ────
  let company: Company | null = null;

  if (UUID_RE.test(maybeSlug)) {
    const { data } = await supabase
      .from("companies")
      .select("*")
      .eq("id", maybeSlug)
      .single() as unknown as { data: Company | null };
    company = data;
  } else {
    // ── Step 2: slug lookup ─────────────────────────────────────────────────
    // Decode slug to a search term, find matching companies, then pick the one
    // whose own slug equals what was requested (handles name collisions).
    const searchTerm = maybeSlug.replace(/-/g, " ");
    const { data: candidates } = await supabase
      .from("companies")
      .select("*")
      .ilike("name", `%${searchTerm}%`)
      .limit(10) as unknown as { data: Company[] | null };

    if (candidates?.length) {
      // Prefer exact slug match; fall back to first result
      company =
        candidates.find(c => toSlug(c.name) === maybeSlug) ??
        candidates[0];
    }
  }

  if (!company) notFound();

  const companyId = company.id;

  const [{ data: contacts }, { data: interactions }, { data: deals }, { data: memos }] = await Promise.all([
    supabase.from("contacts").select("*").eq("company_id", companyId).order("is_primary_contact", { ascending: false }) as unknown as Promise<{ data: Contact[] | null }>,
    supabase.from("interactions").select("*").eq("company_id", companyId).order("date", { ascending: false }).limit(50) as unknown as Promise<{ data: import("@/lib/types").Interaction[] | null }>,
    supabase.from("deals").select("*").eq("company_id", companyId).order("created_at", { ascending: false }) as unknown as Promise<{ data: Deal[] | null }>,
    supabase.from("ic_memos").select("id, title, recommendation, status, created_at").eq("company_id", companyId).order("created_at", { ascending: false }) as unknown as Promise<{ data: Pick<IcMemo, "id" | "title" | "recommendation" | "status" | "created_at">[] | null }>,
  ]);

  return (
    <div className="flex flex-col h-full">
      <Header
        title={company.name}
        subtitle={[company.type.replace("_", " "), company.location_city, company.location_country].filter(Boolean).join(" · ")}
        actions={
          <div className="flex items-center gap-2">
            <FindLogoButton companyId={companyId} />
            <ExaResearchButton companyId={companyId} />
            <GenerateMemoButton companyId={companyId} />
          </div>
        }
      />
      <CompanyDetailClient
        company={company}
        contacts={contacts ?? []}
        interactions={interactions ?? []}
        deals={deals ?? []}
        memos={memos ?? []}
      />
    </div>
  );
}
