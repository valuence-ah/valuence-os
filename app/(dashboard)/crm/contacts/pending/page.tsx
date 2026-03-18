// ─── Pending Contacts Page /crm/contacts/pending ─────────────────────────────
// Shows contacts created automatically by Make.com automations (status = pending).
// User reviews each one, fills in type/title/location, then confirms → active.

import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { PendingContactsClient } from "@/components/crm/pending-contacts-client";

export const metadata = { title: "New Contacts" };

export default async function PendingContactsPage() {
  const supabase = await createClient();

  const [{ data: contacts }, { data: companies }] = await Promise.all([
    supabase
      .from("contacts")
      .select("*, company:companies(id, name, type)")
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
    supabase
      .from("companies")
      .select("id, name, type")
      .order("name"),
  ]);

  return (
    <div className="flex flex-col h-full">
      <Header
        title="New Contacts"
        subtitle={`${contacts?.length ?? 0} contacts waiting for review`}
      />
      <PendingContactsClient
        initialContacts={contacts ?? []}
        companies={companies ?? []}
      />
    </div>
  );
}
