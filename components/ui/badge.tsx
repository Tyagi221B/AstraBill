import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Status pills — soft tinted "Stripe-style" tone, never saturated solids.
 *
 * Phase 2.6 refactor: each tone is now wired through the semantic colour
 * tokens from globals.css (`--success`, `--success-soft`, etc.) instead
 * of raw Tailwind palette classes. The visual result is the same family
 * of colours we had before, but every future theme tweak flows through
 * the design tokens — no more hunting for `bg-green-50 dark:bg-green-500/15`
 * pairs scattered across the codebase.
 *
 * Tone semantics — keep these straight when picking a tone:
 *   - neutral      gray — counts, generic labels
 *   - info         blue — informational, "default" badges, partial progress
 *   - primary      indigo — primary brand action chips (rare; usually neutral)
 *   - success      emerald — paid, completed, delivered
 *   - warning      amber — unpaid, partial-paid, low-stock, due-soon, OUTSTANDING
 *   - destructive  red — cancelled, voided, overdue, failed
 *   - outline      hairline only — labels that need to read on top of tinted bgs
 */
const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide whitespace-nowrap transition-colors",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-muted-foreground",
        info: "bg-info-soft text-info",
        primary: "bg-primary/10 text-primary dark:bg-primary/20",
        success: "bg-success-soft text-success",
        warning: "bg-warning-soft text-warning",
        destructive: "bg-danger-soft text-danger",
        outline: "border border-border bg-transparent text-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ tone }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
