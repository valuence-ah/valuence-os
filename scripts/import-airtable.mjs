/**
 * import-airtable.mjs
 * Reads Airtable CSV exports and upserts data into Supabase.
 *
 * Companies: upsert on name (UNIQUE constraint exists)
 * Contacts:  upsert on email via manual dedup (no unique constraint on email)
 *
 * Usage:  node scripts/import-airtable.mjs
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// ── Credentials ──────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://gtffgjcffugnjuviglya.supabase.co';
const SUPABASE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZmZnamNmZnVnbmp1dmlnbHlhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzgxMDE0MiwiZXhwIjoyMDg5Mzg2MTQyfQ.4G76PvVYHwPeJGhe90bCl8T0WMh4zjMS0SOs-MhV8T4';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const BASE = path.resolve(process.cwd());
const COMPANIES_CSV = path.join(BASE, 'Airtable', 'Companies.csv');
const CONTACTS_CSV = path.join(BASE, 'Airtable', 'Contacts.csv');
const BATCH_SIZE = 100;

// ── CSV Parser ────────────────────────────────────────────────────────────────
// Handles quoted fields with embedded commas and newlines.

function parseCSV(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, ''); // strip BOM
  const rows = [];
  let pos = 0;
  const len = raw.length;

  function parseField() {
    if (raw[pos] === '"') {
      pos++; // skip opening quote
      let val = '';
      while (pos < len) {
        if (raw[pos] === '"') {
          if (raw[pos + 1] === '"') {
            val += '"';
            pos += 2;
          } else {
            pos++; // skip closing quote
            break;
          }
        } else {
          val += raw[pos++];
        }
      }
      return val;
    } else {
      let val = '';
      while (pos < len && raw[pos] !== ',' && raw[pos] !== '\n' && raw[pos] !== '\r') {
        val += raw[pos++];
      }
      return val;
    }
  }

  function parseLine() {
    const fields = [];
    while (pos < len && raw[pos] !== '\n' && raw[pos] !== '\r') {
      fields.push(parseField());
      if (raw[pos] === ',') pos++;
    }
    // skip \r\n or \n
    if (raw[pos] === '\r') pos++;
    if (raw[pos] === '\n') pos++;
    return fields;
  }

  const headers = parseLine();
  while (pos < len) {
    const start = pos;
    const fields = parseLine();
    if (fields.length === 0 || (fields.length === 1 && fields[0] === '')) continue;
    // skip entirely empty rows
    if (fields.every(f => f === '')) continue;
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = fields[i] !== undefined ? fields[i] : '';
    });
    rows.push(obj);
  }
  return rows;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function nullIfEmpty(val) {
  if (val === undefined || val === null) return null;
  const s = String(val).trim();
  return s === '' ? null : s;
}

/** Parse "$1,000,000.00" or "1000000" → number or null */
function parseCurrency(val) {
  if (!val) return null;
  const cleaned = String(val).replace(/[$,\s]/g, '').replace(/\.00$/, '').replace(/\.0$/, '');
  if (cleaned === '' || cleaned === '0') return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

/** Parse "4/15/2025" or "9/17/2024" or "2025-04-15" → "YYYY-MM-DD" or null */
function parseDate(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (!s) return null;

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // M/D/YYYY or MM/DD/YYYY
  const mdyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdyMatch) {
    const [, m, d, y] = mdyMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DD-Mon-YY  e.g. "24-Apr-24"
  const dmyMatch = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/);
  if (dmyMatch) {
    const months = { Jan:'01',Feb:'02',Mar:'03',Apr:'04',May:'05',Jun:'06',
                     Jul:'07',Aug:'08',Sep:'09',Oct:'10',Nov:'11',Dec:'12' };
    const [, d, mon, yr] = dmyMatch;
    const month = months[mon] || '01';
    const year = yr.length === 2 ? (parseInt(yr) >= 50 ? '19' + yr : '20' + yr) : yr;
    return `${year}-${month}-${d.padStart(2, '0')}`;
  }

  return null;
}

/** Normalise website: add https:// if missing a scheme */
function normaliseWebsite(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (!s) return null;
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  // looks like a domain
  if (s.includes('.')) return 'https://' + s;
  return s;
}

