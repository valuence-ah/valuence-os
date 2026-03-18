// ─── Airtable → Supabase Migration Script ────────────────────────────────────
// Imports Companies.csv, Contacts.csv, and Portfolio Companies.csv
// with full cross-table linking via Airtable Record IDs.
//
// Run: npx tsx scripts/migrate-airtable.ts
// Dry run: DRY_RUN=true npx tsx scripts/migrate-airtable.ts

import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load .env.local
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const SUPABASE_URL        = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const AIRTABLE_DIR        = path.join(process.cwd(), "Airtable");
const DRY_RUN             = process.env.DRY_RUN === "true";
const BATCH_SIZE          = 50;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌  Missing SUPABASE env vars in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── CSV Parser ────────────────────────────────────────────────────────────────

function parseCSV(filePath: string): Record<string, string>[] {
  const content = fs.readFileSync(filePath, "utf-8").replace(/^\uFEFF/, ""); // strip BOM
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let cur = "";
    let inQ = false;
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
  return lines.slice(1).map(line => {
    const vals = parseRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h.trim()] = (vals[i] ?? "").trim(); });
    return row;
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Get column value, trying multiple possible column names */
function col(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const match = Object.keys(row).find(k => k.toLowerCase() === key.toLowerCase());
    if (match && row[match]?.trim()) return row[match].trim();
  }
  return "";
}

/** Extract URL from Airtable attachment format: "filename (URL)" */
function extractUrl(val: string): string | null {
  if (!val) return null;
  const match = val.match(/\(https?:\/\/[^)]+\)/);
  if (match) return match[0].slice(1, -1); // remove surrounding ()
  if (val.startsWith("http")) return val;
  return null;
}

/** Extract first URL from a multi-attachment field */
function extractFirstUrl(val: string): string | null {
  if (!val) return null;
  const match = val.match(/https?:\/\/[^\s)]+/);
  return match ? match[0] : null;
}

/** Parse a USD number from "$1,500,000" or "1500000" */
function parseUSD(val: string): number | null {
  if (!val) return null;
  const cleaned = val.replace(/[$,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) || num === 0 ? null : num;
}

/** Parse a date into YYYY-MM-DD */
function parseDate(val: string): string | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
}

/** Pick the most recent of two date strings */
function mostRecent(a: string, b: string): string | null {
  const da = a ? new Date(a).getTime() : 0;
  const db = b ? new Date(b).getTime() : 0;
  if (!da && !db) return null;
  return da >= db ? parseDate(a) : parseDate(b);
}

/** Split a comma-separated Airtable multi-value field */
function splitMulti(val: string): string[] {
  if (!val) return [];
  return val.split(",").map(s => s.trim()).filter(Boolean);
}

// Valid status values from Airtable (ignore garbled text)
const VALID_STATUSES = new Set([
  "first meeting", "passed", "discussion in process",
  "tracking / hold", "portfolio", "due diligence",
  "identified/introduced", "monitoring", "investment memo",
]);

// Valid sector values
const VALID_SECTORS = new Set([
  "cleantech", "biotech", "other", "techbio", "advanced materials",
]);

/** Map Airtable status → deal_status enum */
function mapStatus(val: string): string | null {
  const v = val.toLowerCase().trim();
  if (!VALID_STATUSES.has(v)) return null;
  if (v === "portfolio") return "portfolio";
  if (v === "passed") return "passed";
  if (v === "tracking / hold" || v === "monitoring") return "monitoring";
  if (v === "identified/introduced") return "sourced";
  if (v === "investment memo") return "active_deal";
  if (["first meeting", "discussion in process", "due diligence"].includes(v)) return "active_deal";
  return null;
}

/** Infer company type from name, type field, and boolean columns */
function inferCompanyType(row: Record<string, string>): string {
  const typeField = col(row, "Type").toLowerCase().replace(/[\s_/-]+/g, "");
  if (typeField === "startup") return "startup";
  if (typeField === "lp" || typeField.includes("limitedpartner")) return "lp";
  if (typeField === "fund" || typeField.includes("vcfund")) return "fund";
  if (typeField.includes("government") || typeField.includes("academic")) return "government";
  if (typeField.includes("strategic")) return "ecosystem_partner";

  // Name-based detection
  const name = col(row, "Company").toLowerCase();
  const fundKeywords = ["capital", "ventures", " fund", "asset management", "family office", "endowment", "pension", "investments llc", "management llc", "holdings", "partners fund", "equity"];
  const govKeywords = ["ministry", "ministerio", " department", "government", "bureau", "commission", "authority", "agency of"];
  const ecoKeywords = ["accelerator", "incubator", "university", "institute ", "college ", "research center", "national lab"];
  if (fundKeywords.some(k => name.includes(k))) return "fund";
  if (govKeywords.some(k => name.includes(k))) return "government";
  if (ecoKeywords.some(k => name.includes(k))) return "ecosystem_partner";

  return "startup";
}

