import Link from "next/link";
import type { Metadata } from "next";

import { AppShell } from "@/components/app/AppShell";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import { listBusinessesForUser } from "@/lib/services/businesses";
import { listCustomersForUser } from "@/lib/services/customers";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Customers · AstraBill",
};

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ businessId?: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await searchParams;

  const memberships = await listBusinessesForUser(user.id);
  const businessById = new Map(
    memberships.map((m) => [m.business.id, m.business]),
  );

  const customers = await listCustomersForUser({
    userId: user.id,
    businessId,
    limit: 200,
  });

  const newHref = `/customers/new${
    businessId ? `?businessId=${businessId}` : ""
  }`;

  return (
    <AppShell crumbs={[{ label: "Customers" }]}>
      <header className="mb-6 flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
        <Link href={newHref} className={buttonClasses("primary", "sm")}>
          + New customer
        </Link>
      </header>

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
                    <th className="px-4 py-3 font-medium">Business</th>
                    <th className="px-4 py-3 font-medium">Phone</th>
                    <th className="px-4 py-3 font-medium">GSTIN</th>
                    <th className="px-4 py-3 font-medium">City</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => {
                    const biz = businessById.get(c.businessId);
                    return (
                      <tr
                        key={c.id}
                        className="border-t border-border text-foreground"
                      >
                        <td className="px-4 py-3 font-medium">{c.name}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {biz?.name ?? "—"}
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
                            href={`/customers/${c.id}/edit`}
                            className="text-sm text-primary hover:underline"
                          >
                            Edit →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
