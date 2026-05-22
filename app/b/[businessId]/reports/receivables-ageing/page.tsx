import Link from "next/link";
import type { Metadata } from "next";

import { AgeingTable } from "@/components/documents/AgeingTable";
import { PageHeader } from "@/components/app/PageHeader";
import { getAgeing } from "@/lib/services/reports";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Receivables Ageing · AstraBill" };

export default async function ReceivablesAgeingPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;
  const b = routes.b(businessId);

  const rows = await getAgeing({
    userId: user.id,
    businessId,
    side: "receivables",
  });

  return (
    <>
      <PageHeader
        title="Receivables Ageing"
        description={
          <Link href={b.reports} className="text-muted-foreground hover:underline">
            ← All reports
          </Link>
        }
      />
      <AgeingTable rows={rows} />
    </>
  );
}
