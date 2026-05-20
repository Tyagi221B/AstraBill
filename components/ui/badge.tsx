import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Status pills. Phase 2E moves these from saturated solids ("bg-blue-600
 * text-white") to soft-tinted Stripe-style pills ("bg-blue-50
 * text-blue-700"). The previous loudness only worked against pure white;
 * against the warm-paper page the solids read as hardware-store stickers.
 *
 * Soft pills inform without shouting — they sit calmly on the warm paper.
 * Dark mode uses a subtle tinted background (10-20% opacity) with the
 * tinted text bumped lighter for contrast.
 */
const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide whitespace-nowrap transition-colors",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-muted-foreground",
        info: "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
        primary: "bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary",
        success: "bg-green-50 text-green-700 dark:bg-green-500/15 dark:text-green-300",
        warning: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
        destructive: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
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
