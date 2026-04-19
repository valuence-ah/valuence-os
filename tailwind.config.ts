import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Sidebar chrome (unchanged) ───────────────────────────────────────
        sidebar: {
          bg: "#0a0f1e",
          hover: "#131929",
          active: "#0d3d38",
          border: "#1e2d4a",
          text: "#94a3b8",
          textActive: "#5eead4",
        },

        // ── Valuence brand teal (primary action color) ───────────────────────
        brand: {
          teal:     "#0D3D38",
          tealDark: "#0A302C",
          tealTint: "#E7EEED",
        },

        // ── Semantic colors ──────────────────────────────────────────────────
        link:    "#2563EB",
        success: "#059669",
        danger:  "#DC2626",
        warning: "#F59E0B",

        // ── Ink / neutral text scale ─────────────────────────────────────────
        ink: {
          900: "#0F172A",
          700: "#334155",
          500: "#64748B",
          300: "#CBD5E1",
        },

        // ── Legacy blue tokens (kept so existing bg-legacy-* usages don't break)
        legacy: {
          50:  "#eff6ff",
          100: "#dbeafe",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
          900: "#1e3a5f",
        },
      },

      // ── Type ramp ─────────────────────────────────────────────────────────
      fontSize: {
        caption: ["12px", { lineHeight: "16px", fontWeight: "500" }],
        body:    ["14px", { lineHeight: "22px", fontWeight: "400" }],
        lead:    ["16px", { lineHeight: "24px", fontWeight: "400" }],
        h3:      ["18px", { lineHeight: "24px", fontWeight: "600" }],
        h2:      ["20px", { lineHeight: "28px", fontWeight: "600" }],
        h1:      ["24px", { lineHeight: "32px", fontWeight: "700" }],
        display: ["32px", { lineHeight: "40px", fontWeight: "700" }],
      },

      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
