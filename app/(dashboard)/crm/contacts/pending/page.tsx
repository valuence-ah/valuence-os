// ─── New Contacts Page /crm/contacts/pending ──────────────────────────────────
// Shows contacts with status = 'pending'.
// Status flow: pending (new / needs review) → active (confirmed) | archived (discarded)
// Make.com imports land with status = 'pending' by default.

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { PendingContactsClient } from "@/components/crm/pending-contacts-client";

export const metadata = { title: "New Contacts" };

export default async function PendingContactsPage() {
  const supabase = createAdminClient();
  const supabaseUser = await createClient();

  const currentUserId = (await supabaseUser.auth.getUser()).data.user?.id ?? "";

  const [{ data: contacts }, { data: companies }] = await Promise.all([
    // Fetch all contacts awaiting review with receiving user profile
    supabase
      .from("contacts")
      .select("*, company:companies(id, name, type), received_by:profiles!received_by_user_id(id, full_name, email, initials)")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(10000) as unknown as Promise<{
        data: (import("@/lib/types").Contact & { company?: { id: string; name: string; type: string; website?: string | null } | null; received_by?: { id: string; full_name: string | null; email: string; initials: string | null } | null })[] | null;
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
        currentUserId={currentUserId}
      />
    </div>
  );
}
