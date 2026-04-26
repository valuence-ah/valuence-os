// ─── PWA Icon Generator ────────────────────────────────────────────────────────
// Converts the favicon SVG into correctly-sized PNGs required by the PWA manifest.
// Sizes produced:
//   192×192  — Android home screen
//   512×512  — Android splash screen + Chrome install prompt
//   180×180  — Apple touch icon (iOS "Add to Home Screen")
//    96×96   — shortcut icon
// Run once: node scripts/generate-pwa-icons.mjs

import sharp from "sharp";
import { readFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = join(__dirname, "..");
const iconsDir  = join(root, "public", "icons");
const svgPath   = join(root, "public", "favicon.svg");

mkdirSync(iconsDir, { recursive: true });

// Read the source SVG
const svgBuffer = readFileSync(svgPath);

const sizes = [
  { size: 512, name: "icon-512.png" },
  { size: 192, name: "icon-192.png" },
  { size: 180, name: "apple-touch-icon.png" },
  { size:  96, name: "icon-96.png"  },
];

console.log("Generating PWA icons from favicon.svg…\n");

for (const { size, name } of sizes) {
  const dest = join(iconsDir, name);
  await sharp(svgBuffer)
    .resize(size, size)
    .png()
    .toFile(dest);
  console.log(`  ✓  ${name}  (${size}×${size})`);
}

console.log("\nDone — icons saved to public/icons/");
