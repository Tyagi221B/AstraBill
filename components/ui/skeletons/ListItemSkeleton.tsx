/**
 * ListItemSkeleton — single-line list row (picker dropdowns, simple lists).
 *
 * Use when the row carries an avatar + label + secondary line, like:
 *   - Party picker dropdown rows
 *   - Item picker dropdown rows
 *   - Business switcher entries
 *   - Recent activity feeds
 */
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface ListItemSkeletonProps {
  /** Number of items. Default 4. */
  count?: number;
  /** Show a leading avatar circle. Default true. */
  avatar?: boolean;
  className?: string;
}

const LABEL_WIDTHS = ["w-32", "w-40", "w-28", "w-36", "w-44"];

export function ListItemSkeleton({
  count = 4,
  avatar = true,
  className,
}: ListItemSkeletonProps) {
  return (
    <div className={cn("flex flex-col gap-2.5", className)}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-2.5">
          {avatar && (
            <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
          )}
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className={cn("h-3.5", LABEL_WIDTHS[i % LABEL_WIDTHS.length])} />
            <Skeleton className="h-2.5 w-16" />
          </div>
        </div>
      ))}
    </div>
  );
}