/** Convert Airtable Type / LP / Strategic Partner flags → types array */
function buildTypesArray(typeField, lpField, strategicField, investorField) {
  const types = new Set();

  // Core type field (may be comma-separated)
  if (typeField) {
    const t = String(typeField).trim().toLowerCase();
    if (t) {
      t.split(',').forEach(x => {
        const clean = x.trim();
        if (clean) types.add(clean);
      });
    }
  }

  // LP flag: "true", "yes", "x", "checked", non-empty
  const lpTruthy = lpField && !['false', 'no', '0', ''].includes(String(lpField).trim().toLowerCase());
  if (lpTruthy) types.add('limited partner');

  // Strategic Partner flag
  const spTruthy = strategicField && !['false', 'no', '0', ''].includes(String(strategicField).trim().toLowerCase());
  if (spTruthy) types.add('strategic partner');

  // Investor field
  const invTruthy = investorField && !['false', 'no', '0', ''].includes(String(investorField).trim().toLowerCase());
  if (invTruthy) types.add('investor');

  return types.size > 0 ? Array.from(types) : null;
}

/** Derive a single primary type string from types array */
function primaryType(typesArr) {
  if (!typesArr || typesArr.length === 0) return 'other';
  const t = typesArr[0].toLowerCase();
  const valid = ['startup', 'lp', 'limited partner', 'investor', 'strategic partner',
                 'ecosystem_partner', 'fund', 'corporate', 'government', 'other'];
  return valid.includes(t) ? t : 'other';
}

/** Map Airtable Status → deal_status
 * DB check constraint values:
 * 'identified_introduced' | 'first_meeting' | 'discussion_in_process' |
 * 'due_diligence' | 'passed' | 'portfolio' | 'tracking_hold' | 'exited'
 */
function mapDealStatus(status) {
  if (!status) return null;
  const s = String(status).trim().toLowerCase();
  const map = {
    'identified/introduced': 'identified_introduced',
    'identified_introduced': 'identified_introduced',
    'first meeting': 'first_meeting',
    'first_meeting': 'first_meeting',
    'discussion in process': 'discussion_in_process',
    'discussion_in_process': 'discussion_in_process',
    'due diligence': 'due_diligence',
    'due_diligence': 'due_diligence',
    'passed': 'passed',
    'pass': 'passed',
    'portfolio': 'portfolio',
    'tracking/hold': 'tracking_hold',
    'tracking_hold': 'tracking_hold',
    'tracking / hold': 'tracking_hold',
    'exited': 'exited',
    // Airtable-specific values from CSV
    'active': 'discussion_in_process',
    'sourced': 'identified_introduced',
    'monitoring': 'tracking_hold',
  };
  return map[s] || null;
}

/** Map Airtable Stage (LP) → lp_stage */
function mapLpStage(stage) {
  if (!stage) return null;
  const s = String(stage).trim().toLowerCase();
  const map = {
    'target': 'target',
    'intro made': 'intro_made',
    'intro_made': 'intro_made',
    'meeting scheduled': 'meeting_scheduled',
    'meeting_scheduled': 'meeting_scheduled',
    'meeting done': 'meeting_done',
    'meeting_done': 'meeting_done',
    'materials sent': 'materials_sent',
    'materials_sent': 'materials_sent',
    'soft commit': 'soft_commit',
    'soft_commit': 'soft_commit',
    'committed': 'committed',
    'closed': 'closed',
    'passed': 'passed',
  };
  return map[s] || null;
}

// ── Map Companies CSV row → Supabase row ─────────────────────────────────────

