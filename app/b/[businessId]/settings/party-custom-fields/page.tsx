import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { PageHeader } from "@/components/app/PageHeader";
import { SettingsNav } from "@/components/app/SettingsNav";
import { Card, CardContent } from "@/components/ui/card";
import { getBusinessForUser } from "@/lib/repositories/businesses";
import { listPartyCustomFieldDefsForUser } from "@/lib/repositories/party-custom-fields";
import { requireUser } from "@/lib/session";
import { PartyCustomFieldsPanel } from "./PartyCustomFieldsPanel";

export const metadata: Metadata = {
  title: "Party fields · AstraBill",
};

export default async function PartyCustomFieldsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;

  const business = await getBusinessForUser(user.id, businessId);
  if (!business) notFound();

  const defs = await listPartyCustomFieldDefsForUser({
    userId: user.id,
    businessId,
  });

  return (
    <>
      <PageHeader
        title="Party fields"
        description="Custom text fields that appear on every party form (Birthday, Drug License No., alternate phone, etc.). Optional, workspace-wide, text-only in V1."
      />
      <SettingsNav businessId={businessId} />
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardContent className="pt-6">
            <PartyCustomFieldsPanel businessId={businessId} initial={defs} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
