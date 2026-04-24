// Run once: npx tsx scripts/fix-haiku-model.ts
// Updates any stored AI config using claude-haiku-4-6 → claude-haiku-3-5

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://gtffgjcffugnjuviglya.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd0ZmZnamNmZnVnbmp1dmlnbHlhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzgxMDE0MiwiZXhwIjoyMDg5Mzg2MTQyfQ.4G76PvVYHwPeJGhe90bCl8T0WMh4zjMS0SOs-MhV8T4"
);

async function run() {
  const { data, error } = await supabase
    .from("ai_config")
    .update({ model: "claude-haiku-3-5" })
    .eq("model", "claude-haiku-4-6")
    .select("id, key");

  if (error) {
    console.error("Error:", error.message);
  } else {
    console.log(`Updated ${data?.length ?? 0} ai_config rows:`, data?.map(r => r.key));
  }
}

run().catch(console.error);
