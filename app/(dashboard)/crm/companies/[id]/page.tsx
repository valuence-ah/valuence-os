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

export type CompanyDocument = {
  id: string;
  name: string;
  type: string | null;
  file_url: string | null;
  storage_path: string | null;
  google_drive_url: string | null;
  created_at: string;
};

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
    // Strategy A: hyphens → spaces  ("impact-cooling" → "impact cooling")
    // Strategy B: hyphens → SQL wildcard ("a-star" → "a%star") so names with
    //   special characters like A*STAR also resolve correctly.
    const searchTermSpaces = maybeSlug.replace(/-/g, " ");
    const searchTermWild   = maybeSlug.replace(/-/g, "%");

    const { data: spaceCands } = await supabase
      .from("companies").select("*")
      .ilike("name", `%${searchTermSpaces}%`)
      .limit(20) as unknown as { data: Company[] | null };

    let candidates: Company[] = spaceCands ?? [];

    // Only run wildcard query if strategy A didn't produce an exact slug match
    if (!candidates.find(c => toSlug(c.name) === maybeSlug)) {
      const { data: wildCands } = await supabase
        .from("companies").select("*")
        .ilike("name", searchTermWild)
        .limit(20) as unknown as { data: Company[] | null };
      const existingIds = new Set(candidates.map(c => c.id));
      candidates = [...candidates, ...(wildCands ?? []).filter(c => !existingIds.has(c.id))];
    }

    if (candidates.length) {
      company = candidates.find(c => toSlug(c.name) === maybeSlug) ?? candidates[0];
    }
  }

  if (!company) notFound();

  const companyId = company.id;

  const [{ data: contacts }, { data: interactions }, { data: deals }, { data: memos }, { data: documents }] = await Promise.all([
    supabase.from("contacts").select("*").eq("company_id", companyId).order("last_contact_date", { ascending: false, nullsFirst: false }) as unknown as Promise<{ data: Contact[] | null }>,
    supabase.from("interactions").select("*").eq("company_id", companyId).order("date", { ascending: false }).limit(50) as unknown as Promise<{ data: import("@/lib/types").Interaction[] | null }>,
    supabase.from("deals").select("*").eq("company_id", companyId).order("created_at", { ascending: false }) as unknown as Promise<{ data: Deal[] | null }>,
    supabase.from("ic_memos").select("id, title, recommendation, status, created_at").eq("company_id", companyId).order("created_at", { ascending: false }) as unknown as Promise<{ data: Pick<IcMemo, "id" | "title" | "recommendation" | "status" | "created_at">[] | null }>,
    supabase.from("documents").select("id, name, type, file_url, storage_path, google_drive_url, created_at").eq("company_id", companyId).order("created_at", { ascending: false }) as unknown as Promise<{ data: CompanyDocument[] | null }>,
  ]);

  return (
    <div className="flex flex-col h-full">
      <Header
        title={company.name}
        subtitle={[company.type.replace("_", " "), company.location_city, company.location_country].filter(Boolean).join(" · ")}
        actions={
          <div className="hidden md:flex items-center gap-2">
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
        documents={documents ?? []}
      />
    </div>
  );
}
