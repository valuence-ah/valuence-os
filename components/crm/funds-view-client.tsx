"use client";
// ─── Funds View — Split-pane table + slide-in detail panel ────────────────────
// Left: scrollable table of Fund/Investor companies.
// Right: ~420px detail panel that slides in when a row is clicked.

import { useState, useMemo, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Company, Contact, Interaction, CompanyType } from "@/lib/types";
import { cn, formatDate, getInitials } from "@/lib/utils";
import {
  Search, X, ExternalLink, Mail, Phone, User, ChevronRight,
} from "lucide-react";

// ── Type options ──────────────────────────────────────────────────────────────

const ALL_TYPE_OPTIONS: { value: CompanyType; label: string }[] = [
  { value: "startup",           label: "Startup" },
  { value: "limited partner",   label: "Limited Partner" },
  { value: "investor",          label: "Investor" },
  { value: "strategic partner", label: "Strategic Partner" },
  { value: "ecosystem_partner", label: "Ecosystem Partner" },
  { value: "other",             label: "Other" },
];

// ── Logo / Avatar ─────────────────────────────────────────────────────────────

function CompanyLogo({
  company,
  size = "md",
}: {
  company: Company;
  size?: "sm" | "md" | "lg";
}) {
  const [imgError, setImgError] = useState(false);
  const sz =
    size === "sm" ? "w-8 h-8 text-[10px]" :
    size === "lg" ? "w-14 h-14 text-sm" :
    "w-10 h-10 text-xs";

  const domain = company.website?.replace(/^https?:\/\//, "").split("/")[0];
  const logoSrc =
    company.logo_url ??
    (domain ? `https://logo.clearbit.com/${domain}` : null);

  useEffect(() => { setImgError(false); }, [logoSrc]);

  if (logoSrc && !imgError) {
    return (
      <img
        src={logoSrc}
        alt={company.name}
        onError={() => setImgError(true)}
        className={`${sz} rounded-lg object-contain bg-white border border-slate-200 p-0.5 flex-shrink-0`}
      />
    );
  }
  return (
    <div
      className={`${sz} rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0`}
    >
      <span className="text-white font-bold">{getInitials(company.name)}</span>
    </div>
  );
}

// ── Field label helper ────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
        {label}
      </p>
      {children}
    </div>
  );
}

