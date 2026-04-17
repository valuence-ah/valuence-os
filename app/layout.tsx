// ─── Root Layout ─────────────────────────────────────────────────────────────
// This wraps every page in the app.
// Sets metadata (browser tab title, etc.) and loads the global CSS.

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Valuence OS",
    template: "%s | Valuence OS",
  },
  description: "Valuence Ventures - Operating System",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
