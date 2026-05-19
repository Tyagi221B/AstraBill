import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AppShell } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { listBusinessesForUser } from "@/lib/services/businesses";
import { requireUser } from "@/lib/session";
import { OnboardingForm } from "./OnboardingForm";

export const metadata: Metadata = {
  title: "Set up your business · AstraBill",
};

export default async function OnboardingPage() {
  // If they're not signed in, send them to sign-in. If they already have a
  // business, onboarding is done — bounce to the dashboard.
  const user = await requireUser();
  const businesses = await listBusinessesForUser(user.id);
  if (businesses.length > 0) redirect("/dashboard");

  return (
    <AppShell crumbs={[{ label: "Set up your business" }]}>
      <div className="mx-auto max-w-xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            Set up your business
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Just the basics. Everything else can wait — finish your profile
            when you raise your first invoice.
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            <OnboardingForm />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
