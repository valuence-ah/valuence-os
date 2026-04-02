-- Drop the restrictive lp_type CHECK constraint so display labels can be stored freely.
-- The dropdown in the UI already controls valid values ("Family Office", "Fund of Fund", etc.)
ALTER TABLE companies DROP CONSTRAINT IF EXISTS companies_lp_type_check;