/** Map Airtable contact type → DB contact type */
function mapContactType(val: string): string {
  const v = val.toLowerCase().replace(/[\s/_]+/g, "");
  if (v.includes("founder") || v.includes("mgmt") || v.includes("ceo") || v.includes("cto")) return "founder";
  if (v.includes("limitedpartner") || v.includes("lp")) return "lp";
  if (v.includes("investor")) return "lp";
  if (v.includes("government") || v.includes("academic")) return "government";
  if (v.includes("advisor") || v.includes("kol") || v.includes("lawyer")) return "advisor";
  if (v.includes("strategic") || v.includes("corporate")) return "corporate";
  if (v.includes("ecosystem")) return "ecosystem_partner";
  if (v.includes("fund") || v.includes("vc")) return "fund_manager";
  return "other";
}

/** Infer company type from the contact's type */
function companyTypeFromContact(contactType: string): string {
  const ct = mapContactType(contactType);
  if (ct === "founder" || ct === "other") return "startup";
  if (ct === "lp") return "lp";
  if (ct === "fund_manager") return "fund";
  if (ct === "government") return "government";
  if (ct === "ecosystem_partner") return "ecosystem_partner";
  if (ct === "corporate") return "corporate";
  return "startup";
}

/** Batch insert rows to Supabase */
async function batchInsert(table: string, records: Record<string, unknown>[]): Promise<{ inserted: number; errors: number }> {
  if (DRY_RUN) return { inserted: records.length, errors: 0 };
  let inserted = 0; let errors = 0;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).insert(batch);
    if (error) {
      console.error(`   ⚠️  Batch insert error (rows ${i}–${i + batch.length}):`, error.message);
      errors += batch.length;
      // Try row by row to recover
      for (const rec of batch) {
        const { error: e2 } = await supabase.from(table).insert(rec);
        if (!e2) { inserted++; errors--; }
      }
    } else {
      inserted += batch.length;
    }
  }
  return { inserted, errors };
}

// ── STEP 1: Import Companies ──────────────────────────────────────────────────

