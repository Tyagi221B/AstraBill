"use client";
import { signOut } from "next-auth/react";
import posthog from "posthog-js";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => {
        // Reset PostHog before NextAuth navigates away — guarantees future
        // events on this device aren't grouped with the just-logged-out user.
        posthog.reset();
        signOut({ callbackUrl: "/" });
      }}
      className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-3.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      Sign out
    </button>
  );
}
