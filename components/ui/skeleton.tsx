/**
 * Skeleton — a soft placeholder for content that's loading.
 *
 * Phase 2.0 upgrade: default animation is now `shimmer` — a deliberate
 * horizontal sweep that reads as "the system is working" without the
 * generic Bootstrap-style pulse. The `pulse` variant is kept for cases
 * where a quieter fade-in/out is the right choice (e.g. inside a tooltip
 * or a fast inline state).
 *
 * Skeletons MUST match the dimensions of the content they replace —
 * otherwise the page reflows when content arrives and CLS spikes.
 * The recipes under `components/ui/skeletons/` cover the common shapes
 * (Card, TableRow, FormField, KpiTile, Avatar, PageHeader, ListItem);
 * reach for those before composing a one-off here.
 *
 * Both animations respect `prefers-reduced-motion` — they freeze on the
 * base muted color (see globals.css).
 */
import * as React from "react";

import { cn } from "@/lib/utils";

export type SkeletonVariant = "shimmer" | "pulse";

export function Skeleton({
  variant = "shimmer",
  className,
  ...props
}: React.ComponentProps<"div"> & { variant?: SkeletonVariant }) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn(
        "rounded-md bg-muted",
        variant === "shimmer" ? "animate-shimmer" : "animate-pulse",
        className,
      )}
      {...props}
    />
  );
}
