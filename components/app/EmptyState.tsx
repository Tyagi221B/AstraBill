/**
 * EmptyState — the "nothing here yet" surface used across list/detail pages.
 *
 * Replaces the bland one-line "No customers yet" placeholder with a real
 * surface: a soft icon tile, a one-line headline, a sub-line of helper copy,
 * and one CTA. Phase 2E polish — empty states are the first-time-user's
 * second touchpoint after sign-up, and "no data" is most of what they see
 * for the first hour.
 *
 * Renders inside a `<Card>` so it inherits the warm-paper-on-page elevation
 * and lines up with whatever surrounds it.
 */
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Card, CardContent } from "@/components/ui/card";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
        <div
          aria-hidden
          className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="max-w-sm text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {action && <div className="mt-1">{action}</div>}
      </CardContent>
    </Card>
  );
}
