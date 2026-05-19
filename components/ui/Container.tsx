/**
 * Horizontal page gutter + max width. One knob for page width across the
 * marketing site. Uses cn() so a caller's `max-w-*` reliably wins over the
 * default (tailwind-merge resolves the conflict).
 */
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-5 sm:px-8", className)}>
      {children}
    </div>
  );
}
