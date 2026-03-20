// ─── Company Detail Page /crm/companies/[id] ─────────────────────────────────
// Shows all information about a single company.
// Includes: overview, contacts, interactions, deals, notes.

import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { notFound } from "next/navigation";
import { formatCurrency, formatDate, COMPANY_TYPE_COLORS, DEAL_STAGE_COLORS, DEAL_STAGE_LABELS, timeAgo, cn } from "@/lib/utils";
import { Globe, Linkedin, ExternalLink, MapPin, Calendar, DollarSign } from "lucide-react";
import Link from "next/link";
import { CompanyDetailClient } from "@/components/crm/company-detail-client";
import { GenerateMemoButton } from "@/components/crm/generate-memo-button";
import { ExaResearchButton } from "@/components/crm/exa-research-button";
import type { Company, Contact, Deal, IcMemo } from "@/lib/types";

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: company }, { data: contacts }, { data: interactions }, { data: deals }, { data: memos }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", id).single() as unknown as Promise<{ data: Company | null; error: unknown }>,
    supabase.from("contacts").select("*").eq("company_id", id).order("is_primary_contact", { ascending: false }) as unknown as Promise<{ data: Contact[] | null; error: unknown }>,
    supabase.from("interactions").select("*").eq("company_id", id).order("date", { ascending: false }).limit(10) as unknown as Promise<{ data: import("@/lib/types").Interaction[] | null; error: unknown }>,
    supabase.from("deals").select("*").eq("company_id", id).order("created_at", { ascending: false }) as unknown as Promise<{ data: Deal[] | null; error: unknown }>,
    supabase.from("ic_memos").select("id, title, recommendation, status, created_at").eq("company_id", id).order("created_at", { ascending: false }) as unknown as Promise<{ data: Pick<IcMemo, "id" | "title" | "recommendation" | "status" | "created_at">[] | null; error: unknown }>,
  ]);

  if (!company) notFound();

  return (
    <div className="flex flex-col h-full">
      <Header
        title={company.name}
        subtitle={[company.type.replace("_", " "), company.location_city, company.location_country].filter(Boolean).join(" · ")}
        actions={<div className="flex items-center gap-2"><ExaResearchButton companyId={id} /><GenerateMemoButton companyId={id} /></div>}
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
