"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { twMerge } from "tailwind-merge";

// ── Variant definitions ───────────────────────────────────────────────────────

const buttonVariants = cva(
  // Base styles applied to every button
  [
    "inline-flex items-center justify-center gap-2 rounded-md font-medium",
    "transition-colors duration-150 cursor-pointer select-none",
    "disabled:opacity-50 disabled:pointer-events-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-teal",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-brand-teal text-white hover:bg-brand-tealDark active:bg-brand-tealDark",
        secondary:
          "bg-white text-brand-teal border border-brand-teal hover:bg-brand-tealTint active:bg-brand-tealTint",
        ghost:
          "text-ink-900 hover:bg-slate-100 active:bg-slate-200",
        destructive:
          "bg-danger text-white hover:bg-red-700 active:bg-red-800",
        link:
          "text-link underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-4 text-[14px]",
        lg: "h-12 px-6 text-[15px]",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render a different element while keeping button styles (e.g. Next.js <Link>) */
  asChild?: boolean;
  isLoading?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, isLoading, children, disabled, ...props },
    ref
  ) => {
    return (
      <button
        ref={ref}
        className={twMerge(buttonVariants({ variant, size }), className)}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading && (
          <svg
            className="animate-spin h-4 w-4 shrink-0"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };
