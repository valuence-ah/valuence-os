// ─── Contacts List Page /crm/contacts ────────────────────────────────────────

import { createAdminClient } from "@/lib/supabase/admin";
import { Header } from "@/components/layout/header";
import { ContactsClient } from "@/components/crm/contacts-client";
import Link from "next/link";

export const metadata = { title: "Contacts" };

export default async function ContactsPage() {
  const supabase = createAdminClient();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    { data: contacts },
    { count: totalCount },
    { count: pendingCount },
    { count: newThisMonthCount },
    { count: noLastContactCount },
  ] = await Promise.all([
    supabase
      .from("contacts")
      .select("*, company:companies(id, name, type, deal_status, website)")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .range(0, 499) as unknown as Promise<{
        data: (import("@/lib/types").Contact & {
          company?: { id: string; name: string; type: string; deal_status?: string | null; website?: string | null } | null;
        })[] | null;
        error: unknown;
      }>,
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("status", "active") as unknown as Promise<{ count: number | null; error: unknown }>,
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending") as unknown as Promise<{ count: number | null; error: unknown }>,
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("status", "active")
      .gte("created_at", monthStart.toISOString()) as unknown as Promise<{ count: number | null; error: unknown }>,
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("status", "active")
      .is("last_contact_date", null) as unknown as Promise<{ count: number | null; error: unknown }>,
  ]);

  const PendingBadge = pendingCount && pendingCount > 0 ? (
    <Link
      href="/crm/contacts/pending"
      className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium rounded-lg hover:bg-amber-100 transition-colors"
    >
      <span className="w-5 h-5 bg-amber-500 text-white rounded-full text-[10px] flex items-center justify-center font-bold">
        {pendingCount}
      </span>
      New Contacts to review
    </Link>
  ) : null;

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Contacts"
        subtitle={`${totalCount ?? 0} active contacts`}
        actions={PendingBadge}
      />
      <ContactsClient
        initialContacts={contacts ?? []}
        totalCount={totalCount ?? 0}
        newThisMonthCount={newThisMonthCount ?? 0}
        noLastContactCount={noLastContactCount ?? 0}
      />
    </div>
  );
}
