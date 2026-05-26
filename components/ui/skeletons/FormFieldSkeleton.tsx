/**
 * FormFieldSkeleton — label + input pair.
 *
 * Heights match the live primitives exactly:
 *   - Label: text-sm → h-3.5 placeholder
 *   - Input: h-10 (the Input primitive's default)
 *   - Hint:  text-xs → h-3 placeholder, optional
 *
 * Use inside `<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">`
 * to mirror the dense form layouts under /settings.
 */
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface FormFieldSkeletonProps {
  /** Width of the label placeholder. Default `w-24`. */
  labelWidth?: string;
  /** Show a help-text hint line below the input. Default false. */
  hint?: boolean;
  /** Render as a textarea (taller). Default false. */
  textarea?: boolean;
  className?: string;
}

export function FormFieldSkeleton({
  labelWidth = "w-24",
  hint = false,
  textarea = false,
  className,
}: FormFieldSkeletonProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Skeleton className={cn("h-3.5", labelWidth)} />
      <Skeleton className={cn("w-full", textarea ? "h-24" : "h-10")} />
      {hint && <Skeleton className="h-3 w-40" />}
    </div>
  );
}
