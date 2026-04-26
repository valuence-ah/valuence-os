"use client";
// ─── Top Header Bar ───────────────────────────────────────────────────────────
// Shows the page title + user avatar. On mobile, shows a hamburger button
// that opens the sidebar drawer via MobileNavContext.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import { Bell, Menu } from "lucide-react";
import { useMobileNav } from "@/components/layout/sidebar";

interface HeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}

export function Header({ title, subtitle, actions }: HeaderProps) {
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const { setOpen } = useMobileNav();

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      setProfile(data);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 flex-shrink-0">
      {/* Left: hamburger (mobile) + page title */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Hamburger — mobile only */}
        <button
          onClick={() => setOpen(true)}
          className="md:hidden w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors flex-shrink-0"
          aria-label="Open menu"
        >
          <Menu size={18} />
        </button>

        <div className="min-w-0">
          <h1 className="text-base font-semibold text-slate-900 leading-tight truncate">{title}</h1>
          {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
        </div>
      </div>

      {/* Right: actions + notification + user */}
      <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
        {/* Page actions */}
        {actions && (
          <div className="flex items-center gap-1 md:gap-2">
            {actions}
          </div>
        )}

        {/* Notification bell */}
        <button className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-700 transition-colors">
          <Bell size={16} />
        </button>

        {/* User avatar */}
        {profile && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold flex-shrink-0">
              {getInitials(profile.full_name ?? profile.email)}
            </div>
            <span className="text-xs font-medium text-slate-700 hidden sm:block">
              {profile.full_name ?? profile.email.split("@")[0]}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
