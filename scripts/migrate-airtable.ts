// ─── Airtable → Supabase Migration Script ────────────────────────────────────
// Imports Companies.csv, Contacts.csv, and Portfolio Companies.csv
// with full cross-table linking via Airtable Record IDs.
//
// Run:      npx tsx scripts/migrate-airtable.ts
// Dry run:  DRY_RUN=true npx tsx scripts/migrate-airtable.ts

import { createClient } from "@supabase/supabase-js";
import * as fs   from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const SUPABASE_URL         = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const AIRTABLE_DIR         = path.join(process.cwd(), "Airtable");
const DRY_RUN              = process.env.DRY_RUN === "true";
const BATCH_SIZE           = 100;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌  Missing SUPABASE env vars in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── CSV Parser ────────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

function col(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const match = Object.keys(row).find(k => k.toLowerCase() === key.toLowerCase());
    if (match && row[match]?.trim()) return row[match].trim();
  }
  return "";
}

function extractFirstUrl(val: string): string | null {
  if (!val) return null;
  const m = val.match(/https?:\/\/[^\s),]+/);
  return m ? m[0] : null;
}

function parseUSD(val: string): number | null {
  if (!val) return null;
  const cleaned = val.replace(/[$,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) || num === 0 ? null : num;
}

function parseDate(val: string): string | null {
  if (!val) return null;
  // Handle "12-Aug-25" style dates
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
}

function mostRecent(...vals: string[]): string | null {
  const dates = vals.map(v => v ? new Date(v).getTime() : 0).filter(t => t > 0);
  if (!dates.length) return null;
  const best = Math.max(...dates);
  return parseDate(new Date(best).toISOString());
}

function splitMulti(val: string): string[] {
  if (!val) return [];
  return val.split(",").map(s => s.trim()).filter(Boolean);
}

// ── Type Mapping ──────────────────────────────────────────────────────────────

/**
 * Determine company type from the CSV row.
 * Priority: explicit Type field → checkbox columns → name heuristics → default
 */
function inferCompanyType(row: Record<string, string>): string {
  const raw  = col(row, "Type");
  const norm = raw.toLowerCase().replace(/[\s/_-]+/g, "");

  // Explicit Type field
  if (norm === "startup")                           return "startup";
  if (norm === "lp" || norm === "limitedpartner")   return "lp";
  if (norm === "investor" || norm === "fund" || norm === "vcfund" || norm === "vc")
                                                    return "fund";
  if (norm.includes("government") || norm.includes("academic") || norm.includes("ministry"))
                                                    return "government";
  if (norm.includes("strategic") || norm.includes("corporate") || norm.includes("ecosystem"))
                                                    return "ecosystem_partner";

  // Checkbox columns (Airtable exports "checked" or the value name)
  if (col(row, "Startup").trim())                   return "startup";
  if (col(row, "LP").trim())                        return "lp";
  if (col(row, "Investor").trim())                  return "fund";
  if (col(row, "Strategic Partner").trim())         return "ecosystem_partner";

  // Name heuristics
  const name = col(row, "Company").toLowerCase();
  const fundKw  = ["capital", " ventures", " fund", "asset management", "family office",
                   "endowment", "pension", "investments llc", "management llc",
                   "holdings llc", "partners llc", "equity partners"];
  const govKw   = ["ministry", "ministerio", " department of", "government of",
                   "commission", "authority", "bureau of", "agency of"];
  const ecoKw   = ["accelerator", "incubator", "university", " institute",
                   " college", "research center", "national lab", "polytechnic"];
  if (fundKw.some(k => name.includes(k)))           return "fund";
  if (govKw.some(k => name.includes(k)))            return "government";
  if (ecoKw.some(k => name.includes(k)))            return "ecosystem_partner";

  return "other";   // catch-all — user can reclassify in CRM
}

/** Map Airtable deal Status → DB deal_status enum */
function mapDealStatus(val: string): string | null {
  const v = val.toLowerCase().trim();
  if (v === "portfolio")                         return "portfolio";
  if (v === "passed")                            return "passed";
  if (v.includes("monitoring") || v.includes("tracking") || v.includes("hold"))
                                                 return "monitoring";
  if (v.includes("identified") || v.includes("introduced") || v.includes("sourced"))
                                                 return "sourced";
  if (v.includes("first meeting") || v.includes("discussion") ||
      v.includes("due diligence") || v.includes("investment memo"))
                                                 return "active_deal";
  return null;
}

/** Map Airtable investment stage → DB stage string */
function mapStage(val: string): string | null {
  const v = val.toLowerCase().replace(/[\s-]+/g, "_").trim();
  if (!v) return null;
  if (v.includes("pre_seed") || v.includes("pre-seed"))  return "pre-seed";
  if (v.includes("seed"))                                 return "seed";
  if (v.includes("series_a") || v === "a")                return "series_a";
  if (v.includes("series_b") || v === "b")                return "series_b";
  if (v.includes("series_c") || v === "c")                return "series_c";
  if (v.includes("growth") || v.includes("later"))        return "growth";
  return v.slice(0, 40) || null;  // store raw if unrecognised
}

/** Map Airtable contact Type → DB ContactType enum */
function mapContactType(val: string): string {
  const v = val.toLowerCase().replace(/[\s/_-]+/g, "");
  if (v.includes("founder") || v.includes("ceo") || v.includes("cto") || v.includes("mgmt"))
    return "founder";
  if (v.includes("limitedpartner") || (v === "lp"))
    return "lp";
  if (v.includes("investor") || v.includes("vcfund") || v.includes("fund"))
    return "fund_manager";
  if (v.includes("government") || v.includes("academic") || v.includes("ministry"))
    return "government";
  if (v.includes("advisor") || v.includes("kol") || v.includes("lawyer"))
    return "advisor";
  if (v.includes("strategic") || v.includes("corporate") || v.includes("partner") && !v.includes("ecosystem"))
    return "corporate";
  if (v.includes("ecosystem"))
    return "ecosystem_partner";
  return "other";
}

/** Infer company type from contact type (for stub company creation) */
function companyTypeFromContactType(contactType: string): string {
  const ct = mapContactType(contactType);
  if (ct === "founder")           return "startup";
  if (ct === "lp")                return "lp";
  if (ct === "fund_manager")      return "fund";
  if (ct === "government")        return "government";
  if (ct === "ecosystem_partner") return "ecosystem_partner";
  if (ct === "corporate")         return "corporate";
  return "other";
}

// ── Batch Insert/Update ───────────────────────────────────────────────────────

async function batchInsert(
  table: string,
  records: Record<string, unknown>[]
): Promise<{ inserted: number; errors: number }> {
  if (DRY_RUN) return { inserted: records.length, errors: 0 };
  let inserted = 0, errors = 0;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).insert(batch);
    if (error) {
      console.error(`   ⚠️  Batch error (rows ${i}–${i + batch.length}):`, error.message);
      // Retry row by row
      for (const rec of batch) {
        const { error: e2 } = await supabase.from(table).insert(rec);
        if (!e2) inserted++; else errors++;
      }
    } else {
      inserted += batch.length;
    }
    if ((i / BATCH_SIZE) % 20 === 0 && i > 0) {
      process.stdout.write(`    … ${inserted} so far\r`);
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

  const rows = parseCSV(companiesFile);
  console.log(`    Total rows in CSV: ${rows.length}`);

  // Keep every row that has a real company name
  const valid = rows.filter(r => {
    const name = col(r, "Company").trim();
    if (!name || name.length < 2 || name.length > 150) return false;
    if (name.includes("@")) return false;  // accidental email in name column
    return true;
  });

  // Deduplicate by Record ID first, then by name
  const seenRecordIds = new Set<string>();
  const seenNames     = new Set<string>();
  const deduped: Record<string, string>[] = [];
  for (const r of valid) {
    const recId = col(r, "Record ID").trim();
    const name  = col(r, "Company").toLowerCase().trim();
    if (recId && seenRecordIds.has(recId)) continue;
    if (seenNames.has(name)) continue;
    if (recId) seenRecordIds.add(recId);
    seenNames.add(name);
    deduped.push(r);
  }

  console.log(`    After dedup: ${deduped.length} unique companies`);

  const nameToId     = new Map<string, string>();
  const recordIdToId = new Map<string, string>();
  const toInsert: Record<string, unknown>[] = [];
  const memoRows: Array<{ name: string; memo: string; recordId: string }> = [];

  for (const row of deduped) {
    const name     = col(row, "Company").trim();
    const recordId = col(row, "Record ID").trim();

    // ── Website ──────────────────────────────────────────────────────────────
    const domain  = col(row, "Domain").trim();
    const website =
      col(row, "Website").trim() ||
      (domain
        ? domain.startsWith("http") ? domain : `https://${domain}`
        : null);

    // ── Sector ───────────────────────────────────────────────────────────────
    const sectorRaw = col(row, "Sector").trim().toLowerCase();
    const sectors   = sectorRaw ? [sectorRaw] : [];

    // ── Sub-sector / sub_type ─────────────────────────────────────────────
    const subSector = col(row, "Sub-sector").trim() || null;

    // ── Stage ─────────────────────────────────────────────────────────────
    const stage = mapStage(
      col(row, "Investment Round", "Investment Stage", "Current Round")
    );

    // ── Deal status ────────────────────────────────────────────────────────
    const dealStatus = mapDealStatus(col(row, "Status"));

    // ── Dates ──────────────────────────────────────────────────────────────
    const lastEmail   = parseDate(col(row, "Last Email"));
    const lastMeeting = parseDate(col(row, "Last Meeting"));
    const lastContact = mostRecent(lastEmail ?? "", lastMeeting ?? "");
    const firstDate   = parseDate(col(row, "Date Added", "First Meeting")) || lastContact;

    // ── Financial ──────────────────────────────────────────────────────────
    const fundingRaised   = parseUSD(col(row, "Last Funding Amount (USD)"));
    const lastFundingDate = parseDate(col(row, "Last Funding Date"));

    // ── Tags ───────────────────────────────────────────────────────────────
    const keyWords  = splitMulti(col(row, "Key Words (AI)"));
    const tags      = keyWords.length > 0 ? keyWords : null;

    // ── Notes — combine Notes + Priority + Owners ─────────────────────────
    const noteParts = [
      col(row, "Notes"),
      col(row, "Priority")   ? `Priority: ${col(row, "Priority")}`   : "",
      col(row, "Owners")     ? `Owners: ${col(row, "Owners")}`       : "",
      col(row, "Co-Investors") ? `Co-Investors: ${col(row, "Co-Investors")}` : "",
    ].filter(Boolean);
    const notes = noteParts.length > 0 ? noteParts.join("\n") : null;

    // ── LP type (for LP companies) ─────────────────────────────────────────
    const lpType = col(row, "Stage (LP)").trim() || null;

    // ── Type ──────────────────────────────────────────────────────────────
    const type = inferCompanyType(row);

    // ── AI Memo ───────────────────────────────────────────────────────────
    const memo = col(row, "AI-Generated Memo").trim();
    if (memo.length > 100 && !memo.includes("@")) {
      memoRows.push({ name, memo, recordId });
    }

    const fields: Record<string, unknown> = {
      name,
      type,
      deal_status:        dealStatus,
      description:        col(row, "Company Description") || null,
      website:            website || null,
      sub_type:           subSector,
      sectors,
      stage,
      location_city:      col(row, "Location (City)") || null,
      location_country:   col(row, "Location (Country)") || null,
      funding_raised:     fundingRaised,
      last_funding_date:  lastFundingDate,
      pitch_deck_url:     extractFirstUrl(col(row, "Deck")),
      logo_url:           extractFirstUrl(col(row, "Logo")),
      first_contact_date: firstDate,
      last_contact_date:  lastContact,
      notes,
      tags,
      lp_type:            lpType,
      source:             "airtable",
    };

    toInsert.push(fields);
  }

  console.log(`    Inserting ${toInsert.length} companies…`);

  if (!DRY_RUN) {
    const { inserted, errors } = await batchInsert("companies", toInsert);
    console.log(`\n    ✅  Inserted: ${inserted} | Errors: ${errors}`);

    // Fetch all IDs for linking
    const { data: all } = await supabase.from("companies").select("id, name").limit(20000);
    all?.forEach(c => nameToId.set(c.name.toLowerCase(), c.id));
  } else {
    console.log(`    [DRY RUN] Would insert ${toInsert.length} companies`);
    toInsert.slice(0, 5).forEach(r => console.log(`      - ${r["name"]} (${r["type"]})`));
    // Populate nameToId for dry-run contact linking preview
    toInsert.forEach((r, i) => nameToId.set((r["name"] as string).toLowerCase(), `dry-run-${i}`));
  }

  // Build Record ID → DB UUID map
  for (const row of deduped) {
    const recId  = col(row, "Record ID").trim();
    const dbId   = nameToId.get(col(row, "Company").toLowerCase().trim());
    if (recId && dbId) recordIdToId.set(recId, dbId);
  }

  console.log(`    Record ID map: ${recordIdToId.size} entries`);

  // Store memo rows for Step 5
  (global as Record<string, unknown>)._memoRows = memoRows.map(({ name, memo }) => ({ name, memo }));

  return { nameToId, recordIdToId };
}

// ── STEP 2: Create stub companies for any contacts not already in companies ───

async function createStubCompanies(
  contactsFile: string,
  nameToId: Map<string, string>
): Promise<void> {
  console.log("\n🏗️   STEP 2 — Stub companies for unmatched contact companies");

  const rows  = parseCSV(contactsFile);
  const stubs = new Map<string, string>(); // nameLower → type

  for (const row of rows) {
    const exclude = col(row, "Exclude", "Delete").toLowerCase();
    if (exclude === "checked" || exclude === "yes") continue;
    const name = col(row, "Company").trim();
    if (!name || nameToId.has(name.toLowerCase())) continue;
    stubs.set(name.toLowerCase(), companyTypeFromContactType(col(row, "Type")));
  }

  // Use original casing from first occurrence
  const companyNamesByLower = new Map<string, string>();
  for (const row of rows) {
    const name = col(row, "Company").trim();
    if (name && !companyNamesByLower.has(name.toLowerCase())) {
      companyNamesByLower.set(name.toLowerCase(), name);
    }
  }

  const toInsert = Array.from(stubs.entries()).map(([lower, type]) => ({
    name:   companyNamesByLower.get(lower) ?? lower,
    type,
    source: "airtable",
  }));

  console.log(`    Need ${toInsert.length} stub companies`);

  if (!DRY_RUN && toInsert.length > 0) {
    const { inserted, errors } = await batchInsert("companies", toInsert);
    console.log(`    ✅  Inserted: ${inserted} | Errors: ${errors}`);
    // Refresh nameToId
    const { data } = await supabase.from("companies").select("id, name").limit(20000);
    data?.forEach(c => nameToId.set(c.name.toLowerCase(), c.id));
  } else if (DRY_RUN) {
    console.log(`    [DRY RUN] Would insert ${toInsert.length} stub companies`);
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

  // Skip flagged rows
  const valid = rows.filter(r => {
    const exclude = col(r, "Exclude").toLowerCase();
    const del     = col(r, "Delete").toLowerCase();
    return exclude !== "checked" && exclude !== "yes" &&
           del     !== "checked" && del     !== "yes";
  });
  console.log(`    After excluding flagged: ${valid.length}`);

  // Fetch existing emails for dedup
  const { data: existing } = await supabase.from("contacts").select("email").limit(20000);
  const existingEmails = new Set(
    existing?.map(c => c.email?.toLowerCase()).filter(Boolean) ?? []
  );

  const toInsert: Record<string, unknown>[] = [];
  let   skipped = 0;

  for (const row of valid) {
    // Name resolution — prefer dedicated First/Last columns
    let firstName = col(row, "First Name").trim();
    let lastName  = col(row, "Last Name").trim();
    const fullName = col(row, "Name").trim();

    if (!firstName && !lastName && fullName) {
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

    const email = col(row, "Email").toLowerCase().trim();
    if (email && existingEmails.has(email)) { skipped++; continue; }

    // Skip bulk / automated email addresses
    const JUNK_EMAIL_PATTERNS = [
      "no-reply", "noreply", "no_reply",
      "donotreply", "do-not-reply", "do_not_reply",
      "marketing", "newsletter", "campaign",
      "replies@", "reply@",
      "contact@", "contacts@",
      "info@", "information@",
      "invoice", "billing", "accounts@", "finance@",
      "notifications@", "notification@",
      "support@", "help@", "helpdesk@",
      "admin@", "administrator@",
      "hello@", "hi@",
      "team@", "general@",
      "sales@", "press@", "media@",
    ];
    if (email && JUNK_EMAIL_PATTERNS.some(p => email.includes(p))) { skipped++; continue; }

    // Company linking — Record ID is most reliable
    const airtableRecIds  = splitMulti(col(row, "Record ID (from Company)"));
    const companyName     = col(row, "Company").trim();
    const companyId       =
      (airtableRecIds[0] && recordIdToId.get(airtableRecIds[0])) ||
      (companyName        && nameToId.get(companyName.toLowerCase())) ||
      null;

    // Dates
    const lastContact = mostRecent(
      col(row, "Last Contact"),
      col(row, "Last Meeting"),
      col(row, "Last Email")
    );
    const firstContact = mostRecent(
      col(row, "First Email"),
      col(row, "First Meeting")
    );

    const record: Record<string, unknown> = {
      first_name:         firstName,
      last_name:          lastName || "(unknown)",
      email:              email || null,
      phone:              col(row, "Phone Number") || null,
      linkedin_url:       col(row, "LinkedIn URL") || null,
      title:              col(row, "Job Titles") || null,
      company_id:         companyId,
      type:               mapContactType(col(row, "Type")),
      location_city:      col(row, "Location (City)") || null,
      location_country:   col(row, "Location (Country)") || null,
      notes:              col(row, "Notes") || null,
      last_contact_date:  lastContact,
      status:             "active",  // all CSV contacts are confirmed real contacts
    };

    toInsert.push(record);
    if (email) existingEmails.add(email);
  }

  console.log(`    Inserting ${toInsert.length} contacts (${skipped} skipped)…`);

  if (!DRY_RUN) {
    const { inserted, errors } = await batchInsert("contacts", toInsert);
    console.log(`\n    ✅  Inserted: ${inserted} | Errors: ${errors}`);
  } else {
    console.log(`    [DRY RUN] Would insert ${toInsert.length} contacts`);
    toInsert.slice(0, 5).forEach(r =>
      console.log(`      - ${r["first_name"]} ${r["last_name"]} <${r["email"]}> @ ${r["company_id"]}`)
    );
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
    if (!companyId) { console.log(`    ⚠️  Not found: "${companyName}"`); continue; }

    const status = col(row, "Investment Status").trim().toLowerCase();
    const dealStatus =
      status === "portfolio" ? "portfolio" :
      status === "passed"    ? "passed"    : "active_deal";

    const roundType  = col(row, "Round Type").trim().toLowerCase();
    const instrument =
      roundType.includes("safe")         ? "safe"             :
      roundType.includes("convertible")  ? "convertible_note" :
      (roundType.includes("priced") || roundType.includes("equity")) ? "equity" : "other";

    const dealStage =
      status === "portfolio"       ? "closed"       :
      status === "passed"          ? "passed"        :
      status === "investment memo" ? "ic_memo"       : "first_meeting";

    dealsToInsert.push({
      company_id:        companyId,
      stage:             dealStage,
      investment_amount: parseUSD(col(row, "Valuence Investment")),
      valuation_cap:     parseUSD(col(row, "Pre-Money Valuation", "SAFE Valuation Cap")),
      discount_pct:      parseFloat(col(row, "SAFE Discount").replace("%", "")) || null,
      instrument,
      lead_partner:      col(row, "Deal Lead") || null,
      close_date:        parseDate(col(row, "Close Date")),
      notes:             col(row, "Notes") || null,
    });

    companyUpdates.push({
      id: companyId,
      deal_status: dealStatus,
      stage: mapStage(col(row, "Round Stage", "Investment Round")),
    });
  }

  if (!DRY_RUN) {
    const { inserted, errors } = await batchInsert("deals", dealsToInsert);
    console.log(`    ✅  Deals: ${inserted} inserted, ${errors} errors`);
    for (const { id, deal_status, stage } of companyUpdates) {
      await supabase.from("companies").update({ deal_status, stage }).eq("id", id);
    }
    console.log(`    ✅  Updated ${companyUpdates.length} company statuses`);
  } else {
    console.log(`    [DRY RUN] Would insert ${dealsToInsert.length} deals`);
  }
}

// ── STEP 5: Create IC Memos from AI-Generated Memo field ──────────────────────

async function createIcMemos(nameToId: Map<string, string>): Promise<void> {
  console.log("\n📄  STEP 5 — Creating IC Memos");

  const memoRows = (global as Record<string, unknown>)._memoRows as
    Array<{ name: string; memo: string }> ?? [];
  console.log(`    Memos to create: ${memoRows.length}`);
  if (!memoRows.length) return;

  const toInsert: Record<string, unknown>[] = [];
  for (const { name, memo } of memoRows) {
    const companyId = nameToId.get(name.toLowerCase());
    if (!companyId) continue;
    const lm = memo.toLowerCase();
    const recommendation =
      lm.includes("recommend invest") || lm.includes("recommendation: invest") ? "invest"         :
      lm.includes("recommend pass")   || lm.includes("recommendation: pass")   ? "pass"           :
      lm.includes("further diligence") || lm.includes("more diligence")         ? "more_diligence" :
      "pending";
    const paras      = memo.split(/\n\n+/).filter(p => p.trim().length > 50);
    const execSummary = paras[0]?.trim().slice(0, 1000) ?? null;
    toInsert.push({
      company_id:        companyId,
      title:             `Investment Analysis: ${name}`,
      executive_summary: execSummary,
      full_text:         memo,
      recommendation,
      status:            "draft",
    });
  }

  if (!DRY_RUN) {
    const { inserted, errors } = await batchInsert("ic_memos", toInsert);
    console.log(`    ✅  Memos: ${inserted} inserted, ${errors} errors`);
  } else {
    console.log(`    [DRY RUN] Would insert ${toInsert.length} memos`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("  VALUENCE OS — Airtable Migration");
  if (DRY_RUN) console.log("  ⚠️   DRY RUN — nothing will be written");
  console.log("=".repeat(60));
  console.log("  CSVs from:", AIRTABLE_DIR);

  const companiesFile = path.join(AIRTABLE_DIR, "Companies.csv");
  const contactsFile  = path.join(AIRTABLE_DIR, "Contacts.csv");
  const portfolioFile = path.join(AIRTABLE_DIR, "Portfolio Companies.csv");

  for (const f of [companiesFile, contactsFile]) {
    if (!fs.existsSync(f)) { console.error(`\n❌  File not found: ${f}`); process.exit(1); }
  }
  const hasPortfolio = fs.existsSync(portfolioFile);
  if (!hasPortfolio) console.log("  ℹ️   No Portfolio Companies.csv — skipping portfolio deals");

  // Portfolio names (ensure they're included in companies import)
  const portfolioNames = new Set<string>(
    hasPortfolio
      ? parseCSV(portfolioFile).map(r => col(r, "Company").trim().toLowerCase()).filter(Boolean)
      : []
  );
  console.log(`\n  Portfolio companies: ${portfolioNames.size}`);

  const { nameToId, recordIdToId } = await importCompanies(companiesFile, portfolioNames);
  await createStubCompanies(contactsFile, nameToId);
  await importContacts(contactsFile, nameToId, recordIdToId);
  if (hasPortfolio) await importPortfolioDeals(portfolioFile, nameToId);
  await createIcMemos(nameToId);

  console.log("\n" + "=".repeat(60));
  console.log("  ✅  Migration complete!");
  if (DRY_RUN) console.log("  Remove DRY_RUN=true to write to the database.");
  console.log("=".repeat(60) + "\n");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
