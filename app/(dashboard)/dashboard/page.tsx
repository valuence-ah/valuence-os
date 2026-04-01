// ─── Dashboard Home Page ──────────────────────────────────────────────────────
// The first thing you see after logging in.
// Shows fund-level KPIs: pipeline count, portfolio count, LP commitments, recent activity.
// v3 — Active Pipeline reads company deal_status (not empty deals table)

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { DashboardGreeting } from "@/components/dashboard/dashboard-greeting";
import { formatCurrency, formatDate } from "@/lib/utils";
import { TrendingUp, Users, Wallet, Radar, FileText, BarChart3 } from "lucide-react";

export const metadata = { title: "Dashboard" };

// ── Funnel stages — must match company.deal_status values in DB ───────────────
const FUNNEL_STAGES = [
  { key: "identified_introduced", label: "Identified"    },
  { key: "first_meeting",         label: "1st Meeting"   },
  { key: "discussion_in_process", label: "Discussion"    },
  { key: "tracking_hold",         label: "Tracking/Hold" },
  { key: "due_diligence",         label: "Due Diligence" },
  { key: "portfolio",             label: "Portfolio"     },
  { key: "passed",                label: "Passed"        },
];

const FUNNEL_COLORS: Record<string, string> = {
  identified_introduced: "bg-slate-100 text-slate-600",
  first_meeting:         "bg-sky-100 text-sky-700",
  discussion_in_process: "bg-blue-100 text-blue-700",
  tracking_hold:         "bg-amber-100 text-amber-700",
  due_diligence:         "bg-violet-100 text-violet-700",
  portfolio:             "bg-emerald-100 text-emerald-700",
  passed:                "bg-red-100 text-red-600",
};

// Active pipeline = startups moving through the funnel (not passed / not portfolio yet)
const ACTIVE_STAGES = [
  "identified_introduced",
  "first_meeting",
  "discussion_in_process",
  "tracking_hold",
  "due_diligence",
];

const STAGE_LABELS: Record<string, string> = {
  identified_introduced: "Identified",
  first_meeting:         "1st Meeting",
  discussion_in_process: "Discussion",
  tracking_hold:         "Tracking/Hold",
  due_diligence:         "Due Diligence",
  portfolio:             "Portfolio",
  passed:                "Passed",
};

const STAGE_BADGE_COLORS: Record<string, string> = {
  identified_introduced: "bg-slate-100 text-slate-600",
  first_meeting:         "bg-sky-100 text-sky-700",
  discussion_in_process: "bg-blue-100 text-blue-700",
  tracking_hold:         "bg-amber-100 text-amber-700",
  due_diligence:         "bg-violet-100 text-violet-700",
  portfolio:             "bg-emerald-100 text-emerald-700",
  passed:                "bg-red-100 text-red-600",
};

