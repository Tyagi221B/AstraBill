/**
 * PageHeaderSkeleton — the page-title row that sits above every authed
 * surface: H2 + 1-line description + an action button on the right.
 *
 * Matches the layout every settings sub-page + list view uses:
 *
 *     <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
 *       <div>
 *         <h2>…</h2>
 *         <p>…</p>
 *       </div>
 *       <Button>…</Button>
 *     </div>
 *
 * The action placeholder is optional — pages without a primary action
 * (Account, etc.) can pass `noAction` to hide it.
 */
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface PageHeaderSkeletonProps {
  /** Hide the right-side action-button placeholder. Default false. */
  noAction?: boolean;
  /** Width of the title placeholder. Default `w-48`. */
  titleWidth?: string;
  className?: string;
}

export function PageHeaderSkeleton({
  noAction = false,
  titleWidth = "w-48",
  className,
}: PageHeaderSkeletonProps) {
  return (
    <header
      className={cn(
        "mb-6 flex flex-wrap items-start justify-between gap-3",
        className,
      )}
    >
      <div className="min-w-0">
        <Skeleton className={cn("h-7", titleWidth)} />
        <Skeleton className="mt-2 h-4 w-64 max-w-full" />
      </div>
      {!noAction && <Skeleton className="h-9 w-32" />}
    </header>
  );
}
