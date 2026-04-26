"use client";
// ─── Sidebar Navigation ───────────────────────────────────────────────────────
// Desktop: fixed left sidebar, always visible.
// Mobile:  hidden by default, slides in as a drawer via MobileNavContext.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, createContext, useContext } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard, Users, Radar, BarChart3, FileText, MessageSquare,
  LogOut, ChevronRight, ChevronDown, Landmark, Briefcase, GitBranch,
  UserCircle2, Clock, Handshake, Globe, Shield, CheckSquare, Mic, Rss, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Mobile nav context ────────────────────────────────────────────────────────
interface MobileNavCtx { open: boolean; setOpen: (v: boolean) => void; }
export const MobileNavContext = createContext<MobileNavCtx>({ open: false, setOpen: () => {} });
export function useMobileNav() { return useContext(MobileNavContext); }

// ── Nav items ─────────────────────────────────────────────────────────────────
const CRM_ITEMS = [
  { href: "/crm/pipeline",         icon: GitBranch,   label: "Pipeline"      },
  { href: "/crm/lps",              icon: Landmark,    label: "Fundraising"   },
  { href: "/crm/funds",            icon: Briefcase,   label: "Funds"         },
  { href: "/crm/strategic",        icon: Handshake,   label: "Strategic"     },
  { href: "/crm/companies",        icon: Globe,       label: "All Companies" },
  { href: "/crm/contacts",         icon: UserCircle2, label: "Contacts"      },
  { href: "/crm/contacts/pending", icon: Clock,       label: "New Contacts"  },
];
const TOP_ITEMS = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/tasks",     icon: CheckSquare,     label: "Tasks"     },
];
const INTELLIGENCE_ITEMS = [
  { href: "/sourcing",           icon: Radar,         label: "Sourcing"   },
  { href: "/meetings",           icon: Mic,           label: "Meetings"   },
  { href: "/intelligence/feeds", icon: Rss,           label: "News Feeds" },
  { href: "/portfolio",          icon: BarChart3,     label: "Portfolio"  },
  { href: "/memos",              icon: FileText,      label: "IC Memos"   },
  { href: "/chat",               icon: MessageSquare, label: "AI Chat"    },
];

export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const supabase = createClient();
  const { open, setOpen } = useMobileNav();

  const [crmOpen, setCrmOpen] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("crm_nav_open");
    if (saved !== null) setCrmOpen(saved === "true");
  }, []);
  useEffect(() => { if (pathname.startsWith("/crm")) setCrmOpen(true); }, [pathname]);
  // Close mobile drawer on navigation
  useEffect(() => { setOpen(false); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleCrm() {
    setCrmOpen(o => { const n = !o; localStorage.setItem("crm_nav_open", String(n)); return n; });
  }

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
      <Link href={href} className={cn("nav-item", isActive(href) && "active")}>
        <Icon size={16} className="flex-shrink-0" />
        <span className="flex-1">{label}</span>
        {isActive(href) && <ChevronRight size={14} className="text-slate-500" />}
      </Link>
    );
  }

  const sidebarContent = (
    <aside className="h-full w-[240px] flex flex-col" style={{ backgroundColor: "#0a0f1e" }}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-[#1e2d4a]">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-white text-sm font-semibold leading-tight">Valuence OS</div>
          <div className="text-slate-500 text-xs">Valuence Ventures</div>
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={() => setOpen(false)}
          className="md:hidden w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
          aria-label="Close menu"
        >
          <X size={16} />
        </button>
      </div>

      {/* Navigation */}
      <div className="flex-1 relative min-h-0">
        <div
          className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 z-10"
          style={{ background: "linear-gradient(to bottom, transparent, #0a0f1e)" }}
        />
        <nav className="h-full overflow-y-auto px-3 py-4 space-y-5 sidebar-nav">
          <div>
            <p className="section-label mb-2">Core</p>
            <div className="space-y-0.5">
              {TOP_ITEMS.map(({ href, icon, label }) => (
                <NavLink key={href} href={href} icon={icon} label={label} />
              ))}
              <div>
                <button
                  onClick={toggleCrm}
                  className={cn("nav-item w-full text-left", pathname.startsWith("/crm") && "active")}
                >
                  <Users size={16} className="flex-shrink-0" />
                  <span className="flex-1">CRM</span>
                  {crmOpen ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
                </button>
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
          <div>
            <p className="section-label mb-2">Intelligence</p>
            <div className="space-y-0.5">
              {INTELLIGENCE_ITEMS.map(({ href, icon, label }) => (
                <NavLink key={href} href={href} icon={icon} label={label} />
              ))}
            </div>
          </div>
        </nav>
      </div>

      {/* Footer */}
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

  return (
    <>
      {/* DESKTOP: fixed, always visible */}
      <div className="hidden md:flex fixed left-0 top-0 h-full z-40" style={{ width: "var(--sidebar-width, 240px)" }}>
        {sidebarContent}
      </div>

      {/* MOBILE: overlay + drawer */}
      <div
        className={cn(
          "md:hidden fixed inset-0 z-40 bg-black/60 transition-opacity duration-200",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
      <div
        className={cn(
          "md:hidden fixed left-0 top-0 h-full z-50 transition-transform duration-200 ease-in-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ width: "240px" }}
      >
        {sidebarContent}
      </div>
    </>
  );
}
