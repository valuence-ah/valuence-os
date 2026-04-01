"use client";
// ─── Sidebar Navigation ───────────────────────────────────────────────────────
// Fixed left sidebar with an expandable CRM section.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Radar,
  BarChart3,
  FileText,
  MessageSquare,
  LogOut,
  ChevronRight,
  ChevronDown,
  Building2,
  Landmark,
  Briefcase,
  GitBranch,
  UserCircle2,
  Clock,
  Handshake,
  Globe,
  MoreHorizontal,
  Shield,
  CheckSquare,
  Mic,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── CRM sub-navigation ────────────────────────────────────────────────────────
const CRM_ITEMS = [
  { href: "/crm/pipeline",  icon: GitBranch,      label: "Pipeline"         },
  { href: "/crm/lps",       icon: Landmark,       label: "Fundraising"      },
  { href: "/crm/funds",     icon: Briefcase,      label: "Funds"            },
  { href: "/crm/strategic", icon: Handshake,      label: "Strategic"        },
  { href: "/crm/ecosystem", icon: MoreHorizontal, label: "Ecosystem"        },
  { href: "/crm/companies", icon: Globe,          label: "All Companies"    },
  { href: "/crm/contacts",         icon: UserCircle2, label: "Contacts"     },
  { href: "/crm/contacts/pending", icon: Clock,       label: "New Contacts" },
];

// ── Top-level sections (excluding CRM which is handled separately) ─────────────
const TOP_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/tasks",     icon: CheckSquare,     label: "Tasks"     },
];

const INTELLIGENCE_ITEMS = [
  { href: "/sourcing",  icon: Radar,          label: "Sourcing"   },
  { href: "/meetings",  icon: Mic,            label: "Meetings"   },
  { href: "/portfolio", icon: BarChart3,      label: "Portfolio"  },
  { href: "/memos",     icon: FileText,       label: "IC Memos"   },
  { href: "/chat",      icon: MessageSquare,  label: "AI Chat"    },
];

export function Sidebar() {
  const pathname  = usePathname();
  const router    = useRouter();
  const supabase  = createClient();

  // Auto-open CRM section when on any /crm/* route
  const [crmOpen, setCrmOpen] = useState(pathname.startsWith("/crm"));
  useEffect(() => {
    if (pathname.startsWith("/crm")) setCrmOpen(true);
  }, [pathname]);

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/auth/login");
  }

  function isActive(href: string) {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  }

  function NavLink({ href, icon: Icon, label }: { href: string; icon: React.ElementType; label: string }) {
    return (
      <Link
        href={href}
        className={cn("nav-item", isActive(href) && "active")}
      >
        <Icon size={16} className="flex-shrink-0" />
        <span className="flex-1">{label}</span>
        {isActive(href) && <ChevronRight size={14} className="text-slate-500" />}
      </Link>
    );
  }

  return (
    <aside
      className="fixed left-0 top-0 h-full flex flex-col z-40"
      style={{ width: "var(--sidebar-width, 240px)", backgroundColor: "#0a0f1e" }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-[#1e2d4a]">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
        <div>
          <div className="text-white text-sm font-semibold leading-tight">Valuence OS</div>
          <div className="text-slate-500 text-xs">Valuence Ventures</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">

        {/* Core */}
        <div>
          <p className="section-label mb-2">Core</p>
          <div className="space-y-0.5">
            {TOP_ITEMS.map(({ href, icon, label }) => (
              <NavLink key={href} href={href} icon={icon} label={label} />
            ))}

            {/* ── CRM expandable group ── */}
            <div>
              <button
                onClick={() => setCrmOpen(o => !o)}
                className={cn(
                  "nav-item w-full text-left",
                  pathname.startsWith("/crm") && "active"
                )}
              >
                <Users size={16} className="flex-shrink-0" />
                <span className="flex-1">CRM</span>
                {crmOpen
                  ? <ChevronDown size={14} className="text-slate-500" />
                  : <ChevronRight size={14} className="text-slate-500" />
                }
              </button>

              {/* Sub-items slide in/out */}
              {crmOpen && (
                <div className="mt-0.5 ml-4 space-y-0.5 border-l border-[#1e2d4a] pl-2">
                  {CRM_ITEMS.map(({ href, icon, label }) => (
                    <NavLink key={href} href={href} icon={icon} label={label} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Intelligence */}
        <div>
          <p className="section-label mb-2">Intelligence</p>
          <div className="space-y-0.5">
            {INTELLIGENCE_ITEMS.map(({ href, icon, label }) => (
              <NavLink key={href} href={href} icon={icon} label={label} />
            ))}
          </div>
        </div>


      </nav>

      {/* Footer — admin + sign out */}
      <div className="px-3 py-4 border-t border-[#1e2d4a] space-y-0.5">
        <NavLink href="/admin" icon={Shield} label="Admin" />
        <button
          onClick={handleSignOut}
          className="nav-item w-full text-left text-red-400 hover:text-red-300 hover:bg-red-900/20"
        >
          <LogOut size={16} className="flex-shrink-0" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
