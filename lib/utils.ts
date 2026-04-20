// ─── Utility helpers used throughout the app ─────────────────────────────────

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Merges Tailwind class names safely (avoids conflicts)
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Format a number as USD currency
export function formatCurrency(value: number | null | undefined, compact = false): string {
  if (value == null) return "—";
  if (compact) {
    if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value}`;
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

// Format a date string as "Mar 15, 2025"
// timeZone: "UTC" ensures server and client render identically (no hydration mismatch)
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

// Format a date as relative time ("2 days ago")
export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(dateStr);
}

// Human-readable deal stage labels
export const DEAL_STAGE_LABELS: Record<string, string> = {
  sourced: "Sourced",
  first_meeting: "First Meeting",
  deep_dive: "Deep Dive",
  ic_memo: "IC Memo",
  term_sheet: "Term Sheet",
  due_diligence: "Due Diligence",
  closed: "Closed",
  passed: "Passed",
  // Active pipeline statuses
  identified_introduced: "Identified / Introduced",
  discussion_in_process: "Discussion in Process",
  tracking_hold: "Tracking / Hold",
  portfolio: "Portfolio",
  exited: "Exited",
  identified: "Identified",
  discussion: "Discussion",
};

// Human-readable LP stage labels
export const LP_STAGE_LABELS: Record<string, string> = {
  target: "Target",
  intro_made: "Intro Made",
  meeting_scheduled: "Meeting Scheduled",
  meeting_done: "Meeting Done",
  materials_sent: "Materials Sent",
  soft_commit: "Soft Commit",
  committed: "Committed",
  closed: "Closed",
  passed: "Passed",
};

// Color mappings for badges
export const DEAL_STAGE_COLORS: Record<string, string> = {
  sourced: "bg-slate-100 text-slate-700",
  first_meeting: "bg-blue-100 text-blue-700",
  deep_dive: "bg-violet-100 text-violet-700",
  ic_memo: "bg-orange-100 text-orange-700",
  term_sheet: "bg-yellow-100 text-yellow-700",
  due_diligence: "bg-amber-100 text-amber-700",
  closed: "bg-green-100 text-green-700",
  passed: "bg-red-100 text-red-600",
  // Active pipeline statuses
  identified_introduced: "bg-slate-100 text-slate-500",
  identified: "bg-slate-100 text-slate-500",
  discussion_in_process: "bg-blue-100 text-blue-700",
  discussion: "bg-blue-100 text-blue-700",
  tracking_hold: "bg-amber-100 text-amber-700",
  portfolio: "bg-emerald-100 text-emerald-700",
  exited: "bg-gray-100 text-gray-500",
};

export const LP_STAGE_COLORS: Record<string, string> = {
  target: "bg-slate-100 text-slate-700",
  intro_made: "bg-blue-100 text-blue-700",
  meeting_scheduled: "bg-cyan-100 text-cyan-700",
  meeting_done: "bg-violet-100 text-violet-700",
  materials_sent: "bg-orange-100 text-orange-700",
  soft_commit: "bg-yellow-100 text-yellow-700",
  committed: "bg-emerald-100 text-emerald-700",
  closed: "bg-green-100 text-green-700",
  passed: "bg-red-100 text-red-600",
};

export const COMPANY_TYPE_COLORS: Record<string, string> = {
  startup: "bg-blue-100 text-blue-700",
  lp: "bg-purple-100 text-purple-700",
  corporate: "bg-orange-100 text-orange-700",
  ecosystem_partner: "bg-teal-100 text-teal-700",
  fund: "bg-indigo-100 text-indigo-700",
  government: "bg-gray-100 text-gray-700",
};

// Format a snake_case DB type value into a human-readable label
// e.g. "ecosystem_partner" → "Ecosystem Partner", "fund_manager" → "Fund Manager"
export function formatType(raw: string | null | undefined): string {
  if (!raw) return "—";
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

// Truncate long strings
export function truncate(str: string | null | undefined, maxLen = 60): string {
  if (!str) return "";
  return str.length > maxLen ? str.slice(0, maxLen) + "…" : str;
}

// Get initials from a name (e.g. "John Doe" → "JD")
export function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
}