async function importCompanies(
  companiesFile: string,
  portfolioNames: Set<string>
): Promise<{ nameToId: Map<string, string>; recordIdToId: Map<string, string> }> {
  console.log("\n📋  STEP 1 — Importing Companies");
  console.log("    File:", companiesFile);

  const rows = parseCSV(companiesFile);
  console.log(`    Total rows in CSV: ${rows.length}`);

  // Filter to meaningful companies only
  const meaningful = rows.filter(r => {
    const name = col(r, "Company").trim();
    if (!name || name.length < 2) return false;
    // Skip rows that are clearly garbled (name looks like email or fragment)
    if (name.includes("@") || name.length > 100) return false;
    const status = col(r, "Status").toLowerCase().trim();
    const sector = col(r, "Sector").toLowerCase().trim();
    const memo   = col(r, "AI-Generated Memo").trim();
    const desc   = col(r, "Company Description").trim();
    return (
      VALID_STATUSES.has(status) ||
      VALID_SECTORS.has(sector) ||
      (memo.length > 100 && !memo.includes("@")) ||
      portfolioNames.has(name.toLowerCase()) ||
      desc.length > 30
    );
  });

  // Deduplicate by name (lowercase)
  const seen = new Set<string>();
  const deduped = meaningful.filter(r => {
    const key = col(r, "Company").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`    After filtering + dedup: ${deduped.length} companies`);

  // Fetch existing companies to skip dupes
  const { data: existing } = await supabase.from("companies").select("id, name");
  const existingByName = new Map<string, string>();
  existing?.forEach(c => existingByName.set(c.name.toLowerCase(), c.id));

  const nameToId     = new Map<string, string>(existingByName);
  const recordIdToId = new Map<string, string>();
  const toInsert:  Record<string, unknown>[] = [];
  const toUpdate:  { id: string; fields: Record<string, unknown> }[] = [];
  const rowsForMemos: Record<string, string>[] = [];

  for (const row of deduped) {
    const name = col(row, "Company").trim();
    const nameLower = name.toLowerCase();

    const statusRaw = col(row, "Status").trim();
    const sectorRaw = col(row, "Sector").trim().toLowerCase();
    const dealStatus = mapStatus(statusRaw);

    const lastEmail   = parseDate(col(row, "Last Email"));
    const lastMeeting = parseDate(col(row, "Last Meeting"));
    const lastContact = mostRecent(lastEmail ?? "", lastMeeting ?? "");

    const logoUrl  = extractFirstUrl(col(row, "Logo"));
    const deckUrl  = extractFirstUrl(col(row, "Deck"));
    const domain   = col(row, "Domain").trim();
    const website  = col(row, "Website").trim() ||
                     (domain ? (domain.startsWith("http") ? domain : `https://${domain}`) : null);

    const subSectorRaw = col(row, "Sub-sector").trim();

    // Build the full field payload (same shape for insert and update)
    const fields: Record<string, unknown> = {
      type:               inferCompanyType(row),
      deal_status:        dealStatus,
      description:        col(row, "Company Description") || null,
      website:            website || null,
      // sub_type stores sub-sector text (if it's not itself a sector name)
      sub_type:           VALID_SECTORS.has(subSectorRaw.toLowerCase())
                            ? subSectorRaw || null   // keep it if it IS a sector (e.g. "SynBio" is a sub-sector)
                            : (subSectorRaw || null),
      sectors:            VALID_SECTORS.has(sectorRaw) ? [sectorRaw] : [],
      stage:              col(row, "Investment Round")?.toLowerCase().replace(/\s+/g, "_") || null,
      location_city:      col(row, "Location (City)") || null,
      location_country:   col(row, "Location (Country)") || null,
      funding_raised:     parseUSD(col(row, "Last Funding Amount (USD)")),
      last_funding_date:  parseDate(col(row, "Last Funding Date")),
      pitch_deck_url:     deckUrl,
      logo_url:           logoUrl,
      first_contact_date: parseDate(col(row, "Date Added", "First Meeting")),
      last_contact_date:  lastContact,
      notes:              col(row, "Notes") || null,
      tags:               splitMulti(col(row, "Key Words (AI)")).length > 0
                            ? splitMulti(col(row, "Key Words (AI)"))
                            : null,
    };

    // Save row for memo creation later
    const memo = col(row, "AI-Generated Memo").trim();
    if (memo.length > 100 && !memo.includes("@")) {
      rowsForMemos.push({ name, memo });
    }

    if (existingByName.has(nameLower)) {
      // Company already in DB — queue an UPDATE to backfill all fields
      const id = existingByName.get(nameLower)!;
      const recId = col(row, "Record ID");
      if (recId) recordIdToId.set(recId, id);
      toUpdate.push({ id, fields });
    } else {
      // Brand new company — queue an INSERT
      toInsert.push({ name, ...fields });
    }
  }

  console.log(`    Inserting ${toInsert.length} new companies…`);
  console.log(`    Updating  ${toUpdate.length} existing companies with CSV fields…`);

  if (DRY_RUN) {
    console.log("    [DRY RUN] Sample inserts:", toInsert.slice(0, 3).map(r => r["name"]));
    console.log("    [DRY RUN] Sample updates:", toUpdate.slice(0, 3).map(u => u.id));
  } else {
    // Insert new companies
    const { inserted, errors } = await batchInsert("companies", toInsert);
    console.log(`    ✅  Inserted: ${inserted}, Errors: ${errors}`);

    // Update existing companies in batches of BATCH_SIZE
    let updated = 0; let updateErrors = 0;
    for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
      const batch = toUpdate.slice(i, i + BATCH_SIZE);
      for (const { id, fields } of batch) {
        const { error } = await supabase.from("companies").update(fields).eq("id", id);
        if (error) { updateErrors++; }
        else { updated++; }
      }
    }
    console.log(`    ✅  Updated: ${updated}, Update Errors: ${updateErrors}`);

    // Fetch all company IDs (including newly inserted)
    const { data: allCompanies } = await supabase.from("companies").select("id, name");
    allCompanies?.forEach(c => nameToId.set(c.name.toLowerCase(), c.id));
  }

  // Map Airtable Record IDs → company IDs
  for (const row of deduped) {
    const name  = col(row, "Company").toLowerCase();
    const recId = col(row, "Record ID");
    const compId = nameToId.get(name);
    if (recId && compId) recordIdToId.set(recId, compId);
  }

  console.log(`    Total companies in name map: ${nameToId.size}`);
  console.log(`    Airtable Record ID map: ${recordIdToId.size} entries`);
  console.log(`    Companies with AI memos to create: ${rowsForMemos.length}`);

  // Store memo rows for later use (returned via side effect of outer scope)
  // We'll return them via a separate mechanism
  (global as Record<string, unknown>)._memoRows = rowsForMemos;

  return { nameToId, recordIdToId };
}

