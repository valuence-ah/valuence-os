"use client";
// ─── LP View — Split-pane table + slide-in detail panel ───────────────────────
// Left: scrollable table of LP companies with key columns.
// Right: ~420px detail panel that slides in when a row is clicked.

import { useState, useMemo, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Company, Contact, Interaction, CompanyType } from "@/lib/types";
import { cn, formatDate, formatCurrency, getInitials } from "@/lib/utils";
import {
  Search, X, ExternalLink, Mail, Phone, User, MapPin, ChevronRight,
} from "lucide-react";

// ── LP Stage config ───────────────────────────────────────────────────────────

const LP_STAGE_OPTIONS = [
  "Lead",
  "Initial Meeting",
  "Discussion in Process",
  "Due Diligence",
  "Committed",
  "Passed",
] as const;

type LpStageOption = typeof LP_STAGE_OPTIONS[number];

function calcProbPct(stage: string | null): number {
  if (stage === "Lead") return 0;
  if (stage === "Initial Meeting") return 0.05;
  if (stage === "Discussion in Process") return 0.10;
  if (stage === "Due Diligence") return 0.25;
  if (stage === "Committed") return 0.75;
  return 0;
}

const LP_STAGE_COLORS: Record<string, string> = {
  "Lead":                   "bg-blue-100 text-blue-700",
  "Initial Meeting":        "bg-amber-100 text-amber-700",
  "Discussion in Process":  "bg-violet-100 text-violet-700",
  "Due Diligence":          "bg-orange-100 text-orange-700",
  "Committed":              "bg-green-100 text-green-700",
  "Passed":                 "bg-red-100 text-red-600",
};

const ALL_TYPE_OPTIONS: { value: CompanyType; label: string }[] = [
  { value: "startup",           label: "Startup" },
  { value: "limited partner",   label: "Limited Partner" },
  { value: "investor",          label: "Investor" },
  { value: "strategic partner", label: "Strategic Partner" },
  { value: "ecosystem_partner", label: "Ecosystem Partner" },
  { value: "other",             label: "Other" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPct(pct: number): string {
  return pct === 0 ? "0%" : `${Math.round(pct * 100)}%`;
}

function formatCompact(val: number | null | undefined): string {
  return formatCurrency(val, true);
}

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
      className={`${sz} rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0`}
    >
      <span className="text-white font-bold">{getInitials(company.name)}</span>
    </div>
  );
}

// ── Stage Badge ───────────────────────────────────────────────────────────────