export default async function DashboardPage() {
  const supabase = await createClient();

  // Run all queries in parallel for speed
  const [
    { count: companyCount },
    { count: contactCount },
    { count: signalCount },
    { count: memoCount },
    { data: activePipeline },
    { data: recentCompanies },
    { data: lpData },
    { count: portfolioCount },
    { data: recentMeetings },
    { data: dealStatusRows },
  ] = await Promise.all([
    // Stat cards
    supabase.from("companies").select("*", { count: "exact", head: true }).eq("type", "startup"),
    supabase.from("contacts").select("*", { count: "exact", head: true }),
    supabase.from("sourcing_signals").select("*", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("ic_memos").select("*", { count: "exact", head: true }),

    // Active pipeline — startups in active stages, most recently updated first
    supabase
      .from("companies")
      .select("id, name, deal_status, sectors")
      .eq("type", "startup")
      .in("deal_status", ACTIVE_STAGES)
      .order("updated_at", { ascending: false })
      .limit(6) as unknown as Promise<{ data: { id: string; name: string; deal_status: string; sectors: string[] | null }[] | null; error: unknown }>,

    // Recently added — exclude type "other" to avoid AI-generated garbage rows
    supabase
      .from("companies")
      .select("id, name, type, deal_status, sectors, created_at")
      .neq("type", "other")
      .order("created_at", { ascending: false })
      .limit(5) as unknown as Promise<{ data: { id: string; name: string; type: string; deal_status: string | null; sectors: string[] | null; created_at: string }[] | null; error: unknown }>,

    // LP committed amounts
    supabase.from("lp_relationships").select("committed_amount, stage").neq("stage", "passed") as unknown as Promise<{ data: { committed_amount: number | null; stage: string | null }[] | null; error: unknown }>,

    // Portfolio count — companies with deal_status = portfolio
    supabase.from("companies").select("*", { count: "exact", head: true }).eq("type", "startup").eq("deal_status", "portfolio"),

    // Recent meetings
    supabase
      .from("interactions")
      .select("id, subject, date, type, sentiment, summary, company:companies(id, name)")
      .eq("type", "meeting")
      .order("date", { ascending: false })
      .limit(5) as unknown as Promise<{ data: { id: string; subject: string | null; date: string; type: string; sentiment: string | null; summary: string | null; company: { id: string; name: string } | null }[] | null; error: unknown }>,

    // All startup deal_status values for the funnel
    supabase
      .from("companies")
      .select("deal_status")
      .eq("type", "startup")
      .not("deal_status", "is", null) as unknown as Promise<{ data: { deal_status: string }[] | null; error: unknown }>,
  ]);

  const totalCommitted = lpData?.reduce((s, r) => s + (r.committed_amount ?? 0), 0) ?? 0;
  const softCommits    = lpData?.filter(r => ["soft_commit","committed","closed"].includes(r.stage ?? "")).reduce((s, r) => s + (r.committed_amount ?? 0), 0) ?? 0;
  const activeCount    = activePipeline?.length ?? 0;

  const stats = [
    { label: "Startups Tracked",  value: companyCount ?? 0,                 icon: TrendingUp, color: "bg-blue-50 text-blue-600",     sub: `${activeCount} in active pipeline`,          href: "/crm/pipeline" },
    { label: "Contacts",          value: contactCount ?? 0,                 icon: Users,       color: "bg-violet-50 text-violet-600", sub: "founders & partners",                        href: "/crm/contacts" },
    { label: "New Signals",       value: signalCount ?? 0,                  icon: Radar,       color: "bg-cyan-50 text-cyan-600",     sub: "unreviewed sourcing",                        href: "/sourcing" },
    { label: "IC Memos",          value: memoCount ?? 0,                    icon: FileText,    color: "bg-orange-50 text-orange-600", sub: "all time",                                   href: "/memos" },
    { label: "LP Soft Commits",   value: formatCurrency(softCommits, true), icon: Wallet,      color: "bg-emerald-50 text-emerald-600", sub: `${formatCurrency(totalCommitted, true)} total committed`, href: "/crm/lps" },
    { label: "Portfolio Cos.",    value: portfolioCount ?? 0,               icon: BarChart3,   color: "bg-pink-50 text-pink-600",     sub: "active portfolio",                           href: "/portfolio" },
  ];

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Dashboard"
        subtitle={<DashboardGreeting />}
      />

      <main className="flex-1 overflow-auto p-6 space-y-6">

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {stats.map((s) => (
            <Link key={s.label} href={s.href} className="card p-4 block hover:shadow-md transition-shadow cursor-pointer group">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${s.color}`}>
                <s.icon size={16} />
              </div>
              <div className="text-2xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors">{s.value}</div>
              <div className="text-xs font-medium text-slate-600 mt-0.5">{s.label}</div>
              <div className="text-xs text-slate-400 mt-0.5">{s.sub}</div>
            </Link>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

          {/* Active Pipeline — reads company deal_status (not legacy deals table) */}
          <div className="card">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Active Pipeline</h2>
              <Link href="/crm/pipeline" className="text-xs text-blue-600 hover:text-blue-700 font-medium">View all →</Link>
            </div>
            <div className="divide-y divide-slate-100">
              {!activePipeline?.length ? (
                <div className="px-5 py-8 text-center text-sm text-slate-400">
                  No companies in active pipeline — <Link href="/crm/pipeline" className="text-blue-600">open Pipeline</Link>
                </div>
              ) : (
                activePipeline.map((c) => (
                  <Link key={c.id} href="/crm/pipeline" className="px-5 py-3 flex items-center justify-between hover:bg-slate-50/60 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                      <p className="text-xs text-slate-400 truncate">{c.sectors?.slice(0,2).join(", ") ?? "—"}</p>
                    </div>
                    <span className={`badge text-xs ml-3 flex-shrink-0 ${STAGE_BADGE_COLORS[c.deal_status] ?? "bg-slate-100 text-slate-600"}`}>
                      {STAGE_LABELS[c.deal_status] ?? c.deal_status}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Recently Added */}
          <div className="card">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Recently Added</h2>
              <Link href="/crm" className="text-xs text-blue-600 hover:text-blue-700 font-medium">CRM →</Link>
            </div>
            <div className="divide-y divide-slate-100">
              {!recentCompanies?.length ? (
                <div className="px-5 py-8 text-center text-sm text-slate-400">
                  No companies yet — start with <Link href="/crm" className="text-blue-600">CRM</Link>
                </div>
              ) : (
                recentCompanies.map((c) => (
                  <Link key={c.id} href={`/crm/companies/${c.id}`} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50/60 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{c.name}</p>
                      <p className="text-xs text-slate-400 truncate">{c.sectors?.slice(0,2).join(", ") ?? "—"}</p>
                    </div>
                    <div className="text-right ml-3 flex-shrink-0">
                      <span className="badge text-xs bg-slate-100 text-slate-600 capitalize">{c.type.replace(/_/g, " ")}</span>
                      <p className="text-xs text-slate-400 mt-1" suppressHydrationWarning>{formatDate(c.created_at)}</p>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Recent Meetings */}
          <div className="card">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Recent Meetings</h2>
              <Link href="/meetings" className="text-xs text-blue-600 hover:text-blue-700 font-medium">All meetings →</Link>
            </div>
            <div className="divide-y divide-slate-100">
              {!recentMeetings?.length ? (
                <div className="px-5 py-8 text-center text-sm text-slate-400">
                  No meetings yet — <Link href="/meetings" className="text-blue-600">sync Fireflies</Link>
                </div>
              ) : (
                recentMeetings.slice(0, 5).map((meeting) => {
                  const sentimentColors: Record<string, string> = {
                    positive: "bg-emerald-400",
                    neutral:  "bg-slate-300",
                    negative: "bg-red-400",
                  };
                  return (
                    <Link key={meeting.id} href="/meetings" className="px-5 py-3 flex items-start gap-3 hover:bg-slate-50/60 transition-colors">
                      <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${sentimentColors[meeting.sentiment ?? "neutral"] ?? "bg-slate-300"}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{meeting.subject ?? "Untitled Meeting"}</p>
                        <p className="text-xs text-slate-400" suppressHydrationWarning>{meeting.company?.name ?? "—"} · {formatDate(meeting.date)}</p>
                      </div>
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Pipeline Funnel — by deal_status on companies */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-800">Pipeline Funnel</h2>
            <Link href="/crm/pipeline" className="text-xs text-blue-600 hover:text-blue-700 font-medium">Open Pipeline →</Link>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {FUNNEL_STAGES.map(({ key, label }) => {
              const count = dealStatusRows?.filter(r => r.deal_status === key).length ?? 0;
              return (
                <Link key={key} href="/crm/pipeline" className="flex-1 min-w-[90px] text-center group">
                  <div className={`rounded-lg p-3 mb-2 transition-opacity group-hover:opacity-80 ${FUNNEL_COLORS[key] ?? "bg-slate-100 text-slate-600"}`}>
                    <div className="text-xl font-bold">{count}</div>
                  </div>
                  <div className="text-xs text-slate-500 font-medium leading-tight">{label}</div>
                </Link>
              );
            })}
          </div>
        </div>

      </main>
    </div>
  );
}
