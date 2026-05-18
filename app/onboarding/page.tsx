import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { listBusinessesForUser } from "@/lib/services/businesses";
import { requireUser } from "@/lib/session";
import { OnboardingForm } from "./OnboardingForm";

export const metadata: Metadata = {
  title: "Set up your business · AstraBill",
};

export default async function OnboardingPage() {
  // If they're not signed in, send them to sign-in. If they already have a
  // business, onboarding is done — bounce home.
  const user = await requireUser();
  const businesses = await listBusinessesForUser(user.id);
  if (businesses.length > 0) redirect("/");

  return (
    <main
      style={{
        maxWidth: 520,
        margin: "4rem auto",
        padding: "0 1.25rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "1.75rem", marginBottom: "0.25rem" }}>
        Set up your business
      </h1>
      <p style={{ color: "#666", marginBottom: "2rem" }}>
        Just the basics. Everything else can wait — finish your profile when
        you raise your first invoice.
      </p>
      <OnboardingForm />
    </main>
  );
}
