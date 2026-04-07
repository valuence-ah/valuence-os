import type { NextConfig } from "next";

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

export default nextConfig;
