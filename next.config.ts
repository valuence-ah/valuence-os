import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  transpilePackages: ["react-data-grid"],
  // Prevent Next.js/Turbopack from bundling these packages so they load
  // correctly from node_modules at runtime (pdf-parse reads test files on init
  // that only exist on disk, not in a bundled context).
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
