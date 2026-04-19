import * as React from "react";
import { twMerge } from "tailwind-merge";
import { Button, type ButtonProps } from "@/components/ui/button";

// ── Types ─────────────────────────────────────────────────────────────────────

interface EmptyStateAction extends Omit<ButtonProps, "children"> {
  label: string;
}

interface EmptyStateProps {
  /** A lucide-react icon element, e.g. <Inbox className="h-8 w-8" /> */
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  className?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  const { label, ...actionProps } = action ?? { label: "" };

  return (
    <div
      className={twMerge(
        "flex flex-col items-center justify-center gap-3 py-16 px-6 text-center",
        className
      )}
    >
      {icon && (
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-brand-tealTint text-brand-teal">
          {icon}
        </div>
      )}

      <div className="space-y-1 max-w-xs">
        <p className="text-h3 text-ink-900">{title}</p>
        {description && (
          <p className="text-body text-ink-500">{description}</p>
        )}
      </div>

      {action && (
        <Button variant="primary" size="md" {...actionProps}>
          {label}
        </Button>
      )}
    </div>
  );
}

export { EmptyState };
export type { EmptyStateProps };
