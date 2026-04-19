// ─── New Contacts Page /crm/contacts/pending ──────────────────────────────────
// Paginated review queue for contacts with status = 'pending'.
// Supports ?cursor=0&pageSize=25&q=search via URL search params.

import { createAdminClient } from "@/lib/supabase/admin";
import { Header } from "@/components/layout/header";
import { PendingContactsClient } from "@/components/crm/pending-contacts-client";

export const metadata = { title: "New Contacts" };

const DEFAULT_PAGE_SIZE = 25;
const VALID_SIZES = [25, 50, 100] as const;

export default async function PendingContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const cursor   = Math.max(0, parseInt(String(sp.cursor   ?? "0"), 10) || 0);
  const pageSize = (VALID_SIZES as readonly number[]).includes(
    parseInt(String(sp.pageSize ?? ""), 10)
  )
    ? parseInt(String(sp.pageSize), 10)
    : DEFAULT_PAGE_SIZE;
  const q = String(sp.q ?? "").trim();

  const supabase = createAdminClient();

  // Build base query — server-side search on name / email
  let contactsQuery = supabase
    .from("contacts")
    .select("*, company:companies(id, name, type, website)", { count: "exact" })
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (q) {
    contactsQuery = contactsQuery.or(
      `first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%`
    );
  }

  const [
    { data: contacts, count },
    { data: companies },
  ] = await Promise.all([
    contactsQuery
      .range(cursor, cursor + pageSize - 1) as unknown as Promise<{
        data: (import("@/lib/types").Contact & {
          company?: { id: string; name: string; type: string; website?: string | null } | null;
        })[] | null;
        count: number | null;
        error: unknown;
      }>,
    supabase
      .from("companies")
      .select("id, name, type, website")
      .order("name")
      .limit(10000) as unknown as Promise<{
        data: { id: string; name: string; type: string; website?: string | null }[] | null;
        error: unknown;
      }>,
  ]);

  const total = count ?? 0;

  return (
    <div className="flex flex-col h-full">
      <Header
        title="New Contacts"
        subtitle={`${total} contact${total !== 1 ? "s" : ""} waiting for review`}
      />
      <PendingContactsClient
        initialContacts={contacts ?? []}
        companies={companies ?? []}
        total={total}
        cursor={cursor}
        pageSize={pageSize}
        initialQuery={q}
      />
    </div>
  );
}
