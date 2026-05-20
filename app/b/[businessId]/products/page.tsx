/**
 * /b/[businessId]/products — product list for one business.
 *
 * Business-scoped: `businessId` from the path, membership verified by the
 * parent layout. The old cross-business "Business" column is gone.
 */
import Link from "next/link";
import type { Metadata } from "next";
import { Package } from "lucide-react";

import { EmptyState } from "@/components/app/EmptyState";
import { PageHeader } from "@/components/app/PageHeader";
import { buttonClasses } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/card";
import { listProductsForUser } from "@/lib/services/products";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Products · AstraBill",
};

const formatINR = (n: string) =>
  `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

export default async function ProductsPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const user = await requireUser();
  const { businessId } = await params;
  const b = routes.b(businessId);

  const products = await listProductsForUser({
    userId: user.id,
    businessId,
    limit: 200,
  });

  // At least one row carries purchasePrice? Then this user can see profit
  // — surface the column. (The service redacts it per role.)
  const showProfitColumn = products.some(
    (p) => p.purchasePrice !== undefined,
  );

  return (
    <>
      <PageHeader
        title="Products"
        description={`${products.length} ${
          products.length === 1 ? "product" : "products"
        }`}
        action={
          <Link href={b.newProduct} className={buttonClasses("primary", "sm")}>
            + New product
          </Link>
        }
      />

      {products.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No products yet"
          description="Add the items you sell to make invoicing one-tap. Stock follows automatically as you bill."
          action={
            <Link
              href={b.newProduct}
              className={buttonClasses("primary", "sm")}
            >
              + Add your first product
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
                    <th className="px-4 py-3 font-medium">HSN</th>
                    <th className="px-4 py-3 font-medium">Unit</th>
                    <th className="px-4 py-3 font-medium">GST</th>
                    <th className="px-4 py-3 text-right font-medium">Selling</th>
                    {showProfitColumn && (
                      <th className="px-4 py-3 text-right font-medium">Cost</th>
                    )}
                    <th className="px-4 py-3 text-right font-medium">Stock</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
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
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={b.editProduct(p.id)}
                          className="text-sm text-primary hover:underline"
                        >
                          Edit →
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
