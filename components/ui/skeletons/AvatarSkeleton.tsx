/**
 * AvatarSkeleton — circular placeholder with optional faded icon hint.
 *
 * The icon hint is a subtle premium touch — instead of a flat circle,
 * we render a faded `User` glyph at low opacity so the placeholder
 * communicates "this will be a person" rather than just "something
 * round will go here". Matches the convention every UserMenu uses
 * (BusinessAvatar fallback, etc.).
 *
 * Sizes mirror the live BusinessAvatar / UserMenu surfaces:
 *   - xs: h-6 w-6   (business switcher dropdown)
 *   - sm: h-7 w-7   (mobile top bar)
 *   - md: h-8 w-8   (UserMenu in sidebar footer)
 *   - lg: h-9 w-9   (active-business header)
 *   - xl: h-16 w-16 (account-form preview)
 *   - 2xl: h-20 w-20 (account-form preview, larger)
 */
import { User } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type AvatarSkeletonSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

const SIZE_CLASSES: Record<AvatarSkeletonSize, string> = {
  xs: "h-6 w-6",
  sm: "h-7 w-7",
  md: "h-8 w-8",
  lg: "h-9 w-9",
  xl: "h-16 w-16",
  "2xl": "h-20 w-20",
};

const ICON_SIZE_CLASSES: Record<AvatarSkeletonSize, string> = {
  xs: "h-3 w-3",
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-4 w-4",
  xl: "h-7 w-7",
  "2xl": "h-9 w-9",
};

export interface AvatarSkeletonProps {
  size?: AvatarSkeletonSize;
  /** Hide the faded icon hint inside the circle. Default false. */
  noIcon?: boolean;
  className?: string;
}

export function AvatarSkeleton({
  size = "md",
  noIcon = false,
  className,
}: AvatarSkeletonProps) {
  return (
    <div className={cn("relative shrink-0", SIZE_CLASSES[size], className)}>
      <Skeleton className="h-full w-full rounded-full" />
      {!noIcon && (
        <User
          aria-hidden
          className={cn(
            "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-muted-foreground/40",
            ICON_SIZE_CLASSES[size],
          )}
        />
      )}
    </div>
  );
}
