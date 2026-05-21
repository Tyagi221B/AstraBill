/**
 * /b/[businessId]/parties — unified Parties list (customers + suppliers).
 *
 * The new full-ledger domain's replacement for the old Customers list. Type
 * is a column on `parties` — UI-only metadata; ledger sign / arrow colour is
 * computed from `ledger_entries` (wired in a later step). For Step 2 the
 * Balance column shows "—" until the ledger reads land.
 */
import Link from "next/link";
import type { Metadata } from "next";
import { Users } from "lucide-react";

import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import { listPartiesForUser } from "@/lib/services/parties";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Parties · AstraBill",
};

export default async function PartiesPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;
  const b = routes.b(businessId);

  const parties = await listPartiesForUser({
    userId: user.id,
    businessId,
    limit: 500,
  });

  const customerCount = parties.filter((p) => p.type === "customer").length;
  const supplierCount = parties.length - customerCount;

  return (
    <>
      <PageHeader
        title="Parties"
        description={
          <span>
            <span>{customerCount}</span>{" "}
            <span className="text-muted-foreground/80">
              {customerCount === 1 ? "customer" : "customers"}
            </span>
            {" · "}
            <span>{supplierCount}</span>{" "}
            <span className="text-muted-foreground/80">
              {supplierCount === 1 ? "supplier" : "suppliers"}
            </span>
          </span>
        }
        action={
          <Link href={b.newParty} className={buttonClasses("primary", "sm")}>
            + New party
          </Link>
        }
      />

      {parties.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No parties yet"
          description="Parties are who you buy from and sell to. Customers and suppliers live here — your books balance from the ledger they share."
          action={
            <Link
              href={b.newParty}
              className={buttonClasses("primary", "sm")}
            >
              + Add your first party
            </Link>
          }
        />
      ) : (
        <Card>
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Mobile</th>
                    <th className="px-4 py-3 font-medium">GSTIN</th>
                    <th className="px-4 py-3 text-right font-medium">
                      Balance
                    </th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {parties.map((p) => (
                    <tr
                      key={p.id}
                      className="border-t border-border text-foreground"
                    >
                      <td className="px-4 py-3 font-medium">
                        <Link
                          href={b.party(p.id)}
                          className="hover:underline"
                        >
                          {p.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground capitalize">
                        {p.type}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {p.mobileNumber ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {p.gstin ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        —
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={b.party(p.id)}
                          className="text-sm text-primary hover:underline"
                        >
                          View →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