// ── STEP 2: Create Stub Companies for Contacts ────────────────────────────────

async function createStubCompanies(
  contactsFile: string,
  nameToId: Map<string, string>
): Promise<void> {
  console.log("\n🏗️   STEP 2 — Creating stub companies for contact linking");

  const rows = parseCSV(contactsFile);
  const needed = new Map<string, string>(); // name → inferred type

  for (const row of rows) {
    const companyName = col(row, "Company").trim();
    if (!companyName || nameToId.has(companyName.toLowerCase())) continue;
    const contactType = col(row, "Type").trim();
    needed.set(companyName.toLowerCase(), companyTypeFromContact(contactType));
  }

  console.log(`    Need ${needed.size} stub companies`);

  const toInsert: Record<string, unknown>[] = [];
  for (const [nameLower, type] of needed) {
    // Capitalize properly (keep original casing from first occurrence)
    const originalRow = parseCSV(contactsFile).find(r =>
      col(r, "Company").trim().toLowerCase() === nameLower
    );
    const name = originalRow ? col(originalRow, "Company").trim() : nameLower;
    toInsert.push({ name, type });
  }

  // Dedupe by name
  const unique = Array.from(
    new Map(toInsert.map(r => [(r["name"] as string).toLowerCase(), r])).values()
  );

  console.log(`    Inserting ${unique.length} stub companies…`);
  if (!DRY_RUN) {
    const { inserted, errors } = await batchInsert("companies", unique);
    console.log(`    ✅  Inserted: ${inserted}, Errors: ${errors}`);

    // Refresh nameToId
    const { data } = await supabase.from("companies").select("id, name");
    data?.forEach(c => nameToId.set(c.name.toLowerCase(), c.id));
  }
}

// ── STEP 3: Import Contacts ───────────────────────────────────────────────────

