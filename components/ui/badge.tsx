import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Invoice and status pills. The `tone` variants map to the invoice status set
 * so a row in `app/invoices/page.tsx` can write `<Badge tone="paid">PAID</Badge>`
 * without re-deriving colours. Tailwind named-colour utilities keep light + dark
 * in lockstep without a second token block.
 */
const badgeVariants = cva(
  "inline-flex items-center justify-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide whitespace-nowrap transition-colors",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-muted-foreground",
        info: "bg-blue-600 text-white dark:bg-blue-500",
        primary: "bg-primary text-primary-foreground",
        success: "bg-green-600 text-white dark:bg-green-500",
        warning: "bg-amber-500 text-white dark:bg-amber-400 dark:text-black",
        destructive: "bg-destructive text-destructive-foreground",
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
