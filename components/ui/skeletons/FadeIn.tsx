"use client";
/**
 * FadeIn — premium cross-fade for skeleton → real content transitions.
 *
 * Wrap a server component's resolved content in `<FadeIn>` and the real
 * content fades in over 200ms on the *client* once React swaps it in
 * place of the suspense fallback. The skeleton itself simply unmounts;
 * the fade only animates the *arriving* content, which is what reads as
 * polish — not a fake double-animation.
 *
 * Uses CSS animation (not Framer Motion) — no client JS for the
 * animation itself, just a CSS keyframe. Animation runs once on mount
 * then stops, so it doesn't interfere with subsequent re-renders.
 *
 * Respects prefers-reduced-motion: snaps in without fade.
 */
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function FadeIn({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("animate-fade-in", className)}>
      {children}
    </div>
  );
}
