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
  description: "Valuence Ventures — Operating System",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
