// extract-unique-values.js
// Parses CSVs with a hand-rolled parser that handles:
//   - quoted fields containing commas
//   - quoted fields containing embedded newlines
//   - semicolon-separated multi-values inside a single cell

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Minimal RFC-4180 CSV parser
// ---------------------------------------------------------------------------
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  // Normalise line endings
  text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          // Escaped quote
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        row.push(field);
        field = '';
        i++;
      } else if (ch === '\n') {
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Last field / row
  if (field || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Helper: collect unique non-empty values for a column index
// Handles cells that contain semicolon-separated lists
// ---------------------------------------------------------------------------
function uniqueValues(rows, colIndex, startRow = 1) {
  const seen = new Set();
  for (let r = startRow; r < rows.length; r++) {
    const cell = (rows[r][colIndex] || '').trim();
    if (!cell) continue;
    // Some cells contain semicolon-separated multi-values
    const parts = cell.split(/[;|]/).map(s => s.trim()).filter(Boolean);
    for (const p of parts) seen.add(p);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

// ---------------------------------------------------------------------------
// Helper: print a section
// ---------------------------------------------------------------------------
function printSection(label, values) {
  console.log(`\n=== ${label} ===`);
  if (values.length === 0) {
    console.log('  (no values found)');
  } else {
    values.forEach(v => console.log(`  • ${v}`));
  }
}

// ---------------------------------------------------------------------------
// COMPANIES.CSV
// ---------------------------------------------------------------------------
const companiesPath = path.join(__dirname, '..', 'Airtable', 'Companies.csv');
const companiesText = fs.readFileSync(companiesPath, 'utf8');
const companiesRows = parseCSV(companiesText);
const companiesHeaders = companiesRows[0];

console.log('='.repeat(60));
console.log('COMPANIES.CSV');
console.log('='.repeat(60));
console.log(`Total rows (incl. header): ${companiesRows.length}`);
console.log(`Total columns: ${companiesHeaders.length}`);

// Print all headers with their indices so we can verify the right columns
console.log('\n--- Headers ---');
companiesHeaders.forEach((h, i) => console.log(`  [${i}] ${h}`));

// Columns requested
const companyCols = [
  { index: 8,  label: 'Type (col I, index 8)' },
  { index: 9,  label: 'Status (col J, index 9)' },
  { index: 11, label: 'Sector (col L, index 11)' },
  { index: 12, label: 'Sub-sector (col M, index 12)' },
  { index: 13, label: 'Investment Round (col N, index 13)' },
  { index: 14, label: 'Current Round (col O, index 14)' },
  { index: 15, label: 'Priority (col P, index 15)' },
  { index: 16, label: 'Location (col Q, index 16)' },
  { index: 48, label: 'Stage (LP) (col AW, index 48)' },
  { index: 49, label: 'Investment Stage (col AX, index 49)' },
];

for (const col of companyCols) {
  const headerName = companiesHeaders[col.index] || '(missing)';
  const vals = uniqueValues(companiesRows, col.index);
  printSection(`${col.label} → header: "${headerName}"`, vals);
}

// ---------------------------------------------------------------------------
// CONTACTS.CSV
// ---------------------------------------------------------------------------
const contactsPath = path.join(__dirname, '..', 'Airtable', 'Contacts.csv');
const contactsText = fs.readFileSync(contactsPath, 'utf8');
const contactsRows = parseCSV(contactsText);
const contactsHeaders = contactsRows[0];

console.log('\n\n' + '='.repeat(60));
console.log('CONTACTS.CSV');
console.log('='.repeat(60));
console.log(`Total rows (incl. header): ${contactsRows.length}`);
console.log(`Total columns: ${contactsHeaders.length}`);

console.log('\n--- Headers ---');
contactsHeaders.forEach((h, i) => console.log(`  [${i}] ${h}`));

// For Contacts, auto-detect categorical columns:
// A column is "categorical" if it has ≤ 30 unique non-empty values AND
// the average value length is ≤ 40 characters
console.log('\n--- Categorical columns (auto-detected) ---');

// Also always include columns whose name hints at category
const categoricalKeywords = /type|status|stage|role|category|sector|priority|source|round|tier|tag|relationship|level|class|group|fund/i;

for (let c = 0; c < contactsHeaders.length; c++) {
  const header = contactsHeaders[c];
  const vals = uniqueValues(contactsRows, c);
  if (vals.length === 0) continue;

  const avgLen = vals.reduce((sum, v) => sum + v.length, 0) / vals.length;
  const isCategorical = (vals.length <= 30 && avgLen <= 60) || categoricalKeywords.test(header);

  if (isCategorical) {
    printSection(`[${c}] ${header}`, vals);
  }
}

console.log('\n\nDone.');
