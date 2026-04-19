"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { twMerge } from "tailwind-merge";

// ── Variant definitions ───────────────────────────────────────────────────────

const iconButtonVariants = cva(
  [
    "inline-flex items-center justify-center rounded-md",
    "transition-colors duration-150 cursor-pointer select-none",
    "disabled:opacity-50 disabled:pointer-events-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-teal",
  ],
  {
    variants: {
      variant: {
        ghost:       "text-ink-700 hover:bg-slate-100 active:bg-slate-200",
        primary:     "bg-brand-teal text-white hover:bg-brand-tealDark",
        destructive: "text-danger hover:bg-red-50 active:bg-red-100",
      },
      size: {
        sm: "h-7 w-7",
        md: "h-9 w-9",
        lg: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "ghost",
      size: "md",
    },
  }
);

// ── Types ─────────────────────────────────────────────────────────────────────
// aria-label is REQUIRED — icon-only buttons must always be labelled.

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {
  /** Accessible label — required, no default */
  "aria-label": string;
}

// ── Component ─────────────────────────────────────────────────────────────────

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        className={twMerge(iconButtonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);

IconButton.displayName = "IconButton";

export { IconButton, iconButtonVariants };
