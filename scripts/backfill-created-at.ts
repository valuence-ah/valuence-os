// ─── Backfill created_at from Airtable "Created time" (column AN) ─────────────
// Only updates the created_at column — all other contact data is left untouched.
//
// Matching strategy (in order):
//   1. Email match  (most reliable — unique per contact)
//   2. Full-name match (first_name + last_name, case-insensitive fallback)
//
// Run:      npx tsx scripts/backfill-created-at.ts
// Dry run:  DRY_RUN=true npx tsx scripts/backfill-created-at.ts
//
// Usage:
//   Place your Contacts.csv in the Airtable/ folder and run the script.
//   Only rows that have a valid "Created time" value will be processed.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import * as fs   from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const SUPABASE_URL         = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const CONTACTS_CSV         = path.join(process.cwd(), "Airtable", "Contacts.csv");
const DRY_RUN              = process.env.DRY_RUN === "true";

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌  Missing SUPABASE env vars in .env.local");
  process.exit(1);
}

if (!fs.existsSync(CONTACTS_CSV)) {
  console.error(`❌  Contacts.csv not found at: ${CONTACTS_CSV}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── CSV parser (identical to migrate-airtable.ts) ─────────────────────────────

function parseCSV(filePath: string): Record<string, string>[] {
  const content = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, "");
  const lines   = content.split(/\r?\n/);
  if (lines.length < 2) return [];

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === "," && !inQ) {
        result.push(cur); cur = "";
      } else {
        cur += ch;
      }
    }
    result.push(cur);
    return result;
  };

  const headers = parseRow(lines[0]);
  const rows: Record<string, string>[] = [];
  for (let li = 1; li < lines.length; li++) {
    const line = lines[li];
    if (!line.trim()) continue;
    const vals = parseRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h.trim()] = (vals[i] ?? "").trim(); });
    rows.push(row);
  }
  return rows;
}

/** Case-insensitive column lookup (handles slight header variations) */
function col(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const match = Object.keys(row).find(k => k.toLowerCase() === key.toLowerCase());
    if (match && row[match]?.trim()) return row[match].trim();
  }
  return "";
}

/** Parse a date string to ISO timestamp. Returns null if invalid.
 *  Handles common Airtable export formats:
 *    • ISO 8601:           "2023-05-15T10:30:00.000Z"
 *    • Space-separated:   "2023-05-15 10:30:00"
 *    • US short:          "5/15/2023" or "5/15/2023 10:30am"
 *    • Airtable default:  "May 15, 2023 10:30am"
 */
function parseTimestamp(val: string): string | null {
  if (!val) return null;

  // 1. Try native parse first (works for ISO and many standard formats)
  let d = new Date(val);
  if (!isNaN(d.getTime())) return d.toISOString();

  // 2. "YYYY-MM-DD HH:MM:SS" — replace space with T so JS can parse it
  const spaceSep = val.replace(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})/, "$1T$2");
  d = new Date(spaceSep);
  if (!isNaN(d.getTime())) return d.toISOString();

  // 3. M/D/YYYY H:MMam|pm  — Airtable's default export format e.g. "2/6/2025 11:48pm"
  const atMatch = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(am|pm)$/i);
  if (atMatch) {
    const [, mm, dd, yyyy, rawH, min, meridiem] = atMatch;
    let hour = parseInt(rawH, 10);
    if (meridiem.toLowerCase() === "pm" && hour !== 12) hour += 12;
    if (meridiem.toLowerCase() === "am" && hour === 12) hour = 0;
    d = new Date(
      parseInt(yyyy, 10),
      parseInt(mm, 10) - 1,
      parseInt(dd, 10),
      hour,
      parseInt(min, 10)
    );
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  // 4. MM/DD/YYYY (date only, no time)
  const usDateOnly = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usDateOnly) {
    const [, mm, dd, yyyy] = usDateOnly;
    d = new Date(parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10));
    if (!isNaN(d.getTime())) return d.toISOString();
  }

  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🕐  Backfill created_at from Airtable "Created time"`);
  console.log(`    CSV : ${CONTACTS_CSV}`);
  console.log(`    Mode: ${DRY_RUN ? "DRY RUN (no changes written)" : "LIVE"}\n`);

  // ── 1. Load CSV ───────────────────────────────────────────────────────────

  const rows = parseCSV(CONTACTS_CSV);
  console.log(`📄  Rows in CSV: ${rows.length}`);

  // Show the headers present in the CSV so user can confirm column names
  const sampleHeaders = Object.keys(rows[0] ?? {});
  const createdCol = sampleHeaders.find(h => h.toLowerCase().includes("created time") || h.toLowerCase() === "created_time");
  if (!createdCol) {
    console.warn(`\n⚠️  Could not find a "Created time" column in the CSV.`);
    console.warn(`    Available headers:\n    ${sampleHeaders.join("\n    ")}`);
    console.warn(`\n    Update the col() call below to match your exact column name.`);
    process.exit(1);
  }
  console.log(`✅  Found created-time column: "${createdCol}"`);
  // Show a sample value so we can confirm the date format is parseable
  const sampleVal = col(rows[0] ?? {}, createdCol);
  console.log(`    Sample value:  "${sampleVal}"`);
  console.log(`    Parsed as:     ${parseTimestamp(sampleVal) ?? "❌ UNPARSEABLE — check format"}\n`);

  // Filter to rows that actually have a Created time value
  const withDate = rows.filter(r => col(r, createdCol).length > 0);
  console.log(`    Rows with a Created time value: ${withDate.length}`);
  console.log(`    Rows without (will be skipped):  ${rows.length - withDate.length}\n`);

  // ── 2. Load all contacts from Supabase (email + name + id + created_at) ──

  console.log(`⬇️   Fetching existing contacts from Supabase…`);
  const { data: dbContacts, error: fetchErr } = await supabase
    .from("contacts")
    .select("id, email, first_name, last_name, created_at");

  if (fetchErr) {
    console.error("❌  Failed to fetch contacts:", fetchErr.message);
    process.exit(1);
  }

  console.log(`    Found ${dbContacts!.length} contacts in Supabase\n`);

  // Build lookup maps for fast matching
  const byEmail = new Map<string, { id: string; created_at: string }>();
  const byName  = new Map<string, { id: string; created_at: string }>();

  for (const c of dbContacts!) {
    if (c.email) byEmail.set(c.email.toLowerCase().trim(), { id: c.id, created_at: c.created_at });
    const nameKey = `${c.first_name ?? ""} ${c.last_name ?? ""}`.toLowerCase().trim();
    if (nameKey) byName.set(nameKey, { id: c.id, created_at: c.created_at });
  }

  // ── 3. Match CSV rows → Supabase IDs and build update list ───────────────

  let matched      = 0;
  let noMatch      = 0;
  let alreadySet   = 0;
  let noDate       = 0;

  type Update = { id: string; created_at: string; csvName: string; email: string; matchedBy: string };
  const updates: Update[] = [];

  for (const row of withDate) {
    const rawDate  = col(row, createdCol);
    const iso      = parseTimestamp(rawDate);

    if (!iso) { noDate++; continue; }

    // Build name key from CSV (same logic as migrate-airtable.ts)
    let firstName = col(row, "First Name");
    let lastName  = col(row, "Last Name");
    const fullName = col(row, "Name");
    if (!firstName && !lastName && fullName) {
      if (fullName.includes(",")) {
        const parts = fullName.split(",").map(s => s.trim());
        lastName  = parts[0] ?? "";
        firstName = parts[1] ?? "";
      } else {
        const parts = fullName.split(" ");
        firstName = parts[0] ?? "";
        lastName  = parts.slice(1).join(" ");
      }
    }
    const email   = col(row, "Email").toLowerCase().trim();
    const nameKey = `${firstName} ${lastName}`.toLowerCase().trim();
    const csvLabel = `${firstName} ${lastName}`.trim() || email || "(unknown)";

    // Match: email first, then name
    let dbRecord: { id: string; created_at: string } | undefined;
    let matchedBy = "";

    if (email) {
      dbRecord  = byEmail.get(email);
      matchedBy = "email";
    }
    if (!dbRecord && nameKey) {
      dbRecord  = byName.get(nameKey);
      matchedBy = "name";
    }

    if (!dbRecord) {
      console.log(`  ⚠️  No match: "${csvLabel}" (${email || "no email"})`);
      noMatch++;
      continue;
    }

    // Skip if created_at is already a real historical date from Airtable
    // (i.e., not the same as the migration-run date — check if it's within 1 day of now)
    // We update ALL records to be safe; the DRY_RUN will show you what changes.
    matched++;
    updates.push({ id: dbRecord.id, created_at: iso, csvName: csvLabel, email, matchedBy });
  }

  // ── 4. Report plan ────────────────────────────────────────────────────────

  console.log(`\n📊  Summary`);
  console.log(`    ✅  Matched:          ${matched}`);
  console.log(`    ❌  No match found:   ${noMatch}`);
  console.log(`    ⏭️   Invalid date:     ${noDate}`);
  console.log(`    ⏭️   Skipped (no date): ${rows.length - withDate.length}`);

  if (updates.length === 0) {
    console.log("\nNothing to update. Exiting.");
    return;
  }

  // Preview first 10
  console.log(`\n📋  Preview (first 10 updates):`);
  updates.slice(0, 10).forEach(u =>
    console.log(`    [${u.matchedBy}] "${u.csvName}" → created_at = ${u.created_at}`)
  );
  if (updates.length > 10) console.log(`    … and ${updates.length - 10} more`);

  if (DRY_RUN) {
    console.log(`\n✅  DRY RUN complete — ${updates.length} records would be updated.`);
    console.log(`    Re-run without DRY_RUN=true to apply.\n`);
    return;
  }

  // ── 5. Apply updates in batches ───────────────────────────────────────────

  console.log(`\n✍️   Applying ${updates.length} updates…`);
  let ok = 0, fail = 0;
  const BATCH = 50;

  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    for (const u of batch) {
      const { error } = await supabase
        .from("contacts")
        .update({ created_at: u.created_at })
        .eq("id", u.id);
      if (error) {
        console.error(`  ❌  Failed [${u.csvName}]: ${error.message}`);
        fail++;
      } else {
        ok++;
      }
    }
    process.stdout.write(`\r    Progress: ${Math.min(i + BATCH, updates.length)} / ${updates.length}`);
  }

  console.log(`\n\n✅  Done.`);
  console.log(`    Updated: ${ok}  |  Failed: ${fail}\n`);
}

main().catch(err => {
  console.error("❌  Unexpected error:", err);
  process.exit(1);
});
