/**
 * /b/[businessId]/customers — customer list for one business.
 *
 * Business-scoped: `businessId` from the path, membership verified by the
 * parent layout. The old cross-business "Business" column is gone.
 */
import Link from "next/link";
import type { Metadata } from "next";

import { PageHeader } from "@/components/app/PageHeader";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import { listCustomersForUser } from "@/lib/services/customers";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Customers · AstraBill",
};

export default async function CustomersPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;
  const b = routes.b(businessId);

  const customers = await listCustomersForUser({
    userId: user.id,
    businessId,
    limit: 200,
  });

  return (
    <>
      <PageHeader
        title="Customers"
        description={`${customers.length} ${
          customers.length === 1 ? "customer" : "customers"
        }`}
        action={
          <Link href={b.newCustomer} className={buttonClasses("primary", "sm")}>
            + New customer
          </Link>
        }
      />

      {customers.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              No customers yet. Walk-in sales work without a customer; saved
              customers make repeat invoices a one-tap pick.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="px-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Phone</th>
                    <th className="px-4 py-3 font-medium">GSTIN</th>
                    <th className="px-4 py-3 font-medium">City</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr
                      key={c.id}
                      className="border-t border-border text-foreground"
                    >
                      <td className="px-4 py-3 font-medium">
                        <Link
                          href={b.customer(c.id)}
                          className="hover:underline"
                        >
                          {c.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.phone ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {c.gstin ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {c.city ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={b.customer(c.id)}
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
