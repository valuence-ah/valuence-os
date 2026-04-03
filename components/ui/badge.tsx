// ─── Badge / pill component ────────────────────────────────────────────────────
// Centralised pill with consistent color variants.
// Usage:  <Badge variant="teal">Seed</Badge>
//         <Badge variant={getStageBadgeVariant("due_diligence")}>Due Diligence</Badge>

import { cn } from "@/lib/utils";

export type BadgeVariant =
  | "teal"
  | "blue"
  | "sky"
  | "violet"
  | "purple"
  | "amber"
  | "orange"
  | "red"
  | "emerald"
  | "green"
  | "slate"
  | "pink"
  | "cyan"
  | "default";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  teal:    "bg-teal-100   text-teal-700",
  blue:    "bg-blue-100   text-blue-700",
  sky:     "bg-sky-100    text-sky-700",
  violet:  "bg-violet-100 text-violet-700",
  purple:  "bg-purple-100 text-purple-700",
  amber:   "bg-amber-100  text-amber-700",
  orange:  "bg-orange-100 text-orange-600",
  red:     "bg-red-100    text-red-600",
  emerald: "bg-emerald-100 text-emerald-700",
  green:   "bg-green-100  text-green-700",
  slate:   "bg-slate-100  text-slate-600",
  pink:    "bg-pink-100   text-pink-600",
  cyan:    "bg-cyan-100   text-cyan-700",
  default: "bg-slate-100  text-slate-600",
};

interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}

export function Badge({ variant = "default", className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        VARIANT_CLASSES[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

// ── Deal stage → badge variant ─────────────────────────────────────────────────
export function getStageBadgeVariant(stage: string | null | undefined): BadgeVariant {
  switch (stage) {
    case "sourced":
    case "identified_introduced":
      return "slate";
    case "first_meeting":
      return "sky";
    case "deep_dive":
    case "discussion_in_process":
      return "blue";
    case "tracking_hold":
      return "amber";
    case "ic_memo":
      return "violet";
    case "term_sheet":
      return "purple";
    case "due_diligence":
      return "violet";
    case "closed":
    case "portfolio":
      return "emerald";
    case "passed":
      return "red";
    case "monitoring":
      return "teal";
    case "exited":
      return "green";
    default:
      return "default";
  }
}

// ── LP stage → badge variant ───────────────────────────────────────────────────
export function getLpStageBadgeVariant(stage: string | null | undefined): BadgeVariant {
  switch (stage) {
    case "target":       return "slate";
    case "intro_made":   return "sky";
    case "meeting_scheduled":
    case "meeting_done": return "blue";
    case "materials_sent": return "amber";
    case "soft_commit":  return "violet";
    case "committed":    return "emerald";
    case "closed":       return "teal";
    case "passed":       return "red";
    default:             return "default";
  }
}

// ── Company type → badge variant ──────────────────────────────────────────────
export function getTypeBadgeVariant(type: string | null | undefined): BadgeVariant {
  switch ((type ?? "").toLowerCase()) {
    case "startup":           return "blue";
    case "fund":
    case "investor":          return "violet";
    case "lp":
    case "limited partner":   return "teal";
    case "strategic partner":
    case "ecosystem_partner": return "cyan";
    case "corporate":         return "orange";
    case "government":        return "slate";
    default:                  return "default";
  }
}