function StageBadge({ stage }: { stage: string | null }) {
  if (!stage) return <span className="text-slate-300 text-xs">—</span>;
  return (
    <span
      className={cn(
        "inline-block text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap",
        LP_STAGE_COLORS[stage] ?? "bg-slate-100 text-slate-600"
      )}
    >
      {stage}
    </span>
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

// ── Section heading ───────────────────────────────────────────────────────────

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

export function LpViewClient({ initialCompanies }: Props) {
  const supabase = createClient();

  // ── State ─────────────────────────────────────────────────────────────────
  const [companies, setCompanies] = useState<Company[]>(initialCompanies);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Inline-edit state for detail panel fields
  const [editStage, setEditStage] = useState<string>("");
  const [editGoal, setEditGoal] = useState<string>("");
  const [editType, setEditType] = useState<string>("");

  // ── Derived ───────────────────────────────────────────────────────────────
  const selected = companies.find((c) => c.id === selectedId) ?? null;

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return companies.filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        (c.location_city ?? "").toLowerCase().includes(q) ||
        (c.location_country ?? "").toLowerCase().includes(q)
    );
  }, [companies, search]);

  // Last email date per company (from interactions)
  const [lastEmailMap, setLastEmailMap] = useState<Record<string, string>>({});

  // Load last email dates for all companies on mount
  useEffect(() => {
    async function loadLastEmails() {
      const { data } = await supabase
        .from("interactions")
        .select("company_id, date")
        .eq("type", "email")
        .order("date", { ascending: false });
      if (!data) return;
      const map: Record<string, string> = {};
      for (const row of data) {
        if (row.company_id && !map[row.company_id]) {
          map[row.company_id] = row.date;
        }
      }
      setLastEmailMap(map);
    }
    loadLastEmails();
  }, [supabase]);

  // Load contact count per company for left table
  const [contactCountMap, setContactCountMap] = useState<Record<string, number>>({});
  const [contactNamesMap, setContactNamesMap] = useState<Record<string, string>>({});

  useEffect(() => {
    async function loadContactSummaries() {
      if (companies.length === 0) return;
      const ids = companies.map((c) => c.id);
      const { data } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, company_id")
        .in("company_id", ids);
      if (!data) return;
      const counts: Record<string, number> = {};
      const names: Record<string, string> = {};
      for (const contact of data) {
        if (!contact.company_id) continue;
        counts[contact.company_id] = (counts[contact.company_id] ?? 0) + 1;
        if (!names[contact.company_id]) {
          names[contact.company_id] = `${contact.first_name} ${contact.last_name}`;
        }
      }
      setContactCountMap(counts);
      setContactNamesMap(names);
    }
    loadContactSummaries();
  }, [companies, supabase]);

  // ── Load detail on selection ──────────────────────────────────────────────
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
    setEditStage(co.lp_stage ?? "");
    setEditGoal(co.commitment_goal != null ? String(co.commitment_goal) : "");
    setEditType(co.type ?? "");
    loadDetail(id);
  }

  function closePanel() {
    setSelectedId(null);
  }

  // ── Save helpers ──────────────────────────────────────────────────────────
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
      // keep edit state in sync
      if ("lp_stage" in patch) setEditStage((data as Company).lp_stage ?? "");
      if ("commitment_goal" in patch)
        setEditGoal(
          (data as Company).commitment_goal != null
            ? String((data as Company).commitment_goal)
            : ""
        );
    }
  }

  // ── Calculated values for selected company ────────────────────────────────
  const prob = selected ? calcProbPct(selected.lp_stage) : 0;
  const goal = selected?.commitment_goal ?? null;
  const expectedCommitment = goal != null ? goal * prob : null;

  // Primary contact
  const primaryContact =
    contacts.find((c) => c.is_primary_contact) ?? contacts[0] ?? null;

  // Last email from interactions for selected company
  const lastEmail =
    interactions.find((i) => i.type === "email")?.date ?? null;

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
              placeholder="Search LPs…"
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
                  Contacts
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Stage (LP)
                </th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Commitment Goal
                </th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Prob %
                </th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Expected
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Last Email
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  City
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  Country
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-12 text-center text-slate-400 text-sm"
                  >
                    {search ? `No results for "${search}"` : "No LPs found"}
                  </td>
                </tr>
              ) : (
                filtered.map((co) => {
                  const isActive = co.id === selectedId;
                  const prob = calcProbPct(co.lp_stage);
                  const expected =
                    co.commitment_goal != null
                      ? co.commitment_goal * prob
                      : null;
                  const contactCount = contactCountMap[co.id] ?? 0;
                  const contactName = contactNamesMap[co.id] ?? null;
                  const lastEmailDate = lastEmailMap[co.id] ?? null;

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
                      {/* Contacts */}
                      <td className="px-4 py-3 text-slate-600">
                        {contactCount > 0 ? (
                          <span className="text-xs">
                            {contactName}
                            {contactCount > 1 && (
                              <span className="text-slate-400 ml-1">
                                +{contactCount - 1}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      {/* Stage */}
                      <td className="px-4 py-3">
                        <StageBadge stage={co.lp_stage} />
                      </td>
                      {/* Commitment Goal */}
                      <td className="px-4 py-3 text-right text-slate-700 tabular-nums text-xs">
                        {formatCompact(co.commitment_goal)}
                      </td>
                      {/* Prob % */}
                      <td className="px-4 py-3 text-right tabular-nums text-xs">
                        <span
                          className={cn(
                            "font-medium",
                            prob > 0 ? "text-emerald-600" : "text-slate-400"
                          )}
                        >
                          {formatPct(prob)}
                        </span>
                      </td>
                      {/* Expected */}
                      <td className="px-4 py-3 text-right text-slate-700 tabular-nums text-xs">
                        {expected != null ? formatCompact(expected) : "—"}
                      </td>
                      {/* Last Email */}
                      <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                        {formatDate(lastEmailDate)}
                      </td>
                      {/* City */}
                      <td className="px-4 py-3 text-slate-600 text-xs">
                        {co.location_city ?? "—"}
                      </td>
                      {/* Country */}
                      <td className="px-4 py-3 text-slate-600 text-xs">
                        {co.location_country ?? "—"}
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
          RIGHT — Detail panel (slide in)
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

              {/* ── LP Information ── */}
              <section>
                <SectionHeading title="LP Information" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <Field label="Domain / Website">
                    {selected.website ? (
                      <a
                        href={selected.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline truncate block"
                      >
                        {selected.website.replace(/^https?:\/\//, "")}
                      </a>
                    ) : (
                      <span className="text-sm text-slate-300">—</span>
                    )}
                  </Field>

                  <Field label="Primary Contact">
                    {loadingDetail ? (
                      <div className="h-4 bg-slate-100 rounded animate-pulse w-24" />
                    ) : primaryContact ? (
                      <div>
                        <p className="text-xs font-medium text-slate-800">
                          {primaryContact.first_name} {primaryContact.last_name}
                        </p>
                        {primaryContact.title && (
                          <p className="text-[11px] text-slate-500">
                            {primaryContact.title}
                          </p>
                        )}
                        {primaryContact.email && (
                          <a
                            href={`mailto:${primaryContact.email}`}
                            className="text-[11px] text-blue-500 hover:underline"
                          >
                            {primaryContact.email}
                          </a>
                        )}
                        {primaryContact.location_city && (
                          <p className="text-[11px] text-slate-400">
                            {[
                              primaryContact.location_city,
                              primaryContact.location_country,
                            ]
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-slate-300">—</span>
                    )}
                  </Field>

                  <Field label="Last Email">
                    <span className="text-sm text-slate-700">
                      {formatDate(lastEmail)}
                    </span>
                  </Field>

                  <Field label="Stage (LP)">
                    <select
                      className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-700"
                      value={editStage}
                      onChange={async (e) => {
                        const val = e.target.value;
                        setEditStage(val);
                        await saveField(selected.id, {
                          lp_stage: val || null,
                        });
                      }}
                    >
                      <option value="">Not set</option>
                      {LP_STAGE_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Commitment Goal">
                    <input
                      type="number"
                      className="w-full text-xs px-2 py-1.5 border border-slate-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 text-slate-700"
                      placeholder="e.g. 5000000"
                      value={editGoal}
                      onChange={(e) => setEditGoal(e.target.value)}
                      onBlur={async () => {
                        const num = parseFloat(editGoal);
                        await saveField(selected.id, {
                          commitment_goal: isNaN(num) ? null : num,
                        });
                      }}
                    />
                  </Field>

                  <Field label="Prob %">
                    <span
                      className={cn(
                        "text-sm font-semibold",
                        prob > 0 ? "text-emerald-600" : "text-slate-400"
                      )}
                    >
                      {formatPct(prob)}
                    </span>
                  </Field>

                  <Field label="Expected Commitment">
                    <span className="text-sm font-semibold text-slate-800">
                      {expectedCommitment != null
                        ? formatCompact(expectedCommitment)
                        : "—"}
                    </span>
                  </Field>

                  <Field label="Relevant Portfolio">
                    <span className="text-sm text-slate-300 italic">
                      Coming soon
                    </span>
                  </Field>
                </div>
              </section>

              {/* ── Communication ── */}
              <section>
                <SectionHeading title="Communication" />

                {/* Contacts list */}
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
                        <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                          <User size={13} className="text-violet-600" />
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
