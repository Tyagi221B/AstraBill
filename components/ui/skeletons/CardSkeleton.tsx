/**
 * CardSkeleton — matches the live Card primitive's exact frame:
 *   - rounded-card border + same shadow-sm
 *   - px-6 pt-6 pb-6 padding
 *   - Inside: a header (title + subtitle) and 3 body lines by default
 *
 * `lines` controls the body row count when the real content is a list
 * inside a card (e.g. recent invoices, top customers).
 */
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface CardSkeletonProps {
  /** Number of body rows. Defaults to 3 — matches a typical short list. */
  lines?: number;
  /** Hide the header (title + subtitle). Use when the card is body-only. */
  noHeader?: boolean;
  className?: string;
}

export function CardSkeleton({
  lines = 3,
  noHeader = false,
  className,
}: CardSkeletonProps) {
  return (
    <Card className={className}>
      <CardContent className="pt-6">
        {!noHeader && (
          <div className="mb-4 flex flex-col gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
        )}
        <div className="flex flex-col gap-3">
          {Array.from({ length: lines }, (_, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center justify-between",
                i > 0 && "border-t border-border pt-3",
              )}
            >
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
