// Run once: npx tsx scripts/migrate-company-types.ts
// Remaps legacy company type values to new canonical values.

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://gtffgjcffugnjuviglya.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZmZnamNmZnVnbmp1dmlnbHlhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzgxMDE0MiwiZXhwIjoyMDg5Mzg2MTQyfQ.4G76PvVYHwPeJGhe90bCl8T0WMh4zjMS0SOs-MhV8T4"
);

async function run() {
  const remaps: Array<{ from: string; to: string }> = [
    { from: "investor",         to: "fund" },
    { from: "limited partner",  to: "lp" },
    { from: "strategic partner",to: "corporate" },
  ];

  for (const { from, to } of remaps) {
    // Update `type` column
    const { data: updated, error: typeErr } = await supabase
      .from("companies")
      .update({ type: to })
      .eq("type", from)
      .select("id");
    if (typeErr) console.error(`type ${from}→${to}:`, typeErr.message);
    else console.log(`type: ${from} → ${to} (${(updated ?? []).length} rows)`);

    // Fetch rows where the `types` array contains the old value
    const { data: rows, error: fetchErr } = await supabase
      .from("companies")
      .select("id, types")
      .contains("types", [from]);
    if (fetchErr) { console.error(`fetch types ${from}:`, fetchErr.message); continue; }

    for (const row of rows ?? []) {
      const updated = (row.types as string[]).map((t: string) => t === from ? to : t);
      await supabase.from("companies").update({ types: updated }).eq("id", row.id);
    }
    console.log(`types[]: ${from} → ${to} (${(rows ?? []).length} rows)`);
  }

  // Print final distribution
  const { data } = await supabase.from("companies").select("type");
  const dist: Record<string, number> = {};
  for (const row of data ?? []) dist[row.type] = (dist[row.type] ?? 0) + 1;
  console.log("\nFinal type distribution:", dist);
}

run().catch(console.error);
