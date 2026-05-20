/**
 * Skeleton — a soft pulsing placeholder for content that's loading.
 *
 * Phase 2E Step 3 polish. Replaces the blank-flash → content jump on
 * server-component pages with a quiet "something is coming" surface.
 *
 * Uses the same `muted` token as cards and pills so the placeholder reads
 * as part of the warm-paper family, not as a foreign loading widget.
 */
import * as React from "react";

import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}
