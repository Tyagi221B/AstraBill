import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { Suspense } from "react";

import { AppShell } from "@/components/app/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FormFieldSkeleton,
  PageHeaderSkeleton,
} from "@/components/ui/skeletons";
import { listBusinessesForUser } from "@/lib/services/businesses";
import { requireUser } from "@/lib/session";
import { OnboardingForm } from "./OnboardingForm";

export const metadata: Metadata = {
  title: "Set up your business · AstraBill",
};

export default function OnboardingPage() {
  // Outer page is sync so the AppShell chrome is part of the static shell.
  // The auth check + business-list fetch happens inside the Suspense leaf;
  // owner sees the chrome instantly and the onboarding form fades in once
  // the redirect-or-render decision is made.
  return (
    <AppShell crumbs={[{ label: "Set up your business" }]}>
      <Suspense fallback={<OnboardingSkeleton />}>
        <OnboardingContent />
      </Suspense>
    </AppShell>
  );
}

async function OnboardingContent() {
  // If they're not signed in, send them to sign-in. If they already have a
  // business, onboarding is done — bounce to the dashboard.
  const user = await requireUser();
  const businesses = await listBusinessesForUser(user.id);
  if (businesses.length > 0) redirect("/dashboard");

  return (
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
  );
}

function OnboardingSkeleton() {
  return (
    <div className="mx-auto max-w-xl">
      <PageHeaderSkeleton noAction titleWidth="w-56" />
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4">
            <FormFieldSkeleton labelWidth="w-32" />
            <FormFieldSkeleton labelWidth="w-24" hint />
            <FormFieldSkeleton labelWidth="w-28" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
