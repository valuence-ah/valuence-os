// ─── CRM Hub Page /crm ────────────────────────────────────────────────────────
// Overview landing page for the CRM module.
// Shows counts + quick links to Companies and Contacts sub-pages.

import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import Link from "next/link";
import { Building2, Users, TrendingUp, Handshake, Landmark, Globe } from "lucide-react";

export const metadata = { title: "CRM" };

const COMPANY_TYPES = [
  { key: "startup",          label: "Startups",           icon: TrendingUp,  color: "bg-blue-50 text-blue-600 border-blue-100" },
  { key: "lp",               label: "LPs",                icon: Landmark,    color: "bg-purple-50 text-purple-600 border-purple-100" },
  { key: "corporate",        label: "Corporates",         icon: Building2,   color: "bg-orange-50 text-orange-600 border-orange-100" },
  { key: "ecosystem_partner",label: "Ecosystem Partners", icon: Handshake,   color: "bg-teal-50 text-teal-600 border-teal-100" },
  { key: "fund",             label: "Funds",              icon: Globe,       color: "bg-indigo-50 text-indigo-600 border-indigo-100" },
  { key: "government",       label: "Government",         icon: Landmark,    color: "bg-gray-50 text-gray-600 border-gray-100" },
];

export default async function CrmPage() {
  const supabase = await createClient();

  const [{ data: typeBreakdown }, { count: contactCount }] = await Promise.all([
    supabase.from("companies").select("type").neq("type", null),
    supabase.from("contacts").select("*", { count: "exact", head: true }),
  ]);

  // Count per type
  const typeCounts: Record<string, number> = {};
  typeBreakdown?.forEach(r => { typeCounts[r.type] = (typeCounts[r.type] ?? 0) + 1; });
  const totalCompanies = typeBreakdown?.length ?? 0;

  return (
    <div className="flex flex-col h-full">
      <Header
        title="CRM"
        subtitle="Companies, contacts, and relationship tracking"
      />

      <main className="flex-1 overflow-auto p-6 space-y-6">

        {/* Quick-nav cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link href="/crm/companies" className="card p-5 hover:shadow-md transition-shadow group">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Building2 className="text-blue-600" size={20} />
              </div>
              <span className="text-3xl font-bold text-slate-900">{totalCompanies}</span>
            </div>
            <h3 className="text-sm font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">Companies</h3>
            <p className="text-xs text-slate-500 mt-0.5">Startups, LPs, corporates, partners</p>
          </Link>

          <Link href="/crm/contacts" className="card p-5 hover:shadow-md transition-shadow group">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center">
                <Users className="text-violet-600" size={20} />
              </div>
              <span className="text-3xl font-bold text-slate-900">{contactCount ?? 0}</span>
            </div>
            <h3 className="text-sm font-semibold text-slate-800 group-hover:text-violet-600 transition-colors">Contacts</h3>
            <p className="text-xs text-slate-500 mt-0.5">Founders, LPs, partners, advisors</p>
          </Link>
        </div>

        {/* Companies by type */}
        <div className="card">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-800">Companies by Type</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 p-5">
            {COMPANY_TYPES.map(({ key, label, icon: Icon, color }) => (
              <Link
                key={key}
                href={`/crm/companies?type=${key}`}
                className={`rounded-xl border p-4 text-center hover:shadow-sm transition-all ${color}`}
              >
                <Icon size={20} className="mx-auto mb-2" />
                <div className="text-xl font-bold">{typeCounts[key] ?? 0}</div>
                <div className="text-xs font-medium mt-0.5">{label}</div>
              </Link>
            ))}
          </div>
        </div>

      </main>
    </div>
  );
}
