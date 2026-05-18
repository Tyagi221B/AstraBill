"use client";
import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
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
