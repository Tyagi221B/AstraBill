import type { Metadata } from "next";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = {
  title: "Sign in · AstraBill",
};

export default function SignInPage() {
  return (
    <main
      style={{
        maxWidth: 420,
        margin: "4rem auto",
        padding: "0 1.25rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>
        Sign in to AstraBill
      </h1>
      <p style={{ color: "#666", marginBottom: "2rem" }}>
        It&apos;s that simple.
      </p>
      <SignInForm />
    </main>
  );
}
