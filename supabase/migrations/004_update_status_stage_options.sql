-- ─── Migration 004: Align deal_status and stage with Excel values ─────────────

-- 1. Drop old deal_status CHECK constraint
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_deal_status_check;

-- 2. Map old DB values → new Excel-matching values
UPDATE companies SET deal_status = 'identified_introduced' WHERE deal_status = 'sourced';
UPDATE companies SET deal_status = 'tracking_hold'         WHERE deal_status = 'monitoring';
UPDATE companies SET deal_status = 'discussion_in_process' WHERE deal_status = 'active_deal';
-- 'passed' and 'portfolio' stay the same
-- 'exited' kept as-is (valid edge case)

-- 3. Add new constraint with updated values
ALTER TABLE companies ADD CONSTRAINT companies_deal_status_check
  CHECK (deal_status IN (
    'identified_introduced',
    'first_meeting',
    'discussion_in_process',
    'due_diligence',
    'passed',
    'portfolio',
    'tracking_hold',
    'exited'
  ));

-- 4. Update stage values to match Excel Investment Round column
UPDATE companies SET stage = 'Pre-Seed'       WHERE LOWER(stage) IN ('pre-seed','pre_seed','preseed');
UPDATE companies SET stage = 'Pre-A'          WHERE LOWER(stage) IN ('pre-a','pre_a','prea');
UPDATE companies SET stage = 'Seed'           WHERE LOWER(stage) IN ('seed');
UPDATE companies SET stage = 'Seed Extension' WHERE LOWER(stage) IN ('seed extension','seed_extension');
UPDATE companies SET stage = 'Series A'       WHERE LOWER(stage) IN ('series a','series_a');
UPDATE companies SET stage = 'Series B'       WHERE LOWER(stage) IN ('series b','series_b');
UPDATE companies SET stage = 'Series C'       WHERE LOWER(stage) IN ('series c','series_c');
UPDATE companies SET stage = 'Growth'         WHERE LOWER(stage) IN ('growth');