async function importContacts(
  contactsFile: string,
  nameToId: Map<string, string>,
  recordIdToId: Map<string, string>
): Promise<void> {
  console.log("\n👤  STEP 3 — Importing Contacts");

  const rows = parseCSV(contactsFile);
  console.log(`    Total rows: ${rows.length}`);

  // Skip excluded / deleted
  const validRows = rows.filter(r => {
    const exclude = col(r, "Exclude").toLowerCase();
    const del     = col(r, "Delete").toLowerCase();
    return exclude !== "yes" && del !== "checked" && del !== "yes";
  });

  console.log(`    After excluding flagged rows: ${validRows.length}`);

  // Fetch existing contact emails to avoid dupes
  const { data: existing } = await supabase.from("contacts").select("email");
  const existingEmails = new Set(
    existing?.map(c => c.email?.toLowerCase()).filter(Boolean) ?? []
  );

  const toInsert: Record<string, unknown>[] = [];
  let skipped = 0;

  for (const row of validRows) {
    // Name handling — use First/Last columns first, then split Name
    let firstName = col(row, "First Name").trim();
    let lastName  = col(row, "Last Name").trim();
    const fullName = col(row, "Name").trim();

    if (!firstName && !lastName && fullName) {
      // Handle "Last, First" format (Airtable sometimes exports this way)
      if (fullName.includes(",")) {
        const parts = fullName.split(",").map(s => s.trim());
        lastName  = parts[0] ?? "";
        firstName = parts[1] ?? "";
      } else {
        const parts = fullName.split(" ");
        firstName = parts[0] ?? "";
        lastName  = parts.slice(1).join(" ") || "(unknown)";
      }
    }

    if (!firstName) { skipped++; continue; }

    const email = col(row, "Email").toLowerCase();
    if (email && existingEmails.has(email)) { skipped++; continue; }

    // Find company — prefer Record ID link, fall back to name
    const airtableCompanyRecordId = col(row, "Record ID (from Company)").trim();
    const companyName             = col(row, "Company").trim();
    const companyId =
      (airtableCompanyRecordId && recordIdToId.get(airtableCompanyRecordId)) ||
      (companyName && nameToId.get(companyName.toLowerCase())) ||
      null;

    const lastContact = mostRecent(
      col(row, "Last Contact"),
      col(row, "Last Meeting")
    );

    const record: Record<string, unknown> = {
      first_name:           firstName,
      last_name:            lastName || "(unknown)",
      email:                email || null,
      phone:                col(row, "Phone Number") || null,
      linkedin_url:         col(row, "LinkedIn URL") || null,
      title:                col(row, "Job Titles") || null,
      company_id:           companyId,
      type:                 mapContactType(col(row, "Type")),
      last_contact_date:    lastContact,
      notes:                col(row, "Notes") || null,
    };

    toInsert.push(record);
    if (email) existingEmails.add(email);
  }

  console.log(`    Preparing to insert ${toInsert.length} contacts (${skipped} skipped)…`);
  if (!DRY_RUN) {
    const { inserted, errors } = await batchInsert("contacts", toInsert);
    console.log(`    ✅  Inserted: ${inserted}, Errors: ${errors}`);
  } else {
    console.log("    [DRY RUN] Would insert:", toInsert.length, "contacts");
    toInsert.slice(0, 3).forEach(r => console.log(`      - ${r["first_name"]} ${r["last_name"]} <${r["email"]}> @ company_id=${r["company_id"]}`));
  }
}

// ── STEP 4: Import Portfolio Deals ────────────────────────────────────────────

async function importPortfolioDeals(
  portfolioFile: string,
  nameToId: Map<string, string>
): Promise<void> {
  console.log("\n💼  STEP 4 — Importing Portfolio Deals");

  const rows = parseCSV(portfolioFile);
  console.log(`    Rows: ${rows.length}`);

  const dealsToInsert: Record<string, unknown>[] = [];
  const companyUpdates: { id: string; deal_status: string; stage: string | null }[] = [];

  for (const row of rows) {
    const companyName = col(row, "Company").trim();
    if (!companyName) continue;

    const companyId = nameToId.get(companyName.toLowerCase());
    if (!companyId) {
      console.log(`    ⚠️  Company not found: "${companyName}"`);
      continue;
    }

    const status    = col(row, "Investment Status").trim().toLowerCase();
    const dealStatus =
      status === "portfolio" ? "portfolio" :
      status === "passed"    ? "passed"    :
      status === "investment memo" ? "active_deal" : "active_deal";

    const roundStage = col(row, "Round Stage").trim().toLowerCase().replace(/[\s-]+/g, "_");
    const roundType  = col(row, "Round Type").trim().toLowerCase();
    const instrument =
      roundType.includes("safe")              ? "safe"             :
      roundType.includes("convertible")       ? "convertible_note" :
      roundType.includes("priced") || roundType.includes("equity") ? "equity" : "other";

    const dealStage =
      status === "portfolio"       ? "closed"        :
      status === "passed"          ? "passed"         :
      status === "investment memo" ? "ic_memo"        :
      roundStage.includes("due")   ? "due_diligence"  : "first_meeting";

    const deal: Record<string, unknown> = {
      company_id:       companyId,
      stage:            dealStage,
      investment_amount: parseUSD(col(row, "Valuence Investment")),
      valuation_cap:    parseUSD(col(row, "Pre-Money Valuation", "SAFE Valuation Cap")),
      discount_pct:     parseFloat(col(row, "SAFE Discount").replace("%", "")) || null,
      instrument,
      lead_partner:     col(row, "Deal Lead") || null,
      close_date:       parseDate(col(row, "Close Date")),
      notes:            col(row, "Notes") || null,
    };

    dealsToInsert.push(deal);
    companyUpdates.push({ id: companyId, deal_status: dealStatus, stage: roundStage || null });
  }

  if (!DRY_RUN) {
    const { inserted, errors } = await batchInsert("deals", dealsToInsert);
    console.log(`    ✅  Deals inserted: ${inserted}, Errors: ${errors}`);

    // Update company deal_status and stage
    for (const { id, deal_status, stage } of companyUpdates) {
      await supabase.from("companies").update({ deal_status, stage }).eq("id", id);
    }
    console.log(`    ✅  Updated ${companyUpdates.length} company statuses`);
  } else {
    console.log("    [DRY RUN] Would insert deals:", dealsToInsert.map(d => ({ company: d["company_id"], stage: d["stage"], amount: d["investment_amount"] })));
  }
}

