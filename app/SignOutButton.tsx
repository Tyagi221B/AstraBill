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
      style={{
        padding: "0.4rem 0.85rem",
        fontSize: "0.85rem",
        border: "1px solid #ddd",
        borderRadius: 6,
        background: "#fff",
        cursor: "pointer",
        color: "#666",
      }}
    >
      Sign out
    </button>
  );
}
