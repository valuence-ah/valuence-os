// ─── Shared constants ────────────────────────────────────────────────────────
// Single source of truth for type/sector values used across admin + CRM forms.

export const COMPANY_TYPE_OPTIONS = [
  { value: "startup",            label: "Startup" },
  { value: "fund",               label: "Investor / Fund" },
  { value: "lp",                 label: "LP" },
  { value: "corporate",          label: "Corporate" },
  { value: "ecosystem_partner",  label: "Ecosystem Partner" },
  { value: "government",         label: "Government / Academic" },
  { value: "other",              label: "Other" },
] as const;

export const INVESTOR_TYPE_OPTIONS = [
  { value: "VC",              label: "VC" },
  { value: "Angel",           label: "Angel" },
  { value: "CVC",             label: "Corporate VC" },
  { value: "Family Office",   label: "Family Office" },
  { value: "Fund of Funds",   label: "Fund of Funds" },
  { value: "PE",              label: "Private Equity" },
  { value: "Other",           label: "Other" },
] as const;

export const STRATEGIC_TYPE_OPTIONS = [
  { value: "Customer",            label: "Customer" },
  { value: "Partner",             label: "Partner" },
  { value: "Supplier",            label: "Supplier" },
  { value: "Distributor",         label: "Distributor" },
  { value: "Potential Acquirer",  label: "Potential Acquirer" },
  { value: "Other",               label: "Other" },
] as const;

export const LP_TYPE_OPTIONS = [
  { value: "Family Office",    label: "Family Office" },
  { value: "Institutional",    label: "Institutional" },
  { value: "HNWI",             label: "HNWI" },
  { value: "Corporate",        label: "Corporate" },
  { value: "Endowment",        label: "Endowment" },
  { value: "Sovereign Wealth", label: "Sovereign Wealth" },
  { value: "Other",            label: "Other" },
] as const;

export const SECTOR_OPTIONS = [
  "Cleantech",
  "Techbio",
  "Other",
] as const;

/** Normalize sector strings for consistent DB storage */
export function normalizeSector(s: string): string {
  const lower = s.trim().toLowerCase();
  // Biotech / synthetic bio variants → Techbio
  if (
    lower === "biotech" ||
    lower === "techbio" ||
    lower === "synthetic bio / biotech" ||
    lower === "synthetic bio/biotech" ||
    lower === "synthetic bio" ||
    lower === "bio" ||
    lower === "techbio / biotech"
  ) return "Techbio";
  // Cleantech variants
  if (lower === "cleantech" || lower === "clean tech" || lower === "ct") return "Cleantech";
  // Everything else → Other (if not already a known value)
  if (lower === "other") return "Other";
  // Unknown sectors → Other
  return "Other";
}

/** Format snake_case deal status to Title Case for display */
export function formatDealStatus(status: string | null | undefined): string {
  if (!status) return "";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
