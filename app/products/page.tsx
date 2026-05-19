import Link from "next/link";
import type { Metadata } from "next";

import { AppShell } from "@/components/app/AppShell";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import { listBusinessesForUser } from "@/lib/services/businesses";
import { listProductsForUser } from "@/lib/services/products";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Products · AstraBill",
};

const formatINR = (n: string) =>
  `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

export default async function ProductsPage({
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

  const products = await listProductsForUser({
    userId: user.id,
    businessId,
    limit: 200,
  });

  // At least one row carries purchasePrice? Then this user can see profit
  // somewhere — surface the column. (The service has already redacted per
  // business; an undefined here means the user lacks the permission for
  // that row's business.)
  const showProfitColumn = products.some(
    (p) => p.purchasePrice !== undefined,
  );

  const newHref = `/products/new${
    businessId ? `?businessId=${businessId}` : ""
  }`;

  return (
    <AppShell crumbs={[{ label: "Products" }]}>
      <header className="mb-6 flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Products</h1>
        <Link href={newHref} className={buttonClasses("primary", "sm")}>
          + New product
        </Link>
      </header>

      {products.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">
              No products yet. Add the items you sell to make invoicing
              one-tap, and your stock will follow.
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
                    <th className="px-4 py-3 font-medium">HSN</th>
                    <th className="px-4 py-3 font-medium">Unit</th>
                    <th className="px-4 py-3 font-medium">GST</th>
                    <th className="px-4 py-3 text-right font-medium">Selling</th>
                    {showProfitColumn && (
                      <th className="px-4 py-3 text-right font-medium">Cost</th>
                    )}
                    <th className="px-4 py-3 text-right font-medium">Stock</th>
                    <th className="px-4 py-3 font-medium">Business</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => {
                    const biz = businessById.get(p.businessId);
                    return (
                      <tr
                        key={p.id}
                        className="border-t border-border text-foreground"
                      >
                        <td className="px-4 py-3 font-medium">
                          {p.name}
                          {!p.isActive && (
                            <span className="ml-2 text-muted-foreground/70">
                              (inactive)
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {p.hsnCode ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {p.unit}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {p.gstRate}%
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatINR(p.sellingPrice)}
                        </td>
                        {showProfitColumn && (
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                            {p.purchasePrice ? formatINR(p.purchasePrice) : "—"}
                          </td>
                        )}
                        <td className="px-4 py-3 text-right tabular-nums">
                          {p.stock}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {biz?.name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={`/products/${p.id}/edit`}
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
