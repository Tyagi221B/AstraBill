/**
 * /b/[businessId]/settings/manage-business — the dense business profile
 * form (name, address, GST/PAN, business type, industry, signature,
 * additional invoice details). The marquee surface in Settings, mirroring
 * myBillBook's Business Settings page.
 *
 * Server component: resolves the business from the path and hands its
 * current row to the client form. Membership + the parent settings layout
 * already verified the user.
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { getMembership, roleHas } from "@/lib/rbac";
import { getBusinessForUser } from "@/lib/repositories/businesses";
import { requireUser } from "@/lib/session";
import type {
  BusinessRegistrationType,
  BusinessType,
  IndustryType,
  SignatureMode,
} from "@/lib/constants/business-profile";

import { ManageBusinessForm } from "./ManageBusinessForm";

export const metadata: Metadata = { title: "Manage Business" };

export default async function ManageBusinessPage({
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
    <ManageBusinessForm
      businessId={business.id}
      canEdit={roleHas(membership.role, "settings:edit")}
      initial={{
        name: business.name,
        isGstRegistered: business.isGstRegistered,
        gstin: business.gstin,
        panNumber: business.panNumber,
        phone: business.phone,
        email: business.email,
        addressLine1: business.addressLine1,
        addressLine2: business.addressLine2,
        city: business.city,
        state: business.state,
        stateCode: business.stateCode,
        pincode: business.pincode,
        logoUrl: business.logoUrl,
        businessType: (business.businessType ?? []) as BusinessType[],
        industryType: (business.industryType ?? null) as IndustryType | null,
        businessRegistrationType:
          (business.businessRegistrationType ?? null) as
            | BusinessRegistrationType
            | null,
        signatureUrl: business.signatureUrl,
        signatureMode: business.signatureMode as SignatureMode,
        signatoryName: business.signatoryName,
        additionalDetails: business.additionalDetails ?? {},
        enableTds: business.enableTds,
        enableTcs: business.enableTcs,
        fyStartMonth: business.fyStartMonth,
      }}
    />
  );
}