function mapCompany(row) {
  const name = nullIfEmpty(row['Company']);
  if (!name) return null;

  // Website: prefer "Website" column, fall back to "Domain"
  const websiteRaw = nullIfEmpty(row['Website']) || nullIfEmpty(row['Domain']);
  const website = normaliseWebsite(websiteRaw);

  // Location: separate "Location (City)" and "Location (Country)" columns exist
  // Also a combined "Location" column — use the dedicated ones first
  let locationCity = nullIfEmpty(row['Location (City)']);
  let locationCountry = nullIfEmpty(row['Location (Country)']);
  // If dedicated columns are empty, try to parse combined "Location" col e.g. "Singapore, Singapore"
  if (!locationCity && !locationCountry) {
    const loc = nullIfEmpty(row['Location']);
    if (loc) {
      const parts = loc.split(',').map(p => p.trim());
      locationCity = parts[0] || null;
      locationCountry = parts[1] || null;
    }
  }

  const typesArr = buildTypesArray(
    row['Type'],
    row['LP'],
    row['Strategic Partner'],
    row['Investor']
  );

  const sector = nullIfEmpty(row['Sector']);
  const sectors = sector ? [sector] : null;

  const commitmentGoal = parseCurrency(row['Commitment (Goal)']);

  const lastMeeting = parseDate(row['Last Meeting']);
  const firstMeeting = parseDate(row['First Meeting']);
  const dateAdded = parseDate(row['Date Added']);

  const lpFlag = row['LP'] && !['false', 'no', '0', ''].includes(String(row['LP']).trim().toLowerCase());
  const spFlag = row['Strategic Partner'] && !['false', 'no', '0', ''].includes(String(row['Strategic Partner']).trim().toLowerCase());

  return {
    name,
    type: primaryType(typesArr),
    types: typesArr,
    description: nullIfEmpty(row['Company Description']),
    website,
    sectors,
    location_city: locationCity,
    location_country: locationCountry,
    priority: nullIfEmpty(row['Priority']),
    deal_status: mapDealStatus(row['Status']),
    lp_stage: mapLpStage(row['Stage (LP)']),
    commitment_goal: commitmentGoal,
    is_strategic_partner: spFlag ? true : null,
    last_meeting_date: lastMeeting,
    first_contact_date: dateAdded || firstMeeting,
    last_contact_date: lastMeeting,
    notes: nullIfEmpty(row['Notes']),
  };
}

/** Map Airtable contact Type → DB check constraint value
 * Valid: 'Advisor / KOL' | 'Ecosystem' | 'Employee' | 'Founder / Mgmt' |
 *        'Government/Academic' | 'Investor' | 'Lawyer' | 'Limited Partner' |
 *        'Other' | 'Strategic'
 */
// DB check constraint values (exact casing):
// 'Advisor / KOL'|'Ecosystem'|'Employee'|'Founder / Mgmt'|'Government/Academic'|'Investor'|'Lawyer'|'Limited Partner'|'Other'|'Strategic'
function mapContactType(typeVal) {
  if (!typeVal) return 'Other';
  const s = String(typeVal).trim().toLowerCase();
  const map = {
    'advisor / kol':       'Advisor / KOL',
    'advisor/kol':         'Advisor / KOL',
    'advisor':             'Advisor / KOL',
    'kol':                 'Advisor / KOL',
    'ecosystem':           'Ecosystem',
    'ecosystem_partner':   'Ecosystem',
    'employee':            'Employee',
    'founder / mgmt':      'Founder / Mgmt',
    'founder/mgmt':        'Founder / Mgmt',
    'founder':             'Founder / Mgmt',
    'government/academic': 'Government/Academic',
    'government':          'Government/Academic',
    'academic':            'Government/Academic',
    'investor':            'Investor',
    'fund_manager':        'Investor',
    'fund manager':        'Investor',
    'lawyer':              'Lawyer',
    'legal':               'Lawyer',
    'limited partner':     'Limited Partner',
    'lp':                  'Limited Partner',
    'strategic':           'Strategic',
    'strategic partner':   'Strategic',
    'other':               'Other',
    'corporate':           'Other',
  };
  return map[s] || 'Other';
}

// ── Map Contacts CSV row → Supabase row ──────────────────────────────────────