// ── STEP 5: Create IC Memos ───────────────────────────────────────────────────

async function createIcMemos(nameToId: Map<string, string>): Promise<void> {
  console.log("\n📄  STEP 5 — Creating IC Memos from AI-Generated Memo field");

  const memoRows = (global as Record<string, unknown>)._memoRows as Array<{ name: string; memo: string }> ?? [];
  console.log(`    Memos to create: ${memoRows.length}`);

  if (memoRows.length === 0) {
    console.log("    No memos to create.");
    return;
  }

  const toInsert: Record<string, unknown>[] = [];

  for (const { name, memo } of memoRows) {
    const companyId = nameToId.get(name.toLowerCase());
    if (!companyId) continue;

    // Try to extract a recommendation from the memo text
    const lowerMemo = memo.toLowerCase();
    const recommendation =
      lowerMemo.includes("recommend invest") || lowerMemo.includes("recommendation: invest")   ? "invest" :
      lowerMemo.includes("recommend pass")   || lowerMemo.includes("recommendation: pass")     ? "pass" :
      lowerMemo.includes("further diligence") || lowerMemo.includes("more diligence")           ? "more_diligence" :
      "pending";

    // Extract first paragraph as executive summary
    const paragraphs = memo.split(/\n\n+/).filter(p => p.trim().length > 50);
    const execSummary = paragraphs[0]?.trim().slice(0, 1000) ?? null;

    toInsert.push({
      company_id:         companyId,
      title:              `Investment Analysis: ${name}`,
      executive_summary:  execSummary,
      full_text:          memo,
      recommendation,
      status:             "draft",
    });
  }

  console.log(`    Prepared ${toInsert.length} memos`);
  if (!DRY_RUN) {
    const { inserted, errors } = await batchInsert("ic_memos", toInsert);
    console.log(`    ✅  Memos inserted: ${inserted}, Errors: ${errors}`);
  } else {
    console.log("    [DRY RUN] Would insert", toInsert.length, "memos");
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("  VALUENCE OS — Airtable Migration");
  if (DRY_RUN) console.log("  ⚠️   DRY RUN — nothing will be written to the database");
  console.log("=".repeat(60));
  console.log("  Looking for CSVs in:", AIRTABLE_DIR);

  const companiesFile  = path.join(AIRTABLE_DIR, "Companies.csv");
  const contactsFile   = path.join(AIRTABLE_DIR, "Contacts.csv");
  const portfolioFile  = path.join(AIRTABLE_DIR, "Portfolio Companies.csv");

  for (const f of [companiesFile, contactsFile, portfolioFile]) {
    if (!fs.existsSync(f)) {
      console.error(`\n❌  File not found: ${f}`);
      process.exit(1);
    }
  }

  // Build set of portfolio company names (used to ensure they're imported)
  const portfolioRows  = parseCSV(portfolioFile);
  const portfolioNames = new Set(
    portfolioRows.map(r => col(r, "Company").trim().toLowerCase()).filter(Boolean)
  );
  console.log(`\n  Portfolio companies: ${portfolioNames.size}`);

  // Run steps
  const { nameToId, recordIdToId } = await importCompanies(companiesFile, portfolioNames);
  await createStubCompanies(contactsFile, nameToId);
  await importContacts(contactsFile, nameToId, recordIdToId);
  await importPortfolioDeals(portfolioFile, nameToId);
  await createIcMemos(nameToId);

  console.log("\n" + "=".repeat(60));
  console.log("  ✅  Migration complete!");
  if (DRY_RUN) console.log("  Run without DRY_RUN=true to actually write to the database.");
  console.log("=".repeat(60) + "\n");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
