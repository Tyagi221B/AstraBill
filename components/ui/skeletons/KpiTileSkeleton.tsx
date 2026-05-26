/**
 * KpiTileSkeleton — the dashboard's KPI cards (Outstanding ₹, Paid this
 * month, Revenue this month, etc.).
 *
 * Three-line stack inside a Card:
 *   - Small label (uppercase tracking)
 *   - Large number
 *   - Subtle caption (delta or hint)
 *
 * Widths are deliberately varied so a row of tiles doesn't read as a
 * mechanical grid of identical bars.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function KpiTileSkeleton({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="pt-6">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-7 w-32" />
        <Skeleton className="mt-2 h-3 w-20" />
      </CardContent>
    </Card>
  );
}

/** Renders `count` KPI tiles in the same grid the dashboard uses. */
export function KpiTileSkeletonRow({
  count = 3,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-3",
        className,
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <KpiTileSkeleton key={i} />
      ))}
    </div>
  );
}
