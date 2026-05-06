// ─── Root Layout ─────────────────────────────────────────────────────────────
// This wraps every page in the app.
// Sets metadata (browser tab title, PWA manifest, iOS meta tags) and loads CSS.

import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";

export const viewport: Viewport = {
  themeColor: "#0D3D38",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: {
    default: "Valuence OS",
    template: "%s | Valuence OS",
  },
  description: "Valuence Ventures — Operating System",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Valuence OS",
    startupImage: "/icons/apple-touch-icon.png",
  },
  icons: {
    icon: [
      { url: "/favicon.svg",         type: "image/svg+xml" },
      { url: "/favicon.png",         type: "image/png" },
      { url: "/favicon-96x96.png",   type: "image/png", sizes: "96x96"   },
      { url: "/icons/icon-192.png",  type: "image/png", sizes: "192x192" },
      { url: "/icons/icon-512.png",  type: "image/png", sizes: "512x512" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/favicon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* iOS full-screen PWA */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Valuence OS" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
      </head>
      <body>
        {/* Skip-to-content link — visible only on keyboard focus, for screen readers */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium focus:shadow-lg"
        >
          Skip to main content
        </a>
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
