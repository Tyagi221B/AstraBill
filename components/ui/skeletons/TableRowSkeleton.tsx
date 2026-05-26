/**
 * TableRowSkeleton — list-page rows (parties, items, documents, payments).
 *
 * Renders `count` rows inside a Card, separated by `border-t` so they
 * read as a real table without us needing a full `<table>` element for
 * the placeholder. Each row carries:
 *   - Left: a primary label (~40% width)
 *   - Center: a secondary label (~25% width)
 *   - Right: a small badge / amount (~15% width)
 *
 * Widths shift slightly row-to-row so the column doesn't read as a
 * mechanical bar chart. The variance is deterministic (mod N) so SSR
 * and hydration produce the same HTML — no hydration warnings.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface TableRowSkeletonProps {
  /** Number of rows. Default 5 — matches the average list-page first paint. */
  count?: number;
  /** Wrap in a Card. Default true; pass false if the caller owns the frame. */
  card?: boolean;
  className?: string;
}

// Deterministic width variance — index → tailwind class.
const PRIMARY_WIDTHS = ["w-44", "w-36", "w-48", "w-32", "w-40"];
const SECONDARY_WIDTHS = ["w-24", "w-32", "w-20", "w-28", "w-24"];

export function TableRowSkeleton({
  count = 5,
  card = true,
  className,
}: TableRowSkeletonProps) {
  const rows = (
    <div className="flex flex-col">
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={cn(
            "flex items-center justify-between gap-4 py-3",
            i > 0 && "border-t border-border",
          )}
        >
          <Skeleton
            className={cn("h-4 shrink-0", PRIMARY_WIDTHS[i % PRIMARY_WIDTHS.length])}
          />
          <Skeleton
            className={cn(
              "h-3 hidden sm:block",
              SECONDARY_WIDTHS[i % SECONDARY_WIDTHS.length],
            )}
          />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );

  if (!card) return <div className={className}>{rows}</div>;

  return (
    <Card className={className}>
      <CardContent className="pt-6">{rows}</CardContent>
    </Card>
  );
}