function mapContact(row) {
  // Use dedicated First Name / Last Name if present, else split Name
  let firstName = nullIfEmpty(row['First Name']);
  let lastName = nullIfEmpty(row['Last Name']);

  if (!firstName && !lastName) {
    const fullName = nullIfEmpty(row['Name']);
    if (!fullName) return null;
    const spaceIdx = fullName.indexOf(' ');
    if (spaceIdx === -1) {
      firstName = fullName;
      lastName = '';
    } else {
      firstName = fullName.substring(0, spaceIdx);
      lastName = fullName.substring(spaceIdx + 1);
    }
  }

  if (!firstName && !lastName) return null;

  const email = nullIfEmpty(row['Email']);

  // Job Titles: take first value if comma-separated
  const titleRaw = nullIfEmpty(row['Job Titles']);
  const title = titleRaw ? titleRaw.split(',')[0].trim() || null : null;

  // Last Meeting / Last Contact date
  const lastContact = parseDate(row['Last Meeting']) || parseDate(row['Last Contact']);

  // Phone: strip leading apostrophe Airtable sometimes adds
  const phoneRaw = nullIfEmpty(row['Phone Number']);
  const phone = phoneRaw ? phoneRaw.replace(/^'+/, '').trim() || null : null;

  return {
    first_name: firstName || '',
    last_name: lastName || '',
    email,
    phone,
    linkedin_url: nullIfEmpty(row['LinkedIn URL']),
    title,
    location_city: nullIfEmpty(row['Location (City)']),
    location_country: nullIfEmpty(row['Location (Country)']),
    notes: nullIfEmpty(row['Notes']),
    last_contact_date: lastContact,
    type: mapContactType(row['Type']),
    status: 'active',
    is_primary_contact: false,
  };
}

// ── Batch upsert helper ───────────────────────────────────────────────────────

async function upsertBatch(table, rows, conflictCol) {
  if (rows.length === 0) return { count: 0, errors: [] };
  const errors = [];

  const { error, count } = await supabase
    .from(table)
    .upsert(rows, {
      onConflict: conflictCol,
      ignoreDuplicates: false,
      count: 'exact',
    });

  if (error) {
    // Try row-by-row to isolate bad records
    let individualSuccess = 0;
    for (const row of rows) {
      const { error: rowErr } = await supabase
        .from(table)
        .upsert([row], { onConflict: conflictCol, ignoreDuplicates: false });
      if (rowErr) {
        errors.push({ row: row.name || row.email || JSON.stringify(row).slice(0, 80), error: rowErr.message });
      } else {
        individualSuccess++;
      }
    }
    return { count: individualSuccess, errors };
  }

  return { count: count ?? rows.length, errors };
}

// ── Insert contacts (no unique on email — dedup in memory first) ─────────────

async function insertContactBatch(rows) {
  if (rows.length === 0) return { count: 0, errors: [] };
  const errors = [];
  let inserted = 0;

  for (const row of rows) {
    const { error } = await supabase.from('contacts').insert([row]);
    if (error) {
      // Duplicate or constraint violation — try update if email matches
      if (row.email && (error.code === '23505' || error.message.includes('duplicate'))) {
        const { error: updErr } = await supabase
          .from('contacts')
          .update(row)
          .eq('email', row.email);
        if (updErr) {
          errors.push({ row: row.email || `${row.first_name} ${row.last_name}`, error: updErr.message });
        } else {
          inserted++;
        }
      } else {
        errors.push({ row: row.email || `${row.first_name} ${row.last_name}`, error: error.message });
      }
    } else {
      inserted++;
    }
  }

  return { count: inserted, errors };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Airtable → Supabase Import ===\n');

  // ── Companies ────────────────────────────────────────────────────────────
  console.log('Reading Companies.csv...');
  const companyRows = parseCSV(COMPANIES_CSV);
  console.log(`  Parsed ${companyRows.length} raw rows`);

  const companies = [];
  const companySkipped = [];
  const seenCompanyNames = new Set();

  for (const row of companyRows) {
    const mapped = mapCompany(row);
    if (!mapped) {
      companySkipped.push(row['Company'] || '(blank)');
      continue;
    }
    // Deduplicate by name before sending (CSV may have dupes)
    if (seenCompanyNames.has(mapped.name)) {
      companySkipped.push(`DUPE: ${mapped.name}`);
      continue;
    }
    seenCompanyNames.add(mapped.name);
    companies.push(mapped);
  }

  console.log(`  Mapped: ${companies.length} companies  |  Skipped: ${companySkipped.length}`);
  console.log('\nUpserting companies (batches of ' + BATCH_SIZE + ')...');

  let companyInserted = 0;
  const companyErrors = [];

  for (let i = 0; i < companies.length; i += BATCH_SIZE) {
    const batch = companies.slice(i, i + BATCH_SIZE);
    const { count, errors } = await upsertBatch('companies', batch, 'name');
    companyInserted += count;
    companyErrors.push(...errors);
    if ((i / BATCH_SIZE + 1) % 5 === 0 || i + BATCH_SIZE >= companies.length) {
      process.stdout.write(`  Progress: ${Math.min(i + BATCH_SIZE, companies.length)} / ${companies.length} processed, ${companyInserted} upserted\r\n`);
    }
  }

  // ── Contacts ─────────────────────────────────────────────────────────────
  console.log('\nReading Contacts.csv...');
  const contactRows = parseCSV(CONTACTS_CSV);
  console.log(`  Parsed ${contactRows.length} raw rows`);

  const contacts = [];
  const contactSkipped = [];
  const seenEmails = new Set();

  for (const row of contactRows) {
    // Skip if flagged Exclude or Delete
    const excluded = row['Exclude'] && !['', 'false', 'no', '0'].includes(String(row['Exclude']).trim().toLowerCase());
    const deleted  = row['Delete']  && !['', 'false', 'no', '0'].includes(String(row['Delete']).trim().toLowerCase());
    if (excluded || deleted) {
      contactSkipped.push((row['Name'] || row['Email'] || '') + ' (excluded/deleted)');
      continue;
    }

    const mapped = mapContact(row);
    if (!mapped) {
      contactSkipped.push(row['Name'] || row['Email'] || '(blank)');
      continue;
    }

    // Dedup by email if present
    if (mapped.email) {
      if (seenEmails.has(mapped.email.toLowerCase())) {
        contactSkipped.push(`DUPE email: ${mapped.email}`);
        continue;
      }
      seenEmails.add(mapped.email.toLowerCase());
    }

    contacts.push(mapped);
  }

  console.log(`  Mapped: ${contacts.length} contacts  |  Skipped: ${contactSkipped.length}`);
  console.log('\nInserting contacts in batches of ' + BATCH_SIZE + '...');

  let contactInserted = 0;
  const contactErrors = [];

  // For contacts we batch-insert but fall back to row-by-row on error
  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);

    // Try bulk insert first
    const { error } = await supabase.from('contacts').insert(batch);
    if (!error) {
      contactInserted += batch.length;
    } else {
      // Log first batch error so we can diagnose
      if (contactErrors.length === 0) {
        console.error('\n  First batch error:', JSON.stringify(error));
      }
      // Fall back to row-by-row
      const { count, errors } = await insertContactBatch(batch);
      contactInserted += count;
      contactErrors.push(...errors);
    }

    if ((i / BATCH_SIZE + 1) % 5 === 0 || i + BATCH_SIZE >= contacts.length) {
      process.stdout.write(`  Progress: ${Math.min(i + BATCH_SIZE, contacts.length)} / ${contacts.length} processed, ${contactInserted} inserted\r\n`);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════');
  console.log('SUMMARY');
  console.log('════════════════════════════════════');
  console.log(`Companies:`);
  console.log(`  Upserted:  ${companyInserted}`);
  console.log(`  Skipped:   ${companySkipped.length}`);
  console.log(`  Errors:    ${companyErrors.length}`);
  console.log(`Contacts:`);
  console.log(`  Inserted:  ${contactInserted}`);
  console.log(`  Skipped:   ${contactSkipped.length}`);
  console.log(`  Errors:    ${contactErrors.length}`);

  if (companyErrors.length > 0) {
    console.log('\nCompany errors (first 20):');
    companyErrors.slice(0, 20).forEach(e => console.log(`  [${e.row}] ${e.error}`));
  }
  if (contactErrors.length > 0) {
    console.log('\nContact errors (first 20):');
    contactErrors.slice(0, 20).forEach(e => console.log(`  [${e.row}] ${e.error}`));
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
