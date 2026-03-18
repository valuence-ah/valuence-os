// ─── Dashboard Home Page ──────────────────────────────────────────────────────
// The first thing you see after logging in.
// Shows fund-level KPIs: pipeline count, portfolio count, LP commitments, recent activity.

import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import { formatCurrency, formatDate, DEAL_STAGE_COLORS, DEAL_STAGE_LABELS } from "@/lib/utils";
import type { Deal } from "@/lib/types";
import { TrendingUp, Users, Wallet, Radar, FileText, BarChart3 } from "lucide-react";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const supabase = await createClient();

  // Run all queries in parallel for speed
  const [
    { count: companyCount },
    { count: contactCount },
    { count: signalCount },
    { count: memoCount },
    { data: deals },
    { data: recentCompanies },
    { data: lpData },
  ] = await Promise.all([
    supabase.from("companies").select("*", { count: "exact", head: true }).eq("type", "startup"),
    supabase.from("contacts").select("*", { count: "exact", head: true }),
    supabase.from("sourcing_signals").select("*", { count: "exact", head: true }).eq("status", "new"),
    supabase.from("ic_memos").select("*", { count: "exact", head: true }),
    supabase.from("deals").select("*, company:companies(name, sectors)").neq("stage", "passed").order("created_at", { ascending: false }).limit(6) as unknown as Promise<{ data: (Deal & { company?: { name: string; sectors: string[] | null } | null })[] | null; error: unknown }>,
    supabase.from("companies").select("id, name, type, deal_status, sectors, created_at").order("created_at", { ascending: false }).limit(5) as unknown as Promise<{ data: { id: string; name: string; type: string; deal_status: string | null; sectors: string[] | null; created_at: string }[] | null; error: unknown }>,
    supabase.from("lp_relationships").select("committed_amount, stage").neq("stage", "passed") as unknown as Promise<{ data: { committed_amount: number | null; stage: string | null }[] | null; error: unknown }>,
  ]);

  // Calculate pipeline stats
  const activeDeals = deals?.filter(d => !["closed","passed"].includes(d.stage)) ?? [];
  const totalCommitted = lpData?.reduce((s, r) => s + (r.committed_amount ?? 0), 0) ?? 0;
  const softCommits    = lpData?.filter(r => ["soft_commit","committed","closed"].includes(r.stage ?? "")).reduce((s, r) => s + (r.committed_amount ?? 0), 0) ?? 0;

  const stats = [
    { label: "Startups Tracked",    value: companyCount ?? 0,              icon: TrendingUp,  color: "bg-blue-50 text-blue-600",   sub: `${activeDeals.length} active deals` },
    { label: "Contacts",            value: contactCount ?? 0,              icon: Users,        color: "bg-violet-50 text-violet-600", sub: "founders & partners" },
    { label: "New Signals",         value: signalCount ?? 0,               icon: Radar,        color: "bg-cyan-50 text-cyan-600",   sub: "unreviewed sourcing" },
    { label: "IC Memos",            value: memoCount ?? 0,                 icon: FileText,     color: "bg-orange-50 text-orange-600", sub: "all time" },
    { label: "LP Soft Commits",     value: formatCurrency(softCommits, true), icon: Wallet,   color: "bg-emerald-50 text-emerald-600", sub: `${formatCurrency(totalCommitted, true)} total committed` },
    { label: "Portfolio Cos.",      value: (companyCount ?? 0),            icon: BarChart3,    color: "bg-pink-50 text-pink-600",   sub: "active portfolio" },
  ];

  // Group deals by stage for pipeline view
  const pipelineStages = ["sourced","first_meeting","deep_dive","ic_memo","term_sheet","due_diligence"] as const;

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Dashboard"
        subtitle={`Good ${getTimeOfDay()} — here's your fund overview`}
      />

      <main className="flex-1 overflow-auto p-6 space-y-6">

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {stats.map((s) => (
            <div key={s.label} className="card p-4">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${s.color}`}>
                <s.icon size={16} />
              </div>
              <div className="text-2xl font-bold text-slate-900">{s.value}</div>
              <div className="text-xs font-medium text-slate-600 mt-0.5">{s.label}</div>
              <div className="text-xs text-slate-400 mt-0.5">{s.sub}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

          {/* Active Pipeline */}
          <div className="card">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Active Pipeline</h2>
              <a href="/pipeline" className="text-xs text-blue-600 hover:text-blue-700 font-medium">View all →</a>
            </div>
            <div className="divide-y divide-slate-100">
              {activeDeals.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-slate-400">
                  No active deals — add your pipeline in <a href="/pipeline" className="text-blue-600">Pipeline</a>
                </div>
              ) : (
                activeDeals.slice(0, 6).map((deal) => (
                  <div key={deal.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50/60">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{deal.company?.name ?? "Unknown"}</p>
                      <p className="text-xs text-slate-400">
                        {deal.company?.sectors?.slice(0,2).join(", ") ?? "—"}
                      </p>
                    </div>
                    <span className={`badge text-xs ${DEAL_STAGE_COLORS[deal.stage] ?? "bg-slate-100 text-slate-600"}`}>
                      {DEAL_STAGE_LABELS[deal.stage] ?? deal.stage}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Recent Additions */}
          <div className="card">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Recently Added</h2>
              <a href="/crm" className="text-xs text-blue-600 hover:text-blue-700 font-medium">CRM →</a>
            </div>
            <div className="divide-y divide-slate-100">
              {recentCompanies?.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-slate-400">
                  No companies yet — start with <a href="/crm" className="text-blue-600">CRM</a>
                </div>
              ) : (
                recentCompanies?.map((c) => (
                  <div key={c.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50/60">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{c.name}</p>
                      <p className="text-xs text-slate-400">{c.sectors?.slice(0,2).join(", ") ?? "—"}</p>
                    </div>
                    <div className="text-right">
                      <span className="badge text-xs bg-slate-100 text-slate-600 capitalize">{c.type.replace("_", " ")}</span>
                      <p className="text-xs text-slate-400 mt-1">{formatDate(c.created_at)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Pipeline Funnel */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">Pipeline Funnel</h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {pipelineStages.map((stage) => {
              const count = deals?.filter(d => d.stage === stage).length ?? 0;
              return (
                <div key={stage} className="flex-1 min-w-[100px] text-center">
                  <div className={`rounded-lg p-3 mb-2 ${DEAL_STAGE_COLORS[stage] ?? "bg-slate-100 text-slate-600"}`}>
                    <div className="text-xl font-bold">{count}</div>
                  </div>
                  <div className="text-xs text-slate-500 font-medium">{DEAL_STAGE_LABELS[stage]}</div>
                </div>
              );
            })}
          </div>
        </div>

      </main>
    </div>
  );
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
