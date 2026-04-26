"use client";
// ─── Mobile Nav Provider ──────────────────────────────────────────────────────
// Client wrapper that provides the MobileNavContext (hamburger open/close state)
// to both Sidebar and Header, which are client components.

import { useState } from "react";
import { Sidebar, MobileNavContext } from "@/components/layout/sidebar";

export function MobileNavProvider({ children }: { children: React.ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <MobileNavContext.Provider value={{ open: mobileNavOpen, setOpen: setMobileNavOpen }}>
      {/* Sidebar: fixed on desktop, drawer on mobile */}
      <Sidebar />

      {/* Main content area:
          - Mobile (default): full width, no left margin
          - Desktop (md+): offset by sidebar width via CSS variable */}
      <div
        className="flex-1 flex flex-col h-screen overflow-hidden min-w-0 md:ml-[240px]"
      >
        {children}
      </div>
    </MobileNavContext.Provider>
  );
}
