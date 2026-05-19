/**
 * /settings/branding — invoice design + branding (Phase 2C, Stage 6).
 *
 * Server component: gates auth, resolves which business to edit (the
 * `?businessId=` param, or the user's first), and hands the current branding
 * to the client <BrandingEditor>. The editor owns all interaction; this page
 * is just the loader + the AppShell chrome.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AppShell } from "@/components/app/AppShell";
import { buttonClasses } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DEFAULT_INVOICE_SETTINGS } from "@/lib/db/schema";
import { roleHas } from "@/lib/rbac";
import { listBusinessesForUser } from "@/lib/services/businesses";
import { getSessionUser } from "@/lib/session";
import { BrandingEditor } from "./BrandingEditor";

export const metadata: Metadata = { title: "Invoice branding" };

const CRUMBS = [{ label: "Settings" }, { label: "Branding" }];

export default async function BrandingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ businessId?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in?callbackUrl=/settings/branding");

  const memberships = await listBusinessesForUser(user.id);

  if (memberships.length === 0) {
    return (
      <AppShell crumbs={CRUMBS}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Set up a business first</CardTitle>
            <CardDescription>
              Invoice branding applies to a business. Create one, then come
              back to make its invoices yours.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/onboarding" className={buttonClasses("primary", "md")}>
              Set up your business
            </Link>
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  const { businessId } = await searchParams;
  // memberships is non-empty (checked above); the fallback is always defined.
  const chosen =
    memberships.find((m) => m.business.id === businessId) ?? memberships[0]!;
  const { business, membership } = chosen;

  return (
    <AppShell crumbs={CRUMBS}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Invoice branding</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How {business.name}&rsquo;s invoices look when a customer opens them.
        </p>
      </div>

      <BrandingEditor
        businessId={business.id}
        businesses={memberships.map((m) => ({
          id: m.business.id,
          name: m.business.name,
        }))}
        canEdit={roleHas(membership.role, "settings:edit")}
        isFreePlan={business.plan === "free"}
        initial={{
          template: business.invoiceTemplateId,
          color: business.brandColor,
          font: business.brandFont,
          logoUrl: business.logoUrl,
          columns:
            business.invoiceSettings?.columns ??
            DEFAULT_INVOICE_SETTINGS.columns,
        }}
      />
    </AppShell>
  );
}
