/**
 * /b/[businessId]/settings/payments — payment-collection settings.
 *
 * V1: a single UPI VPA (`businesses.upi_id`). When set, the public share
 * page and the invoice PDF render a "Pay ₹X via UPI" button + QR code that
 * targets this address via NPCI's standard `upi://pay?...` deep link. See
 * `wiki/decision/upi-deep-links.md` for the full rationale.
 *
 * Owner-only at the service layer; non-owners still see the page in
 * read-only mode (`canEdit=false`).
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getMembership, roleHas } from "@/lib/rbac";
import { getBusinessForUser } from "@/lib/repositories/businesses";
import { requireUser } from "@/lib/session";

import { PaymentSettingsEditor } from "./PaymentSettingsEditor";

export const metadata: Metadata = { title: "Payment settings" };

export default async function PaymentSettingsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;

  const business = await getBusinessForUser(user.id, businessId);
  if (!business) notFound();
  const membership = await getMembership(user.id, businessId);
  if (!membership) notFound();

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Payments</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          How customers pay {business.name} — the UPI ID that drives the
          &ldquo;Pay&rdquo; button on every shared invoice.
        </p>
      </div>
      <PaymentSettingsEditor
        businessId={business.id}
        businessName={business.name}
        canEdit={roleHas(membership.role, "settings:edit")}
        initialUpiId={business.upiId}
      />
    </div>
  );
}
