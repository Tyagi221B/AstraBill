import { notFound } from "next/navigation";
import type { Metadata } from "next";

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
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Party fields</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Custom text fields that appear on every party form (Birthday, Drug
          License No., alternate phone, etc.). Optional, workspace-wide,
          text-only in V1.
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <PartyCustomFieldsPanel businessId={businessId} initial={defs} />
        </CardContent>
      </Card>
    </div>
  );
}
