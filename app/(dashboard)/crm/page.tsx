// ─── CRM Hub /crm ─────────────────────────────────────────────────────────────
// Landing page showing counts for each section with quick navigation.

import { createClient } from "@/lib/supabase/server";
import { Header } from "@/components/layout/header";
import Link from "next/link";
import { GitBranch, Landmark, Briefcase, Handshake, Globe, Users, MoreHorizontal } from "lucide-react";

export const metadata = { title: "CRM" };

const SECTIONS = [
  {
    href: "/crm/pipeline",
    label: "Pipeline",
    description: "Startups in the deal pipeline",
    icon: GitBranch,
    color: "bg-blue-50 text-blue-600 border-blue-100",
    types: ["startup"],
  },
  {
    href: "/crm/lps",
    label: "Limited Partners",
    description: "LP relationships and commitments",
    icon: Landmark,
    color: "bg-purple-50 text-purple-600 border-purple-100",
    types: ["lp"],
  },
  {
    href: "/crm/funds",
    label: "Funds",
    description: "Co-investors and VC funds",
    icon: Briefcase,
    color: "bg-indigo-50 text-indigo-600 border-indigo-100",
    types: ["fund"],
  },
  {
    href: "/crm/strategic",
    label: "Companies",
    description: "Ecosystem and strategic partners",
    icon: Handshake,
    color: "bg-teal-50 text-teal-600 border-teal-100",
    types: ["ecosystem_partner", "corporate"],
  },
  {
    href: "/crm/other",
    label: "Other",
    description: "Government bodies and other orgs",
    icon: MoreHorizontal,
    color: "bg-slate-50 text-slate-600 border-slate-200",
    types: ["government", "other"],
  },
];

export default async function CrmPage() {
  const supabase = await createClient();

  const [{ data: typeBreakdown }, { count: contactCount }] = await Promise.all([
    supabase.from("companies").select("type").neq("type", null) as unknown as Promise<{ data: { type: string }[] | null; error: unknown }>,
    supabase.from("contacts").select("*", { count: "exact", head: true }),
  ]);

  const typeCounts: Record<string, number> = {};
  typeBreakdown?.forEach(r => { typeCounts[r.type] = (typeCounts[r.type] ?? 0) + 1; });
  const totalCompanies = typeBreakdown?.length ?? 0;

  function sectionCount(types: string[]) {
    return types.reduce((sum, t) => sum + (typeCounts[t] ?? 0), 0);
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="CRM" subtitle="Companies, contacts, and relationship tracking" />
      <main className="flex-1 overflow-auto p-6 space-y-6">

        {/* Summary totals */}
        <div className="grid grid-cols-2 gap-4">
          <Link href="/crm/companies"
            className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow group">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Globe className="text-blue-600" size={20} />
              </div>
              <span className="text-3xl font-bold text-slate-900">{totalCompanies}</span>
            </div>
            <h3 className="text-sm font-semibold text-slate-800 group-hover:text-blue-600 transition-colors">All Companies</h3>
            <p className="text-xs text-slate-500 mt-0.5">Every company across all categories</p>
          </Link>

          <Link href="/crm/contacts"
            className="bg-white rounded-xl border border-slate-200 p-5 hover:shadow-md transition-shadow group">
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

        {/* Section breakdown */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {SECTIONS.map(({ href, label, description, icon: Icon, color, types }) => (
            <Link key={href} href={href}
              className={`rounded-xl border p-4 hover:shadow-md transition-all group ${color}`}>
              <div className="flex items-center justify-between mb-3">
                <Icon size={18} />
                <span className="text-2xl font-bold">{sectionCount(types)}</span>
              </div>
              <h3 className="text-sm font-semibold group-hover:opacity-75 transition-opacity">{label}</h3>
              <p className="text-xs opacity-60 mt-0.5 leading-tight">{description}</p>
            </Link>
          ))}
        </div>

      </main>
    </div>
  );
}
