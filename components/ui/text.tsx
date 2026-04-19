import * as React from "react";
import { twMerge } from "tailwind-merge";

// ── Type map — each variant maps to an element tag and a Tailwind class ───────

const TEXT_VARIANTS = {
  display: { tag: "p",    cls: "text-display text-ink-900" },
  h1:      { tag: "h1",   cls: "text-h1 text-ink-900" },
  h2:      { tag: "h2",   cls: "text-h2 text-ink-900" },
  h3:      { tag: "h3",   cls: "text-h3 text-ink-900" },
  lead:    { tag: "p",    cls: "text-lead text-ink-700" },
  body:    { tag: "p",    cls: "text-body text-ink-700" },
  caption: { tag: "span", cls: "text-caption text-ink-500" },
} as const;

type TextVariant = keyof typeof TEXT_VARIANTS;

// ── Props ─────────────────────────────────────────────────────────────────────

interface TextProps extends React.HTMLAttributes<HTMLElement> {
  as?: TextVariant;
  /** Override the rendered HTML element independently of the visual variant */
  tag?: keyof React.JSX.IntrinsicElements;
}

// ── Component ─────────────────────────────────────────────────────────────────

function Text({ as = "body", tag, className, children, ...props }: TextProps) {
  const { tag: defaultTag, cls } = TEXT_VARIANTS[as];
  const Tag = (tag ?? defaultTag) as React.ElementType;

  return (
    <Tag className={twMerge(cls, className)} {...props}>
      {children}
    </Tag>
  );
}

export { Text };
export type { TextVariant };
