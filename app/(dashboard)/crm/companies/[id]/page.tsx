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

export default async function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: company }, { data: contacts }, { data: interactions }, { data: deals }] = await Promise.all([
    supabase.from("companies").select("*").eq("id", id).single(),
    supabase.from("contacts").select("*").eq("company_id", id).order("is_primary_contact", { ascending: false }),
    supabase.from("interactions").select("*").eq("company_id", id).order("date", { ascending: false }).limit(10),
    supabase.from("deals").select("*").eq("company_id", id).order("created_at", { ascending: false }),
  ]);

  if (!company) notFound();

  return (
    <div className="flex flex-col h-full">
      <Header
        title={company.name}
        subtitle={[company.type.replace("_", " "), company.location_city, company.location_country].filter(Boolean).join(" · ")}
      />
      <CompanyDetailClient
        company={company}
        contacts={contacts ?? []}
        interactions={interactions ?? []}
        deals={deals ?? []}
      />
    </div>
  );
}
