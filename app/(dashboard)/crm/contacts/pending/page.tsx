// ─── New Contacts Page /crm/contacts/pending ──────────────────────────────────
// Shows contacts that are missing Contact Type (type = 'other') OR Location
// (Country). This catches both Make.com auto-imports and any under-enriched
// contacts. Once confirmed with a type + country, they auto-route to the right
// CRM view (Pipeline → Startup, LPs → LP, Funds → Fund, etc.).

import { createAdminClient } from "@/lib/supabase/admin";
import { Header } from "@/components/layout/header";
import { PendingContactsClient } from "@/components/crm/pending-contacts-client";

export const metadata = { title: "New Contacts" };

export default async function PendingContactsPage() {
  const supabase = createAdminClient();

  const [{ data: contacts }, { data: companies }] = await Promise.all([
    // Fetch contacts missing type (still 'other') OR missing country
    supabase
      .from("contacts")
      .select("*, company:companies(id, name, type)")
      .or("type.eq.other,location_country.is.null")
      .order("created_at", { ascending: false })
      .limit(10000) as unknown as Promise<{
        data: (import("@/lib/types").Contact & { company?: { id: string; name: string; type: string; website?: string | null } | null })[] | null;
        error: unknown;
      }>,
    supabase
      .from("companies")
      .select("id, name, type, website")
      .order("name")
      .limit(10000) as unknown as Promise<{
        data: { id: string; name: string; type: string; website?: string }[] | null;
        error: unknown;
      }>,
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
