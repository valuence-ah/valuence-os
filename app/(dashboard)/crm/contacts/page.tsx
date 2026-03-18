// ─── Contacts List Page /crm/contacts ────────────────────────────────────────

import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { ContactsClient } from "@/components/crm/contacts-client";
import Link from "next/link";

export const metadata = { title: "Contacts" };

export default async function ContactsPage() {
  const supabase = await createClient();

  const [{ data: contacts }, { count: pendingCount }] = await Promise.all([
    supabase
      .from("contacts")
      .select("*, company:companies(id, name, type)")
      .eq("status", "active")
      .order("updated_at", { ascending: false }),
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
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
        subtitle={`${contacts?.length ?? 0} active contacts`}
        actions={PendingBadge}
      />
      <ContactsClient initialContacts={contacts ?? []} />
    </div>
  );
}
