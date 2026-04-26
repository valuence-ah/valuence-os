import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",          // service worker written to /public/sw.js
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development", // don't run SW locally
  workboxOptions: {
    disableDevLogs: true,
  },
});

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.logo.dev" },
      { protocol: "https", hostname: "logo.clearbit.com" },
      { protocol: "https", hostname: "*.googleusercontent.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
    ],
  },
  transpilePackages: ["react-data-grid"],
  // Prevent Next.js/Turbopack from bundling these packages so they load
  // correctly from node_modules at runtime (pdf-parse reads test files on init
  // that only exist on disk, not in a bundled context).
  serverExternalPackages: ["pdf-parse"],

  async headers() {
    return [
      {
        // Apply to all routes
        source: "/:path*",
        headers: [
          // Prevent clickjacking
          { key: "X-Frame-Options", value: "DENY" },
          // Prevent MIME-type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Control referrer information
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Disable browser features not needed by this app
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          // HSTS — tell browsers to always use HTTPS (1 year, include subdomains)
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          // Basic XSS protection for legacy browsers
          { key: "X-XSS-Protection", value: "1; mode=block" },
        ],
      },
    ];
  },

  async redirects() {
    return [
      {
        source: "/pipeline",
        destination: "/crm/pipeline",
        permanent: true,
      },
      {
        source: "/lp",
        destination: "/crm/lps",
        permanent: true,
      },
    ];
  },
};

export default withPWA(nextConfig);