function SectionHeading({ title }: { title: string }) {
  return (
    <h2 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 pt-4 border-t border-slate-100 first:border-t-0 first:pt-0">
      {title}
    </h2>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

interface Props {
  initialCompanies: Company[];
}

export function FundsViewClient({ initialCompanies }: Props) {
  const supabase = createClient();

  // ── State ─────────────────────────────────────────────────────────────────
  const [companies, setCompanies] = useState<Company[]>(initialCompanies);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [editType, setEditType] = useState<string>("");

  // ── Derived ───────────────────────────────────────────────────────────────
  const selected = companies.find((c) => c.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return companies.filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.website ?? "").toLowerCase().includes(q) ||
        (c.location_city ?? "").toLowerCase().includes(q)
    );
  }, [companies, search]);

  // Last email date per company
  const [lastEmailMap, setLastEmailMap] = useState<Record<string, string>>({});
  const [lastMeetingMap, setLastMeetingMap] = useState<Record<string, { date: string; transcript_url: string | null }>>({});

  useEffect(() => {
    async function loadInteractionSummaries() {
      const { data } = await supabase
        .from("interactions")
        .select("company_id, date, type, transcript_url")
        .in("type", ["email", "meeting"])
        .order("date", { ascending: false });
      if (!data) return;
      const emails: Record<string, string> = {};
      const meetings: Record<string, { date: string; transcript_url: string | null }> = {};
      for (const row of data) {
        if (!row.company_id) continue;
        if (row.type === "email" && !emails[row.company_id]) {
          emails[row.company_id] = row.date;
        }
        if (row.type === "meeting" && !meetings[row.company_id]) {
          meetings[row.company_id] = {
            date: row.date,
            transcript_url: row.transcript_url ?? null,
          };
        }
      }
      setLastEmailMap(emails);
      setLastMeetingMap(meetings);
    }
    loadInteractionSummaries();
  }, [supabase]);

  // Primary contact name per company (for table)
  const [primaryContactMap, setPrimaryContactMap] = useState<Record<string, string>>({});

  useEffect(() => {
    async function loadPrimaryContacts() {
      if (companies.length === 0) return;
      const ids = companies.map((c) => c.id);
      const { data } = await supabase
        .from("contacts")
        .select("company_id, first_name, last_name, is_primary_contact")
        .in("company_id", ids)
        .order("is_primary_contact", { ascending: false });
      if (!data) return;
      const map: Record<string, string> = {};
      for (const c of data) {
        if (!c.company_id) continue;
        if (!map[c.company_id]) {
          map[c.company_id] = `${c.first_name} ${c.last_name}`;
        }
      }
      setPrimaryContactMap(map);
    }
    loadPrimaryContacts();
  }, [companies, supabase]);

  // ── Load detail ───────────────────────────────────────────────────────────
  const loadDetail = useCallback(
    async (id: string) => {
      setLoadingDetail(true);
      const [{ data: ctcts }, { data: ints }] = await Promise.all([
        supabase
          .from("contacts")
          .select("*")
          .eq("company_id", id)
          .order("is_primary_contact", { ascending: false }),
        supabase
          .from("interactions")
          .select("*")
          .eq("company_id", id)
          .order("date", { ascending: false })
          .limit(10),
      ]);
      setContacts(ctcts ?? []);
      setInteractions(ints ?? []);
      setLoadingDetail(false);
    },
    [supabase]
  );

  function selectCompany(id: string) {
    const co = companies.find((c) => c.id === id);
    if (!co) return;
    setSelectedId(id);
    setEditType(co.type ?? "");
    loadDetail(id);
  }

  function closePanel() {
    setSelectedId(null);
  }

  async function saveField(id: string, patch: Partial<Company>) {
    const { data, error } = await supabase
      .from("companies")
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (!error && data) {
      setCompanies((prev) =>
        prev.map((c) => (c.id === data.id ? (data as Company) : c))
      );
    }
  }

  // ── Detail computed ───────────────────────────────────────────────────────
  const primaryContact =
    contacts.find((c) => c.is_primary_contact) ?? contacts[0] ?? null;
  const lastEmail =
    interactions.find((i) => i.type === "email")?.date ?? null;
  const lastMeeting =
    interactions.find((i) => i.type === "meeting") ?? null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-1 overflow-hidden relative">
      {/* ═══════════════════════════════════════════════════════════════════════
          LEFT — Table
      ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white">
        {/* Search bar */}
        <div className="px-4 py-3 border-b border-slate-100">
          <div className="relative max-w-xs">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              className="w-full pl-8 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Search funds…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Company
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Domain
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Strategic Partner
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Contact
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Last Email
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Last Meeting
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Transcript
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-slate-400 text-sm"
                  >
                    {search ? `No results for "${search}"` : "No funds found"}
                  </td>
                </tr>
              ) : (
                filtered.map((co) => {
                  const isActive = co.id === selectedId;
                  const lastEmailDate = lastEmailMap[co.id] ?? null;
                  const lastMeetingData = lastMeetingMap[co.id] ?? null;
                  const contactName = primaryContactMap[co.id] ?? null;
                  const domain = co.website
                    ?.replace(/^https?:\/\//, "")
                    .split("/")[0];

                  return (
                    <tr
                      key={co.id}
                      onClick={() => selectCompany(co.id)}
                      className={cn(
                        "border-b border-slate-100 cursor-pointer transition-colors",
                        isActive
                          ? "bg-blue-50 hover:bg-blue-50"
                          : "hover:bg-slate-50"
                      )}
                    >
                      {/* Company */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <CompanyLogo company={co} size="sm" />
                          <span
                            className={cn(
                              "font-medium truncate max-w-[160px]",
                              isActive ? "text-blue-700" : "text-slate-800"
                            )}
                          >
                            {co.name}
                          </span>
                        </div>
                      </td>
                      {/* Domain */}
                      <td className="px-4 py-3">
                        {domain ? (
                          <a
                            href={co.website ?? "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                          >
                            <ExternalLink size={10} />
                            {domain}
                          </a>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      {/* Strategic Partner */}
                      <td className="px-4 py-3">
                        {co.is_strategic_partner ? (
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">
                            Yes
                          </span>
                        ) : (
                          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-500">
                            No
                          </span>
                        )}
                      </td>
                      {/* Contact */}
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {contactName ?? (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      {/* Last Email */}
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {formatDate(lastEmailDate)}
                      </td>
                      {/* Last Meeting */}
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {formatDate(lastMeetingData?.date ?? null)}
                      </td>
                      {/* Transcript */}
                      <td className="px-4 py-3">
                        {lastMeetingData?.transcript_url ? (
                          <a
                            href={lastMeetingData.transcript_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                          >
                            <ExternalLink size={10} />
                            View
                          </a>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          RIGHT — Detail panel
      ═══════════════════════════════════════════════════════════════════════ */}
      <div
        className={cn(
          "fixed right-0 top-0 h-full bg-white border-l border-slate-200 shadow-2xl z-30 flex flex-col transition-transform duration-300 ease-in-out",
          selected ? "translate-x-0" : "translate-x-full"
        )}
        style={{ width: 420 }}
      >
        {selected && (
          <>
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3 min-w-0">
                <CompanyLogo company={selected} size="lg" />
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-900 truncate">
                    {selected.name}
                  </h2>
                  {selected.website && (
                    <a
                      href={selected.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-600 hover:underline mt-0.5"
                    >
                      <ExternalLink size={10} />
                      Go to Website
                    </a>
                  )}
                </div>
              </div>
              <button
                onClick={closePanel}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500 transition-colors flex-shrink-0"
                aria-label="Close panel"
              >
                <X size={15} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {/* ── General Information ── */}
              <section>
                <SectionHeading title="General Information" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Field label="Owners">
                    <span className="text-sm text-slate-700">Andrew</span>
                  </Field>
                  <Field label="Type">
                    <select
                      className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-700"
                      value={editType}
                      onChange={async (e) => {
                        const val = e.target.value as CompanyType;
                        setEditType(val);
                        await saveField(selected.id, {
                          type: val,
                          types: [val],
                        });
                      }}
                    >
                      {ALL_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Location City">
                    <span className="text-sm text-slate-700">
                      {selected.location_city ?? "—"}
                    </span>
                  </Field>
                  <Field label="Location Country">
                    <span className="text-sm text-slate-700">
                      {selected.location_country ?? "—"}
                    </span>
                  </Field>
                  <Field label="Sector">
                    <span className="text-sm text-slate-700 capitalize">
                      {selected.sectors?.[0] ?? "—"}
                    </span>
                  </Field>
                  <Field label="Sub-sector">
                    <span className="text-sm text-slate-700">
                      {selected.sub_type ?? "—"}
                    </span>
                  </Field>
                </div>
              </section>

              {/* ── Communication ── */}
              <section>
                <SectionHeading title="Communication" />

                {loadingDetail ? (
                  <div className="space-y-2">
                    {[1, 2].map((i) => (
                      <div
                        key={i}
                        className="h-12 bg-slate-50 rounded-lg animate-pulse"
                      />
                    ))}
                  </div>
                ) : contacts.length === 0 ? (
                  <p className="text-sm text-slate-300 italic mb-3">
                    No contacts linked yet
                  </p>
                ) : (
                  <div className="space-y-2 mb-3">
                    {contacts.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg"
                      >
                        <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                          <User size={13} className="text-indigo-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-800 truncate">
                            {c.first_name} {c.last_name}
                            {c.is_primary_contact && (
                              <span className="ml-1.5 text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                                Primary
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {c.title ?? c.type}
                          </p>
                        </div>
                        <div className="flex gap-2 text-slate-400">
                          {c.email && (
                            <a
                              href={`mailto:${c.email}`}
                              className="hover:text-blue-600 transition-colors"
                            >
                              <Mail size={12} />
                            </a>
                          )}
                          {c.phone && (
                            <a
                              href={`tel:${c.phone}`}
                              className="hover:text-blue-600 transition-colors"
                            >
                              <Phone size={12} />
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2">
                  <button className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
                    <User size={11} /> + Add contact
                  </button>
                  <button className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-dashed border-slate-300 rounded-lg text-slate-500 hover:border-blue-400 hover:text-blue-600 transition-colors">
                    + Add a comment
                  </button>
                </div>

                {/* Interaction history */}
                {interactions.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      Recent interactions
                    </p>
                    {interactions.slice(0, 5).map((i) => (
                      <div
                        key={i.id}
                        className="flex items-start gap-2.5 text-xs text-slate-600"
                      >
                        <span className="mt-0.5 text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 uppercase font-medium flex-shrink-0">
                          {i.type}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-slate-700 truncate">
                            {i.subject ?? "(no subject)"}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {formatDate(i.date)}
                          </p>
                        </div>
                        {i.transcript_url && (
                          <a
                            href={i.transcript_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:text-blue-700"
                          >
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* View full profile link */}
              <a
                href={`/crm/companies/${selected.id}`}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
              >
                View full profile <ChevronRight size={12} />
              </a>
            </div>
          </>
        )}
      </div>

      {/* Overlay when panel is open */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/10 z-20"
          onClick={closePanel}
        />
      )}
    </div>
  );
}
